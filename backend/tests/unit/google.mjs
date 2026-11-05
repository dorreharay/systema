import assert from 'node:assert/strict';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { verifyGoogleAccessToken, verifyGoogleIdToken } from '../../src/utils/google.js';
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

// ---------------------------------------------------------------------------
// The access token of the web build: Google is asked about it (tokeninfo for whom it was made out to, userinfo for the name)
// ---------------------------------------------------------------------------
const ACCESS = 'ya29.an-access-token';
const TOKENINFO = 'https://google.test/tokeninfo';
const USERINFO = 'https://google.test/userinfo';

/** What Google answers to the question about a token that is good, unless `extra` says otherwise (`undefined` takes a field away). */
const tokeninfo = (extra = {}) => {
  const answer = { azp: WEB, aud: WEB, sub: '1001', scope: 'openid email profile', exp: '4102444800', expires_in: '3599', email: ' Ann@Example.com ', email_verified: 'true', access_type: 'online', ...extra };
  return Object.fromEntries(Object.entries(answer).filter(([, value]) => value !== undefined));
};
const userinfo = (extra = {}) => ({ sub: '1001', name: ' Ann Lee ', email: 'ann@example.com', email_verified: true, ...extra });

/** A fetch that answers each address as `answers` says ([status, body]) and remembers what it was asked. */
function fakeGoogle(answers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const answer = answers[url];
    if (answer instanceof Error) throw answer;
    const [status, body] = answer;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetchImpl, calls };
}
const ask = (answers, settings = {}) => {
  const { fetchImpl, calls } = fakeGoogle(answers);
  return { calls, run: () => verifyGoogleAccessToken(ACCESS, { clientIds: [WEB, IOS], fetchImpl, tokeninfoUrl: TOKENINFO, userinfoUrl: USERINFO, ...settings }) };
};
const good = { [TOKENINFO]: [200, tokeninfo()], [USERINFO]: [200, userinfo()] };
const refusedAccess = (answers, status, code, settings) =>
  assert.rejects(
    () => ask(answers, settings).run(),
    (err) => err instanceof HttpError && err.status === status && err.code === code
  );

// A good token says who it is for, in the shape of an ID token's answer, with the email tidied and the name from userinfo.
{
  const { calls, run } = ask(good);
  assert.deepEqual(await run(), { sub: '1001', email: 'ann@example.com', emailVerified: true, name: 'Ann Lee' });
  // Asked as a form, with the token in the body and not in the address; the name with the token as a bearer.
  const [question, profile] = calls;
  assert.equal(question.url, TOKENINFO);
  assert.equal(question.init.method, 'POST');
  assert.equal(question.init.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(question.init.body.get('access_token'), ACCESS);
  assert.ok(question.init.signal instanceof AbortSignal, 'with a time limit');
  assert.equal(profile.url, USERINFO);
  assert.equal(profile.init.headers.authorization, `Bearer ${ACCESS}`);
  assert.ok(![question.url, profile.url].some((url) => url.includes(ACCESS)), 'in no address');
}

// Any of our clients may be the audience; the flag arrives as the text "true", or as a boolean, and only a true one counts.
assert.equal((await ask({ ...good, [TOKENINFO]: [200, tokeninfo({ aud: IOS })] }).run()).sub, '1001', 'the second client');
for (const [given, expected] of [['true', true], [true, true], ['false', false], [false, false], [undefined, false], ['yes', false]]) {
  const answers = { ...good, [TOKENINFO]: [200, tokeninfo({ email_verified: given })] };
  assert.equal((await ask(answers).run()).emailVerified, expected, `email_verified: ${JSON.stringify(given)}`);
}

// What is not accepted: a token made out to another app (it proves nothing about this one), and answers that say nobody.
await refusedAccess({ ...good, [TOKENINFO]: [200, tokeninfo({ aud: 'other.apps.googleusercontent.com' })] }, 401, 'google_token_invalid');
await refusedAccess({ ...good, [TOKENINFO]: [200, tokeninfo({ aud: undefined })] }, 401, 'google_token_invalid');
await refusedAccess({ ...good, [TOKENINFO]: [200, tokeninfo({ aud: [WEB] })] }, 401, 'google_token_invalid');
await refusedAccess({ ...good, [TOKENINFO]: [200, tokeninfo({ sub: undefined })] }, 401, 'google_token_invalid');
await refusedAccess({ ...good, [TOKENINFO]: [200, tokeninfo({ sub: '' })] }, 401, 'google_token_invalid');
await refusedAccess({ ...good, [TOKENINFO]: [200, tokeninfo({ email: undefined })] }, 401, 'google_token_invalid');
await refusedAccess({ ...good, [TOKENINFO]: [200, tokeninfo({ expires_in: '0' })] }, 401, 'google_token_invalid');
await refusedAccess({ ...good, [TOKENINFO]: [200, tokeninfo({ expires_in: undefined })] }, 401, 'google_token_invalid');
await refusedAccess({ ...good, [TOKENINFO]: [200, null] }, 401, 'google_token_invalid');
for (const status of [400, 401, 403, 404]) {
  await refusedAccess({ ...good, [TOKENINFO]: [status, { error: 'invalid_token', error_description: 'Invalid Value' }] }, 401, 'google_token_invalid');
}

// Without client IDs the server cannot tell whose token this is, so it says so and asks nobody.
{
  const { calls, run } = ask(good, { clientIds: [] });
  await assert.rejects(run, (err) => err instanceof HttpError && err.status === 503 && err.code === 'google_not_configured');
  assert.equal(calls.length, 0, 'Google is not asked');
}

// Google busy, down or out of reach is not the token's fault, and is said in the log (without the token).
{
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  try {
    for (const answers of [
      { ...good, [TOKENINFO]: [429, {}] },
      { ...good, [TOKENINFO]: [500, {}] },
      { ...good, [TOKENINFO]: [503, undefined] },
      { ...good, [TOKENINFO]: new Error('connect ECONNREFUSED') },
      { ...good, [TOKENINFO]: Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' }) },
    ]) {
      await refusedAccess(answers, 503, 'google_unavailable');
    }
  } finally {
    console.error = silenced;
  }
  assert.equal(logged.length, 5, 'each is logged');
  assert.ok(logged.every((line) => line.startsWith('[google]') && !line.includes(ACCESS)), 'under [google], with no token in it');
}

// The name is an extra: whatever goes wrong with it, the person is let in with none.
{
  console.error = () => {};
  try {
    for (const [label, answer] of [
      ['refused', [401, { error: 'invalid_request' }]],
      ['failing', [500, {}]],
      ['not reached', new Error('connect ECONNREFUSED')],
      ['no name', [200, userinfo({ name: undefined })]],
      ['a blank name', [200, userinfo({ name: '  ' })]],
      ['a name that is not text', [200, userinfo({ name: 42 })]],
      ['someone else', [200, userinfo({ sub: '2002' })]],
      ['nothing', [200, null]],
    ]) {
      const result = await ask({ ...good, [USERINFO]: answer }).run();
      assert.deepEqual([result.sub, result.name], ['1001', null], label);
    }
  } finally {
    console.error = silenced;
  }
  assert.equal((await ask({ ...good, [USERINFO]: [200, userinfo({ name: 'n'.repeat(150) })] }).run()).name.length, 100, 'a name of 100 at most');
}

console.log('google: ok');
