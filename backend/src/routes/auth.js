import { and, eq, gt } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { sendEmailsBestEffort } from '../utils/email.js';
import { passwordResetEmail } from '../utils/emailTemplates.js';
import { HttpError } from '../utils/http.js';
import { hashPassword, newPasswordSchema, verifyAgainstDecoy, verifyPassword } from '../utils/password.js';
import { clearSessionCookie, setSessionCookie, signToken } from '../utils/session.js';
import { createToken, hashToken } from '../utils/tokens.js';
import { toPublicUser } from '../utils/user.js';

const router = express.Router();

const UNIQUE_VIOLATION = '23505';

const emailSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.string({ error: 'Email is required' }).max(254).pipe(z.email('Invalid email'))
);

const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  full_name: z.string().trim().max(100).optional(),
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});
const profileSchema = z.object({ full_name: z.string().trim().max(100) });
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

// POST /api/auth/register
router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const { email, password, full_name } = req.body;
  const emailTaken = () =>
    new HttpError(409, 'An account with this email already exists', { code: 'email_taken' });

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw emailTaken();

  let user;
  try {
    [user] = await db
      .insert(users)
      .values({ email, full_name: full_name || null, password_hash: await hashPassword(password) })
      .returning();
  } catch (err) {
    // Two sign-ups with the same address at the same moment: the database settles which one wins.
    if (err?.code === UNIQUE_VIOLATION || err?.cause?.code === UNIQUE_VIOLATION) throw emailTaken();
    throw err;
  }

  signIn(res, user, 201);
});

// POST /api/auth/login
router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const invalid = () => new HttpError(401, 'Invalid email or password', { code: 'invalid_credentials' });

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
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
  const [updated] = await db
    .update(users)
    .set({ full_name: req.body.full_name || null })
    .where(eq(users.id, req.user.id))
    .returning();
  res.json(toPublicUser(updated));
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
