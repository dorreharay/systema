import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { needsConfirmation } from '../utils/emailVerified.js';
import { HttpError, isUuid } from '../utils/http.js';
import { SESSION_COOKIE, verifyToken } from '../utils/session.js';
import { loadWorkshop } from '../utils/workshop.js';

/** The cookie a browser sends, or `Authorization: Bearer <token>`, which is what a native app sends. */
export function readToken(req) {
  const header = req.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  return req.cookies?.[SESSION_COOKIE] ?? header?.[1];
}

/**
 * Put before `requireAuth` on a route that an account that has not confirmed its email address may use (to ask for the code, to type it
 * in, to see the profile, to delete the account). Every other route turns such an account away.
 */
export const allowUnverified = (req, res, next) => {
  req.allowUnverified = true;
  next();
};

/**
 * Sets `req.user` to the signed-in user, or answers 401. Where the email address has to be confirmed (config.emailVerification) an account
 * that has not confirmed it is answered 403 `email_not_verified`, unless the route allows it (see `allowUnverified`).
 *
 * Sets `req.workshop` too: whose data the person works in and what their role there is (see utils/workshop.js). A route that reads or writes
 * the data of the workshop filters by `req.workshop.ownerId`, never by `req.user.id`.
 */
export async function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) throw new HttpError(401, 'Not authenticated', { code: 'unauthenticated' });

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new HttpError(401, 'Invalid or expired token', { code: 'invalid_token' });
  }

  const [user] = isUuid(payload.sub)
    ? await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
    : [];
  if (!user || !user.is_active) {
    throw new HttpError(401, 'User not found or inactive', { code: 'invalid_token' });
  }

  // `iat` is in whole seconds, so compare in seconds: a token issued in the same second as the
  // change is accepted.
  if (user.password_changed_at && payload.iat < Math.floor(user.password_changed_at.getTime() / 1000)) {
    throw new HttpError(401, 'The password was changed. Sign in again.', { code: 'invalid_token' });
  }

  if (!req.allowUnverified && needsConfirmation(user)) {
    throw new HttpError(403, 'Confirm your email address first', { code: 'email_not_verified' });
  }

  req.user = user;
  req.workshop = await loadWorkshop(user);
  next();
}

/** After requireAuth: lets through only the listed roles. */
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw new HttpError(403, 'Insufficient permissions');
  }
  next();
};
