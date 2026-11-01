import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const SESSION_COOKIE = 'auth_token';

// The cookie is for browsers. A native app keeps the `token` from the response and sends it as
// `Authorization: Bearer <token>`.
const cookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax',
  path: '/',
};

export function signToken(userId) {
  return jwt.sign({}, config.jwtSecret, {
    subject: userId,
    algorithm: 'HS256',
    expiresIn: `${config.sessionDays}d`,
  });
}

/** The payload of a valid token. Throws if it is forged, malformed or expired. */
export const verifyToken = (token) => jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: config.sessionDays * 24 * 60 * 60 * 1000 });
}

export const clearSessionCookie = (res) => res.clearCookie(SESSION_COOKIE, cookieOptions);
