import assert from 'node:assert/strict';
import { SignJWT, createLocalJWKSet, errors, exportJWK, exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { loadConfig } from '../../src/config.js';
import {
  appleClientSecret,
  exchangeAppleAuthorizationCode,
  revokeAppleToken,
  verifyAppleIdentityToken,
} from '../../src/utils/apple.js';
import { HttpError } from '../../src/utils/http.js';

const APP = 'com.example.restring';
const DEV_APP = 'com.example.restring.dev';

// ---------------------------------------------------------------------------
// The identity token
// ---------------------------------------------------------------------------
const { publicKey, privateKey } = await generateKeyPair('RS256');
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] });
const options = { keys, clientIds: [APP, DEV_APP] };

/** A token as Apple would issue it, unless `claims` or the header options say otherwise. */
const sign = ({ key = privateKey, kid = 'k1', alg = 'RS256', expires = '10m', ...claims } = {}) =>
  new SignJWT({
    iss: 'https://appleid.apple.com',
    aud: APP,
    sub: '001234.abcdef.5678',
    email: ' Ann@Example.com ',
    email_verified: 'true',
    is_private_email: 'false',
    ...claims,
  })
    .setProtectedHeader({ alg, kid })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key);

const refused = (token, status, code, settings = options) =>
  assert.rejects(
    () => verifyAppleIdentityToken(token, settings),
    (err) => err instanceof HttpError && err.status === status && err.code === code
  );
const check = async (claims) => verifyAppleIdentityToken(await sign(claims), options);

// A good token says who it is for, with the email tidied.
assert.deepEqual(await verifyAppleIdentityToken(await sign(), options), {
  sub: '001234.abcdef.5678',
  email: 'ann@example.com',
  emailVerified: true,
  isPrivateEmail: false,
  audience: APP,
});

// Either of our identifiers (the app's bundle ID, the Services ID of the web sign-in) may be the audience, and the result says
// which it was: a token may name more than one audience, and the first of ours that it names is the one.
assert.equal((await check({ aud: DEV_APP })).sub, '001234.abcdef.5678', 'the second one');
assert.equal((await check({ aud: DEV_APP })).audience, DEV_APP, 'and it is named');
assert.equal((await check({ aud: ['com.example.other', APP] })).sub, '001234.abcdef.5678', 'one of several audiences');
assert.equal((await check({ aud: ['com.example.other', DEV_APP, APP] })).audience, APP, 'the first of ours in the list, whatever the token puts first');

// A person who hides their address has one Apple made up for this app.
assert.deepEqual(await check({ email: 'x7k2m9@privaterelay.appleid.com', is_private_email: true }), {
  sub: '001234.abcdef.5678',
  email: 'x7k2m9@privaterelay.appleid.com',
  emailVerified: true,
  isPrivateEmail: true,
  audience: APP,
});

// The flags arrive as booleans or as the strings "true" and "false", or not at all. Only a true one counts.
for (const [given, expected] of [[true, true], ['true', true], [false, false], ['false', false], [undefined, false], ['yes', false], [1, false]]) {
  assert.equal((await check({ email_verified: given })).emailVerified, expected, `email_verified: ${JSON.stringify(given)}`);
  assert.equal((await check({ is_private_email: given })).isPrivateEmail, expected, `is_private_email: ${JSON.stringify(given)}`);
}

// The email can be missing (the person shared none, or Apple left it out): reported as null, and the token is still good.
for (const email of [undefined, '', '   ', 42, null]) {
  const { email: said, sub } = await check({ email });
  assert.deepEqual([said, sub], [null, '001234.abcdef.5678'], `email: ${JSON.stringify(email)}`);
}

// What is not accepted.
await refused(await sign({ aud: 'com.example.other' }), 401, 'apple_token_invalid');
await refused(await sign({ aud: undefined }), 401, 'apple_token_invalid');
await refused(await sign({ iss: 'https://accounts.google.com' }), 401, 'apple_token_invalid');
await refused(await sign({ iss: 'appleid.apple.com' }), 401, 'apple_token_invalid');
await refused(await sign({ iss: 'https://appleid.apple.com.evil.example' }), 401, 'apple_token_invalid');
await refused(await sign({ iss: undefined }), 401, 'apple_token_invalid');
await refused(await sign({ expires: Math.floor(Date.now() / 1000) - 60 }), 401, 'apple_token_invalid');
await refused(await sign({ key: (await generateKeyPair('RS256')).privateKey }), 401, 'apple_token_invalid');
await refused(await sign({ kid: 'unknown-key' }), 401, 'apple_token_invalid');
await refused(await sign({ sub: undefined }), 401, 'apple_token_invalid');
await refused(await sign({ sub: '' }), 401, 'apple_token_invalid');
await refused(await sign({ sub: 1001 }), 401, 'apple_token_invalid');
await refused('not.a.jwt', 401, 'apple_token_invalid');
await refused('', 401, 'apple_token_invalid');

// A token signed with a shared secret (HS256), with another kind of key (ES256), or with no signature, is not Apple's,
// whatever it claims.
const secret = new TextEncoder().encode('x'.repeat(32));
await refused(await sign({ alg: 'HS256', key: secret }), 401, 'apple_token_invalid');
await refused(await sign({ alg: 'ES256', key: (await generateKeyPair('ES256')).privateKey }), 401, 'apple_token_invalid');
const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: 'https://appleid.apple.com', aud: APP, sub: '1', email: 'a@b.c' })).toString('base64url')}.`;
await refused(unsigned, 401, 'apple_token_invalid');

// Without client IDs the server cannot tell whose token this is, so it says so instead of accepting any, whatever it is given.
await refused(await sign(), 503, 'apple_not_configured', { keys, clientIds: [] });
await refused('not.a.jwt', 503, 'apple_not_configured', { keys, clientIds: [] });

// Apple's keys out of reach is not the token's fault.
const unreachable = () => Promise.reject(new Error('connect ECONNREFUSED'));
const silenced = console.error;
const logged = [];
console.error = (...args) => logged.push(args.join(' '));
try {
  await refused(await sign(), 503, 'apple_unavailable', { keys: unreachable, clientIds: [APP] });
} finally {
  console.error = silenced;
}
assert.ok(logged.length === 1 && logged[0].startsWith('[apple]') && logged[0].includes('ECONNREFUSED'), 'and it is logged');

// ---------------------------------------------------------------------------
// The server's own calls to Apple: the client secret, the trade of a code for a token, revoking a token
// ---------------------------------------------------------------------------
const signing = await generateKeyPair('ES256', { extractable: true });
const pem = await exportPKCS8(signing.privateKey);
const TEAM = 'TEAM123456';
const KEY = 'KEY1234567';
const settings = loadConfig({
  APPLE_CLIENT_IDS: `${APP}, ${DEV_APP}`,
  APPLE_TEAM_ID: TEAM,
  APPLE_KEY_ID: KEY,
  // The way a .p8 file goes into a one-line variable.
  APPLE_PRIVATE_KEY: pem.trim().replace(/\n/g, '\\n'),
  APPLE_AUTH_URL: 'https://apple.test/auth/',
});

/** A client secret as Apple would check it: signed with the key it knows, and naming the team, the key and the client (the app by default). */
async function readSecret(token, subject = APP) {
  const { payload, protectedHeader } = await jwtVerify(token, signing.publicKey, {
    algorithms: ['ES256'],
    issuer: TEAM,
    audience: 'https://appleid.apple.com',
    subject,
  });
  return { payload, protectedHeader };
}

// The client secret: ES256, the key's id in the header, the team, the audience and the first app in the claims, a few minutes to live.
{
  const before = Math.floor(Date.now() / 1000);
  const { payload, protectedHeader } = await readSecret(await appleClientSecret(settings));
  assert.equal(protectedHeader.alg, 'ES256');
  assert.equal(protectedHeader.kid, KEY, 'the id of the key');
  assert.deepEqual([payload.iss, payload.aud, payload.sub], [TEAM, 'https://appleid.apple.com', APP], 'team, audience, the first app');
  assert.ok(payload.iat >= before && payload.iat <= before + 5, 'issued now');
  const lifetime = payload.exp - payload.iat;
  assert.ok(lifetime >= 60 && lifetime <= 600, `a few minutes, not days: ${lifetime}s`);
  // It speaks for the client it is asked to (the Services ID of the web sign-in, say), and for the first one without a say.
  for (const [asked, expected] of [[DEV_APP, DEV_APP], [undefined, APP], [null, APP], ['', APP]]) {
    const { payload } = await readSecret(await appleClientSecret(settings, asked), expected);
    assert.equal(payload.sub, expected, `client secret for ${JSON.stringify(asked)}`);
  }
  // Only the key it was signed with checks out.
  const secretOf = await appleClientSecret(settings);
  const { publicKey: strangerKey } = await generateKeyPair('ES256');
  await assert.rejects(
    () => jwtVerify(secretOf, strangerKey, { algorithms: ['ES256'] }),
    (err) => err instanceof errors.JWSSignatureVerificationFailed
  );
}

/** A fetch that answers with `status` and `body`, and remembers what it was asked. */
function fakeFetch(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, form: Object.fromEntries(init.body) });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetchImpl, calls };
}
/** A fetch that never gets an answer. */
const failing = (name, message) => async () => {
  throw Object.assign(new Error(message), { name });
};

// Anything logged is read here, and none of it may contain a secret.
const output = [];
console.error = (...args) => output.push(args.join(' '));
const CODE = 'c1234.0.abcd.xyz-authorization-code';
const REFRESH = 'r1234.0.abcd.xyz-refresh-token';
try {
  // The trade: where, how, and with what.
  {
    const { fetchImpl, calls } = fakeFetch(200, { access_token: 'a-1', token_type: 'Bearer', expires_in: 3600, refresh_token: REFRESH, id_token: 'x.y.z' });
    assert.equal(await exchangeAppleAuthorizationCode(CODE, { settings, fetchImpl }), REFRESH, 'the refresh token');
    const [{ url, init, form }] = calls;
    assert.equal(url, 'https://apple.test/auth/token', 'the base has no trailing slash');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/x-www-form-urlencoded');
    assert.ok(init.signal instanceof AbortSignal, 'with a time limit');
    assert.deepEqual(Object.keys(form).sort(), ['client_id', 'client_secret', 'code', 'grant_type'], 'the fields');
    assert.deepEqual([form.grant_type, form.code, form.client_id], ['authorization_code', CODE, APP], 'what they say');
    assert.equal((await readSecret(form.client_secret)).protectedHeader.kid, KEY, 'signed as Apple expects');
  }

  // As the client the code was made out to: the Services ID of the web sign-in, not the app's bundle ID. Apple wants the one that
  // got the code to trade it, and the one that got the token to revoke it.
  {
    const { fetchImpl, calls } = fakeFetch(200, { refresh_token: REFRESH });
    assert.equal(await exchangeAppleAuthorizationCode(CODE, { settings, fetchImpl, clientId: DEV_APP }), REFRESH);
    assert.equal(calls[0].form.client_id, DEV_APP, 'the trade is made as that client');
    assert.equal((await readSecret(calls[0].form.client_secret, DEV_APP)).payload.sub, DEV_APP, 'with a secret that speaks for it');
    // Nothing named, or nothing kept (null from the database): the app's.
    for (const clientId of [undefined, null, '']) {
      const plain = fakeFetch(200, { refresh_token: REFRESH });
      await exchangeAppleAuthorizationCode(CODE, { settings, fetchImpl: plain.fetchImpl, clientId });
      assert.equal(plain.calls[0].form.client_id, APP, `the app's when the client is ${JSON.stringify(clientId)}`);
    }
  }
  {
    const { fetchImpl, calls } = fakeFetch(200, undefined);
    assert.equal(await revokeAppleToken(REFRESH, { settings, fetchImpl, clientId: DEV_APP }), true);
    assert.equal(calls[0].form.client_id, DEV_APP, 'the revoking is made as that client');
    assert.equal((await readSecret(calls[0].form.client_secret, DEV_APP)).payload.sub, DEV_APP, 'with a secret that speaks for it');
    for (const clientId of [undefined, null, '']) {
      const plain = fakeFetch(200, undefined);
      await revokeAppleToken(REFRESH, { settings, fetchImpl: plain.fetchImpl, clientId });
      assert.equal(plain.calls[0].form.client_id, APP, `the app's when the client is ${JSON.stringify(clientId)}`);
    }
  }

  // What Apple does not give.
  for (const [status, body] of [
    [400, { error: 'invalid_grant', error_description: 'The code has expired or has been revoked.' }],
    [400, { error: 'invalid_client' }],
    [500, undefined],
    [200, {}],
    [200, { refresh_token: '' }],
    [200, { refresh_token: 42 }],
  ]) {
    const { fetchImpl, calls } = fakeFetch(status, body);
    assert.equal(await exchangeAppleAuthorizationCode(CODE, { settings, fetchImpl }), null, `${status} ${JSON.stringify(body)}`);
    assert.equal(calls.length, 1);
  }
  for (const failure of [failing('TypeError', 'fetch failed'), failing('TimeoutError', 'The operation timed out')]) {
    assert.equal(await exchangeAppleAuthorizationCode(CODE, { settings, fetchImpl: failure }), null, 'not reached');
  }

  // Revoking: where, how, and with what.
  {
    const { fetchImpl, calls } = fakeFetch(200, undefined);
    assert.equal(await revokeAppleToken(REFRESH, { settings, fetchImpl }), true);
    const [{ url, init, form }] = calls;
    assert.equal(url, 'https://apple.test/auth/revoke');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/x-www-form-urlencoded');
    assert.ok(init.signal instanceof AbortSignal, 'with a time limit');
    assert.deepEqual(Object.keys(form).sort(), ['client_id', 'client_secret', 'token', 'token_type_hint'], 'the fields');
    assert.deepEqual([form.token, form.token_type_hint, form.client_id], [REFRESH, 'refresh_token', APP], 'what they say');
    assert.equal((await readSecret(form.client_secret)).protectedHeader.kid, KEY, 'signed as Apple expects');
  }
  for (const [status, body] of [[400, { error: 'invalid_request' }], [401, { error: 'invalid_client' }], [500, undefined]]) {
    const { fetchImpl } = fakeFetch(status, body);
    assert.equal(await revokeAppleToken(REFRESH, { settings, fetchImpl }), false, `${status}`);
  }
  for (const failure of [failing('TypeError', 'fetch failed'), failing('TimeoutError', 'The operation timed out')]) {
    assert.equal(await revokeAppleToken(REFRESH, { settings, fetchImpl: failure }), false, 'not reached');
  }

  // Without a key to ask with (any of the three missing, or no app) neither calls Apple at all, and neither is an error.
  const without = (name) => loadConfig({ APPLE_CLIENT_IDS: APP, APPLE_TEAM_ID: TEAM, APPLE_KEY_ID: KEY, APPLE_PRIVATE_KEY: pem, [name]: '' });
  for (const incomplete of [
    loadConfig({ APPLE_CLIENT_IDS: APP }),
    without('APPLE_TEAM_ID'),
    without('APPLE_KEY_ID'),
    without('APPLE_PRIVATE_KEY'),
    without('APPLE_CLIENT_IDS'),
  ]) {
    const { fetchImpl, calls } = fakeFetch(200, { refresh_token: REFRESH });
    assert.equal(await exchangeAppleAuthorizationCode(CODE, { settings: incomplete, fetchImpl }), null);
    assert.equal(await revokeAppleToken(REFRESH, { settings: incomplete, fetchImpl }), false);
    assert.equal(calls.length, 0, 'Apple is not asked');
  }

  // Nothing to revoke is not a call.
  {
    const { fetchImpl, calls } = fakeFetch(200, undefined);
    for (const token of [undefined, null, '']) assert.equal(await revokeAppleToken(token, { settings, fetchImpl }), false);
    assert.equal(calls.length, 0, 'Apple is not asked');
  }

  // A key that is not a key makes no client secret, and so no call; the failure is swallowed like any other.
  {
    const broken = loadConfig({ APPLE_CLIENT_IDS: APP, APPLE_TEAM_ID: TEAM, APPLE_KEY_ID: KEY, APPLE_PRIVATE_KEY: 'not a key' });
    const { fetchImpl, calls } = fakeFetch(200, { refresh_token: REFRESH });
    assert.equal(await exchangeAppleAuthorizationCode(CODE, { settings: broken, fetchImpl }), null);
    assert.equal(await revokeAppleToken(REFRESH, { settings: broken, fetchImpl }), false);
    assert.equal(calls.length, 0, 'Apple is not asked');
  }
} finally {
  console.error = silenced;
}

// Failures are logged under [apple], and none of what is secret gets into the log: the code, the token, the client secret
// (any JWT starts with eyJ), the key.
assert.ok(output.length >= 10, `failures are logged (${output.length} lines)`);
assert.ok(output.every((line) => line.startsWith('[apple]')), 'every line says where it is from');
assert.ok(output.some((line) => line.includes('invalid_grant')), 'with the reason Apple gave');
const secrets = [CODE, REFRESH, pem.split('\n')[1], 'eyJ'];
assert.ok(!output.some((line) => secrets.some((secret) => line.includes(secret))), 'and no secret');

console.log('apple: ok');
