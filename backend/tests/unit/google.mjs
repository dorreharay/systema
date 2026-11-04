import assert from 'node:assert/strict';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { verifyGoogleIdToken } from '../../src/utils/google.js';
import { HttpError } from '../../src/utils/http.js';

const WEB = 'web.apps.googleusercontent.com';
const IOS = 'ios.apps.googleusercontent.com';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] });
const options = { keys, clientIds: [WEB, IOS] };

/** A token as Google would issue it, unless `claims` or the header options say otherwise. */
const sign = ({ key = privateKey, kid = 'k1', alg = 'RS256', expires = '1h', ...claims } = {}) =>
  new SignJWT({
    iss: 'https://accounts.google.com',
    aud: WEB,
    sub: '1001',
    email: ' Ann@Example.com ',
    email_verified: true,
    name: ' Ann Lee ',
    ...claims,
  })
    .setProtectedHeader({ alg, kid })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key);

const refused = (token, status, code, settings = options) =>
  assert.rejects(
    () => verifyGoogleIdToken(token, settings),
    (err) => err instanceof HttpError && err.status === status && err.code === code
  );

// A good token says who it is for, with the email tidied.
assert.deepEqual(await verifyGoogleIdToken(await sign(), options), {
  sub: '1001',
  email: 'ann@example.com',
  emailVerified: true,
  name: 'Ann Lee',
});

// Either of our clients may be the audience; both spellings of the issuer are Google's.
assert.equal((await verifyGoogleIdToken(await sign({ aud: IOS }), options)).sub, '1001', 'the iOS client');
assert.equal((await verifyGoogleIdToken(await sign({ iss: 'accounts.google.com' }), options)).sub, '1001', 'the short issuer');

// An address Google has not verified is reported as it is: the route decides what to do with it.
assert.equal((await verifyGoogleIdToken(await sign({ email_verified: false }), options)).emailVerified, false);
assert.equal((await verifyGoogleIdToken(await sign({ email_verified: undefined }), options)).emailVerified, false, 'absent');
assert.equal((await verifyGoogleIdToken(await sign({ email_verified: 'true' }), options)).emailVerified, true, 'as a string');
assert.equal((await verifyGoogleIdToken(await sign({ name: undefined }), options)).name, null, 'no name');

// What is not accepted.
await refused(await sign({ aud: 'other.apps.googleusercontent.com' }), 401, 'google_token_invalid');
await refused(await sign({ aud: undefined }), 401, 'google_token_invalid');
await refused(await sign({ iss: 'https://evil.example' }), 401, 'google_token_invalid');
await refused(await sign({ expires: Math.floor(Date.now() / 1000) - 60 }), 401, 'google_token_invalid');
await refused(await sign({ key: (await generateKeyPair('RS256')).privateKey }), 401, 'google_token_invalid');
await refused(await sign({ kid: 'unknown-key' }), 401, 'google_token_invalid');
await refused(await sign({ sub: undefined }), 401, 'google_token_invalid');
await refused(await sign({ email: undefined }), 401, 'google_token_invalid');
await refused('not.a.jwt', 401, 'google_token_invalid');
await refused('', 401, 'google_token_invalid');

// A token signed with a shared secret (HS256), or with no signature, is not Google's, whatever it claims.
const secret = new TextEncoder().encode('x'.repeat(32));
await refused(await sign({ alg: 'HS256', key: secret }), 401, 'google_token_invalid');
const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: 'accounts.google.com', aud: WEB, sub: '1', email: 'a@b.c' })).toString('base64url')}.`;
await refused(unsigned, 401, 'google_token_invalid');

// Without client IDs the server cannot tell whose token this is, so it says so instead of accepting any.
await refused(await sign(), 503, 'google_not_configured', { keys, clientIds: [] });

// Google's keys out of reach is not the token's fault.
const unreachable = () => Promise.reject(new Error('connect ECONNREFUSED'));
const silenced = console.error;
console.error = () => {};
await refused(await sign(), 503, 'google_unavailable', { keys: unreachable, clientIds: [WEB] });
console.error = silenced;

console.log('google: ok');
