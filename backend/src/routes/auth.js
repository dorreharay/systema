import { and, eq, gt } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { isValidTimeZone } from '../utils/dates.js';
import { createDefaultServices, createStarterCatalog } from '../utils/defaults.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { sendEmailsBestEffort } from '../utils/email.js';
import { LANGUAGES } from '../utils/messages/index.js';
import { passwordResetEmail } from '../utils/emailTemplates.js';
import { exchangeAppleAuthorizationCode, revokeAppleToken, verifyAppleIdentityToken } from '../utils/apple.js';
import { verifyGoogleIdToken } from '../utils/google.js';
import { HttpError } from '../utils/http.js';
import { optionalText } from '../utils/validators.js';
import { hashPassword, newPasswordSchema, verifyAgainstDecoy, verifyPassword } from '../utils/password.js';
import { clearSessionCookie, setSessionCookie, signToken } from '../utils/session.js';
import { createToken, hashToken } from '../utils/tokens.js';
import { toPublicUser } from '../utils/user.js';

const router = express.Router();

const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (err) => err?.code === UNIQUE_VIOLATION || err?.cause?.code === UNIQUE_VIOLATION;

const emailSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.string({ error: 'Email is required' }).max(254).pipe(z.email('Invalid email'))
);

// A new account is made in the language the app was in, when it names one of the app's (see utils/messages).
// What the app says about itself when it asks for an account. A language the server does not know is left out, not refused,
// so that no sign-up fails over it.
const languageHint = z.string().max(16).optional();
const accountLanguage = (value) => (LANGUAGES.includes(value) ? value : undefined);

const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  full_name: z.string().trim().max(100).optional(),
  language: languageHint,
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});
const googleSchema = z.object({
  id_token: z.string({ error: 'Google token is required' }).min(1, 'Google token is required').max(8192),
  language: languageHint,
});
const appleSchema = z.object({
  identity_token: z.string({ error: 'Apple token is required' }).min(1, 'Apple token is required').max(8192),
  // What the server trades with Apple for a token it can revoke when the account is deleted (see rememberAppleRefreshToken).
  authorization_code: z.string().max(2048).optional(),
  // Apple gives the name only the first time a person authorizes the app, and the app passes it on then.
  full_name: z.string().trim().max(100).optional(),
  language: languageHint,
});
const profileSchema = z
  .object({
    full_name: z.string().trim().max(100),
    workshop_name: optionalText(100),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
    tension_unit: z.enum(['kg', 'lbs'], 'Choose kg or lbs'),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
    language: z.enum(LANGUAGES, 'Unsupported language'),
    notifications_enabled: z.boolean(),
    setup_completed: z.literal(true),
  })
  .partial()
  .refine((profile) => Object.values(profile).some((value) => value !== undefined), {
    message: 'Nothing to change',
  });
const deleteAccountSchema = z.object({ password: z.string().optional() });
const forgotPasswordSchema = z.object({ email: emailSchema });
const resetPasswordSchema = z.object({
  token: z.string({ error: 'Token is required' }).min(1, 'Token is required'),
  password: newPasswordSchema,
});

/** What a sign-in or sign-up answers with: the user, and the token for a client that has no cookies. */
function signIn(res, user, status = 200) {
  const token = signToken(user.id);
  setSessionCookie(res, token);
  res.status(status).json({ user: toPublicUser(user), token });
}

const emailTaken = () => new HttpError(409, 'An account with this email already exists', { code: 'email_taken' });

// POST /api/auth/register
router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const { email, password, full_name, language } = req.body;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw emailTaken();

  const password_hash = await hashPassword(password);
  let user;
  try {
    user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email, full_name: full_name || null, password_hash, language: accountLanguage(language) })
        .returning();
      await createDefaultServices(tx, created.id, created.language);
      await createStarterCatalog(tx, created.id);
      return created;
    });
  } catch (err) {
    // Two sign-ups with the same address at the same moment: the database settles which one wins.
    if (isUniqueViolation(err)) throw emailTaken();
    throw err;
  }

  signIn(res, user, 201);
});

// POST /api/auth/login
router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const invalid = () => new HttpError(401, 'Invalid email or password', { code: 'invalid_credentials' });

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // An account made with Google or Apple has no password. Refusing it takes as long as a wrong password does, so the two
  // answers cannot be told apart by the time they take.
  if (!user?.password_hash) {
    await verifyAgainstDecoy(password);
    throw invalid();
  }
  if (!(await verifyPassword(password, user.password_hash))) throw invalid();

  // Said only after the password is right, so it does not reveal which addresses have an account.
  if (!user.is_active) {
    throw new HttpError(403, 'Account is inactive. Contact support.', { code: 'account_inactive' });
  }

  signIn(res, user);
});

/**
 * The account a Google sign-in is for: the one already linked to this Google user, else the one with the same email (it
 * is linked now), else a new one.
 */
async function accountForGoogle({ sub, email, name }, language) {
  const [linked] = await db.select().from(users).where(eq(users.google_sub, sub)).limit(1);
  if (linked) return { user: linked, created: false };

  const [sameEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (sameEmail) {
    // The caller turns this one away; nothing about it is changed.
    if (!sameEmail.is_active) return { user: sameEmail, created: false };
    if (sameEmail.google_sub) {
      // The same address but another Google user: Google does not give an address to someone else, but a company's
      // mailbox can pass to a new colleague.
      throw new HttpError(409, 'This email is linked to another Google account', { code: 'google_account_mismatch' });
    }
    // Signing up never checked that the address is the person's, so a password somebody else set must not outlive
    // Google showing whose address it is. It is removed, and every session opened before now ends; to use a password
    // again, the person resets it.
    const [user] = await db
      .update(users)
      .set({
        google_sub: sub,
        ...(!sameEmail.full_name && { full_name: name }),
        ...(sameEmail.password_hash && { password_hash: null, password_changed_at: new Date() }),
      })
      .where(eq(users.id, sameEmail.id))
      .returning();
    return { user, created: false };
  }

  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ email, full_name: name, google_sub: sub, language: accountLanguage(language) })
      .returning();
    await createDefaultServices(tx, created.id, created.language);
    await createStarterCatalog(tx, created.id);
    return created;
  });
  return { user, created: true };
}

// POST /api/auth/google
router.post('/google', authLimiter, validateBody(googleSchema), async (req, res) => {
  const google = await verifyGoogleIdToken(req.body.id_token);
  if (!google.emailVerified) {
    throw new HttpError(403, 'The email of this Google account is not verified', { code: 'google_email_unverified' });
  }

  let account;
  try {
    account = await accountForGoogle(google, req.body.language);
  } catch (err) {
    // The first sign-in of one person arrived twice at once: the database let one of them make the account, and the
    // other finds it now.
    if (!isUniqueViolation(err)) throw err;
    account = await accountForGoogle(google, req.body.language);
  }

  // Said after the token is checked, so it only tells that to someone who has this Google account.
  if (!account.user.is_active) {
    throw new HttpError(403, 'Account is inactive. Contact support.', { code: 'account_inactive' });
  }
  signIn(res, account.user, account.created ? 201 : 200);
});

/**
 * The account an Apple sign-in is for, like accountForGoogle: the one already linked to this Apple user, else the one with
 * the same email (it is linked now), else a new one. `fullName` and `language` are what the app passed on, and only a new
 * account takes them.
 */
async function accountForApple({ sub, email, emailVerified }, fullName, language) {
  const [linked] = await db.select().from(users).where(eq(users.apple_sub, sub)).limit(1);
  if (linked) return { user: linked, created: false };

  // Apple leaves the address out when the person did not share one, and with no account of theirs to find by the id there
  // is nothing to go by.
  if (!email) {
    throw new HttpError(400, 'Apple did not share an email address for this sign-in', { code: 'apple_email_missing' });
  }

  const [sameEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (sameEmail) {
    // An address Apple does not call verified is no proof that it is the person's, so it does not hand over the account that
    // has it, and it cannot be given to a second account either.
    if (!emailVerified) throw emailTaken();
    // The caller turns this one away; nothing about it is changed.
    if (!sameEmail.is_active) return { user: sameEmail, created: false };
    if (sameEmail.apple_sub) {
      // The same address but another Apple user: Apple does not give an address to someone else, but a company's mailbox
      // can pass to a new colleague.
      throw new HttpError(409, 'This email is linked to another Apple account', { code: 'apple_account_mismatch' });
    }
    // As with Google: signing up never checked that the address is the person's, so a password somebody else set must not
    // outlive Apple showing whose address it is. It is removed, and every session opened before now ends. The name the app
    // passed on is not used here: the account is not new.
    const [user] = await db
      .update(users)
      .set({
        apple_sub: sub,
        ...(sameEmail.password_hash && { password_hash: null, password_changed_at: new Date() }),
      })
      .where(eq(users.id, sameEmail.id))
      .returning();
    return { user, created: false };
  }

  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ email, full_name: fullName || null, apple_sub: sub, language: accountLanguage(language) })
      .returning();
    await createDefaultServices(tx, created.id, created.language);
    await createStarterCatalog(tx, created.id);
    return created;
  });
  return { user, created: true };
}

/**
 * Trades the authorization code of a sign-in with Apple for a refresh token and keeps it, so that deleting the account can
 * revoke it. Best effort, down to the last line: no key to ask Apple with, a code Apple refuses or a database that does not
 * take the token leave the sign-in as it is.
 */
async function rememberAppleRefreshToken(userId, authorizationCode) {
  try {
    const refreshToken = await exchangeAppleAuthorizationCode(authorizationCode);
    if (refreshToken) await db.update(users).set({ apple_refresh_token: refreshToken }).where(eq(users.id, userId));
  } catch (err) {
    console.error('[apple] Could not keep the refresh token:', err.message);
  }
}

// POST /api/auth/apple
router.post('/apple', authLimiter, validateBody(appleSchema), async (req, res) => {
  const { identity_token, authorization_code, full_name, language } = req.body;
  const apple = await verifyAppleIdentityToken(identity_token);
  // An address is usable when a sign-up would take it (and is tidied the same way); a missing or odd one is as good as none.
  const email = emailSchema.safeParse(apple.email);
  const identity = { ...apple, email: email.success ? email.data : null };

  let account;
  try {
    account = await accountForApple(identity, full_name, language);
  } catch (err) {
    // The first sign-in of one person arrived twice at once: the database let one of them make the account, and the
    // other finds it now.
    if (!isUniqueViolation(err)) throw err;
    account = await accountForApple(identity, full_name, language);
  }

  // Said after the token is checked, so it only tells that to someone who has this Apple account.
  if (!account.user.is_active) {
    throw new HttpError(403, 'Account is inactive. Contact support.', { code: 'account_inactive' });
  }
  if (authorization_code) await rememberAppleRefreshToken(account.user.id, authorization_code);
  signIn(res, account.user, account.created ? 201 : 200);
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json(toPublicUser(req.user));
});

// PATCH /api/auth/me
router.patch('/me', requireAuth, validateBody(profileSchema), async (req, res) => {
  const { setup_completed, full_name, ...rest } = req.body;
  const [updated] = await db
    .update(users)
    .set({
      ...rest,
      ...(full_name !== undefined && { full_name: full_name || null }),
      ...(setup_completed && !req.user.setup_completed_at && { setup_completed_at: new Date() }),
    })
    .where(eq(users.id, req.user.id))
    .returning();
  res.json(toPublicUser(updated));
});

// POST /api/auth/delete-account
router.post('/delete-account', requireAuth, authLimiter, validateBody(deleteAccountSchema), async (req, res) => {
  const { password } = req.body;
  // A stolen session could change anything else in the account, but not end it: the password has to be given as well. An
  // account made with Google or Apple has none, and there the session is all there is to go by. It is a 403 and not a 401,
  // so that the app does not take a wrong password for an ended session and sign the person out.
  if (req.user.password_hash && !(password && (await verifyPassword(password, req.user.password_hash)))) {
    throw new HttpError(403, 'The password is wrong', { code: 'invalid_password' });
  }

  // Apple keeps the person linked to the app (it is listed in their Apple ID settings) until it is told otherwise, and while
  // it is, a new sign-in with Apple is not a first one: it brings no name for the account made then. Best effort: the
  // account is deleted whatever Apple answers.
  if (req.user.apple_sub && req.user.apple_refresh_token) {
    await revokeAppleToken(req.user.apple_refresh_token);
  }

  // Everything the account owns goes with it: its clients, rackets, strings, services, orders and photos are deleted by
  // the foreign keys, in the same statement, so there is no half-deleted account.
  await db.delete(users).where(eq(users.id, req.user.id));
  clearSessionCookie(res);
  res.json({ ok: true });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), async (req, res) => {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, req.body.email), eq(users.is_active, true)))
    .limit(1);

  if (user) {
    const { token, hash } = createToken();
    await db
      .update(users)
      .set({
        reset_token_hash: hash,
        reset_token_expires: new Date(Date.now() + config.resetTokenMinutes * 60 * 1000),
      })
      .where(eq(users.id, user.id));

    const email = passwordResetEmail({
      name: user.full_name,
      url: `${config.appUrl}/reset-password?token=${token}`,
      minutes: config.resetTokenMinutes,
      language: user.language,
    });
    // Not awaited: waiting for the mail server would make this answer slower for an address that has
    // an account, and so tell it apart. A failure is logged; saying "could not send" would do the same.
    void sendEmailsBestEffort([{ to: user.email, ...email }]);
  }

  // The same answer whether or not the address has an account.
  res.json({ ok: true });
});

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), async (req, res) => {
  const { token, password } = req.body;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.reset_token_hash, hashToken(token)), gt(users.reset_token_expires, new Date())))
    .limit(1);
  if (!user) {
    throw new HttpError(400, 'Invalid or expired reset link', { code: 'invalid_reset_token' });
  }

  // The token is single-use, and every session opened before now stops working.
  await db
    .update(users)
    .set({
      password_hash: await hashPassword(password),
      reset_token_hash: null,
      reset_token_expires: null,
      password_changed_at: new Date(),
    })
    .where(eq(users.id, user.id));

  res.json({ ok: true });
});

export default router;
