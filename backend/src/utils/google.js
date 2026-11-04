import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { config } from '../config.js';
import { HttpError } from './http.js';

// The "iss" of a Google ID token is written in one of these two ways.
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// What can be wrong with the token itself, as against Google's keys being out of reach.
const BAD_TOKEN = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
];

let googleKeys;
// Google's signing keys: fetched on first use and kept, and fetched again when a token names a key that is not among
// them (Google changes its keys from time to time).
const defaultKeys = () => (googleKeys ??= createRemoteJWKSet(new URL(config.googleCertsUrl)));

/**
 * Checks an ID token the app got from Google Sign-In and says whom it is for. The token has to be signed by Google, meant
 * for one of our OAuth clients and not expired. `keys` and `clientIds` are parameters so that a test can pass its own.
 */
export async function verifyGoogleIdToken(idToken, { keys, clientIds = config.googleClientIds } = {}) {
  if (clientIds.length === 0) {
    throw new HttpError(503, 'Sign in with Google is not set up on this server', { code: 'google_not_configured' });
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keys ?? defaultKeys(), {
      issuer: ISSUERS,
      audience: clientIds,
      algorithms: ['RS256'],
    }));
  } catch (err) {
    if (BAD_TOKEN.some((type) => err instanceof type)) {
      throw new HttpError(401, 'The Google token is not valid', { code: 'google_token_invalid' });
    }
    // Not the token's fault: Google's keys could not be fetched.
    console.error('[google] Could not check a token:', err.message);
    throw new HttpError(503, 'Google could not be reached', { code: 'google_unavailable' });
  }

  const { sub, email, email_verified: emailVerified, name } = payload;
  if (typeof sub !== 'string' || !sub || typeof email !== 'string' || !email) {
    throw new HttpError(401, 'The Google token is not valid', { code: 'google_token_invalid' });
  }
  return {
    // Google's own id of the person: it stays the same when they change their address.
    sub,
    email: email.trim().toLowerCase(),
    // A boolean from Google; some libraries turn it into a string on the way.
    emailVerified: emailVerified === true || emailVerified === 'true',
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : null,
  };
}
