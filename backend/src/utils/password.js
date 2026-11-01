import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt reads only the first 72 bytes of a password. A longer one would be accepted and silently
// cut, so it is refused instead.
const MAX_PASSWORD_BYTES = 72;

/** A new password: what the sign-up and password-reset screens ask for. */
export const newPasswordSchema = z
  .string({ error: 'Password is required' })
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .refine((value) => Buffer.byteLength(value) <= MAX_PASSWORD_BYTES, 'Password is too long');

export const hashPassword = (password) => bcrypt.hash(password, config.bcryptRounds);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

let decoyHash;
/**
 * Checks a password against a hash nobody knows the password of. Logging in as an address that has
 * no account does this, so that it takes as long as a wrong password and the response time does not
 * tell the two apart.
 */
export async function verifyAgainstDecoy(password) {
  decoyHash ??= await hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, decoyHash);
}
