import { createHash, randomBytes } from 'node:crypto';

/** SHA-256 of a token, as stored in the database. */
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** A random token to put in a link, and the hash to keep in the database. */
export function createToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
