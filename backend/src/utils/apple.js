import { createRemoteJWKSet, errors, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { config } from '../config.js';
import { HttpError } from './http.js';

// The "iss" of an identity token, and the "aud" of the client secret the server signs to talk to Apple.
const APPLE = 'https://appleid.apple.com';

// What can be wrong with the token itself, as against Apple's keys being out of reach.
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

let appleKeys;
// Apple's signing keys: fetched on first use and kept, and fetched again when a token names a key that is not among them
// (Apple changes its keys from time to time).
const defaultKeys = () => (appleKeys ??= createRemoteJWKSet(new URL(config.appleKeysUrl)));

// Apple writes its flags as booleans, or as the strings "true" and "false", depending on the claim and the token.
const isTrue = (value) => value === true || value === 'true';

/**
 * Checks an identity token the app got from Sign in with Apple and says whom it is for. The token has to be signed by Apple,
 * meant for one of our identifiers and not expired. `keys` and `clientIds` are parameters so that a test can pass its own.
 *
 * Our identifiers are the app's bundle ID, which is whom the token of the native sign-in is made out to, and the Services ID of
 * the web sign-in (Sign in with Apple JS), which is whom the token of the browser is made out to. `audience` says which of them
 * it was: Apple wants the code that came with the token traded, and the token it gives for it revoked, by that same one.
 *
 * `email` is missing when the person shared none; it is a made-up address on privaterelay.appleid.com when they hid theirs
 * (`isPrivateEmail`). Whether to trust it is the route's decision, which is why `emailVerified` is reported as it is.
 */
export async function verifyAppleIdentityToken(identityToken, { keys, clientIds = config.appleClientIds } = {}) {
  if (clientIds.length === 0) {
    throw new HttpError(503, 'Sign in with Apple is not set up on this server', { code: 'apple_not_configured' });
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(identityToken, keys ?? defaultKeys(), {
      issuer: APPLE,
      audience: clientIds,
      algorithms: ['RS256'],
    }));
  } catch (err) {
    if (BAD_TOKEN.some((type) => err instanceof type)) {
      throw new HttpError(401, 'The Apple token is not valid', { code: 'apple_token_invalid' });
    }
    // Not the token's fault: Apple's keys could not be fetched.
    console.error('[apple] Could not check a token:', err.message);
    throw new HttpError(503, 'Apple could not be reached', { code: 'apple_unavailable' });
  }

  const { sub, email, email_verified: emailVerified, is_private_email: isPrivateEmail, aud } = payload;
  // The token passed the check above, so it names one of ours; a token may name several audiences.
  const audience = clientIds.find((clientId) => [aud].flat().includes(clientId));
  if (typeof sub !== 'string' || !sub || !audience) {
    throw new HttpError(401, 'The Apple token is not valid', { code: 'apple_token_invalid' });
  }
  return {
    // Apple's own id of the person, for this team: it stays the same when they change their address, and it is the same
    // whether they signed in to the app or to the web (all of them are the team's).
    sub,
    email: typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null,
    emailVerified: isTrue(emailVerified),
    isPrivateEmail: isTrue(isPrivateEmail),
    // The identifier of ours the token was made out to.
    audience,
  };
}

// ---------------------------------------------------------------------------
// The server's own calls to Apple: the optional part. They need a Sign in with Apple key (APPLE_TEAM_ID, APPLE_KEY_ID and
// APPLE_PRIVATE_KEY). They are an extra, never a condition: whatever goes wrong is logged and swallowed, so a sign-in and
// the deleting of an account go on without them. `settings` and `fetchImpl` are parameters so that a test can pass its own.
// ---------------------------------------------------------------------------

const SECRET_MINUTES = 5;
const TIMEOUT_MS = 5_000;

const canAskApple = (settings) =>
  Boolean(settings.appleTeamId && settings.appleKeyId && settings.applePrivateKey && settings.appleClientIds.length > 0);

// Whom the server speaks for when it asks Apple something: the one the token or code was made out to. Without one named, the
// first of ours, which is the app (the setting lists its bundle ID first). A `null` (nothing was kept) is none named too.
const clientOf = (settings, clientId) => clientId || settings.appleClientIds[0];

/**
 * What Apple wants in place of a password from a server: a JWT signed (ES256) with the .p8 key, naming the key, the team and
 * the app or the Services ID it speaks for (`clientId`). It is made for each call and lives a few minutes. One key serves all
 * of them: the Services ID is grouped with the app's primary App ID, which is what the key is for.
 */
export async function appleClientSecret(settings = config, clientId) {
  const key = await importPKCS8(settings.applePrivateKey, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: settings.appleKeyId })
    .setIssuer(settings.appleTeamId)
    .setIssuedAt()
    .setExpirationTime(`${SECRET_MINUTES}m`)
    .setAudience(APPLE)
    .setSubject(clientOf(settings, clientId))
    .sign(key);
}

/** Posts a form to one of Apple's endpoints (`path` is `/token` or `/revoke`) as `clientId`; returns the answer and its body. */
async function askApple(path, fields, { settings, fetchImpl, clientId }) {
  const response = await fetchImpl(`${settings.appleAuthUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      client_id: clientOf(settings, clientId),
      client_secret: await appleClientSecret(settings, clientId),
      ...fields,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

/** What Apple said when it refused, for the log. Nothing in it is a secret: it is the name of the mistake. */
function refusal({ response, body }) {
  const reason = [body?.error, body?.error_description].filter((part) => typeof part === 'string').join(': ');
  return `${response.status} ${reason.slice(0, 200) || 'no reason given'}`;
}

/**
 * Trades the authorization code that came with a sign-in for a refresh token and returns it, or null when the server has no
 * key to ask with or Apple did not give one. The code works once, for a few minutes, and only for the one it was made out to:
 * `clientId` is the `audience` of the identity token that came with it (a code of the web sign-in is not good for the app's
 * bundle ID, and the other way round).
 */
export async function exchangeAppleAuthorizationCode(code, { settings = config, fetchImpl = fetch, clientId } = {}) {
  try {
    if (!canAskApple(settings)) return null;
    const answer = await askApple('/token', { grant_type: 'authorization_code', code }, { settings, fetchImpl, clientId });
    if (!answer.response.ok) {
      console.error(`[apple] Could not trade an authorization code: ${refusal(answer)}`);
      return null;
    }
    const refreshToken = answer.body?.refresh_token;
    if (typeof refreshToken !== 'string' || !refreshToken) {
      console.error('[apple] Apple answered an authorization code with no refresh token');
      return null;
    }
    return refreshToken;
  } catch (err) {
    console.error('[apple] Could not trade an authorization code:', err.message);
    return null;
  }
}

/**
 * Tells Apple that the person's link with the app is over (it is listed in their Apple ID settings until then). True when
 * Apple took it; false when the server has no key to ask with, there is no token or Apple did not take it. `clientId` is the
 * one the token was kept for (the app's, when none is said).
 */
export async function revokeAppleToken(refreshToken, { settings = config, fetchImpl = fetch, clientId } = {}) {
  try {
    if (!refreshToken || !canAskApple(settings)) return false;
    const answer = await askApple(
      '/revoke',
      { token: refreshToken, token_type_hint: 'refresh_token' },
      { settings, fetchImpl, clientId }
    );
    if (answer.response.ok) return true;
    console.error(`[apple] Could not revoke a token: ${refusal(answer)}`);
    return false;
  } catch (err) {
    console.error('[apple] Could not revoke a token:', err.message);
    return false;
  }
}
