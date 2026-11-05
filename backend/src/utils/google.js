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

// How long the server waits for Google when it asks about an access token.
const TIMEOUT_MS = 5_000;

/**
 * Checks an access token the web build got from Google and says whom it is for, as `verifyGoogleIdToken` does for an ID token
 * (and answers in the same shape). A page gets an ID token only through a button that Google draws, and the web build draws its
 * own, so it asks Google for an access token (the token model of Google Identity Services) and the server asks Google about it:
 * whom it was made out to, and who the person is. `fetchImpl`, `clientIds` and the two addresses are parameters so that a test can
 * pass its own.
 *
 * Whom it was made out to is what makes the token worth anything here. An access token proves nothing about this app by itself
 * (every app a person has signed in to gets one for them, and could hand it to a server like this one), so it is accepted only when
 * Google says it was made out to one of our OAuth clients. The name is an extra: where Google does not give it, the person has none.
 */
export async function verifyGoogleAccessToken(
  accessToken,
  { clientIds = config.googleClientIds, fetchImpl = fetch, tokeninfoUrl = config.googleTokeninfoUrl, userinfoUrl = config.googleUserinfoUrl } = {}
) {
  if (clientIds.length === 0) {
    throw new HttpError(503, 'Sign in with Google is not set up on this server', { code: 'google_not_configured' });
  }
  const invalid = () => new HttpError(401, 'The Google token is not valid', { code: 'google_token_invalid' });

  let info;
  try {
    // In the body and not in the address, so that it is in no log.
    const response = await fetchImpl(tokeninfoUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ access_token: accessToken }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Google answers a token it does not know, or that has run out, with a 400; whatever else it refuses is no better. Google
    // being busy or down is another thing, and no fault of the token.
    if (response.status !== 429 && response.status >= 400 && response.status < 500) throw invalid();
    if (!response.ok) throw new Error(`Google answered ${response.status}`);
    info = await response.json();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error('[google] Could not check an access token:', err.message);
    throw new HttpError(503, 'Google could not be reached', { code: 'google_unavailable' });
  }

  const { aud, sub, email, email_verified: emailVerified, expires_in: expiresIn } = info ?? {};
  if (typeof aud !== 'string' || !clientIds.includes(aud)) throw invalid();
  if (typeof sub !== 'string' || !sub || typeof email !== 'string' || !email) throw invalid();
  // Google refuses a token that has run out, so this only guards against an answer that says otherwise.
  if (!(Number(expiresIn) > 0)) throw invalid();

  let name = null;
  try {
    const response = await fetchImpl(userinfoUrl, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) {
      const profile = await response.json();
      // The same person, or the name is not theirs.
      if (profile?.sub === sub && typeof profile.name === 'string' && profile.name.trim()) {
        name = profile.name.trim().slice(0, 100);
      }
    }
  } catch (err) {
    console.error('[google] Could not ask for a name:', err.message);
  }

  return {
    sub,
    email: email.trim().toLowerCase(),
    // The tokeninfo answer writes its flags as strings.
    emailVerified: emailVerified === true || emailVerified === 'true',
    name,
  };
}
