import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { HttpError, isUuid } from '../utils/http.js';
import { SESSION_COOKIE, verifyToken } from '../utils/session.js';

/** The cookie a browser sends, or `Authorization: Bearer <token>`, which is what a native app sends. */
export function readToken(req) {
  const header = req.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  return req.cookies?.[SESSION_COOKIE] ?? header?.[1];
}

/** Sets `req.user` to the signed-in user, or answers 401. */
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

  req.user = user;
  next();
}

/** After requireAuth: lets through only the listed roles. */
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw new HttpError(403, 'Insufficient permissions');
  }
  next();
};
