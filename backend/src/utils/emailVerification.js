/**
 * Confirming the email address of an account made with an email and a password. A code of six digits is sent to the address; the account
 * is not used (every route but a few answers 403 `email_not_verified`, see middleware/auth.js) until the person types it in, which
 * shows that the address is theirs. Whether any of it applies is a setting of the server (`config.emailVerification.required`): in
 * production it does, on a local server it does not.
 *
 * A code works for `codeMinutes`, takes `maxAttempts` wrong guesses and is then no good, and the one that was sent last is the only one
 * that works. Another can be asked for after `resendSeconds`, and `sendsPerHour` at most in an hour. Only a keyed hash of a code is
 * kept (table `email_codes`). Accounts made with Google or Apple, and accounts that reset their password through the link in an
 * email, are confirmed without a code: they have shown that the address is theirs already.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { emailCodes, users } from '../db/schema.js';
import { sendEmailsBestEffort } from './email.js';
import { emailVerificationEmail } from './emailTemplates.js';
import { HttpError } from './http.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
// The codes that were sent stay this long, to count how many went out in an hour; then they are removed.
const KEEP_MS = 24 * HOUR_MS;

export const CODE_LENGTH = 6;
const CODE_FORMAT = new RegExp(`^\\d{${CODE_LENGTH}}$`);

/** A new code: six digits, from the system's random numbers. */
export const newCode = () => String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

/** What a person typed, as the code it may be: the digits, with the spaces and dashes of "123 456" taken out; `null` if it is no code. */
export function normalizeCode(text) {
  const digits = String(text ?? '').replace(/[\s-]/g, '');
  return CODE_FORMAT.test(digits) ? digits : null;
}

/** The hash a code is kept as: keyed with the server's secret and the id of the account, so one account's hash is no use for another. */
export const hashCode = (userId, code, secret = config.jwtSecret) =>
  createHmac('sha256', secret).update(`${userId}:${code}`).digest('hex');

/** Whether two hashes (hex) are the same, in the time it takes for any two. */
export function sameHash(a, b) {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The newest code that was sent to the account, or nothing. */
async function newestCode(userId) {
  const [latest] = await db
    .select()
    .from(emailCodes)
    .where(eq(emailCodes.user_id, userId))
    .orderBy(desc(emailCodes.created_at))
    .limit(1);
  return latest;
}

/**
 * Makes a new code for the account and sends it to its address. With `limits` (everything but the first code, which goes with the
 * sign-up) a code is refused while the last one is younger than `resendSeconds` (429 `code_cooldown`) and when `sendsPerHour` went out in
 * the last hour (429 `code_limit`); both say `retry_after`, in seconds. The email is sent as well as it can be: `sent` says whether it
 * went, and `reason` why not. `now` and `settings` are for a test.
 */
export async function sendCode(user, { limits = true, settings = config.emailVerification, now = Date.now() } = {}) {
  if (limits) {
    const recent = await db
      .select({ created_at: emailCodes.created_at })
      .from(emailCodes)
      .where(and(eq(emailCodes.user_id, user.id), gt(emailCodes.created_at, new Date(now - HOUR_MS))))
      .orderBy(emailCodes.created_at);

    const last = recent.at(-1);
    if (last) {
      const wait = Math.ceil((last.created_at.getTime() + settings.resendSeconds * 1000 - now) / 1000);
      if (wait > 0) throw new HttpError(429, 'A code was sent a moment ago', { code: 'code_cooldown', data: { retry_after: wait } });
    }
    if (recent.length >= settings.sendsPerHour) {
      // A place frees up when the one that is `sendsPerHour` back from the newest is an hour old.
      const frees = recent[recent.length - settings.sendsPerHour].created_at.getTime() + HOUR_MS;
      const wait = Math.max(1, Math.ceil((frees - now) / 1000));
      throw new HttpError(429, 'Too many codes were sent to this account', { code: 'code_limit', data: { retry_after: wait } });
    }
  }

  const code = newCode();
  const [made] = await db
    .insert(emailCodes)
    .values({
      user_id: user.id,
      code_hash: hashCode(user.id, code),
      expires_at: new Date(now + settings.codeMinutes * MINUTE_MS),
    })
    .returning({ id: emailCodes.id });
  await db.delete(emailCodes).where(and(eq(emailCodes.user_id, user.id), lt(emailCodes.created_at, new Date(now - KEEP_MS))));

  const email = emailVerificationEmail({ name: user.full_name, code, minutes: settings.codeMinutes, language: user.language });
  const { failed, reason } = await sendEmailsBestEffort([{ to: user.email, ...email }]);
  // A code that never left is no code: the one before it (if it still works) stays the newest, and the person may ask again at once.
  if (failed.length > 0) await db.delete(emailCodes).where(eq(emailCodes.id, made.id));
  return { sent: failed.length === 0, reason, retryAfter: settings.resendSeconds };
}

/**
 * Makes sure that an account that has to confirm its address has a code that can still be typed in: one is sent when there is none,
 * when it has run out, or when it took its wrong guesses. Used when such an account signs in. It never throws for a limit: a person who
 * is waiting for a code that was sent a moment ago has one.
 */
export async function ensureCode(user, { settings = config.emailVerification, now = Date.now() } = {}) {
  const latest = await newestCode(user.id);
  if (latest && latest.expires_at.getTime() > now && latest.attempts < settings.maxAttempts) return;
  try {
    await sendCode(user, { settings, now });
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 429)) throw error;
  }
}

/**
 * Checks the code that a person typed for the account and, if it is the newest one and still good, confirms the address: the account
 * is returned as it is now. A wrong code is 400 `invalid_code` (with `attempts_left`); the wrong guess that is the last one the code
 * takes, and any after it, is 429 `code_attempts_exceeded`, and a new code has to be asked for; one that ran out (or none was ever sent)
 * is 400 `code_expired`.
 */
export async function confirmCode(user, input, { settings = config.emailVerification, now = Date.now() } = {}) {
  const code = normalizeCode(input);
  if (!code) throw new HttpError(400, `The code is ${CODE_LENGTH} digits`, { code: 'invalid_code' });

  const latest = await newestCode(user.id);
  if (!latest || latest.expires_at.getTime() <= now) {
    // Two requests at once (a double tap on the button): the first confirmed the address and took the codes away, so the second finds none.
    const [fresh] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (fresh?.email_verified_at) return fresh;
    throw new HttpError(400, 'The code has expired', { code: 'code_expired' });
  }
  const exceeded = () => new HttpError(429, 'Too many wrong codes: ask for a new one', { code: 'code_attempts_exceeded' });

  // A guess is counted before it is looked at, in the one statement that also sees that the code has guesses left: guesses that arrive at
  // the same moment cannot get more than `maxAttempts` looks at the code between them.
  const [guess] = await db
    .update(emailCodes)
    .set({ attempts: sql`${emailCodes.attempts} + 1` })
    .where(and(eq(emailCodes.id, latest.id), lt(emailCodes.attempts, settings.maxAttempts)))
    .returning({ attempts: emailCodes.attempts });
  if (!guess) throw exceeded();

  if (!sameHash(latest.code_hash, hashCode(user.id, code))) {
    const left = settings.maxAttempts - guess.attempts;
    if (left <= 0) throw exceeded();
    throw new HttpError(400, 'The code is wrong', { code: 'invalid_code', data: { attempts_left: left } });
  }

  const [confirmed] = await db.update(users).set({ email_verified_at: new Date(now) }).where(eq(users.id, user.id)).returning();
  await db.delete(emailCodes).where(eq(emailCodes.user_id, user.id));
  return confirmed;
}
