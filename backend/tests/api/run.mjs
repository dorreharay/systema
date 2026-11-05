/**
 * API integration tests.
 *
 * Starts the real server against a dedicated test database and exercises the API end to end.
 *
 *   npm run test:api
 *
 * Exits with a non-zero code if any test fails.
 */
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  CONFIG, Client, assertEq, assertStatus, assertTrue,
  dbExec, dbScalar, resetDatabase, startFakeApple, startFakeGoogle, startFakeResend, startServer,
} from './harness.mjs';

const tests = [];
const test = (group, name, fn) => tests.push({ group, name, fn });

const password = 'correct-horse-1';
let counter = 0;
const newEmail = () => `user${++counter}@test.local`;

/** The languages of the app, each with a word that the subject of its password reset email has (not read from the server's own texts). */
const RESET_SUBJECT_WORD = {
  en: 'Password reset',
  de: 'Passwort',
  fr: 'mot de passe',
  es: 'contraseña',
  it: 'password',
  pt: 'senha',
  ja: 'パスワード',
  uk: 'Відновлення пароля',
  pl: 'hasła',
};
const LANGUAGES = Object.keys(RESET_SUBJECT_WORD);

/** The reset link in the email the server printed for this address. */
function resetTokenFor(ctx, email) {
  const logs = ctx.server.logs();
  const at = logs.lastIndexOf(`To: ${email}`);
  assertTrue(at !== -1, `an email to ${email} was printed`);
  const match = logs.slice(at).match(/reset-password\?token=([\w-]+)/);
  assertTrue(match, 'the email has a reset link');
  return match[1];
}

async function register(ctx, email = newEmail(), extra = {}) {
  const client = new Client(ctx.server.base);
  const res = await client.post('/api/auth/register', { email, password, ...extra });
  assertStatus(res, 201);
  return { client, email, res };
}

// ---------------------------------------------------------------------------
// Health and errors
// ---------------------------------------------------------------------------
test('Health', 'GET /api/health answers ok', async (ctx) => {
  const res = await ctx.anon.get('/api/health');
  assertStatus(res, 200);
  assertEq(res.data, { ok: true }, 'health body');
});
test('Health', 'sets security headers', async (ctx) => {
  const res = await ctx.anon.get('/api/health');
  assertEq(res.headers.get('x-content-type-options'), 'nosniff', 'x-content-type-options');
  assertEq(res.headers.get('x-powered-by'), null, 'x-powered-by is hidden');
});
test('Errors', 'an unknown /api path is a JSON 404', async (ctx) => {
  const res = await ctx.anon.get('/api/nothing-here');
  assertStatus(res, 404);
  assertEq(res.data, { error: 'Not found' }, 'body');
});
test('Errors', 'a body that is not JSON is a 400', async (ctx) => {
  const res = await fetch(`${ctx.server.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{bad',
  });
  assertEq(res.status, 400, 'status');
  assertEq((await res.json()).code, 'invalid_json', 'code');
});

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------
test('Register', 'rejects an invalid email and a short password, naming both fields', async (ctx) => {
  const res = await ctx.anon.post('/api/auth/register', { email: 'nope', password: 'short' });
  assertStatus(res, 400);
  assertEq(res.data.code, 'validation_error', 'code');
  assertTrue(res.data.fields.email, 'email is named');
  assertTrue(res.data.fields.password, 'password is named');
});
test('Register', 'rejects a password over 72 bytes', async (ctx) => {
  const res = await ctx.anon.post('/api/auth/register', { email: newEmail(), password: 'a'.repeat(73) });
  assertStatus(res, 400);
  assertTrue(res.data.fields.password, 'password is named');
});
test('Register', 'creates the account, signs in and hides the secrets', async (ctx) => {
  const { client, res } = await register(ctx, 'Mixed.Case@Test.Local ', { full_name: ' Ann ' });
  assertEq(res.data.user.email, 'mixed.case@test.local', 'email is trimmed and lower case');
  assertEq(res.data.user.full_name, 'Ann', 'name is trimmed');
  assertEq(res.data.user.role, 'user', 'role');
  assertTrue(res.data.token, 'a token is returned for native clients');
  assertTrue(client.cookies.has('auth_token'), 'the session cookie is set');
  assertTrue(!('password_hash' in res.data.user), 'password_hash is not exposed');
  assertTrue(!('reset_token_hash' in res.data.user), 'reset_token_hash is not exposed');
  assertTrue(dbScalar(`SELECT password_hash FROM users WHERE email='mixed.case@test.local'`).startsWith('$2'), 'the password is stored hashed');
});
test('Register', 'makes the account in the language the app was in, when it is one the server knows', async (ctx) => {
  for (const language of LANGUAGES) {
    const { client, res } = await register(ctx, newEmail(), { language });
    assertEq(res.data.user.language, language, `${language}, as asked`);
    assertEq((await client.get('/api/auth/me')).data.language, language, `and it is the one the account has (${language})`);
  }
  assertEq((await register(ctx)).res.data.user.language, 'en', 'English where none is named');
  // Not a reason to turn a sign-up away: the language is a hint.
  assertEq((await register(ctx, newEmail(), { language: 'xx' })).res.data.user.language, 'en', 'a language the server does not know is ignored');
});
test('Register', 'refuses an email that is already taken, whatever its case', async (ctx) => {
  const { email } = await register(ctx);
  const res = await ctx.anon.post('/api/auth/register', { email: email.toUpperCase(), password });
  assertStatus(res, 409);
  assertEq(res.data.code, 'email_taken', 'code');
});
test('Register', 'two sign-ups with one address at once: one wins, none is a 500', async (ctx) => {
  const email = newEmail();
  const results = await Promise.all([1, 2, 3].map(() => new Client(ctx.server.base).post('/api/auth/register', { email, password })));
  const statuses = results.map((r) => r.status).sort();
  assertEq(statuses, [201, 409, 409], 'statuses');
});

// ---------------------------------------------------------------------------
// Login and session
// ---------------------------------------------------------------------------
test('Login', 'requires an email and a password', async (ctx) => {
  assertStatus(await ctx.anon.post('/api/auth/login', {}), 400);
});
test('Login', 'refuses a wrong password and an unknown email with the same answer', async (ctx) => {
  const { email } = await register(ctx);
  const wrong = await ctx.anon.post('/api/auth/login', { email, password: 'not-the-password' });
  const unknown = await ctx.anon.post('/api/auth/login', { email: 'nobody@test.local', password });
  assertStatus(wrong, 401);
  assertStatus(unknown, 401);
  assertEq(wrong.data, unknown.data, 'the two answers are identical');
});
test('Login', 'signs in with a cookie and with a Bearer token', async (ctx) => {
  const { email } = await register(ctx);

  const browser = new Client(ctx.server.base);
  const login = await browser.post('/api/auth/login', { email: email.toUpperCase(), password });
  assertStatus(login, 200);
  assertStatus(await browser.get('/api/auth/me'), 200);

  const native = new Client(ctx.server.base);
  native.token = login.data.token;
  const me = await native.get('/api/auth/me');
  assertStatus(me, 200);
  assertEq(me.data.email, email, 'the same user');
});
test('Login', 'an inactive account cannot sign in or use a session it already had', async (ctx) => {
  const { client, email } = await register(ctx);
  dbExec(`UPDATE users SET is_active=false WHERE email='${email}'`);
  const login = await ctx.anon.post('/api/auth/login', { email, password });
  assertStatus(login, 403);
  assertEq(login.data.code, 'account_inactive', 'code');
  assertStatus(await client.get('/api/auth/me'), 401);
});
test('Session', '/me needs authentication', async (ctx) => {
  assertStatus(await ctx.anon.get('/api/auth/me'), 401);
});
test('Session', 'rejects a forged or malformed token', async (ctx) => {
  const client = new Client(ctx.server.base);
  client.token = 'not.a.jwt';
  assertStatus(await client.get('/api/auth/me'), 401);
});
test('Session', 'PATCH /me changes the name', async (ctx) => {
  const { client } = await register(ctx);
  const res = await client.patch('/api/auth/me', { full_name: 'New Name' });
  assertStatus(res, 200);
  assertEq(res.data.full_name, 'New Name', 'name');
  assertStatus(await client.patch('/api/auth/me', { email: 'x@test.local' }), 400);
});
test('Session', 'logout ends the cookie session', async (ctx) => {
  const { client } = await register(ctx);
  assertStatus(await client.post('/api/auth/logout'), 200);
  assertTrue(!client.cookies.has('auth_token'), 'the cookie is cleared');
  assertStatus(await client.get('/api/auth/me'), 401);
});

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------
test('Reset', 'forgot-password answers the same for an unknown address and sends nothing', async (ctx) => {
  const known = (await register(ctx)).email;
  const a = await ctx.anon.post('/api/auth/forgot-password', { email: known });
  const b = await ctx.anon.post('/api/auth/forgot-password', { email: 'nobody@test.local' });
  assertStatus(a, 200);
  assertStatus(b, 200);
  assertEq(a.data, b.data, 'identical answers');
  assertTrue(!ctx.server.logs().includes('To: nobody@test.local'), 'no email to an unknown address');
});
test('Reset', 'forgot-password rejects something that is not an email', async (ctx) => {
  assertStatus(await ctx.anon.post('/api/auth/forgot-password', { email: 'nope' }), 400);
});
test('Reset', 'the token is stored hashed, not as sent', async (ctx) => {
  const { email } = await register(ctx);
  await ctx.anon.post('/api/auth/forgot-password', { email });
  await new Promise((r) => setTimeout(r, 300));
  const token = resetTokenFor(ctx, email);
  assertTrue(dbScalar(`SELECT reset_token_hash FROM users WHERE email='${email}'`) !== token, 'not stored as is');
});
test('Reset', 'a valid token sets a new password, once, and ends old sessions', async (ctx) => {
  const { client: oldSession, email } = await register(ctx);
  await ctx.anon.post('/api/auth/forgot-password', { email });
  await new Promise((r) => setTimeout(r, 300));
  const token = resetTokenFor(ctx, email);

  // Sessions are compared by the second, so let the old one be older than the change.
  await new Promise((r) => setTimeout(r, 1100));

  const weak = await ctx.anon.post('/api/auth/reset-password', { token, password: 'short' });
  assertStatus(weak, 400);

  const done = await ctx.anon.post('/api/auth/reset-password', { token, password: 'a-brand-new-pass-2' });
  assertStatus(done, 200);

  assertStatus(await ctx.anon.post('/api/auth/login', { email, password }), 401);
  assertStatus(await ctx.anon.post('/api/auth/login', { email, password: 'a-brand-new-pass-2' }), 200);
  assertStatus(await oldSession.get('/api/auth/me'), 401);

  const again = await ctx.anon.post('/api/auth/reset-password', { token, password: 'another-pass-3' });
  assertStatus(again, 400);
  assertEq(again.data.code, 'invalid_reset_token', 'code');
});
test('Reset', 'an unknown or expired token is refused', async (ctx) => {
  assertStatus(await ctx.anon.post('/api/auth/reset-password', { token: 'nope', password }), 400);

  const { email } = await register(ctx);
  await ctx.anon.post('/api/auth/forgot-password', { email });
  await new Promise((r) => setTimeout(r, 300));
  const token = resetTokenFor(ctx, email);
  dbExec(`UPDATE users SET reset_token_expires = now() - interval '1 minute' WHERE email='${email}'`);
  assertStatus(await ctx.anon.post('/api/auth/reset-password', { token, password }), 400);
});

// ---------------------------------------------------------------------------
// Sign in with Google (Google itself is played by the harness: see startFakeGoogle)
// ---------------------------------------------------------------------------
let googleCounter = 0;
/** The claims of a Google user nobody has met before. */
const googleUser = (extra = {}) => {
  const n = ++googleCounter;
  return { sub: `google-sub-${n}`, email: `google${n}@test.local`, name: 'Gina Google', ...extra };
};
/** Signs in with an ID token made from `options` (see idToken in the harness), as a client of its own. */
async function googleLogin(ctx, options, body = {}) {
  const client = new Client(ctx.server.base);
  const res = await client.post('/api/auth/google', { id_token: await ctx.google.idToken(options), ...body });
  return { client, res };
}
const googleUserCount = (email) => dbScalar(`SELECT count(*) FROM users WHERE email='${email}'`);

test('Google', 'a first sign-in makes the account, signs in and keeps the secrets', async (ctx) => {
  const user = googleUser({ email: 'Gina.Google@Test.Local' });
  const { client, res } = await googleLogin(ctx, user);
  assertStatus(res, 201);
  assertEq(res.data.user.email, 'gina.google@test.local', 'the email, in lower case');
  assertEq(res.data.user.full_name, 'Gina Google', 'the name is Google\'s');
  assertEq(res.data.user.setup_completed, false, 'the first-run setup is still to do');
  assertTrue(res.data.token, 'a token is returned for native clients');
  assertTrue(client.cookies.has('auth_token'), 'the session cookie is set');
  assertTrue(!('google_sub' in res.data.user) && !('password_hash' in res.data.user), 'the secrets are not exposed');
  assertEq(dbScalar(`SELECT google_sub FROM users WHERE email='gina.google@test.local'`), user.sub, 'the Google id is kept');
  assertEq(dbScalar(`SELECT password_hash IS NULL FROM users WHERE email='gina.google@test.local'`), 't', 'there is no password');
  assertEq((await client.get('/api/auth/me')).data.email, 'gina.google@test.local', 'the session works');
  assertTrue(Number(dbScalar(`SELECT count(*) FROM services WHERE user_id='${res.data.user.id}'`)) > 0, 'the default services are made');
});
test('Google', 'a new account is made in the language the app was in, and a later sign-in does not change it', async (ctx) => {
  const user = googleUser();
  const first = await googleLogin(ctx, user, { language: 'uk' });
  assertStatus(first.res, 201);
  assertEq(first.res.data.user.language, 'uk', 'the language of the app');
  const again = await googleLogin(ctx, user, { language: 'en' });
  assertStatus(again.res, 200);
  assertEq(again.res.data.user.language, 'uk', 'the account keeps its own');
  assertEq((await googleLogin(ctx, googleUser(), { language: 'xx' })).res.data.user.language, 'en', 'a language the server does not know is ignored');
});
test('Google', 'the same Google user gets the same account, whatever address Google now has for them', async (ctx) => {
  const user = googleUser();
  const first = await googleLogin(ctx, user);
  const again = await googleLogin(ctx, { ...user, email: 'moved@test.local' });
  assertStatus(again.res, 200);
  assertEq(again.res.data.user.id, first.res.data.user.id, 'the same account');
  assertEq(again.res.data.user.email, user.email, 'the address of the account is not rewritten');
  assertEq(googleUserCount('moved@test.local'), '0', 'no second account');
});
test('Google', 'an account with the same email is linked: its password is removed and its sessions end', async (ctx) => {
  const { client: oldSession, email, res: registered } = await register(ctx);
  // Sessions are compared by the second, so let the old one be older than the change.
  await new Promise((r) => setTimeout(r, 1100));

  const { client, res } = await googleLogin(ctx, googleUser({ email }));
  assertStatus(res, 200);
  assertEq(res.data.user.id, registered.data.user.id, 'the account that was there');
  assertEq(res.data.user.full_name, 'Gina Google', 'a name it did not have is filled in');
  assertStatus(await new Client(ctx.server.base).post('/api/auth/login', { email, password }), 401);
  assertStatus(await oldSession.get('/api/auth/me'), 401);
  assertStatus(await client.get('/api/auth/me'), 200);
});
test('Google', 'linking keeps the name the account already has', async (ctx) => {
  const { email } = await register(ctx, newEmail(), { full_name: 'Ann' });
  const { res } = await googleLogin(ctx, googleUser({ email }));
  assertStatus(res, 200);
  assertEq(res.data.user.full_name, 'Ann', 'name');
});
test('Google', 'an address linked to one Google user is not given to another', async (ctx) => {
  const user = googleUser();
  await googleLogin(ctx, user);
  const other = await googleLogin(ctx, googleUser({ email: user.email }));
  assertStatus(other.res, 409);
  assertEq(other.res.data.code, 'google_account_mismatch', 'code');
});
test('Google', 'refuses a token made for another app', async (ctx) => {
  const user = googleUser();
  const { res } = await googleLogin(ctx, { ...user, aud: 'someone-elses-app.apps.googleusercontent.com' });
  assertStatus(res, 401);
  assertEq(res.data.code, 'google_token_invalid', 'code');
  assertEq(googleUserCount(user.email), '0', 'no account');
});
test('Google', 'refuses an expired token', async (ctx) => {
  const { res } = await googleLogin(ctx, { ...googleUser(), expires: Math.floor(Date.now() / 1000) - 60 });
  assertStatus(res, 401);
  assertEq(res.data.code, 'google_token_invalid', 'code');
});
test('Google', 'refuses a token from another issuer', async (ctx) => {
  const { res } = await googleLogin(ctx, { ...googleUser(), iss: 'https://accounts.evil.example' });
  assertStatus(res, 401);
  assertEq(res.data.code, 'google_token_invalid', 'code');
});
test('Google', 'refuses a token that Google did not sign', async (ctx) => {
  const user = googleUser();
  const { res } = await googleLogin(ctx, { ...user, key: await ctx.google.otherKey() });
  assertStatus(res, 401);
  assertEq(res.data.code, 'google_token_invalid', 'code');
  assertEq(googleUserCount(user.email), '0', 'no account');
});
test('Google', 'refuses something that is not a token, and a request without one', async (ctx) => {
  const garbage = await ctx.anon.post('/api/auth/google', { id_token: 'not.a.jwt' });
  assertStatus(garbage, 401);
  assertEq(garbage.data.code, 'google_token_invalid', 'code');

  const missing = await ctx.anon.post('/api/auth/google', {});
  assertStatus(missing, 400);
  assertTrue(missing.data.fields.id_token, 'id_token is named');
});
test('Google', 'refuses an address Google has not verified, and makes no account', async (ctx) => {
  const user = googleUser();
  const { res } = await googleLogin(ctx, { ...user, email_verified: false });
  assertStatus(res, 403);
  assertEq(res.data.code, 'google_email_unverified', 'code');
  assertEq(googleUserCount(user.email), '0', 'no account');
});
test('Google', 'an inactive account cannot sign in with Google either, and is left as it was', async (ctx) => {
  const { email } = await register(ctx);
  dbExec(`UPDATE users SET is_active=false WHERE email='${email}'`);
  const { res } = await googleLogin(ctx, googleUser({ email }));
  assertStatus(res, 403);
  assertEq(res.data.code, 'account_inactive', 'code');
  assertEq(dbScalar(`SELECT google_sub IS NULL AND password_hash IS NOT NULL FROM users WHERE email='${email}'`), 't', 'not linked, password kept');
});
test('Google', 'a first sign-in that arrives three times at once makes one account', async (ctx) => {
  const user = googleUser();
  const token = await ctx.google.idToken(user);
  const results = await Promise.all(
    [1, 2, 3].map(() => new Client(ctx.server.base).post('/api/auth/google', { id_token: token }))
  );
  assertEq(results.map((r) => r.status).sort(), [200, 200, 201], 'one makes the account, the others find it');
  assertEq(googleUserCount(user.email), '1', 'one account');
});
test('Google', 'an address a Google account has cannot be registered with a password', async (ctx) => {
  const user = googleUser();
  await googleLogin(ctx, user);
  const res = await ctx.anon.post('/api/auth/register', { email: user.email, password });
  assertStatus(res, 409);
  assertEq(res.data.code, 'email_taken', 'code');
});
test('Google', 'an account made with Google has no password until it sets one, and Google keeps working', async (ctx) => {
  const user = googleUser();
  await googleLogin(ctx, user);

  const wrong = await new Client(ctx.server.base).post('/api/auth/login', { email: user.email, password });
  assertStatus(wrong, 401);
  assertEq(wrong.data.code, 'invalid_credentials', 'the answer for a wrong password');

  await ctx.anon.post('/api/auth/forgot-password', { email: user.email });
  await new Promise((r) => setTimeout(r, 300));
  const token = resetTokenFor(ctx, user.email);
  assertStatus(await ctx.anon.post('/api/auth/reset-password', { token, password: 'a-brand-new-pass-2' }), 200);
  assertStatus(await new Client(ctx.server.base).post('/api/auth/login', { email: user.email, password: 'a-brand-new-pass-2' }), 200);
  assertStatus((await googleLogin(ctx, user)).res, 200);
});
test('Google', 'is off while the server has no client IDs', async (ctx) => {
  const server = await startServer({ port: CONFIG.port + 1, env: { GOOGLE_CLIENT_IDS: '' } });
  try {
    const res = await new Client(server.base).post('/api/auth/google', { id_token: await ctx.google.idToken(googleUser()) });
    assertStatus(res, 503);
    assertEq(res.data.code, 'google_not_configured', 'code');
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------
// Sign in with Apple (Apple itself is played by the harness: see startFakeApple)
// ---------------------------------------------------------------------------
let appleCounter = 0;
/** The claims of an Apple user nobody has met before. */
const appleUser = (extra = {}) => {
  const n = ++appleCounter;
  return { sub: `apple-sub-${n}`, email: `apple${n}@test.local`, ...extra };
};
/** Signs in with an identity token made from `claims` (see identityToken in the harness), as a client of its own. */
async function appleLogin(ctx, claims, body = {}) {
  const client = new Client(ctx.server.base);
  const res = await client.post('/api/auth/apple', { identity_token: await ctx.apple.identityToken(claims), ...body });
  return { client, res };
}
const appleUserCount = (email) => dbScalar(`SELECT count(*) FROM users WHERE email='${email}'`);
let appleCodeCounter = 0;
/** An authorization code nobody has used, so that a test can find what became of it. */
const appleCode = () => `apple-code-${++appleCodeCounter}`;
const tradedFor = (ctx, code) => ctx.apple.asked('token').filter((request) => request.fields.code === code);
const refreshTokenOf = (email) => dbScalar(`SELECT apple_refresh_token FROM users WHERE email='${email}'`);

test('Apple', 'a first sign-in makes the account, signs in and keeps the secrets', async (ctx) => {
  const user = appleUser({ email: ' Annie.Apple@Test.Local' });
  const traded = ctx.apple.asked('token').length;
  const { client, res } = await appleLogin(ctx, user, { full_name: ' Annie Apple ' });
  assertStatus(res, 201);
  assertEq(res.data.user.email, 'annie.apple@test.local', 'the email, tidied');
  assertEq(res.data.user.full_name, 'Annie Apple', 'the name the app passed on, trimmed');
  assertEq(res.data.user.has_password, false, 'there is no password');
  assertEq(res.data.user.setup_completed, false, 'the first-run setup is still to do');
  assertTrue(res.data.token, 'a token is returned for native clients');
  assertTrue(client.cookies.has('auth_token'), 'the session cookie is set');
  const hidden = ['apple_sub', 'apple_refresh_token', 'google_sub', 'password_hash'];
  assertTrue(hidden.every((field) => !(field in res.data.user)), 'the secrets are not exposed');
  assertEq(dbScalar(`SELECT apple_sub FROM users WHERE email='annie.apple@test.local'`), user.sub, 'the Apple id is kept');
  assertEq(dbScalar(`SELECT password_hash IS NULL FROM users WHERE email='annie.apple@test.local'`), 't', 'there is no password');
  assertEq(refreshTokenOf('annie.apple@test.local'), '', 'no code, no token');
  assertEq(ctx.apple.asked('token').length, traded, 'and Apple was not asked for one');
  assertEq((await client.get('/api/auth/me')).data.email, 'annie.apple@test.local', 'the session works');
  assertTrue(Number(dbScalar(`SELECT count(*) FROM services WHERE user_id='${res.data.user.id}'`)) > 0, 'the default services are made');
});
test('Apple', 'a new account is made in the language the app was in, and a later sign-in does not change it', async (ctx) => {
  const user = appleUser();
  const first = await appleLogin(ctx, user, { language: 'uk' });
  assertStatus(first.res, 201);
  assertEq(first.res.data.user.language, 'uk', 'the language of the app');
  const again = await appleLogin(ctx, user, { language: 'en' });
  assertStatus(again.res, 200);
  assertEq(again.res.data.user.language, 'uk', 'the account keeps its own');
  assertEq((await appleLogin(ctx, appleUser(), { language: 'xx' })).res.data.user.language, 'en', 'a language the server does not know is ignored');
});
test('Apple', 'a person who hides their address gets an account on the one Apple made up for the app', async (ctx) => {
  const email = 'x7k2m9q4@privaterelay.appleid.com';
  const { res } = await appleLogin(ctx, appleUser({ email, is_private_email: 'true' }));
  assertStatus(res, 201);
  assertEq(res.data.user.email, email, 'the relay address');
});
test('Apple', 'the name the app passes on is saved when the account is made, and only then', async (ctx) => {
  const user = appleUser();
  assertEq((await appleLogin(ctx, user, { full_name: '  Anna Apple  ' })).res.data.user.full_name, 'Anna Apple', 'saved, trimmed');
  assertEq((await appleLogin(ctx, user, { full_name: 'Someone Else' })).res.data.user.full_name, 'Anna Apple', 'a later sign-in does not rewrite it');
  assertEq((await appleLogin(ctx, appleUser())).res.data.user.full_name, null, 'none passed on, none kept');
  assertEq((await appleLogin(ctx, appleUser(), { full_name: '   ' })).res.data.user.full_name, null, 'a blank one is none');

  // An account that was there already is linked, not made: it does not take the name, whether it has one or not.
  const nameless = await register(ctx);
  assertEq((await appleLogin(ctx, appleUser({ email: nameless.email }), { full_name: 'Not Hers' })).res.data.user.full_name, null, 'none');
  const named = await register(ctx, newEmail(), { full_name: 'Ann' });
  assertEq((await appleLogin(ctx, appleUser({ email: named.email }), { full_name: 'Not Hers' })).res.data.user.full_name, 'Ann', 'its own');
});
test('Apple', 'the same Apple user gets the same account, whatever address Apple now has for them', async (ctx) => {
  const user = appleUser();
  const first = await appleLogin(ctx, user);
  const again = await appleLogin(ctx, { ...user, email: 'moved@test.local' });
  assertStatus(again.res, 200);
  assertEq(again.res.data.user.id, first.res.data.user.id, 'the same account');
  assertEq(again.res.data.user.email, user.email, 'the address of the account is not rewritten');
  assertEq(appleUserCount('moved@test.local'), '0', 'no second account');
});
test('Apple', 'a token with no email signs in the person who has an account, and only them', async (ctx) => {
  const user = appleUser();
  const first = await appleLogin(ctx, user);
  const again = await appleLogin(ctx, { sub: user.sub, email: undefined });
  assertStatus(again.res, 200);
  assertEq(again.res.data.user.id, first.res.data.user.id, 'found by the Apple id');

  const stranger = appleUser({ email: undefined });
  const refused = await appleLogin(ctx, stranger);
  assertStatus(refused.res, 400);
  assertEq(refused.res.data.code, 'apple_email_missing', 'code');
  assertEq(dbScalar(`SELECT count(*) FROM users WHERE apple_sub='${stranger.sub}'`), '0', 'no account');
  for (const email of ['', '   ', 'not-an-address']) {
    const odd = await appleLogin(ctx, appleUser({ email }));
    assertEq([odd.res.status, odd.res.data.code], [400, 'apple_email_missing'], `refused for ${JSON.stringify(email)}`);
  }
});
test('Apple', 'an account with the same verified email is linked: its password is removed and its sessions end', async (ctx) => {
  const { client: oldSession, email, res: registered } = await register(ctx);
  // Sessions are compared by the second, so let the old one be older than the change.
  await new Promise((r) => setTimeout(r, 1100));

  const user = appleUser({ email: email.toUpperCase() });
  const { client, res } = await appleLogin(ctx, user);
  assertStatus(res, 200);
  assertEq(res.data.user.id, registered.data.user.id, 'the account that was there');
  assertEq(dbScalar(`SELECT apple_sub FROM users WHERE email='${email}'`), user.sub, 'linked');
  assertStatus(await new Client(ctx.server.base).post('/api/auth/login', { email, password }), 401);
  assertStatus(await oldSession.get('/api/auth/me'), 401);
  assertStatus(await client.get('/api/auth/me'), 200);
  assertEq(res.data.user.has_password, false, 'it has none now');
  assertEq(appleUserCount(email), '1', 'no second account');
  assertStatus((await appleLogin(ctx, user)).res, 200);
});
test('Apple', 'a flag that is a real boolean counts too', async (ctx) => {
  const { email } = await register(ctx);
  assertStatus((await appleLogin(ctx, appleUser({ email, email_verified: true }))).res, 200);
});
test('Apple', 'an account with no password keeps its sessions when it is linked', async (ctx) => {
  const google = await googleLogin(ctx, googleUser());
  const { res } = await appleLogin(ctx, appleUser({ email: google.res.data.user.email }));
  assertStatus(res, 200);
  assertEq(res.data.user.id, google.res.data.user.id, 'the account that was there');
  assertStatus(await google.client.get('/api/auth/me'), 200);
});
test('Apple', 'an email that Apple does not call verified does not link an account', async (ctx) => {
  const { client, email } = await register(ctx);
  for (const flag of ['false', false, undefined]) {
    const user = appleUser({ email, email_verified: flag });
    const { res } = await appleLogin(ctx, user);
    assertStatus(res, 409);
    assertEq(res.data.code, 'email_taken', `code for ${JSON.stringify(flag)}`);
    assertEq(dbScalar(`SELECT count(*) FROM users WHERE apple_sub='${user.sub}'`), '0', 'no account for the Apple user');
  }
  assertEq(dbScalar(`SELECT apple_sub IS NULL AND password_hash IS NOT NULL FROM users WHERE email='${email}'`), 't', 'not linked, password kept');
  assertStatus(await new Client(ctx.server.base).post('/api/auth/login', { email, password }), 200);
  assertStatus(await client.get('/api/auth/me'), 200);
});
test('Apple', 'an unverified email is no obstacle to an account when nobody has the address', async (ctx) => {
  const { res } = await appleLogin(ctx, appleUser({ email_verified: 'false' }));
  assertStatus(res, 201);
});
test('Apple', 'an address linked to one Apple user is not given to another', async (ctx) => {
  const user = appleUser();
  await appleLogin(ctx, user);
  const other = await appleLogin(ctx, appleUser({ email: user.email }));
  assertStatus(other.res, 409);
  assertEq(other.res.data.code, 'apple_account_mismatch', 'code');
});
test('Apple', 'an inactive account cannot sign in with Apple, linked or not, and is left as it was', async (ctx) => {
  const { email } = await register(ctx);
  dbExec(`UPDATE users SET is_active=false WHERE email='${email}'`);
  const unlinked = await appleLogin(ctx, appleUser({ email }));
  assertStatus(unlinked.res, 403);
  assertEq(unlinked.res.data.code, 'account_inactive', 'code');
  assertEq(dbScalar(`SELECT apple_sub IS NULL AND password_hash IS NOT NULL FROM users WHERE email='${email}'`), 't', 'not linked, password kept');

  const user = appleUser();
  await appleLogin(ctx, user);
  dbExec(`UPDATE users SET is_active=false WHERE email='${user.email}'`);
  const linked = await appleLogin(ctx, user);
  assertEq([linked.res.status, linked.res.data.code], [403, 'account_inactive'], 'linked');
});
test('Apple', 'refuses a token made for another app', async (ctx) => {
  const user = appleUser();
  const { res } = await appleLogin(ctx, { ...user, aud: 'com.someone.else' });
  assertStatus(res, 401);
  assertEq(res.data.code, 'apple_token_invalid', 'code');
  assertEq(appleUserCount(user.email), '0', 'no account');
});
test('Apple', 'refuses an expired token', async (ctx) => {
  const { res } = await appleLogin(ctx, { ...appleUser(), expires: Math.floor(Date.now() / 1000) - 60 });
  assertStatus(res, 401);
  assertEq(res.data.code, 'apple_token_invalid', 'code');
});
test('Apple', 'refuses a token from another issuer, Google for one', async (ctx) => {
  for (const iss of ['https://accounts.google.com', 'https://appleid.apple.com.evil.example']) {
    const { res } = await appleLogin(ctx, { ...appleUser(), iss });
    assertStatus(res, 401);
    assertEq(res.data.code, 'apple_token_invalid', `code for ${iss}`);
  }
});
test('Apple', 'refuses a token that Apple did not sign', async (ctx) => {
  const user = appleUser();
  const { res } = await appleLogin(ctx, { ...user, key: await ctx.apple.otherKey() });
  assertStatus(res, 401);
  assertEq(res.data.code, 'apple_token_invalid', 'code');
  assertEq(appleUserCount(user.email), '0', 'no account');
});
test('Apple', 'refuses something that is not a token, and a request that is not right', async (ctx) => {
  const garbage = await ctx.anon.post('/api/auth/apple', { identity_token: 'not.a.jwt' });
  assertStatus(garbage, 401);
  assertEq(garbage.data.code, 'apple_token_invalid', 'code');

  const token = await ctx.apple.identityToken(appleUser());
  const missing = await ctx.anon.post('/api/auth/apple', {});
  assertStatus(missing, 400);
  assertTrue(missing.data.fields.identity_token, 'identity_token is named');
  assertTrue((await ctx.anon.post('/api/auth/apple', { identity_token: '' })).data.fields.identity_token, 'not empty');
  assertTrue((await ctx.anon.post('/api/auth/apple', { identity_token: 42 })).data.fields.identity_token, 'a string');
  assertTrue((await ctx.anon.post('/api/auth/apple', { identity_token: 'a'.repeat(8193) })).data.fields.identity_token, 'not huge');
  assertTrue((await ctx.anon.post('/api/auth/apple', { identity_token: token, full_name: 'n'.repeat(101) })).data.fields.full_name, 'a name of 100 at most');
  assertTrue((await ctx.anon.post('/api/auth/apple', { identity_token: token, full_name: 7 })).data.fields.full_name, 'a name is text');
  assertTrue((await ctx.anon.post('/api/auth/apple', { identity_token: token, authorization_code: 'c'.repeat(2049) })).data.fields.authorization_code, 'a code of 2048 at most');
  assertTrue((await ctx.anon.post('/api/auth/apple', { identity_token: token, authorization_code: 7 })).data.fields.authorization_code, 'a code is text');
  const limits = await ctx.anon.post('/api/auth/apple', { identity_token: token, full_name: 'n'.repeat(100), authorization_code: 'c'.repeat(2048) });
  assertStatus(limits, 201);
});
test('Apple', 'a first sign-in that arrives three times at once makes one account', async (ctx) => {
  const user = appleUser();
  const token = await ctx.apple.identityToken(user);
  const results = await Promise.all(
    [1, 2, 3].map(() => new Client(ctx.server.base).post('/api/auth/apple', { identity_token: token, full_name: 'Twice Over' }))
  );
  assertEq(results.map((r) => r.status).sort(), [200, 200, 201], 'one makes the account, the others find it');
  assertEq(appleUserCount(user.email), '1', 'one account');
});
test('Apple', 'an address an Apple account has cannot be registered with a password', async (ctx) => {
  const user = appleUser();
  await appleLogin(ctx, user);
  const res = await ctx.anon.post('/api/auth/register', { email: user.email, password });
  assertStatus(res, 409);
  assertEq(res.data.code, 'email_taken', 'code');
});
test('Apple', 'an account made with Apple has no password until it sets one, and Apple keeps working', async (ctx) => {
  const user = appleUser();
  await appleLogin(ctx, user);

  const wrong = await new Client(ctx.server.base).post('/api/auth/login', { email: user.email, password });
  assertStatus(wrong, 401);
  assertEq(wrong.data.code, 'invalid_credentials', 'the answer for a wrong password');

  await ctx.anon.post('/api/auth/forgot-password', { email: user.email });
  await new Promise((r) => setTimeout(r, 300));
  const token = resetTokenFor(ctx, user.email);
  assertStatus(await ctx.anon.post('/api/auth/reset-password', { token, password: 'a-brand-new-pass-2' }), 200);
  assertStatus(await new Client(ctx.server.base).post('/api/auth/login', { email: user.email, password: 'a-brand-new-pass-2' }), 200);
  assertStatus((await appleLogin(ctx, user)).res, 200);
});
test('Apple', 'is off while the server has no bundle IDs', async (ctx) => {
  const server = await startServer({ port: CONFIG.port + 1, env: { APPLE_CLIENT_IDS: '' } });
  try {
    const res = await new Client(server.base).post('/api/auth/apple', { identity_token: await ctx.apple.identityToken(appleUser()) });
    assertStatus(res, 503);
    assertEq(res.data.code, 'apple_not_configured', 'code');
  } finally {
    await server.stop();
  }
});
test('Apple', 'a new account starts with the default services and the starter catalog, like any other', async (ctx) => {
  const server = await startServer({ port: CONFIG.port + 1, env: { ...ctx.apple.env, STARTER_CATALOG: 'true' } });
  try {
    const client = new Client(server.base);
    const res = await client.post('/api/auth/apple', { identity_token: await ctx.apple.identityToken(appleUser()) });
    assertStatus(res, 201);
    assertEq((await client.get('/api/services')).data.items.length, 3, 'the default services');
    const rackets = (await client.get('/api/rackets?kind=catalog')).data.items;
    assertTrue(rackets.length >= 50, `rackets: ${rackets.length}`);
    assertTrue(rackets.every((r) => r.track_stock && r.stock === 0 && !r.available), 'counted, none in stock');
    const strings = (await client.get('/api/strings')).data.items;
    assertTrue(strings.length >= 50, `strings: ${strings.length}`);
    assertTrue(strings.every((s) => s.track_stock && s.stock === 0 && !s.available), 'counted, none in stock');
  } finally {
    await server.stop();
  }
});

// The authorization code of a sign-in is traded with Apple for a token that can be revoked when the account is deleted. It
// is an extra: nothing that goes wrong with it stops the sign-in.
test('Apple', 'the authorization code is traded for a refresh token, which is kept', async (ctx) => {
  const user = appleUser();
  const code = appleCode();
  const { res } = await appleLogin(ctx, user, { authorization_code: code });
  assertStatus(res, 201);
  assertEq(refreshTokenOf(user.email), `refresh-${code}`, 'what Apple gave for the code');
  assertTrue(!JSON.stringify(res.data).includes(`refresh-${code}`), 'and it is not sent to anyone');

  // What Apple was asked, and how.
  const [request, ...more] = tradedFor(ctx, code);
  assertEq(more.length, 0, 'once');
  assertEq(request.contentType, 'application/x-www-form-urlencoded', 'as a form');
  assertEq(
    [request.fields.grant_type, request.fields.code, request.fields.client_id],
    ['authorization_code', code, ctx.apple.clientId],
    'for this app'
  );
  assertEq(request.secret.valid, true, `with a client secret Apple accepts: ${request.secret.reason}`);
  assertEq([request.secret.header.alg, request.secret.header.kid], ['ES256', ctx.apple.keyId], 'ES256, and the key it is signed with');
  const { iss, sub, aud, iat, exp } = request.secret.claims;
  assertEq([iss, sub, aud], [ctx.apple.teamId, ctx.apple.clientId, 'https://appleid.apple.com'], 'team, app, audience');
  assertTrue(exp > iat && exp - iat <= 600, 'a few minutes to live');

  // Neither the code nor what came of it is in the log.
  const logs = ctx.server.logs();
  assertTrue(!logs.includes(code) && !logs.includes(`refresh-${code}`), 'nothing secret is printed');
});
test('Apple', 'a later sign-in with a new code keeps the newer token, and a link with a code keeps one too', async (ctx) => {
  const user = appleUser();
  await appleLogin(ctx, user, { authorization_code: appleCode() });
  const second = appleCode();
  assertStatus((await appleLogin(ctx, user, { authorization_code: second })).res, 200);
  assertEq(refreshTokenOf(user.email), `refresh-${second}`, 'the newer');

  // A sign-in that brings no code leaves the token alone.
  assertStatus((await appleLogin(ctx, user)).res, 200);
  assertEq(refreshTokenOf(user.email), `refresh-${second}`, 'still the newer');

  const { email } = await register(ctx);
  const code = appleCode();
  assertStatus((await appleLogin(ctx, appleUser({ email }), { authorization_code: code })).res, 200);
  assertEq(refreshTokenOf(email), `refresh-${code}`, 'kept when an account is linked');
});
test('Apple', 'a code Apple refuses does not stop the sign-in', async (ctx) => {
  ctx.apple.answer('token', 400, { error: 'invalid_grant', error_description: 'The code has expired or has been revoked.' });
  try {
    const user = appleUser();
    const code = appleCode();
    const { res } = await appleLogin(ctx, user, { authorization_code: code });
    assertStatus(res, 201);
    assertEq(refreshTokenOf(user.email), '', 'no token');
    assertEq(tradedFor(ctx, code).length, 1, 'Apple was asked');
    await until(() => ctx.server.logs().includes('[apple] Could not trade an authorization code: 400 invalid_grant'), 'the reason in the log');
    assertTrue(!ctx.server.logs().includes(code), 'but not the code');

    ctx.apple.answer('token', 200, { access_token: 'a', token_type: 'Bearer' });
    const bare = appleUser();
    assertStatus((await appleLogin(ctx, bare, { authorization_code: appleCode() })).res, 201);
    assertEq(refreshTokenOf(bare.email), '', 'an answer without a token is no token');
  } finally {
    ctx.apple.answer('token');
  }
});
test('Apple', 'an Apple that cannot be reached does not stop the sign-in either', async (ctx) => {
  // Nothing listens on port 1, so the connection is refused at once.
  const server = await startServer({ port: CONFIG.port + 1, env: { ...ctx.apple.env, APPLE_AUTH_URL: 'http://127.0.0.1:1/auth' } });
  try {
    const user = appleUser();
    const res = await new Client(server.base).post('/api/auth/apple', {
      identity_token: await ctx.apple.identityToken(user),
      authorization_code: appleCode(),
    });
    assertStatus(res, 201);
    assertEq(refreshTokenOf(user.email), '', 'no token');
    assertTrue(server.logs().includes('[apple] Could not trade an authorization code'), 'and it is said in the log');
  } finally {
    await server.stop();
  }
});
test('Apple', 'a server with no key to ask Apple with takes the code and does nothing with it', async (ctx) => {
  // Signing in only: the app and where Apple's keys are, but not the team, the key and the .p8 file.
  const { APPLE_CLIENT_IDS, APPLE_KEYS_URL, APPLE_AUTH_URL } = ctx.apple.env;
  const server = await startServer({ port: CONFIG.port + 1, env: { APPLE_CLIENT_IDS, APPLE_KEYS_URL, APPLE_AUTH_URL } });
  try {
    const user = appleUser();
    const code = appleCode();
    const res = await new Client(server.base).post('/api/auth/apple', {
      identity_token: await ctx.apple.identityToken(user),
      authorization_code: code,
    });
    assertStatus(res, 201);
    assertEq(refreshTokenOf(user.email), '', 'no token');
    assertEq(tradedFor(ctx, code).length, 0, 'Apple was not asked');
  } finally {
    await server.stop();
  }
});
test('Apple', 'a sign-in that is turned away does not trade its code', async (ctx) => {
  const codes = [];
  const withCode = () => {
    codes.push(appleCode());
    return { authorization_code: codes.at(-1) };
  };

  const { email } = await register(ctx);
  dbExec(`UPDATE users SET is_active=false WHERE email='${email}'`);
  assertStatus((await appleLogin(ctx, appleUser({ email }), withCode())).res, 403);

  const taken = appleUser();
  await appleLogin(ctx, taken);
  assertStatus((await appleLogin(ctx, appleUser({ email: taken.email }), withCode())).res, 409);

  assertStatus((await appleLogin(ctx, appleUser({ email: undefined }), withCode())).res, 400);
  assertStatus((await appleLogin(ctx, { ...appleUser(), aud: 'com.someone.else' }, withCode())).res, 401);
  assertStatus(await new Client(ctx.server.base).post('/api/auth/apple', { identity_token: 'not.a.jwt', ...withCode() }), 401);

  assertEq(codes.map((code) => tradedFor(ctx, code).length), [0, 0, 0, 0, 0], 'Apple was never asked');
});

// ---------------------------------------------------------------------------
// Profile and preferences
// ---------------------------------------------------------------------------
test('Profile', 'a new account has the default preferences and has not done the setup', async (ctx) => {
  const { res } = await register(ctx);
  const { user } = res.data;
  assertEq(
    [user.currency, user.tension_unit, user.timezone, user.language, user.setup_completed, user.workshop_name],
    ['USD', 'kg', 'UTC', 'en', false, null],
    'defaults'
  );
  assertTrue(!('order_counter' in user), 'the order counter is not exposed');
});
test('Profile', 'PATCH /me saves the setup and marks it done', async (ctx) => {
  const { client } = await register(ctx);
  const res = await client.patch('/api/auth/me', {
    full_name: 'Alex Stringer',
    workshop_name: ' Baseline Strings ',
    currency: 'eur',
    tension_unit: 'lbs',
    timezone: 'Europe/Kyiv',
    language: 'uk',
    notifications_enabled: false,
    setup_completed: true,
  });
  assertStatus(res, 200);
  assertEq(
    [res.data.workshop_name, res.data.currency, res.data.tension_unit, res.data.timezone, res.data.language, res.data.notifications_enabled, res.data.setup_completed],
    ['Baseline Strings', 'EUR', 'lbs', 'Europe/Kyiv', 'uk', false, true],
    'saved'
  );
  assertEq((await client.get('/api/auth/me')).data.tension_unit, 'lbs', 'it persists');
});
test('Profile', 'rejects a bad currency, unit, time zone and language', async (ctx) => {
  const { client } = await register(ctx);
  const res = await client.patch('/api/auth/me', { currency: 'EURO', tension_unit: 'N', timezone: 'Mars/Base', language: 'xx' });
  assertStatus(res, 400);
  for (const field of ['currency', 'tension_unit', 'timezone', 'language']) assertTrue(res.data.fields[field], `${field} is named`);
  assertStatus(await client.patch('/api/auth/me', {}), 400);
});
test('Profile', 'a new account starts with the usual services, without prices', async (ctx) => {
  const { client } = await register(ctx);
  const { data } = await client.get('/api/services');
  assertEq(data.items.map((s) => s.name), ['Stringing Labor', 'Grip Replacement', 'Overgrip Installation'], 'names');
  assertEq(data.items[0].kind, 'labor', 'the first is the labor');
  assertTrue(data.items.every((s) => s.price === null && s.active), 'no prices, all active');
});
test('Profile', 'the usual services of a new account are named in its language', async (ctx) => {
  const labor = new Set();
  for (const language of LANGUAGES) {
    const { client } = await register(ctx, newEmail(), { language });
    const { data } = await client.get('/api/services');
    assertEq(data.items.length, 3, `${language}: the three services`);
    assertEq(data.items[0].kind, 'labor', `${language}: the first is the labor`);
    assertTrue(data.items.every((s) => s.price === null && s.active), `${language}: no prices, all active`);
    labor.add(data.items[0].name);
  }
  assertEq(labor.size, LANGUAGES.length, 'each language names the labor in its own words');

  const ukrainian = await register(ctx, newEmail(), { language: 'uk' });
  const names = (await ukrainian.client.get('/api/services')).data.items.map((s) => s.name);
  assertEq(names.sort(), ['Заміна гріпа', 'Намотування овергріпа', 'Робота з перетяжки'].sort(), 'the Ukrainian names');
  // A language the server does not know is English, like the account.
  const unknown = await register(ctx, newEmail(), { language: 'xx' });
  assertEq((await unknown.client.get('/api/services')).data.items[0].name, 'Stringing Labor', 'English for any other');
});

// ---------------------------------------------------------------------------
// The workshop: clients, rackets, strings, services
// ---------------------------------------------------------------------------
async function shop(ctx) {
  const { client } = await register(ctx);
  const customer = (await client.post('/api/clients', { name: 'Maria Sharapova', phone: '+380501112233' })).data;
  const racket = (await client.post('/api/rackets', { client_id: customer.id, brand: 'Wilson', model: 'Pro Staff 97' })).data;
  const string = (await client.post('/api/strings', { brand: 'Luxilon', model: 'ALU Power', gauge: '1.25 mm', type: 'polyester', default_price: 12.5 })).data;
  return { client, customer, racket, string };
}
const minimalOrder = (s, extra = {}) => ({ client_id: s.customer.id, racket_id: s.racket.id, ...extra });

test('Clients', 'the name and the phone are required; email and notes are optional', async (ctx) => {
  const { client } = await register(ctx);
  assertStatus(await client.post('/api/clients', {}), 400);
  assertStatus(await client.post('/api/clients', { name: '   ', phone: '+380501112233' }), 400);
  assertStatus(await client.post('/api/clients', { name: 'Ann' }), 400);
  assertStatus(await client.post('/api/clients', { name: 'Ann', phone: '   ' }), 400);
  const res = await client.post('/api/clients', { name: ' Ann ', phone: ' +380501112233 ', email: '' });
  assertStatus(res, 201);
  assertEq([res.data.name, res.data.phone, res.data.email], ['Ann', '+380501112233', null], 'trimmed, empty is null');
  assertStatus(await client.post('/api/clients', { name: 'Bob', phone: '+380509998877', email: 'not-an-email' }), 400);
  assertStatus(await client.patch(`/api/clients/${res.data.id}`, { phone: '' }), 400);
});
test('Clients', 'the list searches by name and phone and counts rackets', async (ctx) => {
  const s = await shop(ctx);
  await s.client.post('/api/clients', { name: 'Zed', phone: '+380671234567' });
  assertEq((await s.client.get('/api/clients')).data.items.map((c) => c.name), ['Maria Sharapova', 'Zed'], 'sorted by name');
  assertEq((await s.client.get('/api/clients?q=shara')).data.items.length, 1, 'by name');
  assertEq((await s.client.get('/api/clients?q=0501')).data.items.length, 1, 'by phone');
  assertEq((await s.client.get('/api/clients?q=100%25')).data.items.length, 0, '% is a character, not a wildcard');
  const [maria] = (await s.client.get('/api/clients?q=maria')).data.items;
  assertEq([maria.rackets_count, maria.orders_count, maria.last_order_date], [1, 0, null], 'counts');
});
test('Clients', 'the details have rackets and the order history', async (ctx) => {
  const s = await shop(ctx);
  assertStatus(await s.client.post('/api/orders', minimalOrder(s, { received_date: '2026-03-01' })), 201);
  const { data } = await s.client.get(`/api/clients/${s.customer.id}`);
  assertEq([data.rackets.length, data.orders.length, data.last_order_date], [1, 1, '2026-03-01'], 'history');
  assertEq(data.rackets[0].orders_count, 1, 'racket order count');
  assertEq(data.orders[0].racket.model, 'Pro Staff 97', 'the order shows its racket');
});
test('Clients', 'editing changes only the fields sent', async (ctx) => {
  const s = await shop(ctx);
  const res = await s.client.patch(`/api/clients/${s.customer.id}`, { notes: 'Left-handed' });
  assertStatus(res, 200);
  assertEq([res.data.name, res.data.phone, res.data.notes], ['Maria Sharapova', '+380501112233', 'Left-handed'], 'kept');
  assertEq((await s.client.patch(`/api/clients/${s.customer.id}`, { notes: null })).data.notes, null, 'null clears');
  assertStatus(await s.client.patch(`/api/clients/${s.customer.id}`, { phone: null }), 400);
});
test('Clients', 'deleting hides the client and their rackets, and keeps their orders', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  assertStatus(await s.client.delete(`/api/clients/${s.customer.id}`), 200);
  assertStatus(await s.client.get(`/api/clients/${s.customer.id}`), 404);
  assertEq((await s.client.get('/api/clients')).data.items.length, 0, 'not listed');
  assertEq((await s.client.get('/api/rackets')).data.items.length, 0, 'racket not listed');
  const kept = await s.client.get(`/api/orders/${order.id}`);
  assertStatus(kept, 200);
  assertEq(kept.data.client.name, 'Maria Sharapova', 'the order still names the client');
});
test('Clients', 'one stringer never sees or changes another one\'s data', async (ctx) => {
  const s = await shop(ctx);
  const { client: other } = await register(ctx);
  assertStatus(await other.get(`/api/clients/${s.customer.id}`), 404);
  assertStatus(await other.patch(`/api/clients/${s.customer.id}`, { name: 'Hacked' }), 404);
  assertStatus(await other.delete(`/api/clients/${s.customer.id}`), 404);
  assertStatus(await other.get(`/api/rackets/${s.racket.id}`), 404);
  assertStatus(await other.patch(`/api/strings/${s.string.id}`, { brand: 'x' }), 404);
  assertEq((await other.get('/api/clients')).data.items.length, 0, 'empty list');
  const stolen = await other.post('/api/rackets', { client_id: s.customer.id, brand: 'A', model: 'B' });
  assertStatus(stolen, 400);
  assertTrue(stolen.data.fields.client_id, 'the client is named');
  assertStatus(await new Client(ctx.server.base).get('/api/clients'), 401);
  assertStatus(await s.client.get('/api/clients/not-a-uuid'), 404);
});

test('Clients', 'a phone number another client has is refused, however it is typed', async (ctx) => {
  const s = await shop(ctx);
  for (const typed of ['+380501112233', '0501112233', '050 111-22-33', '+38 (050) 111 22 33', '80501112233']) {
    const res = await s.client.post('/api/clients', { name: 'Twin', phone: typed });
    assertStatus(res, 409);
    assertEq(res.data.code, 'phone_taken', `code for ${typed}`);
    assertTrue(res.data.fields.phone, 'the phone is named');
    assertEq(res.data.data.client, { id: s.customer.id, name: 'Maria Sharapova' }, 'the client who has it is named');
  }
  assertEq((await s.client.get('/api/clients')).data.items.length, 1, 'nothing was made');
  assertStatus(await s.client.post('/api/clients', { name: 'Zed', phone: '+380501112234' }), 201);
});
test('Clients', 'clients made at the same moment cannot share a phone number', async (ctx) => {
  const { client } = await register(ctx);
  const answers = await Promise.all(
    Array.from({ length: 5 }, (_, i) => client.post('/api/clients', { name: `Twin ${i}`, phone: '+380631234567' }))
  );
  assertEq(answers.map((a) => a.status).sort(), [201, 409, 409, 409, 409], 'one is made, the others are refused');
  assertEq((await client.get('/api/clients')).data.items.length, 1, 'one client');
});
test('Clients', 'another stringer may have a client with the same phone number', async (ctx) => {
  await shop(ctx);
  const { client: other } = await register(ctx);
  assertStatus(await other.post('/api/clients', { name: 'Maria', phone: '+380501112233' }), 201);
});
test('Clients', 'the number of a deleted client can be used again', async (ctx) => {
  const s = await shop(ctx);
  assertStatus(await s.client.delete(`/api/clients/${s.customer.id}`), 200);
  assertStatus(await s.client.post('/api/clients', { name: 'Maria again', phone: '0501112233' }), 201);
});
test('Clients', 'editing cannot give a client the number of another, but their own number can be retyped', async (ctx) => {
  const s = await shop(ctx);
  const zed = (await s.client.post('/api/clients', { name: 'Zed', phone: '+380671234567' })).data;
  const taken = await s.client.patch(`/api/clients/${zed.id}`, { phone: '050 111 22 33' });
  assertStatus(taken, 409);
  assertEq([taken.data.code, taken.data.data.client.name], ['phone_taken', 'Maria Sharapova'], 'who has it');
  assertEq((await s.client.get(`/api/clients/${zed.id}`)).data.phone, '+380671234567', 'the number is unchanged');
  const retyped = await s.client.patch(`/api/clients/${zed.id}`, { phone: '067 123 45 67', notes: 'Left-handed' });
  assertStatus(retyped, 200);
  assertEq([retyped.data.phone, retyped.data.notes], ['067 123 45 67', 'Left-handed'], 'saved as typed');
});
test('Clients', 'a client who already shares a number (made before the check) can still be edited', async (ctx) => {
  const s = await shop(ctx);
  const zed = (await s.client.post('/api/clients', { name: 'Zed', phone: '+380671234567' })).data;
  dbExec(`UPDATE clients SET phone = '+380501112233' WHERE id = '${zed.id}'`);
  const res = await s.client.patch(`/api/clients/${zed.id}`, { name: 'Zed Z', phone: '+380501112233' });
  assertStatus(res, 200);
  assertEq(res.data.name, 'Zed Z', 'edited');
});

test('Rackets', 'brand and model are required; a client is not (without one it is a catalog racket)', async (ctx) => {
  const s = await shop(ctx);
  assertStatus(await s.client.post('/api/rackets', { client_id: s.customer.id, brand: 'Head' }), 400);
  assertStatus(await s.client.post('/api/rackets', { brand: 'Head' }), 400);
  const catalog = await s.client.post('/api/rackets', { brand: 'Head', model: 'Speed' });
  assertEq([catalog.status, catalog.data.client_id], [201, null], 'no client: a catalog racket');
  const unknown = await s.client.post('/api/rackets', { client_id: '00000000-0000-4000-8000-000000000000', brand: 'Head', model: 'Speed' });
  assertStatus(unknown, 400);
  assertTrue(unknown.data.fields.client_id, 'an unknown client is named');
});
test('Rackets', 'the list can be filtered by owner and searched by brand and model', async (ctx) => {
  const s = await shop(ctx);
  const other = (await s.client.post('/api/clients', { name: 'Iga', phone: '+380631110000' })).data;
  await s.client.post('/api/rackets', { client_id: other.id, brand: 'Babolat', model: 'Pure Aero' });
  assertEq((await s.client.get('/api/rackets')).data.items.length, 2, 'all');
  assertEq((await s.client.get(`/api/rackets?client_id=${other.id}`)).data.items.map((r) => r.brand), ['Babolat'], 'by owner');
  assertEq((await s.client.get('/api/rackets?q=wilson%20pro')).data.items.length, 1, 'brand and model together');
  assertEq((await s.client.get('/api/rackets?q=iga')).data.items.length, 1, 'by owner name');
  assertEq((await s.client.get('/api/rackets?client_id=nope')).status, 400, 'a bad owner id is a 400');
});
test('Rackets', 'the racket carries the setup of its latest order and its history', async (ctx) => {
  const s = await shop(ctx);
  assertEq((await s.client.get(`/api/rackets/${s.racket.id}`)).data.last_setup, null, 'no history yet');
  await s.client.post('/api/orders', minimalOrder(s, { main_string_id: s.string.id, main_tension: 24, labor_price: 20 }));
  await s.client.post('/api/orders', minimalOrder(s, { main_string_id: s.string.id, main_tension: 25.5, knots: 4 }));
  const { data } = await s.client.get(`/api/rackets/${s.racket.id}`);
  assertEq([data.last_setup.number, data.last_setup.main_tension, data.last_setup.knots], [2, 25.5, 4], 'the newest order');
  assertEq(data.orders.map((o) => o.number), [2, 1], 'history, newest first');
  assertEq(data.orders_count, 2, 'count');
  const list = (await s.client.get(`/api/rackets?client_id=${s.customer.id}`)).data.items[0];
  assertEq(list.last_setup.main_string_name, 'Luxilon ALU Power 1.25 mm', 'the list has it too, for the order form');
});
test('Rackets', 'deleting hides the racket; the owner can be changed', async (ctx) => {
  const s = await shop(ctx);
  const other = (await s.client.post('/api/clients', { name: 'Iga', phone: '+380631110000' })).data;
  const moved = await s.client.patch(`/api/rackets/${s.racket.id}`, { client_id: other.id });
  assertEq([moved.status, moved.data.client_name], [200, 'Iga'], 'new owner');
  assertStatus(await s.client.delete(`/api/rackets/${s.racket.id}`), 200);
  assertStatus(await s.client.get(`/api/rackets/${s.racket.id}`), 404);
});

test('Strings', 'a string has a brand, a model and a type; the price and gauge are optional', async (ctx) => {
  const { client } = await register(ctx);
  assertStatus(await client.post('/api/strings', { brand: 'Head' }), 400);
  assertStatus(await client.post('/api/strings', { brand: 'Head', model: 'Hawk', type: 'kevlar' }), 400);
  assertStatus(await client.post('/api/strings', { brand: 'Head', model: 'Hawk', default_price: -1 }), 400);
  const res = await client.post('/api/strings', { brand: 'Head', model: 'Hawk' });
  assertStatus(res, 201);
  assertEq([res.data.type, res.data.gauge, res.data.default_price], ['other', null, null], 'defaults');
});
test('Strings', 'can be searched, edited and removed', async (ctx) => {
  const s = await shop(ctx);
  assertEq((await s.client.get('/api/strings?q=lux%20alu%20pow')).data.items.length, 1, 'brand + model');
  assertEq((await s.client.get('/api/strings?q=babolat')).data.items.length, 0, 'no match');
  const edited = await s.client.patch(`/api/strings/${s.string.id}`, { default_price: 14 });
  assertEq([edited.data.default_price, edited.data.type], [14, 'polyester'], 'only the price changed');
  assertStatus(await s.client.delete(`/api/strings/${s.string.id}`), 200);
  assertEq((await s.client.get('/api/strings')).data.items.length, 0, 'gone from the catalog');
});

test('Services', 'can be created, edited and archived', async (ctx) => {
  const { client } = await register(ctx);
  const created = await client.post('/api/services', { name: 'Dampener', price: 3 });
  assertStatus(created, 201);
  assertEq([created.data.kind, created.data.active, created.data.price], ['extra', true, 3], 'defaults');
  assertStatus(await client.post('/api/services', { price: 3 }), 400);
  const archived = await client.patch(`/api/services/${created.data.id}`, { active: false });
  assertEq(archived.data.active, false, 'archived');
  const list = (await client.get('/api/services')).data.items;
  assertEq(list[list.length - 1].name, 'Dampener', 'archived ones come last');
  assertEq((await client.patch(`/api/services/${created.data.id}`, { active: true })).data.active, true, 'and can return');
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
test('Orders', 'a standard order needs only a client and a racket', async (ctx) => {
  const s = await shop(ctx);
  const res = await s.client.post('/api/orders', minimalOrder(s));
  assertStatus(res, 201);
  const o = res.data;
  assertEq([o.number, o.status, o.is_paid, o.total, o.due_date], [1, 'received', false, null, null], 'basics');
  assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(o.received_date), 'received today by default');
  assertEq([o.client.name, o.racket.brand, o.services, o.photos], ['Maria Sharapova', 'Wilson', [], []], 'joined data');
  assertStatus(await s.client.post('/api/orders', {}), 400);
});
test('Orders', 'numbers count up for each stringer on their own', async (ctx) => {
  const a = await shop(ctx);
  const b = await shop(ctx);
  const numbers = [];
  for (const s of [a, a, b, a, b]) numbers.push((await s.client.post('/api/orders', minimalOrder(s))).data.number);
  assertEq(numbers, [1, 2, 1, 3, 2], 'numbers');
});
test('Orders', 'two orders created at once get different numbers', async (ctx) => {
  const s = await shop(ctx);
  const results = await Promise.all([1, 2, 3, 4].map(() => s.client.post('/api/orders', minimalOrder(s))));
  assertEq(results.map((r) => r.status), [201, 201, 201, 201], 'all created');
  assertEq(results.map((r) => r.data.number).sort(), [1, 2, 3, 4], 'distinct numbers');
});
test('Orders', 'the total is labor + strings + services and can be left empty', async (ctx) => {
  const s = await shop(ctx);
  const grip = (await s.client.get('/api/services')).data.items.find((x) => x.name === 'Grip Replacement');
  const res = await s.client.post('/api/orders', minimalOrder(s, {
    labor_price: 20, string_price: 12.5,
    services: [{ service_id: grip.id, name: 'Grip Replacement', price: 8 }, { name: 'Custom', price: 0.5 }],
  }));
  assertStatus(res, 201);
  assertEq(res.data.total, 41, 'total');
  assertEq(res.data.services.map((x) => x.name), ['Custom', 'Grip Replacement'], 'service lines');
  const noPrice = (await s.client.post('/api/orders', minimalOrder(s, { labor_price: 0 }))).data;
  assertEq(noPrice.total, 0, 'free is not the same as unknown');
});
test('Orders', 'a price change recalculates the total; the services are replaced as a whole', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s, { labor_price: 20, services: [{ name: 'Grip', price: 5 }] }))).data;
  assertEq((await s.client.patch(`/api/orders/${order.id}`, { labor_price: 25 })).data.total, 30, 'labor changed, services kept');
  const replaced = await s.client.patch(`/api/orders/${order.id}`, { services: [{ name: 'Overgrip', price: 2 }, { name: 'Dampener', price: 1 }] });
  assertEq([replaced.data.total, replaced.data.services.length], [28, 2], 'services replaced');
  assertEq((await s.client.patch(`/api/orders/${order.id}`, { services: [] })).data.total, 25, 'and removed');
});
test('Orders', 'tension is stored in kg whatever unit the stringer shows', async (ctx) => {
  const s = await shop(ctx);
  const kg = 55 / 2.2046226218; // 55 lbs, converted by the app
  const order = (await s.client.post('/api/orders', minimalOrder(s, { main_tension: kg, cross_tension: 23.5 }))).data;
  assertTrue(Math.abs(order.main_tension - 24.9476) < 0.0001, 'main tension kept to 4 decimals');
  assertEq(order.cross_tension, 23.5, 'cross tension');
  await s.client.patch('/api/auth/me', { tension_unit: 'lbs' });
  assertEq((await s.client.get(`/api/orders/${order.id}`)).data.main_tension, order.main_tension, 'changing the unit leaves it alone');
  assertStatus(await s.client.post('/api/orders', minimalOrder(s, { main_tension: 2 })), 400);
  assertStatus(await s.client.post('/api/orders', minimalOrder(s, { main_tension: 120 })), 400);
});
test('Orders', 'a hybrid has two strings; other setups keep no second string', async (ctx) => {
  const s = await shop(ctx);
  const gut = (await s.client.post('/api/strings', { brand: 'Babolat', model: 'VS Touch', type: 'natural_gut' })).data;
  const hybrid = await s.client.post('/api/orders', minimalOrder(s, {
    hybrid: true, main_string_id: s.string.id, cross_string_id: gut.id, main_tension: 24, cross_tension: 26, knots: 2,
  }));
  assertStatus(hybrid, 201);
  assertEq([hybrid.data.main_string_name, hybrid.data.cross_string_name], ['Luxilon ALU Power 1.25 mm', 'Babolat VS Touch'], 'names');
  const plain = await s.client.patch(`/api/orders/${hybrid.data.id}`, { hybrid: false });
  assertEq([plain.data.cross_string_id, plain.data.cross_string_name], [null, null], 'second string dropped');
  assertEq(plain.data.cross_tension, 26, 'a different cross tension is separate from a hybrid');
});
test('Orders', 'customer-provided strings are not from the catalog and cost nothing', async (ctx) => {
  const s = await shop(ctx);
  const res = await s.client.post('/api/orders', minimalOrder(s, {
    customer_strings: true, main_string_id: s.string.id, main_string_name: 'Their Solinco', string_price: 12, labor_price: 20,
  }));
  assertEq([res.data.main_string_id, res.data.main_string_name, res.data.string_price, res.data.total], [null, 'Their Solinco', null, 20], 'own strings');
});
test('Orders', 'an order keeps the string name it was made with', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s, { main_string_id: s.string.id }))).data;
  await s.client.patch(`/api/strings/${s.string.id}`, { model: 'ALU Power Soft' });
  assertStatus(await s.client.delete(`/api/strings/${s.string.id}`), 200);
  const after = (await s.client.patch(`/api/orders/${order.id}`, { notes: 'Fast' })).data;
  assertEq(after.main_string_name, 'Luxilon ALU Power 1.25 mm', 'the old name');
  assertStatus(await s.client.post('/api/orders', minimalOrder(s, { main_string_id: s.string.id })), 400);
});
test('Orders', 'checks what an order points at', async (ctx) => {
  const s = await shop(ctx);
  const other = (await s.client.post('/api/clients', { name: 'Iga', phone: '+380631110000' })).data;
  const wrongOwner = await s.client.post('/api/orders', { client_id: other.id, racket_id: s.racket.id });
  assertStatus(wrongOwner, 400);
  assertTrue(wrongOwner.data.fields.racket_id, 'the racket is named');
  const stranger = await register(ctx);
  assertStatus(await stranger.client.post('/api/orders', minimalOrder(s)), 400);
  assertStatus(await s.client.post('/api/orders', minimalOrder(s, { main_string_id: '00000000-0000-4000-8000-000000000000' })), 400);
  assertStatus(await s.client.post('/api/orders', minimalOrder(s, { services: [{ service_id: '00000000-0000-4000-8000-000000000000', name: 'x' }] })), 400);
  const time = await s.client.post('/api/orders', minimalOrder(s, { due_time: '15:30' }));
  assertStatus(time, 400);
  assertTrue(time.data.fields.due_time, 'a time needs a date');
  assertStatus(await s.client.post('/api/orders', minimalOrder(s, { due_date: '2026-02-31' })), 400);
  assertStatus(await s.client.post('/api/orders', minimalOrder(s, { knots: 3 })), 400);
  assertStatus(await s.client.post('/api/orders', minimalOrder(s, { due_date: '2026-06-01', due_time: '25:00' })), 400);
  assertEq((await s.client.post('/api/orders', minimalOrder(s, { due_date: '2026-06-01', due_time: '09:30' }))).status, 201, 'a valid date and time');
});
const clientRackets = async (s, client = s.customer) =>
  (await s.client.get(`/api/rackets?client_id=${client.id}`)).data.items.map((r) => `${r.brand} ${r.model}`);

test('Orders', 'an order can name a racket the client does not have: it is made with the order', async (ctx) => {
  const s = await shop(ctx);
  assertEq(await clientRackets(s), ['Wilson Pro Staff 97'], 'the client starts with one');

  const res = await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: { brand: ' Babolat ', model: 'Pure Drive' } });
  assertStatus(res, 201);
  assertEq(
    [res.data.racket.brand, res.data.racket.model, res.data.racket.client_id],
    ['Babolat', 'Pure Drive', s.customer.id],
    'the racket of the order is a new one of the client\'s'
  );
  assertEq(await clientRackets(s), ['Babolat Pure Drive', 'Wilson Pro Staff 97'], 'and now the client has it');
  const made = (await s.client.get(`/api/rackets/${res.data.racket.id}`)).data;
  assertEq([made.track_stock, made.stock, made.orders_count], [false, 0, 1], 'a client\'s racket, not counted, with this one order');
});
test('Orders', 'a named racket that the client has already is used, not made again', async (ctx) => {
  const s = await shop(ctx);
  for (const named of [
    { brand: 'wilson', model: 'PRO STAFF 97' },
    { brand: 'Wilson', model: 'pro-staff 97' },
    { brand: ' Wilson ', model: 'ProStaff97' },
  ]) {
    const res = await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: named });
    assertStatus(res, 201);
    assertEq(res.data.racket.id, s.racket.id, `${named.model}: the racket the client has`);
  }
  assertEq(await clientRackets(s), ['Wilson Pro Staff 97'], 'still the one');

  const plus = await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: { brand: 'Wilson', model: 'Pro Staff 97+' } });
  assertStatus(plus, 201);
  assertTrue(plus.data.racket.id !== s.racket.id, '"+" is another racket');

  // A racket is each client's own: another client with the same model gets one of their own.
  const iga = (await s.client.post('/api/clients', { name: 'Iga', phone: '+380631110000' })).data;
  const hers = await s.client.post('/api/orders', { client_id: iga.id, new_racket: { brand: 'Wilson', model: 'Pro Staff 97' } });
  assertStatus(hers, 201);
  assertTrue(hers.data.racket.id !== s.racket.id, 'Iga does not get Maria\'s racket');
  assertEq(hers.data.racket.client_id, iga.id, 'she gets her own');
  assertEq(await clientRackets(s, iga), ['Wilson Pro Staff 97'], 'one for her');
});
test('Orders', 'a racket is pointed at or named, never both and never neither', async (ctx) => {
  const s = await shop(ctx);
  const named = { brand: 'Strangebrand', model: 'Speed' };
  const none = await s.client.post('/api/orders', { client_id: s.customer.id });
  assertStatus(none, 400);
  assertTrue(none.data.fields.racket_id, 'the racket is named');
  const both = await s.client.post('/api/orders', { client_id: s.customer.id, racket_id: s.racket.id, new_racket: named });
  assertStatus(both, 400);
  assertTrue(both.data.fields.racket_id, 'the racket is named');
  const blank = await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: { brand: '  ', model: '' } });
  assertStatus(blank, 400);
  assertTrue(blank.data.fields['new_racket.brand'] && blank.data.fields['new_racket.model'], 'the brand and the model are named');

  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  assertStatus(await s.client.patch(`/api/orders/${order.id}`, { racket_id: s.racket.id, new_racket: named }), 400);
  const stranger = await register(ctx);
  assertStatus(await stranger.client.post('/api/orders', { client_id: s.customer.id, new_racket: named }), 400);
  assertEq(Number(dbScalar(`SELECT count(*) FROM rackets WHERE brand='Strangebrand'`)), 0, 'no racket was made by any of them');
});
test('Orders', 'an order can be moved to a named racket, which is made with the change', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const moved = await s.client.patch(`/api/orders/${order.id}`, { new_racket: { brand: 'Yonex', model: 'Ezone 98' } });
  assertStatus(moved, 200);
  assertEq(
    [moved.data.racket.brand, moved.data.racket.model, moved.data.racket.client_id],
    ['Yonex', 'Ezone 98', s.customer.id],
    'the order has the new racket'
  );
  assertEq((await s.client.get(`/api/rackets/${s.racket.id}`)).data.orders.length, 0, 'the old racket has no order now');
  assertEq(await clientRackets(s), ['Wilson Pro Staff 97', 'Yonex Ezone 98'], 'the client has both');

  const again = await s.client.patch(`/api/orders/${order.id}`, { new_racket: { brand: 'yonex', model: 'ezone-98' } });
  assertEq([again.status, again.data.racket.id], [200, moved.data.racket.id], 'the same name is the same racket');
  assertEq(await clientRackets(s), ['Wilson Pro Staff 97', 'Yonex Ezone 98'], 'not made twice');
});
test('Orders', 'status moves through the workflow and keeps its timestamps', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const move = async (status) => (await s.client.patch(`/api/orders/${order.id}`, { status })).data;

  let o = await move('in_progress');
  assertTrue(o.started_at && !o.ready_at && !o.completed_at, 'started');
  o = await move('ready');
  assertTrue(o.started_at && o.ready_at && !o.completed_at, 'ready');
  const readyAt = o.ready_at;
  o = await move('completed');
  assertTrue(o.completed_at && o.ready_at === readyAt, 'completed, ready time kept');
  o = await move('in_progress');
  assertTrue(o.started_at && !o.ready_at && !o.completed_at, 'moving back clears the later steps');
  assertStatus(await s.client.patch(`/api/orders/${order.id}`, { status: 'shipped' }), 400);
});
test('Orders', 'payment is separate from the status', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const paid = (await s.client.patch(`/api/orders/${order.id}`, { is_paid: true })).data;
  assertEq([paid.is_paid, paid.status], [true, 'received'], 'paid before it is strung');
  assertTrue(paid.paid_at, 'when');
  const moved = (await s.client.patch(`/api/orders/${order.id}`, { status: 'ready' })).data;
  assertEq([moved.is_paid, moved.paid_at], [true, paid.paid_at], 'a status change leaves payment alone');
  const unpaid = (await s.client.patch(`/api/orders/${order.id}`, { is_paid: false })).data;
  assertEq([unpaid.is_paid, unpaid.paid_at, unpaid.status], [false, null, 'ready'], 'and the other way');
  assertEq((await s.client.post('/api/orders', minimalOrder(s, { is_paid: true }))).data.is_paid, true, 'paid when created');
});
test('Orders', 'handing an order over can mark it paid in the same request', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const done = (await s.client.patch(`/api/orders/${order.id}`, { status: 'completed', is_paid: true })).data;
  assertEq([done.status, done.is_paid], ['completed', true], 'both changed');
  assertTrue(done.completed_at && done.paid_at, 'with their times');
});
test('Orders', 'the list filters by status and sorts the queue by due date', async (ctx) => {
  const s = await shop(ctx);
  const make = async (extra) => (await s.client.post('/api/orders', minimalOrder(s, extra))).data;
  const late = await make({ due_date: '2026-05-10' });
  const soon = await make({ due_date: '2026-05-02' });
  const undated = await make({});
  const done = await make({ due_date: '2026-04-01' });
  await s.client.patch(`/api/orders/${done.id}`, { status: 'completed' });
  await s.client.patch(`/api/orders/${late.id}`, { status: 'ready' });

  const numbers = async (query) => (await s.client.get(`/api/orders${query}`)).data.items.map((o) => o.number);
  assertEq(await numbers(''), [soon.number, late.number, undated.number, done.number], 'queue by due date, no date last, finished last');
  assertEq(await numbers('?status=active'), [soon.number, late.number, undated.number], 'active');
  assertEq(await numbers('?status=ready'), [late.number], 'ready');
  assertEq(await numbers('?status=completed'), [done.number], 'completed');
  assertStatus(await s.client.get('/api/orders?status=lost'), 400);
});
test('Orders', 'search finds a customer, a racket model, a string or an order number', async (ctx) => {
  const s = await shop(ctx);
  const iga = (await s.client.post('/api/clients', { name: 'Iga Swiatek', phone: '+380631110000' })).data;
  const racket = (await s.client.post('/api/rackets', { client_id: iga.id, brand: 'Tecnifibre', model: 'TF40' })).data;
  await s.client.post('/api/orders', minimalOrder(s, { main_string_id: s.string.id }));
  const second = (await s.client.post('/api/orders', { client_id: iga.id, racket_id: racket.id })).data;
  const find = async (q) => (await s.client.get(`/api/orders?q=${encodeURIComponent(q)}`)).data.items.map((o) => o.number);
  assertEq(await find('swiatek'), [2], 'customer');
  assertEq(await find('tf40'), [2], 'racket model');
  assertEq(await find('wilson pro'), [1], 'racket brand and model');
  assertEq(await find('alu power'), [1], 'string');
  assertEq(await find(`#${second.number}`), [2], 'order number with #');
  assertEq(await find('1'), [1], 'order number');
  assertEq(await find('nothing'), [], 'no match');
});
test('Orders', 'the list is paged', async (ctx) => {
  const s = await shop(ctx);
  for (let i = 0; i < 5; i++) await s.client.post('/api/orders', minimalOrder(s));
  const first = (await s.client.get('/api/orders?limit=2')).data;
  assertEq([first.items.length, first.has_more], [2, true], 'first page');
  const last = (await s.client.get('/api/orders?limit=2&offset=4')).data;
  assertEq([last.items.length, last.has_more], [1, false], 'last page');
  assertStatus(await s.client.get('/api/orders?limit=1000'), 400);
});
test('Orders', 'one stringer cannot read, change, delete or photograph another one\'s order', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const { client: other } = await register(ctx);
  assertStatus(await other.get(`/api/orders/${order.id}`), 404);
  assertStatus(await other.patch(`/api/orders/${order.id}`, { notes: 'x' }), 404);
  assertStatus(await other.delete(`/api/orders/${order.id}`), 404);
  assertStatus(await other.rawRequest('POST', `/api/orders/${order.id}/photos`, JPEG, 'image/jpeg'), 404);
  assertEq((await other.get('/api/orders')).data.items.length, 0, 'not listed');
  assertStatus(await new Client(ctx.server.base).get(`/api/orders/${order.id}`), 401);
});
test('Orders', 'deleting an order removes it with its services and photos', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s, { services: [{ name: 'Grip', price: 5 }] }))).data;
  await s.client.rawRequest('POST', `/api/orders/${order.id}/photos`, JPEG, 'image/jpeg');
  assertStatus(await s.client.delete(`/api/orders/${order.id}`), 200);
  assertStatus(await s.client.get(`/api/orders/${order.id}`), 404);
  assertEq(dbScalar(`SELECT count(*) FROM order_services WHERE order_id='${order.id}'`), '0', 'no service lines left');
  assertEq(dbScalar(`SELECT count(*) FROM order_photos WHERE order_id='${order.id}'`), '0', 'no photos left');
});

// A few bytes that look like the start of a JPEG file, which is all the server looks at.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')]);
test('Photos', 'an image can be attached, shown and removed', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const up = await s.client.rawRequest('POST', `/api/orders/${order.id}/photos`, JPEG, 'image/jpeg');
  assertStatus(up, 201);
  assertEq([up.data.content_type, up.data.size], ['image/jpeg', JPEG.length], 'stored');
  assertEq((await s.client.get(`/api/orders/${order.id}`)).data.photos.length, 1, 'listed on the order');

  const shown = await s.client.rawRequest('GET', `/api/photos/${up.data.id}`);
  assertStatus(shown, 200);
  assertEq(shown.headers.get('content-type'), 'image/jpeg', 'content type');
  assertTrue(shown.data.equals(JPEG), 'the same bytes come back');
  assertStatus(await new Client(ctx.server.base).get(`/api/photos/${up.data.id}`), 401);
  const { client: other } = await register(ctx);
  assertStatus(await other.rawRequest('GET', `/api/photos/${up.data.id}`), 404);
  assertStatus(await other.delete(`/api/photos/${up.data.id}`), 404);

  assertStatus(await s.client.delete(`/api/photos/${up.data.id}`), 200);
  assertStatus(await s.client.rawRequest('GET', `/api/photos/${up.data.id}`), 404);
});
test('Photos', 'only real images are accepted, up to a limit', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const url = `/api/orders/${order.id}/photos`;
  const lie = await s.client.rawRequest('POST', url, Buffer.from('<script>alert(1)</script>........'), 'image/jpeg');
  assertEq([lie.status, lie.data.code], [415, 'unsupported_image'], 'content type is not trusted');
  assertEq((await s.client.rawRequest('POST', url, Buffer.alloc(0), 'image/jpeg')).status, 415, 'empty');
  const big = Buffer.concat([JPEG, Buffer.alloc(9 * 1024 * 1024)]);
  assertEq((await s.client.rawRequest('POST', url, big, 'image/jpeg')).status, 413, 'too large');
  for (let i = 0; i < 10; i++) assertStatus(await s.client.rawRequest('POST', url, JPEG, 'image/jpeg'), 201);
  const extra = await s.client.rawRequest('POST', url, JPEG, 'image/jpeg');
  assertEq([extra.status, extra.data.code], [400, 'photo_limit'], 'eleventh photo');
});

// ---------------------------------------------------------------------------
// Deleting the account
// ---------------------------------------------------------------------------
/** How many rows of each table belong to this user, counted around the API. */
const ownedRows = (userId) =>
  Object.fromEntries(
    ['clients', 'rackets', 'strings', 'services', 'orders', 'order_photos'].map((table) => [
      table,
      Number(dbScalar(`SELECT count(*) FROM ${table} WHERE user_id='${userId}'`)),
    ])
  );
/** An account with a bit of everything: clients with rackets, a catalog racket, strings, an order with service lines and a photo. */
async function furnished(ctx) {
  const s = await shop(ctx);
  const second = (await s.client.post('/api/clients', { name: 'Serena Williams', phone: '+380509998877' })).data;
  await s.client.post('/api/rackets', { client_id: second.id, brand: 'Babolat', model: 'Pure Aero' });
  await s.client.post('/api/rackets', { brand: 'Yonex', model: 'Vcore 98', track_stock: true, stock: 3 });
  const order = (
    await s.client.post('/api/orders', minimalOrder(s, {
      main_string_id: s.string.id, main_tension: 24, labor_price: 20,
      services: [{ name: 'Grip', price: 5 }, { name: 'Overgrip', price: 2 }],
    }))
  ).data;
  assertStatus(await s.client.rawRequest('POST', `/api/orders/${order.id}/photos`, JPEG, 'image/jpeg'), 201);
  const userId = (await s.client.get('/api/auth/me')).data.id;
  return { ...s, order, userId };
}

test('Account', '/me says whether the account has a password', async (ctx) => {
  const { client } = await register(ctx);
  assertEq((await client.get('/api/auth/me')).data.has_password, true, 'made with a password');
  const google = await googleLogin(ctx, googleUser());
  assertEq((await google.client.get('/api/auth/me')).data.has_password, false, 'made with Google');
  const apple = await appleLogin(ctx, appleUser());
  assertEq((await apple.client.get('/api/auth/me')).data.has_password, false, 'made with Apple');
});
test('Account', 'deleting it removes the account and everything it owns', async (ctx) => {
  const s = await furnished(ctx);
  const before = ownedRows(s.userId);
  assertTrue(Object.values(before).every((count) => count > 0), `there is something in every table: ${JSON.stringify(before)}`);
  const lines = () => Number(dbScalar(`SELECT count(*) FROM order_services WHERE order_id='${s.order.id}'`));
  assertEq(lines(), 2, 'the order has its service lines');

  const res = await s.client.post('/api/auth/delete-account', { password });
  assertStatus(res, 200);
  assertEq(res.data, { ok: true }, 'body');

  assertEq(Number(dbScalar(`SELECT count(*) FROM users WHERE id='${s.userId}'`)), 0, 'the user is gone');
  assertEq(ownedRows(s.userId), { clients: 0, rackets: 0, strings: 0, services: 0, orders: 0, order_photos: 0 }, 'and all it owned');
  assertEq(lines(), 0, 'with the lines of its orders');
  assertTrue(!s.client.cookies.has('auth_token'), 'the cookie is cleared');
});
test('Account', 'a deleted account can no longer sign in, and its session ends', async (ctx) => {
  const { client, email, res } = await register(ctx);
  const token = res.data.token;
  assertStatus(await client.post('/api/auth/delete-account', { password }), 200);

  assertStatus(await client.get('/api/auth/me'), 401);
  const stale = new Client(ctx.server.base);
  stale.token = token;
  assertEq((await stale.get('/api/auth/me')).data.code, 'invalid_token', 'the old token is turned down');
  const login = await new Client(ctx.server.base).post('/api/auth/login', { email, password });
  assertEq([login.status, login.data.code], [401, 'invalid_credentials'], 'no sign-in');
});
test('Account', 'the address can be used again, for a new and empty account', async (ctx) => {
  const s = await furnished(ctx);
  const { email } = (await s.client.get('/api/auth/me')).data;
  assertStatus(await s.client.post('/api/auth/delete-account', { password }), 200);

  const again = await register(ctx, email);
  assertTrue(again.res.data.user.id !== s.userId, 'a new account');
  assertEq((await again.client.get('/api/clients')).data.items, [], 'with none of the old clients');
});
test('Account', 'it needs the password: none or a wrong one deletes nothing', async (ctx) => {
  const s = await furnished(ctx);
  const rows = ownedRows(s.userId);
  for (const body of [{}, { password: '' }, { password: 'not-the-password' }]) {
    const res = await s.client.post('/api/auth/delete-account', body);
    assertEq([res.status, res.data.code], [403, 'invalid_password'], `refused for ${JSON.stringify(body)}`);
  }
  assertEq(ownedRows(s.userId), rows, 'nothing was deleted');
  // A wrong password is not an ended session: the app would sign the person out on a 401.
  assertStatus(await s.client.get('/api/auth/me'), 200);
});
test('Account', 'it needs a session', async (ctx) => {
  // A client of its own: `ctx.anon` may have signed in during an earlier test.
  assertEq((await new Client(ctx.server.base).post('/api/auth/delete-account', { password })).status, 401, 'no token');
});
test('Account', 'another account is left alone', async (ctx) => {
  const mine = await furnished(ctx);
  const other = await furnished(ctx);
  const rows = ownedRows(other.userId);
  assertStatus(await mine.client.post('/api/auth/delete-account', { password }), 200);

  assertEq(ownedRows(other.userId), rows, 'the rows of the other account');
  assertEq((await other.client.get('/api/clients')).data.items.length, 2, 'its clients');
  assertEq((await other.client.get(`/api/orders/${other.order.id}`)).data.photos.length, 1, 'its order and photo');
});
test('Account', 'an account made with Google is deleted without a password', async (ctx) => {
  const user = googleUser();
  const { client, res } = await googleLogin(ctx, user);
  assertEq(res.data.user.has_password, false, 'it has none');
  await client.post('/api/clients', { name: 'Maria Sharapova', phone: '+380501112233' });

  assertStatus(await client.post('/api/auth/delete-account', {}), 200);
  assertEq(Number(googleUserCount(user.email)), 0, 'the account is gone');
  // Signing in with the same Google account starts over: a new account, with no clients.
  const again = await googleLogin(ctx, user);
  assertStatus(again.res, 201);
  assertEq((await again.client.get('/api/clients')).data.items, [], 'nothing of the old one');
});
// Deleting the account takes the link with the app away at Apple too.
test('Account', 'an account made with Apple is deleted without a password, and its token is revoked at Apple', async (ctx) => {
  const user = appleUser();
  const code = appleCode();
  const { client, res } = await appleLogin(ctx, user, { authorization_code: code });
  assertEq(res.data.user.has_password, false, 'it has none');
  await client.post('/api/clients', { name: 'Maria Sharapova', phone: '+380501112233' });
  const revoked = ctx.apple.asked('revoke').length;

  assertStatus(await client.post('/api/auth/delete-account', {}), 200);
  assertEq(appleUserCount(user.email), '0', 'the account is gone');
  const requests = ctx.apple.asked('revoke').slice(revoked);
  assertEq(requests.length, 1, 'Apple was told once');
  assertEq(
    [requests[0].fields.token, requests[0].fields.token_type_hint, requests[0].fields.client_id],
    [`refresh-${code}`, 'refresh_token', ctx.apple.clientId],
    'which token, for this app'
  );
  assertEq(requests[0].secret.valid, true, `with a client secret Apple accepts: ${requests[0].secret.reason}`);
  assertEq(requests[0].contentType, 'application/x-www-form-urlencoded', 'as a form');

  // Signing in with the same Apple account starts over: a new account, with no clients.
  const again = await appleLogin(ctx, user);
  assertStatus(again.res, 201);
  assertEq((await again.client.get('/api/clients')).data.items, [], 'nothing of the old one');
});
test('Account', 'the account is deleted whatever Apple answers to the revoking', async (ctx) => {
  const failures = [[500, { error: 'server_error' }], [400, { error: 'invalid_grant' }], [401, undefined]];
  try {
    for (const [status, body] of failures) {
      ctx.apple.answer('revoke', status, body);
      const user = appleUser();
      const { client } = await appleLogin(ctx, user, { authorization_code: appleCode() });
      const revoked = ctx.apple.asked('revoke').length;
      const res = await client.post('/api/auth/delete-account', {});
      assertEq([res.status, res.data], [200, { ok: true }], `deleted when Apple says ${status}`);
      assertEq(ctx.apple.asked('revoke').length, revoked + 1, `Apple was asked (${status})`);
      assertEq(appleUserCount(user.email), '0', `the account is gone (${status})`);
    }
  } finally {
    ctx.apple.answer('revoke');
  }
  await until(() => ctx.server.logs().includes('[apple] Could not revoke a token: 400 invalid_grant'), 'the reason in the log');
});
test('Account', 'the account is deleted when Apple cannot be reached to revoke', async (ctx) => {
  // The account is made against the working Apple, and deleted by a server that cannot reach it.
  const user = appleUser();
  await appleLogin(ctx, user, { authorization_code: appleCode() });
  const server = await startServer({ port: CONFIG.port + 1, env: { ...ctx.apple.env, APPLE_AUTH_URL: 'http://127.0.0.1:1/auth' } });
  try {
    const client = new Client(server.base);
    const signedIn = await client.post('/api/auth/apple', { identity_token: await ctx.apple.identityToken(user) });
    assertStatus(signedIn, 200);
    assertStatus(await client.post('/api/auth/delete-account', {}), 200);
    assertEq(appleUserCount(user.email), '0', 'the account is gone');
    assertTrue(server.logs().includes('[apple] Could not revoke a token'), 'and it is said in the log');
  } finally {
    await server.stop();
  }
});
test('Account', 'an Apple account with no token kept deletes without asking Apple anything', async (ctx) => {
  const user = appleUser();
  const { client } = await appleLogin(ctx, user);
  const revoked = ctx.apple.asked('revoke').length;
  assertStatus(await client.post('/api/auth/delete-account', {}), 200);
  assertEq(ctx.apple.asked('revoke').length, revoked, 'no call');
  assertEq(appleUserCount(user.email), '0', 'the account is gone');
});
test('Account', 'an account with a password and Apple needs the password, and a refused deletion revokes nothing', async (ctx) => {
  const user = appleUser();
  const code = appleCode();
  await appleLogin(ctx, user, { authorization_code: code });
  await ctx.anon.post('/api/auth/forgot-password', { email: user.email });
  await new Promise((r) => setTimeout(r, 300));
  const token = resetTokenFor(ctx, user.email);
  assertStatus(await ctx.anon.post('/api/auth/reset-password', { token, password: 'a-brand-new-pass-2' }), 200);
  const { client, res } = await appleLogin(ctx, user);
  assertEq(res.data.user.has_password, true, 'it has one now');
  const revoked = ctx.apple.asked('revoke').length;

  for (const body of [{}, { password: 'not-the-password' }]) {
    const refused = await client.post('/api/auth/delete-account', body);
    assertEq([refused.status, refused.data.code], [403, 'invalid_password'], `refused for ${JSON.stringify(body)}`);
  }
  assertEq(ctx.apple.asked('revoke').length, revoked, 'Apple was not told anything');
  assertEq(refreshTokenOf(user.email), `refresh-${code}`, 'the token is still kept');

  assertStatus(await client.post('/api/auth/delete-account', { password: 'a-brand-new-pass-2' }), 200);
  assertEq(ctx.apple.asked('revoke').length, revoked + 1, 'told when the password is right');
  assertEq(appleUserCount(user.email), '0', 'the account is gone');
});

test('Dashboard', 'counts the active, ready and completed orders and lists what is due first', async (ctx) => {
  const s = await shop(ctx);
  const make = async (extra) => (await s.client.post('/api/orders', minimalOrder(s, extra))).data;
  const a = await make({ due_date: '2026-09-02' });
  const b = await make({ due_date: '2026-09-01' });
  const c = await make({});
  await make({});
  await s.client.patch(`/api/orders/${a.id}`, { status: 'ready' });
  await s.client.patch(`/api/orders/${c.id}`, { status: 'completed' });
  const { data } = await s.client.get('/api/dashboard');
  assertEq([data.active_orders, data.ready_for_pickup, data.completed_this_month], [3, 1, 1], 'counts');
  assertEq(data.active.map((o) => o.number), [b.number, a.number, 4], 'due first, undated last');
  assertEq((await (await register(ctx)).client.get('/api/dashboard')).data.active_orders, 0, 'another stringer has their own');
});
test('Dashboard', 'this month is the stringer\'s month, not the server\'s', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  await s.client.patch(`/api/orders/${order.id}`, { status: 'completed' });
  dbExec(`UPDATE orders SET completed_at = date_trunc('month', now()) - interval '1 minute' WHERE id='${order.id}'`);
  assertEq((await s.client.get('/api/dashboard')).data.completed_this_month, 0, 'finished last month');
  dbExec(`UPDATE orders SET completed_at = now() WHERE id='${order.id}'`);
  assertEq((await s.client.get('/api/dashboard')).data.completed_this_month, 1, 'finished now');
});

// ---------------------------------------------------------------------------
// Catalog stock
// ---------------------------------------------------------------------------
/** The stringer's own catalog: a racket with no owner, and the string of `shop`, both counted. */
async function stocked(ctx, { racketStock = 2, stringStock = 3 } = {}) {
  const s = await shop(ctx);
  const catalogRacket = (await s.client.post('/api/rackets', {
    brand: 'Yonex', model: 'Vcore 98', track_stock: true, stock: racketStock,
  })).data;
  const string = (await s.client.patch(`/api/strings/${s.string.id}`, { track_stock: true, stock: stringStock })).data;
  return { ...s, catalogRacket, string };
}
const racketStock = async (s, id) => (await s.client.get(`/api/rackets/${id}`)).data.stock;
const stringStock = async (s, id) => (await s.client.get(`/api/strings/${id}`)).data.stock;
const catalogOrder = (s, extra = {}) => ({ client_id: s.customer.id, racket_id: s.catalogRacket.id, ...extra });

test('Stock', 'a racket can be added to the catalog with no client, with a stock', async (ctx) => {
  const s = await shop(ctx);
  const res = await s.client.post('/api/rackets', { brand: 'Yonex', model: 'Vcore 98', track_stock: true, stock: 3 });
  assertStatus(res, 201);
  assertEq(
    [res.data.client_id, res.data.client_name, res.data.track_stock, res.data.stock, res.data.available, res.data.last_setup],
    [null, null, true, 3, true, null],
    'a catalog racket'
  );
  assertEq((await s.client.get('/api/rackets?kind=catalog')).data.items.map((r) => r.model), ['Vcore 98'], 'the catalog');
  assertEq((await s.client.get('/api/rackets?kind=client')).data.items.map((r) => r.model), ['Pro Staff 97'], 'the clients');
  assertEq((await s.client.get('/api/rackets?q=vcore')).data.items.length, 1, 'found by name without an owner');

  const own = await s.client.post('/api/rackets', {
    client_id: s.customer.id, brand: 'Head', model: 'Speed', track_stock: true, stock: 5,
  });
  assertEq([own.status, own.data.track_stock, own.data.stock], [201, false, 0], 'a client\'s racket is not counted');

  assertStatus(await s.client.post('/api/rackets', { brand: 'A', model: 'B', stock: -1 }), 400);
  assertStatus(await s.client.post('/api/rackets', { brand: 'A', model: 'B', stock: 1.5 }), 400);
});
test('Stock', 'only what is available is listed as in stock', async (ctx) => {
  const s = await shop(ctx);
  await s.client.post('/api/rackets', { brand: 'Babolat', model: 'Pure Drive', track_stock: true, stock: 0 });
  await s.client.post('/api/rackets', { brand: 'Head', model: 'Radical', track_stock: true, stock: 2 });
  await s.client.post('/api/rackets', { brand: 'Prince', model: 'Phantom' });
  const models = async (query) => (await s.client.get(`/api/rackets?${query}`)).data.items.map((r) => r.model);
  assertEq(await models('kind=catalog'), ['Pure Drive', 'Radical', 'Phantom'], 'all of the catalog, by brand');
  assertEq(await models('kind=catalog&in_stock=1'), ['Radical', 'Phantom'], 'a counted one with none left is out, one that is not counted is in');
  const out = (await s.client.get('/api/rackets?kind=catalog')).data.items.find((r) => r.model === 'Pure Drive');
  assertEq(out.available, false, 'marked as not available');

  await s.client.post('/api/strings', { brand: 'Head', model: 'Hawk', track_stock: true, stock: 0 });
  await s.client.post('/api/strings', { brand: 'Head', model: 'Lynx', track_stock: true, stock: 0.5 });
  assertEq((await s.client.get('/api/strings?in_stock=1')).data.items.map((x) => x.model), ['Lynx', 'ALU Power'], 'half a set is something');
  assertEq((await s.client.get('/api/strings')).data.items.length, 3, 'the whole catalog');
});
test('Stock', 'strings are counted in whole and half sets', async (ctx) => {
  const { client } = await register(ctx);
  const res = await client.post('/api/strings', { brand: 'Head', model: 'Hawk', track_stock: true, stock: 2.5 });
  assertStatus(res, 201);
  assertEq([res.data.track_stock, res.data.stock, res.data.available], [true, 2.5, true], 'kept');
  assertStatus(await client.post('/api/strings', { brand: 'Head', model: 'Lynx', stock: 0.3 }), 400);
  assertStatus(await client.post('/api/strings', { brand: 'Head', model: 'Lynx', stock: -1 }), 400);
  const plain = (await client.post('/api/strings', { brand: 'Head', model: 'Lynx' })).data;
  assertEq([plain.track_stock, plain.stock, plain.available], [false, 0, true], 'not counted unless asked: always available');
  assertEq((await client.patch(`/api/strings/${res.data.id}`, { stock: 4 })).data.stock, 4, 'the stock can be set');
});
test('Stock', 'a catalog racket has no owner and a client\'s racket always has one', async (ctx) => {
  const s = await stocked(ctx);
  const moved = await s.client.patch(`/api/rackets/${s.catalogRacket.id}`, { client_id: s.customer.id });
  assertStatus(moved, 400);
  assertTrue(moved.data.fields.client_id, 'the owner is named');
  assertStatus(await s.client.patch(`/api/rackets/${s.racket.id}`, { client_id: null }), 400);
  const edited = await s.client.patch(`/api/rackets/${s.catalogRacket.id}`, { stock: 7, notes: 'Demo' });
  assertEq([edited.data.stock, edited.data.notes, edited.data.model], [7, 'Demo', 'Vcore 98'], 'only what was sent');
  const own = await s.client.patch(`/api/rackets/${s.racket.id}`, { track_stock: true, stock: 9 });
  assertEq([own.data.track_stock, own.data.stock], [false, 0], 'a client\'s racket stays uncounted');
});

test('Stock', 'an order takes its racket and a set of its string, and deleting it gives them back', async (ctx) => {
  const s = await stocked(ctx);
  const order = await s.client.post('/api/orders', catalogOrder(s, { main_string_id: s.string.id }));
  assertStatus(order, 201);
  assertEq(order.data.racket.client_id, null, 'the order shows a catalog racket');
  assertEq([await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id)], [1, 2], 'taken');
  assertStatus(await s.client.delete(`/api/orders/${order.data.id}`), 200);
  assertEq([await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id)], [2, 3], 'given back');
});
test('Stock', 'an order that finds too little fails whole, and keeps its number free', async (ctx) => {
  const s = await stocked(ctx, { racketStock: 1, stringStock: 3 });
  assertStatus(await s.client.post('/api/orders', catalogOrder(s, { main_string_id: s.string.id })), 201);
  const again = await s.client.post('/api/orders', catalogOrder(s, { main_string_id: s.string.id }));
  assertStatus(again, 409);
  assertEq(again.data.code, 'out_of_stock', 'code');
  assertTrue(again.data.fields.racket_id, 'the racket is named');
  assertEq(await stringStock(s, s.string.id), 2, 'the string was not taken either');

  await s.client.patch(`/api/rackets/${s.catalogRacket.id}`, { stock: 5 });
  const next = await s.client.post('/api/orders', catalogOrder(s, { main_string_id: s.string.id }));
  assertEq([next.status, next.data.number], [201, 2], 'the failed order used no number');

  const bare = await stocked(ctx, { stringStock: 0 });
  const refused = await bare.client.post('/api/orders', minimalOrder(bare, { main_string_id: bare.string.id }));
  assertStatus(refused, 409);
  assertTrue(refused.data.fields.main_string_id, 'the string is named');
});
test('Stock', 'an order that is not made leaves no racket behind, a racket it named included', async (ctx) => {
  const s = await stocked(ctx, { stringStock: 0 });
  const count = () => Number(dbScalar(`SELECT count(*) FROM rackets WHERE client_id='${s.customer.id}'`));
  const named = { brand: 'Head', model: 'Speed' };
  assertEq(count(), 1, 'the client starts with one racket');

  // Too little in the stock: the order fails whole, and the racket that was made for it goes with it.
  const refused = await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: named, main_string_id: s.string.id });
  assertStatus(refused, 409);
  assertEq(refused.data.code, 'out_of_stock', 'code');
  assertEq([count(), (await s.client.get('/api/orders')).data.items.length], [1, 0], 'no racket and no order');

  // An order that is wrong is turned away before anything is made.
  assertStatus(await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: named, due_time: '10:00' }), 400);
  assertStatus(await s.client.post('/api/orders', {
    client_id: s.customer.id, new_racket: named, main_string_id: '00000000-0000-4000-8000-000000000000',
  }), 400);
  assertEq(count(), 1, 'no racket');

  // The same for a change: the order keeps its racket, and none is made.
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const changed = await s.client.patch(`/api/orders/${order.id}`, { new_racket: named, main_string_id: s.string.id });
  assertStatus(changed, 409);
  assertEq(count(), 1, 'no racket was made by the change');
  assertEq((await s.client.get(`/api/orders/${order.id}`)).data.racket.id, s.racket.id, 'the order has the racket it had');

  // With enough in the stock the racket and the order are made together, and the failed ones used no number.
  await s.client.patch(`/api/strings/${s.string.id}`, { stock: 2 });
  const made = await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: named, main_string_id: s.string.id });
  assertStatus(made, 201);
  assertEq([count(), made.data.number, made.data.racket.model], [2, 2, 'Speed'], 'a racket, and the order after the one that was made');
  assertEq(await stringStock(s, s.string.id), 1, 'and it took its string');
});
test('Stock', 'a hybrid takes half a set of each string; the customer\'s strings and uncounted ones take none', async (ctx) => {
  const s = await stocked(ctx);
  const gut = (await s.client.post('/api/strings', { brand: 'Babolat', model: 'VS Touch', track_stock: true, stock: 1 })).data;
  const hybrid = await s.client.post('/api/orders', minimalOrder(s, {
    hybrid: true, main_string_id: s.string.id, cross_string_id: gut.id,
  }));
  assertStatus(hybrid, 201);
  assertEq([await stringStock(s, s.string.id), await stringStock(s, gut.id)], [2.5, 0.5], 'half of each');

  const own = await s.client.post('/api/orders', minimalOrder(s, { customer_strings: true, main_string_name: 'Their Solinco' }));
  assertStatus(own, 201);
  const loose = (await s.client.post('/api/strings', { brand: 'Wilson', model: 'NXT' })).data;
  assertStatus(await s.client.post('/api/orders', minimalOrder(s, { main_string_id: loose.id })), 201);
  assertEq(await stringStock(s, loose.id), 0, 'a string that is not counted is never taken from');
  assertEq(await stringStock(s, s.string.id), 2.5, 'and the others are as they were');

  assertStatus(await s.client.delete(`/api/orders/${hybrid.data.id}`), 200);
  assertEq([await stringStock(s, s.string.id), await stringStock(s, gut.id)], [3, 1], 'back as it was');
});
test('Stock', 'changing what an order points at moves the stock; changing anything else does not', async (ctx) => {
  const s = await stocked(ctx);
  const other = (await s.client.post('/api/strings', { brand: 'Babolat', model: 'RPM', track_stock: true, stock: 2 })).data;
  const order = (await s.client.post('/api/orders', minimalOrder(s, { main_string_id: s.string.id }))).data;
  assertEq(await stringStock(s, s.string.id), 2, 'taken');

  await s.client.patch(`/api/orders/${order.id}`, { notes: 'Fast', status: 'in_progress', labor_price: 20, is_paid: true });
  assertEq(await stringStock(s, s.string.id), 2, 'a note, the status and the price leave it alone');

  const changed = await s.client.patch(`/api/orders/${order.id}`, { main_string_id: other.id });
  assertStatus(changed, 200);
  assertEq([await stringStock(s, s.string.id), await stringStock(s, other.id)], [3, 1], 'the old string is back, the new one taken');

  await s.client.patch(`/api/strings/${s.string.id}`, { stock: 0 });
  const refused = await s.client.patch(`/api/orders/${order.id}`, { main_string_id: s.string.id });
  assertStatus(refused, 409);
  assertEq(await stringStock(s, other.id), 1, 'a change that fails changes nothing');
  assertEq((await s.client.get(`/api/orders/${order.id}`)).data.main_string_id, other.id, 'the order is as it was');

  const customer = await s.client.patch(`/api/orders/${order.id}`, { customer_strings: true, main_string_name: 'Their own' });
  assertStatus(customer, 200);
  assertEq(await stringStock(s, other.id), 2, 'strings the customer brings: the set goes back');
});
test('Stock', 'an order made before the stock was counted gives nothing back', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s, { main_string_id: s.string.id }))).data;
  await s.client.patch(`/api/strings/${s.string.id}`, { track_stock: true, stock: 3 });
  await s.client.patch(`/api/orders/${order.id}`, { notes: 'Counted since' });
  assertEq(await stringStock(s, s.string.id), 3, 'editing it takes nothing');
  assertStatus(await s.client.delete(`/api/orders/${order.id}`), 200);
  assertEq(await stringStock(s, s.string.id), 3, 'and deleting it gives nothing back');
});
test('Stock', 'two orders at once cannot both take the last one', async (ctx) => {
  const s = await stocked(ctx, { stringStock: 1 });
  const results = await Promise.all([1, 2, 3].map(() => s.client.post('/api/orders', minimalOrder(s, { main_string_id: s.string.id }))));
  assertEq(results.map((r) => r.status).sort(), [201, 409, 409], 'one wins');
  assertEq(await stringStock(s, s.string.id), 0, 'nothing is below zero');
  assertEq((await s.client.get('/api/orders')).data.items.map((o) => o.number), [1], 'and only one number was used');
});
test('Stock', 'a catalog racket goes with any client and has no setup of its own', async (ctx) => {
  const s = await stocked(ctx);
  const iga = (await s.client.post('/api/clients', { name: 'Iga', phone: '+380631110000' })).data;
  assertStatus(await s.client.post('/api/orders', catalogOrder(s, { main_tension: 24 })), 201);
  assertStatus(await s.client.post('/api/orders', { client_id: iga.id, racket_id: s.catalogRacket.id, main_tension: 25 }), 201);
  const { data } = await s.client.get(`/api/rackets/${s.catalogRacket.id}`);
  assertEq(data.orders.map((o) => o.client.name), ['Iga', 'Maria Sharapova'], 'its history is across clients');
  assertEq(data.last_setup, null, 'a setup is a client\'s, so there is none to repeat');
  const stranger = await register(ctx);
  assertStatus(await stranger.client.post('/api/orders', { client_id: iga.id, racket_id: s.catalogRacket.id }), 400);
});

// ---------------------------------------------------------------------------
// Offline mode: ids that the phone makes up, stock changed by an amount, the time of a tap, orders with their details
// ---------------------------------------------------------------------------
const ID_CONFLICT = 'This id is already in use';
const idOf = () => randomUUID();
const stamp = (ms) => new Date(Date.now() + ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The five things the phone can name, made by `client` under the ids in `ids`; `more` adds to the order. */
async function madeUnderOwnIds(client, ids, more = {}) {
  const customer = await client.post('/api/clients', { id: ids.client, name: 'Ann Lee', phone: '+380501112233' });
  const racket = await client.post('/api/rackets', { id: ids.racket, client_id: ids.client, brand: 'Wilson', model: 'Blade' });
  const string = await client.post('/api/strings', { id: ids.string, brand: 'Luxilon', model: 'ALU Power', type: 'polyester' });
  const service = await client.post('/api/services', { id: ids.service, name: 'Dampener', price: 3 });
  const order = await client.post('/api/orders', {
    id: ids.order,
    client_id: ids.client,
    racket_id: ids.racket,
    main_string_id: ids.string,
    services: [{ service_id: ids.service, name: 'Dampener', price: 3 }],
    ...more,
  });
  return { customer, racket, string, service, order };
}
const newIds = () => ({ client: idOf(), racket: idOf(), string: idOf(), service: idOf(), order: idOf() });

test('Offline ids', 'a client, a racket, a string, a service and an order are made under the id the phone gave them', async (ctx) => {
  const { client } = await register(ctx);
  const ids = newIds();
  const made = await madeUnderOwnIds(client, ids);
  for (const [kind, res] of Object.entries(made)) assertEq([kind, res.status], [kind, 201], 'made');
  assertEq(
    [made.customer.data.id, made.racket.data.id, made.string.data.id, made.service.data.id, made.order.data.id],
    [ids.client, ids.racket, ids.string, ids.service, ids.order],
    'under those ids'
  );
  assertEq([made.order.data.number, made.order.data.client.id, made.order.data.racket.id, made.order.data.main_string_id], [1, ids.client, ids.racket, ids.string], 'and they point at each other');
  for (const path of [`clients/${ids.client}`, `rackets/${ids.racket}`, `strings/${ids.string}`, `orders/${ids.order}`]) {
    assertStatus(await client.get(`/api/${path}`), 200);
  }
  assertTrue((await client.get('/api/services')).data.items.some((service) => service.id === ids.service), 'the service is listed');

  // Without an id the server still makes one, as it always did.
  const plain = await client.post('/api/clients', { name: 'Bob', phone: '+380509998877' });
  assertEq([plain.status, plain.data.id === ids.client, /^[0-9a-f-]{36}$/.test(plain.data.id)], [201, false, true], 'the server\'s own id');
});
test('Offline ids', 'an id has to be a UUID, and a change never takes a new id', async (ctx) => {
  const { client } = await register(ctx);
  for (const [path, body] of [
    ['clients', { name: 'Ann', phone: '+380501112233' }],
    ['rackets', { brand: 'Head', model: 'Speed' }],
    ['strings', { brand: 'Head', model: 'Hawk' }],
    ['services', { name: 'Dampener' }],
  ]) {
    const bad = await client.post(`/api/${path}`, { ...body, id: 'not-a-uuid' });
    assertStatus(bad, 400);
    assertTrue(bad.data.fields.id, `${path}: the id is named`);
  }
  const s = await shop(ctx);
  const bad = await s.client.post('/api/orders', minimalOrder(s, { id: 'nope' }));
  assertStatus(bad, 400);
  assertTrue(bad.data.fields.id, 'orders: the id is named');
  const badRacket = await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: { id: 'nope', brand: 'Head', model: 'Speed' } });
  assertStatus(badRacket, 400);
  assertTrue(badRacket.data.fields['new_racket.id'], 'a named racket: its id is named');

  const other = idOf();
  const edited = await s.client.patch(`/api/clients/${s.customer.id}`, { id: other, notes: 'Left-handed' });
  assertEq([edited.status, edited.data.id, edited.data.notes], [200, s.customer.id, 'Left-handed'], 'the id of a client stays');
  assertStatus(await s.client.get(`/api/clients/${other}`), 404);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const moved = await s.client.patch(`/api/orders/${order.id}`, { id: other, notes: 'Fast' });
  assertEq([moved.status, moved.data.id], [200, order.id], 'and so does the id of an order');
  assertEq((await s.client.patch(`/api/rackets/${s.racket.id}`, { id: other, notes: 'Demo' })).data.id, s.racket.id, 'a racket');
  assertEq((await s.client.patch(`/api/strings/${s.string.id}`, { id: other, model: 'x' })).data.id, s.string.id, 'a string');
});
test('Offline ids', 'the same request sent again is answered with 200 and the same row, and makes nothing', async (ctx) => {
  const { client } = await register(ctx);
  const ids = newIds();
  const first = await madeUnderOwnIds(client, ids);
  const again = await madeUnderOwnIds(client, ids);
  for (const kind of ['customer', 'racket', 'string', 'service', 'order']) {
    assertEq([kind, again[kind].status], [kind, 200], 'answered with 200');
  }
  // The row as it is: what only counts other rows (the orders of a client, the history of a racket) is as it is now.
  const without = (data, keys) => Object.fromEntries(Object.entries(data).filter(([key]) => !keys.includes(key)));
  const counts = ['rackets_count', 'orders_count', 'last_order_date', 'last_setup'];
  assertEq(without(again.customer.data, counts), without(first.customer.data, counts), 'the same client');
  assertEq(without(again.racket.data, counts), without(first.racket.data, counts), 'the same racket');
  assertEq(again.string.data, first.string.data, 'the same string');
  assertEq(again.service.data, first.service.data, 'the same service');
  assertEq(again.order.data, first.order.data, 'the same order');
  assertEq([again.customer.data.rackets_count, again.customer.data.orders_count], [1, 1], 'a client with the counts they have now');
  assertEq(again.racket.data.orders_count, 1, 'and a racket');
  assertEq((await client.get('/api/clients')).data.items.length, 1, 'one client');
  assertEq((await client.get('/api/rackets')).data.items.length, 1, 'one racket');
  assertEq((await client.get('/api/strings')).data.items.length, 1, 'one string');
  assertEq((await client.get('/api/services')).data.items.filter((s) => s.name === 'Dampener').length, 1, 'one service');
  assertEq((await client.get('/api/orders')).data.items.length, 1, 'one order');
  assertEq(dbScalar(`SELECT count(*) FROM order_services WHERE order_id='${ids.order}'`), '1', 'and one service line');
  // The repeat is of the first request: what it says now does not change the row.
  const changed = await client.post('/api/clients', { id: ids.client, name: 'Somebody Else', phone: '+380631110000' });
  assertEq([changed.status, changed.data.name, changed.data.phone], [200, 'Ann Lee', '+380501112233'], 'nothing is overwritten');
  // The next order is the second: the repeat used no number.
  const next = await client.post('/api/orders', { client_id: ids.client, racket_id: ids.racket });
  assertEq([next.status, next.data.number], [201, 2], 'no number was used');
});
test('Offline ids', 'a repeat is a repeat even where a new request would be refused', async (ctx) => {
  const { client } = await register(ctx);
  const ids = newIds();
  assertStatus(await client.post('/api/clients', { id: ids.client, name: 'Ann Lee', phone: '+380501112233' }), 201);
  // The phone of this client is taken, for any other client...
  const twin = await client.post('/api/clients', { id: idOf(), name: 'Twin', phone: '050 111 22 33' });
  assertEq([twin.status, twin.data.code], [409, 'phone_taken'], 'a new id with the same phone is refused as ever');
  // ...but not for the client itself, sent again.
  const same = await client.post('/api/clients', { id: ids.client, name: 'Ann Lee', phone: '+380501112233' });
  assertStatus(same, 200);

  assertStatus(await client.post('/api/rackets', { id: ids.racket, client_id: ids.client, brand: 'Wilson', model: 'Blade' }), 201);
  assertStatus(await client.post('/api/strings', { id: ids.string, brand: 'Luxilon', model: 'ALU Power' }), 201);
  const order = { id: ids.order, client_id: ids.client, racket_id: ids.racket, main_string_id: ids.string };
  assertStatus(await client.post('/api/orders', order), 201);

  // Everything it points at is gone since; the repeat still finds what it made.
  assertStatus(await client.delete(`/api/clients/${ids.client}`), 200);
  assertStatus(await client.delete(`/api/strings/${ids.string}`), 200);
  assertStatus(await client.post('/api/orders', order), 200);
  assertStatus(await client.post('/api/orders', { ...order, id: idOf() }), 400);
  const racket = await client.post('/api/rackets', { id: ids.racket, client_id: ids.client, brand: 'Wilson', model: 'Blade' });
  assertEq([racket.status, racket.data.id], [200, ids.racket], 'a racket whose owner is gone');
  // What was removed is answered, not brought back.
  const string = await client.post('/api/strings', { id: ids.string, brand: 'Luxilon', model: 'ALU Power' });
  assertEq([string.status, string.data.id], [200, ids.string], 'a removed string is answered');
  const customer = await client.post('/api/clients', { id: ids.client, name: 'Ann Lee', phone: '+380501112233' });
  assertEq([customer.status, customer.data.id], [200, ids.client], 'a removed client is answered');
  assertStatus(await client.get(`/api/strings/${ids.string}`), 404);
  assertStatus(await client.get(`/api/clients/${ids.client}`), 404);
  assertEq((await client.get('/api/strings')).data.items.length, 0, 'and stays out of the lists');

  // The body of a repeat is still checked.
  assertStatus(await client.post('/api/clients', { id: ids.client, name: '', phone: '+380501112233' }), 400);
  assertStatus(await client.post('/api/orders', { id: ids.order, client_id: 'x' }), 400);
});
test('Offline ids', 'the id of another stringer\'s row is refused with the same answer for every kind, and nothing is made', async (ctx) => {
  const a = await register(ctx);
  const b = await register(ctx);
  const ids = newIds();
  await madeUnderOwnIds(a.client, ids);
  const mine = await shop(ctx);
  const mineCatalog = { client_id: mine.customer.id, racket_id: mine.racket.id };

  const refused = [
    await b.client.post('/api/clients', { id: ids.client, name: 'Mine', phone: '+380631110000' }),
    await b.client.post('/api/rackets', { id: ids.racket, brand: 'Head', model: 'Speed' }),
    await b.client.post('/api/strings', { id: ids.string, brand: 'Head', model: 'Hawk' }),
    await b.client.post('/api/services', { id: ids.service, name: 'Mine' }),
    await mine.client.post('/api/orders', { id: ids.order, ...mineCatalog }),
  ];
  for (const res of refused) {
    assertStatus(res, 409);
    assertEq(res.data, { error: ID_CONFLICT, code: 'id_conflict' }, 'a 409 that says nothing more');
  }
  // The stringer who owns them has them as they were, and the other has nothing new.
  assertEq((await a.client.get(`/api/clients/${ids.client}`)).data.name, 'Ann Lee', 'the client is unchanged');
  assertEq((await a.client.get(`/api/orders/${ids.order}`)).data.number, 1, 'the order is unchanged');
  assertEq((await b.client.get('/api/clients')).data.items.length, 0, 'no client for the other');
  assertEq((await b.client.get('/api/rackets')).data.items.length, 0, 'no racket for the other');
  assertEq((await mine.client.get('/api/orders')).data.items.length, 0, 'and no order');
  // The order numbers of the stringer who was refused were not used.
  assertEq((await mine.client.post('/api/orders', mineCatalog)).data.number, 1, 'no number was used');
});
test('Offline ids', 'copies of one request at the same moment make one row; two stringers using one id get one 409', async (ctx) => {
  const { client } = await register(ctx);
  const ids = newIds();
  const copies = (send) => Promise.all([1, 2, 3].map(send));
  const statuses = (results) => results.map((res) => res.status).sort();

  const clients = await copies(() => client.post('/api/clients', { id: ids.client, name: 'Ann Lee', phone: '+380501112233' }));
  assertEq(statuses(clients), [200, 200, 201], 'a client: one is made, and the phone of the others is no obstacle');
  const rackets = await copies(() => client.post('/api/rackets', { id: ids.racket, client_id: ids.client, brand: 'Wilson', model: 'Blade' }));
  assertEq(statuses(rackets), [200, 200, 201], 'a racket');
  const strings = await copies(() => client.post('/api/strings', { id: ids.string, brand: 'Luxilon', model: 'ALU Power' }));
  assertEq(statuses(strings), [200, 200, 201], 'a string');
  const services = await copies(() => client.post('/api/services', { id: ids.service, name: 'Dampener' }));
  assertEq(statuses(services), [200, 200, 201], 'a service');
  const orders = await copies(() => client.post('/api/orders', { id: ids.order, client_id: ids.client, racket_id: ids.racket, main_string_id: ids.string }));
  assertEq(statuses(orders), [200, 200, 201], 'an order');
  assertEq(new Set(orders.map((res) => res.data.number)).size, 1, 'with one number');
  assertEq((await client.get('/api/orders')).data.items.length, 1, 'and only one order');
  for (const table of ['clients', 'rackets', 'strings']) {
    assertEq(dbScalar(`SELECT count(*) FROM ${table} WHERE id='${ids[table.slice(0, -1)]}'`), '1', `${table}: one row`);
  }

  // Two stringers who chose one id at the same moment: one is let in, the other is told so, and nobody gets a 500.
  const b = await register(ctx);
  const c = await register(ctx);
  const fresh = newIds();
  for (const [kind, send] of [
    ['client', (who, n) => who.client.post('/api/clients', { id: fresh.client, name: `Who ${n}`, phone: `+38050000000${n}` })],
    ['racket', (who, n) => who.client.post('/api/rackets', { id: fresh.racket, brand: 'Head', model: `Speed ${n}` })],
    ['string', (who, n) => who.client.post('/api/strings', { id: fresh.string, brand: 'Head', model: `Hawk ${n}` })],
    ['service', (who, n) => who.client.post('/api/services', { id: fresh.service, name: `Service ${n}` })],
  ]) {
    const both = await Promise.all([send(b, 1), send(c, 2)]);
    assertEq(statuses(both), [201, 409], `${kind}: one in, one told`);
    assertEq(both.find((res) => res.status === 409).data.code, 'id_conflict', `${kind}: the code`);
  }
  const one = await shop(ctx);
  const two = await shop(ctx);
  const raced = await Promise.all([
    one.client.post('/api/orders', minimalOrder(one, { id: fresh.order })),
    two.client.post('/api/orders', minimalOrder(two, { id: fresh.order })),
  ]);
  assertEq(statuses(raced), [201, 409], 'an order: one in, one told');
  const lost = raced.find((res) => res.status === 409);
  assertEq(lost.data, { error: ID_CONFLICT, code: 'id_conflict' }, 'and the shape of the answer');
  const loser = raced[0].status === 409 ? one : two;
  assertEq((await loser.client.get('/api/orders')).data.items.length, 0, 'the loser has no order');
  assertEq((await loser.client.post('/api/orders', minimalOrder(loser))).data.number, 1, 'and used no number');
});
test('Offline ids', 'a repeated order takes nothing from the stock again and uses no number', async (ctx) => {
  const s = await stocked(ctx, { racketStock: 5, stringStock: 3 });
  const id = idOf();
  const order = catalogOrder(s, { id, main_string_id: s.string.id });
  const first = await s.client.post('/api/orders', order);
  assertStatus(first, 201);
  assertEq([await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id)], [4, 2], 'taken once');
  for (let i = 0; i < 3; i++) {
    const again = await s.client.post('/api/orders', order);
    assertEq([again.status, again.data.number, again.data.id], [200, first.data.number, id], `the repeat ${i + 1}`);
  }
  assertEq([await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id)], [4, 2], 'and not again');
  const next = await s.client.post('/api/orders', catalogOrder(s));
  assertEq([next.status, next.data.number, await racketStock(s, s.catalogRacket.id)], [201, 2, 3], 'the next order is the second');

  // Three copies at the same moment take the stock once.
  const racing = idOf();
  const copies = await Promise.all([1, 2, 3].map(() => s.client.post('/api/orders', catalogOrder(s, { id: racing, main_string_id: s.string.id }))));
  assertEq(copies.map((res) => res.status).sort(), [200, 200, 201], 'one is made');
  assertEq([await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id)], [2, 1], 'and takes once');
  assertEq((await s.client.get('/api/orders')).data.items.length, 3, 'three orders in all');
  // An order that is refused for the stock is not remembered: it can be sent again when there is some.
  const refused = idOf();
  await s.client.patch(`/api/rackets/${s.catalogRacket.id}`, { stock: 0 });
  const out = await s.client.post('/api/orders', catalogOrder(s, { id: refused }));
  assertEq([out.status, out.data.code], [409, 'out_of_stock'], 'refused');
  await s.client.patch(`/api/rackets/${s.catalogRacket.id}`, { stock: 1 });
  assertEq((await s.client.post('/api/orders', catalogOrder(s, { id: refused }))).status, 201, 'and made later under the same id');
});
test('Offline ids', 'a racket named by an order may bring an id; the client\'s racket of that name wins over it', async (ctx) => {
  const s = await shop(ctx);
  const racketId = idOf();
  const orderId = idOf();
  const body = { id: orderId, client_id: s.customer.id, new_racket: { id: racketId, brand: ' Babolat ', model: 'Pure Drive' } };
  const made = await s.client.post('/api/orders', body);
  assertStatus(made, 201);
  assertEq([made.data.racket.id, made.data.racket.brand, made.data.racket.client_id], [racketId, 'Babolat', s.customer.id], 'the racket has the id');
  assertEq((await s.client.get(`/api/rackets/${racketId}`)).data.orders_count, 1, 'and the order');
  // The order sent again: one order, one racket.
  const again = await s.client.post('/api/orders', body);
  assertEq([again.status, again.data.racket.id], [200, racketId], 'a repeat');
  assertEq(await clientRackets(s), ['Babolat Pure Drive', 'Wilson Pro Staff 97'], 'no racket was made twice');

  // The client has a racket of that name by now: it is used, and the id the phone gave is not.
  const unused = idOf();
  const other = await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: { id: unused, brand: 'babolat', model: 'PURE-DRIVE' } });
  assertStatus(other, 201);
  assertEq(other.data.racket.id, racketId, 'the racket the client has');
  assertStatus(await s.client.get(`/api/rackets/${unused}`), 404);

  // A change that names a racket can bring an id as well.
  const moving = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const movedId = idOf();
  const moved = await s.client.patch(`/api/orders/${moving.id}`, { new_racket: { id: movedId, brand: 'Yonex', model: 'Ezone 98' } });
  assertEq([moved.status, moved.data.racket.id], [200, movedId], 'a change');

  // An id that is not free for a racket refuses the order whole.
  const stranger = await shop(ctx);
  const taken = await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: { id: stranger.racket.id, brand: 'Head', model: 'Speed' } });
  assertEq([taken.status, taken.data.code], [409, 'id_conflict'], 'another stringer\'s racket id');
  const ours = await s.client.post('/api/orders', { client_id: s.customer.id, new_racket: { id: s.racket.id, brand: 'Head', model: 'Speed' } });
  assertEq([ours.status, ours.data.code], [409, 'id_conflict'], 'and one of this stringer\'s, for another racket');
  assertEq(await clientRackets(s), ['Babolat Pure Drive', 'Wilson Pro Staff 97', 'Yonex Ezone 98'], 'no racket was made by the refused orders');
  assertEq((await s.client.get('/api/orders')).data.items.length, 3, 'and no order');
  assertEq((await s.client.post('/api/orders', minimalOrder(s))).data.number, 4, 'and no number was used');
});

test('Offline stock', 'a racket\'s stock changes by an amount, never below zero or above the most', async (ctx) => {
  const s = await stocked(ctx, { racketStock: 2 });
  const change = (delta, op = idOf(), id = s.catalogRacket.id) => s.client.post(`/api/rackets/${id}/stock`, { delta, op_id: op });

  const more = await change(3);
  assertStatus(more, 200);
  assertEq([more.data.id, more.data.stock, more.data.available, more.data.track_stock], [s.catalogRacket.id, 5, true, true], 'added');
  assertEq((await change(-1)).data.stock, 4, 'taken');
  assertEq((await change(0)).data.stock, 4, 'zero changes nothing');
  const gone = await change(-10);
  assertEq([gone.status, gone.data.stock, gone.data.available], [200, 0, false], 'not below zero');
  assertEq(await racketStock(s, s.catalogRacket.id), 0, 'and it is what GET says');
  assertEq((await change(100_000)).data.stock, 100_000, 'the most a stock holds');
  assertEq((await change(7)).data.stock, 100_000, 'and it stops there');

  for (const bad of [1.5, '3', null, 100_001, -100_001, true]) {
    const res = await change(bad);
    assertStatus(res, 400);
    assertTrue(res.data.fields.delta, `${JSON.stringify(bad)}: the amount is named`);
  }
  const noKey = await s.client.post(`/api/rackets/${s.catalogRacket.id}/stock`, { delta: 1 });
  assertStatus(noKey, 400);
  assertTrue(noKey.data.fields.op_id, 'the key is named');
  const badKey = await change(1, 'not-a-uuid');
  assertStatus(badKey, 400);
  assertTrue(badKey.data.fields.op_id, 'a key that is not a UUID');
  assertEq(await racketStock(s, s.catalogRacket.id), 100_000, 'a refused request changes nothing');
  assertStatus(await new Client(ctx.server.base).post(`/api/rackets/${s.catalogRacket.id}/stock`, { delta: 1, op_id: idOf() }), 401);
});
test('Offline stock', 'a string\'s stock changes by whole and half sets', async (ctx) => {
  const s = await stocked(ctx, { stringStock: 3 });
  const change = (delta, op = idOf(), id = s.string.id) => s.client.post(`/api/strings/${id}/stock`, { delta, op_id: op });

  assertEq((await change(0.5)).data.stock, 3.5, 'half a set');
  assertEq((await change(-1.5)).data.stock, 2, 'one and a half taken');
  const res = await change(2);
  assertEq([res.status, res.data.stock, res.data.available, res.data.id], [200, 4, true, s.string.id], 'whole sets');
  assertEq((await change(-100)).data.stock, 0, 'not below zero');
  assertEq((await change(100_000)).data.stock, 100_000, 'the most');
  assertEq((await change(0.5)).data.stock, 100_000, 'and it stops there');
  for (const bad of [0.3, 1.25, '1', null, 100_000.5, -100_001]) {
    const refused = await change(bad);
    assertStatus(refused, 400);
    assertTrue(refused.data.fields.delta, `${JSON.stringify(bad)}: the amount is named`);
  }
  assertEq(await stringStock(s, s.string.id), 100_000, 'a refused request changes nothing');
});
test('Offline stock', 'the same key is answered and not applied twice; the key is the stringer\'s own', async (ctx) => {
  const s = await stocked(ctx, { racketStock: 2, stringStock: 3 });
  const racketOp = idOf();
  const stringOp = idOf();
  const racketPath = `/api/rackets/${s.catalogRacket.id}/stock`;
  const stringPath = `/api/strings/${s.string.id}/stock`;

  assertEq((await s.client.post(racketPath, { delta: 3, op_id: racketOp })).data.stock, 5, 'applied');
  for (let i = 0; i < 3; i++) {
    const again = await s.client.post(racketPath, { delta: 3, op_id: racketOp });
    assertEq([again.status, again.data.stock], [200, 5], `a repeat of the racket's change ${i + 1}`);
  }
  assertEq((await s.client.post(stringPath, { delta: 1.5, op_id: stringOp })).data.stock, 4.5, 'applied');
  assertEq((await s.client.post(stringPath, { delta: 1.5, op_id: stringOp })).data.stock, 4.5, 'and not again');
  // The key is what makes it the same change: another key is another change, and a repeat shows the stock as it is now.
  assertEq((await s.client.post(racketPath, { delta: 3, op_id: idOf() })).data.stock, 8, 'another key');
  await s.client.patch(`/api/rackets/${s.catalogRacket.id}`, { stock: 1 });
  assertEq((await s.client.post(racketPath, { delta: 3, op_id: racketOp })).data.stock, 1, 'a repeat shows the stock as it is now');
  assertEq(dbScalar(`SELECT count(*) FROM applied_operations WHERE op_id IN ('${racketOp}', '${stringOp}')`), '2', 'the keys are written once each');

  // Another stringer may use the same key: it is theirs.
  const other = await stocked(ctx, { racketStock: 1 });
  assertEq((await other.client.post(`/api/rackets/${other.catalogRacket.id}/stock`, { delta: 2, op_id: racketOp })).data.stock, 3, 'their own change');

  // Five copies at the same moment are one change; five different changes at the same moment are five.
  const racing = idOf();
  await Promise.all([1, 2, 3, 4, 5].map(() => s.client.post(racketPath, { delta: 1, op_id: racing })));
  assertEq(await racketStock(s, s.catalogRacket.id), 2, 'one change');
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => s.client.post(racketPath, { delta: 1, op_id: idOf() })));
  assertEq(results.map((res) => res.status), [200, 200, 200, 200, 200], 'all answered');
  assertEq(await racketStock(s, s.catalogRacket.id), 7, 'and all counted');
});
test('Offline stock', 'a client\'s racket has no stock; an unknown, removed or another stringer\'s item is a 404; a refused key is free', async (ctx) => {
  const s = await stocked(ctx);
  const op = idOf();
  const own = await s.client.post(`/api/rackets/${s.racket.id}/stock`, { delta: 1, op_id: op });
  assertStatus(own, 400);
  assertEq(own.data.code, 'validation_error', 'code');
  assertTrue(own.data.fields.delta, 'the amount is named');
  assertEq(dbScalar(`SELECT count(*) FROM applied_operations WHERE op_id='${op}'`), '0', 'the key was not used up');

  const unknown = idOf();
  assertStatus(await s.client.post(`/api/rackets/${unknown}/stock`, { delta: 1, op_id: op }), 404);
  assertStatus(await s.client.post(`/api/strings/${unknown}/stock`, { delta: 1, op_id: op }), 404);
  assertStatus(await s.client.post('/api/rackets/not-a-uuid/stock', { delta: 1, op_id: op }), 404);
  const { client: stranger } = await register(ctx);
  assertStatus(await stranger.post(`/api/rackets/${s.catalogRacket.id}/stock`, { delta: 1, op_id: op }), 404);
  assertStatus(await stranger.post(`/api/strings/${s.string.id}/stock`, { delta: 1, op_id: op }), 404);
  assertStatus(await s.client.delete(`/api/rackets/${s.catalogRacket.id}`), 200);
  assertStatus(await s.client.delete(`/api/strings/${s.string.id}`), 200);
  assertStatus(await s.client.post(`/api/rackets/${s.catalogRacket.id}/stock`, { delta: 1, op_id: op }), 404);
  assertStatus(await s.client.post(`/api/strings/${s.string.id}/stock`, { delta: 1, op_id: op }), 404);
  assertEq(dbScalar(`SELECT count(*) FROM applied_operations WHERE op_id='${op}'`), '0', 'no refused request used the key up');

  // So the same key still works for an item that is there.
  const catalog = (await s.client.post('/api/rackets', { brand: 'Head', model: 'Speed', track_stock: true, stock: 1 })).data;
  assertEq((await s.client.post(`/api/rackets/${catalog.id}/stock`, { delta: 2, op_id: op })).data.stock, 3, 'free to use');
});
test('Offline stock', 'an item that is not counted adds up too; counting it is a change of track_stock; old absolute stock still works', async (ctx) => {
  const s = await shop(ctx);
  const plain = (await s.client.post('/api/rackets', { brand: 'Prince', model: 'Phantom' })).data;
  const added = await s.client.post(`/api/rackets/${plain.id}/stock`, { delta: 2, op_id: idOf() });
  assertEq([added.data.stock, added.data.track_stock, added.data.available], [2, false, true], 'added, still not counted');
  const counted = await s.client.patch(`/api/rackets/${plain.id}`, { track_stock: true });
  assertEq([counted.data.track_stock, counted.data.stock], [true, 2], 'counting it keeps the amount');
  const strung = await s.client.post(`/api/strings/${s.string.id}/stock`, { delta: 1.5, op_id: idOf() });
  assertEq([strung.data.stock, strung.data.track_stock], [1.5, false], 'a string too');

  // The absolute number the older builds of the app send is untouched.
  assertEq((await s.client.patch(`/api/rackets/${plain.id}`, { stock: 9 })).data.stock, 9, 'absolute stock of a racket');
  assertEq((await s.client.patch(`/api/strings/${s.string.id}`, { stock: 4, track_stock: true })).data.stock, 4, 'absolute stock of a string');
  assertEq((await s.client.post(`/api/rackets/${plain.id}/stock`, { delta: -4, op_id: idOf() })).data.stock, 5, 'and an amount after it');
});
test('Offline stock', 'a change by an amount goes with the orders that take and give back', async (ctx) => {
  const s = await stocked(ctx, { racketStock: 5, stringStock: 3 });
  const order = (await s.client.post('/api/orders', catalogOrder(s, { main_string_id: s.string.id }))).data;
  assertEq([await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id)], [4, 2], 'taken by the order');
  await s.client.post(`/api/rackets/${s.catalogRacket.id}/stock`, { delta: 3, op_id: idOf() });
  await s.client.post(`/api/strings/${s.string.id}/stock`, { delta: -0.5, op_id: idOf() });
  assertEq([await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id)], [7, 1.5], 'changed by an amount');
  assertStatus(await s.client.delete(`/api/orders/${order.id}`), 200);
  assertEq([await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id)], [8, 2.5], 'and what the order took comes back to what is there');
  // Taking what is there leaves an order that needs it to be refused.
  await s.client.post(`/api/strings/${s.string.id}/stock`, { delta: -100, op_id: idOf() });
  assertEq((await s.client.post('/api/orders', minimalOrder(s, { main_string_id: s.string.id }))).status, 409, 'nothing left for an order');
});
test('Offline stock', 'the keys of an account go with it', async (ctx) => {
  const s = await stocked(ctx);
  const userId = (await s.client.get('/api/auth/me')).data.id;
  assertStatus(await s.client.post(`/api/rackets/${s.catalogRacket.id}/stock`, { delta: 1, op_id: idOf() }), 200);
  assertStatus(await s.client.post(`/api/strings/${s.string.id}/stock`, { delta: 1, op_id: idOf() }), 200);
  assertEq(dbScalar(`SELECT count(*) FROM applied_operations WHERE user_id='${userId}'`), '2', 'two keys');
  assertStatus(await s.client.post('/api/auth/delete-account', { password }), 200);
  assertEq(dbScalar(`SELECT count(*) FROM applied_operations WHERE user_id='${userId}'`), '0', 'none left');
});
test('Offline stock', 'a change of nothing changes nothing, and is still answered once', async (ctx) => {
  const s = await stocked(ctx, { racketStock: 2, stringStock: 1 });
  const before = (await s.client.get(`/api/rackets/${s.catalogRacket.id}`)).data;
  delete before.orders; // the history is on the page of the racket, not in the answer of a change
  const same = await s.client.post(`/api/rackets/${s.catalogRacket.id}/stock`, { delta: 0, op_id: idOf() });
  assertEq([same.status, same.data], [200, before], 'the racket as it was, updated_at too');
  const string = await s.client.post(`/api/strings/${s.string.id}/stock`, { delta: 0, op_id: idOf() });
  assertEq([string.status, string.data.stock], [200, 1], 'and the string');
});
test('Offline stock', 'the keys of operations older than 90 days are deleted when the server starts', async (ctx) => {
  const s = await stocked(ctx);
  const userId = (await s.client.get('/api/auth/me')).data.id;
  const [old, recent] = [idOf(), idOf()];
  dbExec(
    `INSERT INTO applied_operations (user_id, op_id, created_at) VALUES ('${userId}', '${old}', now() - interval '91 days'), ('${userId}', '${recent}', now() - interval '89 days')`
  );
  const count = (op) => dbScalar(`SELECT count(*) FROM applied_operations WHERE op_id='${op}'`);
  assertEq([count(old), count(recent)], ['1', '1'], 'both are there');

  const second = await startServer({ port: CONFIG.port + 1 });
  try {
    for (let attempt = 0; attempt < 50 && count(old) !== '0'; attempt++) await sleep(100);
    assertEq(count(old), '0', 'the older one is gone');
    assertEq(count(recent), '1', 'the newer one stays');
  } finally {
    await second.stop();
  }
});

test('Offline time', 'the moment of a tap dates the status and the payment', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const started = stamp(-2 * DAY);
  const ready = stamp(-DAY);
  const done = stamp(-HOUR);
  const patch = async (body) => (await s.client.patch(`/api/orders/${order.id}`, body)).data;
  const time = (value) => new Date(value).getTime();

  let o = await patch({ status: 'in_progress', at: started });
  assertEq(time(o.started_at), time(started), 'started when it was tapped');
  o = await patch({ status: 'ready', at: ready });
  assertEq([time(o.started_at), time(o.ready_at)], [time(started), time(ready)], 'ready then, and started as before');
  o = await patch({ status: 'completed', is_paid: true, at: done });
  assertEq([time(o.completed_at), time(o.paid_at), time(o.ready_at)], [time(done), time(done), time(ready)], 'completed and paid at the tap');
  const just = Date.now();
  assertTrue(just - time(o.updated_at) < 60_000, 'but the order was changed now');
  // The moment of a tap is for what the tap does: a note changed later has none.
  o = await patch({ notes: 'Fast', at: stamp(-30 * 60_000) });
  assertEq([time(o.completed_at), time(o.paid_at)], [time(done), time(done)], 'nothing else is dated');
  o = await patch({ is_paid: false, at: stamp(-10 * 60_000) });
  assertEq(o.paid_at, null, 'unpaid has no time');
  o = await patch({ is_paid: true, at: stamp(-5 * 60_000) });
  assertTrue(Math.abs(time(o.paid_at) - (Date.now() - 5 * 60_000)) < 60_000, 'paid again at the new tap');
  o = await patch({ status: 'in_progress', at: stamp(-3 * 60_000) });
  assertEq([o.ready_at, o.completed_at], [null, null], 'moving back clears the later times, as ever');
});
test('Offline time', 'a moment in the future, over 90 days ago or missing is the time of the request', async (ctx) => {
  const s = await shop(ctx);
  const close = (value, before) => Math.abs(new Date(value).getTime() - before) < 60_000;
  for (const [what, at] of [
    ['in the future', stamp(HOUR)],
    ['a day ahead', stamp(DAY)],
    ['91 days ago', stamp(-91 * DAY)],
    ['years ago', '2020-01-01T00:00:00Z'],
  ]) {
    const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
    const before = Date.now();
    const moved = (await s.client.patch(`/api/orders/${order.id}`, { status: 'ready', is_paid: true, at })).data;
    assertTrue(close(moved.ready_at, before) && close(moved.paid_at, before), `${what}: ready and paid now`);
    const made = (await s.client.post('/api/orders', minimalOrder(s, { is_paid: true, at }))).data;
    assertTrue(close(made.created_at, before) && close(made.paid_at, before), `${what}: made and paid now`);
  }
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const before = Date.now();
  const moved = (await s.client.patch(`/api/orders/${order.id}`, { status: 'in_progress' })).data;
  assertTrue(close(moved.started_at, before), 'no moment at all: now');
  const longAgo = stamp(-89 * DAY);
  const old = (await s.client.patch(`/api/orders/${order.id}`, { status: 'ready', at: longAgo })).data;
  assertEq(new Date(old.ready_at).getTime(), new Date(longAgo).getTime(), 'but 89 days ago is believed');
});
test('Offline time', 'a moment that is not an ISO 8601 date and time is a 400 naming the field', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  for (const at of ['yesterday', '2026-11-05', '2026-11-05T10:00:00', '2026-13-05T10:00:00Z', 12345, '']) {
    const patched = await s.client.patch(`/api/orders/${order.id}`, { status: 'ready', at });
    assertStatus(patched, 400);
    assertTrue(patched.data.fields.at, `${JSON.stringify(at)}: the field is named on a change`);
    const made = await s.client.post('/api/orders', minimalOrder(s, { at }));
    assertStatus(made, 400);
    assertTrue(made.data.fields.at, `${JSON.stringify(at)}: and on a new order`);
  }
  assertEq((await s.client.get(`/api/orders/${order.id}`)).data.status, 'received', 'a refused change changes nothing');
  assertEq((await s.client.get('/api/orders')).data.items.length, 1, 'and makes nothing');
  assertStatus(await s.client.patch(`/api/orders/${order.id}`, { status: 'ready', at: '2026-11-05T12:30:00+02:00' }), 200);
});
test('Offline time', 'an order made with a moment is made then; one that is paid when made is paid then', async (ctx) => {
  const s = await shop(ctx);
  const at = stamp(-2 * DAY);
  const made = await s.client.post('/api/orders', minimalOrder(s, { at, is_paid: true }));
  assertStatus(made, 201);
  assertEq([new Date(made.data.created_at).getTime(), new Date(made.data.paid_at).getTime()], [new Date(at).getTime(), new Date(at).getTime()], 'made and paid then');
  assertTrue(Date.now() - new Date(made.data.updated_at).getTime() < 60_000, 'though it was saved now');
  const unpaid = (await s.client.post('/api/orders', minimalOrder(s, { at }))).data;
  assertEq([new Date(unpaid.created_at).getTime(), unpaid.paid_at], [new Date(at).getTime(), null], 'an unpaid one has no payment time');
  const plain = (await s.client.post('/api/orders', minimalOrder(s))).data;
  assertTrue(Math.abs(new Date(plain.created_at).getTime() - Date.now()) < 60_000, 'without a moment: now');
  // Orders are still numbered in the order they arrive.
  assertEq([made.data.number, unpaid.number, plain.number], [1, 2, 3], 'numbers');
});

test('Offline details', 'the list of orders can carry the service lines and the photos of each, as the order itself has them', async (ctx) => {
  const s = await shop(ctx);
  const first = (await s.client.post('/api/orders', minimalOrder(s, {
    labor_price: 20, services: [{ name: 'Grip', price: 5 }, { name: 'Dampener', price: 3 }],
  }))).data;
  const second = (await s.client.post('/api/orders', minimalOrder(s, { services: [{ name: 'Overgrip', price: 2 }] }))).data;
  const bare = (await s.client.post('/api/orders', minimalOrder(s))).data;
  for (let i = 0; i < 2; i++) assertStatus(await s.client.rawRequest('POST', `/api/orders/${first.id}/photos`, JPEG, 'image/jpeg'), 201);
  assertStatus(await s.client.rawRequest('POST', `/api/orders/${second.id}/photos`, JPEG, 'image/jpeg'), 201);

  const list = await s.client.get('/api/orders?details=1');
  assertStatus(list, 200);
  assertEq(list.data.items.length, 3, 'all the orders');
  for (const item of list.data.items) {
    const own = (await s.client.get(`/api/orders/${item.id}`)).data;
    assertEq(item, own, `order ${item.number}: the same as the order itself`);
  }
  const byNumber = Object.fromEntries(list.data.items.map((item) => [item.number, item]));
  assertEq([byNumber[1].services.length, byNumber[1].photos.length], [2, 2], 'the first has two lines and two photos');
  assertEq([byNumber[2].services.map((line) => line.name), byNumber[2].photos.length], [['Overgrip'], 1], 'the second');
  assertEq([byNumber[3].services, byNumber[3].photos], [[], []], 'and one with none has empty lists');
  assertEq(Object.keys(byNumber[1].photos[0]), ['id', 'content_type', 'size', 'created_at'], 'a photo has no more than the order shows');

  assertEq((await s.client.get('/api/orders?details=true')).data.items[0].services !== undefined, true, 'true works too');
  const page = (await s.client.get('/api/orders?details=1&limit=1&offset=1')).data;
  assertEq([page.items.length, page.has_more, page.items[0].id], [1, true, second.id], 'paged');
  assertEq(page.items[0].services !== undefined && page.items[0].photos !== undefined, true, 'a page has them too');
  assertEq((await s.client.get('/api/orders?details=1&status=completed')).data, { items: [], has_more: false }, 'nothing to detail');
  assertEq((await s.client.get('/api/orders?details=1&q=nothing-here')).data.items, [], 'and a search that finds nothing');
  assertStatus(await s.client.get('/api/orders?details=yes'), 400);

  // Without the flag the list is what it was.
  const plain = (await s.client.get('/api/orders')).data.items;
  assertEq(plain.map((item) => item.id), list.data.items.map((item) => item.id), 'the same orders');
  assertTrue(plain.every((item) => !('services' in item) && !('photos' in item)), 'with no lines or photos');
  const detailed = { ...list.data.items.find((item) => item.id === bare.id) };
  delete detailed.services;
  delete detailed.photos;
  assertEq(plain.find((item) => item.id === bare.id), detailed, 'and nothing else different');
  assertEq((await s.client.get('/api/orders?details=0')).status, 400, 'only 1 and true are flags');

  // Another stringer sees none of it.
  const { client: other } = await register(ctx);
  assertEq((await other.get('/api/orders?details=1')).data, { items: [], has_more: false }, 'nothing of this stringer\'s');
});

// A change whose answer never reached the phone is sent again, and may be sent while the first copy is still being made.
test('Offline races', 'copies of one change of an order, at the same moment, move the stock once', async (ctx) => {
  const s = await stocked(ctx, { racketStock: 5, stringStock: 3 });
  const other = (await s.client.post('/api/strings', { brand: 'Babolat', model: 'RPM', track_stock: true, stock: 4 })).data;
  const order = (await s.client.post('/api/orders', catalogOrder(s, { main_string_id: s.string.id }))).data;
  const levels = async () => [await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id), await stringStock(s, other.id)];
  assertEq(await levels(), [4, 2, 4], 'taken once');

  const copies = await Promise.all([1, 2, 3, 4, 5, 6].map(() => s.client.patch(`/api/orders/${order.id}`, { main_string_id: other.id })));
  assertEq(copies.map((res) => res.status), [200, 200, 200, 200, 200, 200], 'all answered');
  assertEq(await levels(), [4, 3, 3], 'the old string is back once and the new one taken once');
  assertEq((await s.client.get(`/api/orders/${order.id}`)).data.main_string_id, other.id, 'and the order has it');

  // Moving the order on, at the same moment as a change of what it takes, loses nothing either.
  const mixed = await Promise.all([
    s.client.patch(`/api/orders/${order.id}`, { main_string_id: s.string.id }),
    s.client.patch(`/api/orders/${order.id}`, { main_string_id: s.string.id }),
    s.client.patch(`/api/orders/${order.id}`, { status: 'in_progress' }),
  ]);
  assertEq(mixed.map((res) => res.status), [200, 200, 200], 'answered');
  assertEq(await levels(), [4, 2, 4], 'one string back, the other taken, once');
  assertEq((await s.client.get(`/api/orders/${order.id}`)).data.status, 'in_progress', 'and moved on');
});
test('Offline races', 'copies of one delete of an order, at the same moment, give the stock back once', async (ctx) => {
  const s = await stocked(ctx, { racketStock: 5, stringStock: 3 });
  const order = (await s.client.post('/api/orders', catalogOrder(s, { main_string_id: s.string.id }))).data;
  assertEq([await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id)], [4, 2], 'taken once');

  const copies = await Promise.all([1, 2, 3, 4].map(() => s.client.delete(`/api/orders/${order.id}`)));
  assertEq(copies.map((res) => res.status).sort(), [200, 404, 404, 404], 'one deletes it, the others find it gone');
  assertEq([await racketStock(s, s.catalogRacket.id), await stringStock(s, s.string.id)], [5, 3], 'given back once');
});
test('Offline races', 'copies of one change that names a racket make the racket once and are all answered', async (ctx) => {
  const s = await shop(ctx);
  const order = (await s.client.post('/api/orders', minimalOrder(s))).data;
  const racketId = idOf();
  const body = { client_id: s.customer.id, new_racket: { id: racketId, brand: 'Babolat', model: 'Pure Drive' } };
  const copies = await Promise.all([1, 2, 3, 4].map(() => s.client.patch(`/api/orders/${order.id}`, body)));
  assertEq(copies.map((res) => res.status), [200, 200, 200, 200], 'none is told the id is in use');
  const detail = (await s.client.get(`/api/orders/${order.id}`)).data;
  assertEq([detail.racket.id, detail.racket.model], [racketId, 'Pure Drive'], 'the order has the racket');
  assertEq(Number(dbScalar(`SELECT count(*) FROM rackets WHERE client_id='${s.customer.id}' AND model='Pure Drive'`)), 1, 'made once');
});

// ---------------------------------------------------------------------------
// Reference catalog: the rackets and strings that exist, searched by a part of the name
// ---------------------------------------------------------------------------
const reference = (path, params = {}) => `/api/reference${path}?${new URLSearchParams(params)}`;

test('Reference', 'needs a signed-in user', async (ctx) => {
  // A client of its own: the shared anonymous one may have signed in by an earlier test.
  const stranger = new Client(ctx.server.base);
  for (const path of ['', '/rackets', '/strings']) {
    assertStatus(await stranger.get(`/api/reference${path}`), 401);
  }
});
test('Reference', 'finds a racket by a part of its name, however it is typed', async (ctx) => {
  const { client } = await register(ctx);
  const first = async (q) => {
    const res = await client.get(reference('/rackets', { q }));
    assertStatus(res, 200);
    return res.data.items[0];
  };
  assertEq(await first('pure dr'), { id: 'babolat-pure-drive', brand: 'Babolat', model: 'Pure Drive' }, 'a part of the name');
  assertEq((await first('PROSTAFF 97')).model, 'Pro Staff 97', 'case and spaces');
  assertEq((await first('v core 98')).model, 'VCORE 98', 'a space inside a word');
  assertEq((await first('бабола')).brand, 'Babolat', 'the brand in Ukrainian');
  const none = await client.get(reference('/rackets', { q: 'zzzz' }));
  assertEq(none.data, { items: [], has_more: false }, 'nothing found');
});
test('Reference', 'finds a string and tells its type and gauges', async (ctx) => {
  const { client } = await register(ctx);
  const res = await client.get(reference('/strings', { q: 'alu power 1,25' }));
  assertStatus(res, 200);
  assertEq(
    res.data.items[0],
    { id: 'luxilon-alu-power', brand: 'Luxilon', model: 'ALU Power', type: 'polyester', gauges: ['1.20', '1.25', '1.30'] },
    'the string'
  );
  const natural = await client.get(reference('/strings', { type: 'natural_gut', limit: '50' }));
  assertTrue(natural.data.items.length > 0 && natural.data.items.every((item) => item.type === 'natural_gut'), 'only natural gut');
  const bite = await client.get(reference('/strings', { brand: 'Solinco', q: 'bite' }));
  assertEq(bite.data.items.map((item) => item.model), ['Tour Bite', 'Tour Bite Soft', 'Tour Bite Diamond Rough'], 'a brand and a word, the shorter name first');
});
test('Reference', 'pages the answer and says what it cannot read', async (ctx) => {
  const { client } = await register(ctx);
  const page = await client.get(reference('/rackets', { brand: 'Wilson', limit: '2' }));
  assertEq(page.data.items.length, 2, 'two on a page');
  assertEq(page.data.has_more, true, 'and more after them');
  const next = await client.get(reference('/rackets', { brand: 'Wilson', limit: '2', offset: '2' }));
  assertTrue(
    next.data.items.length === 2 && next.data.items.every((item) => !page.data.items.some((seen) => seen.id === item.id)),
    'the next page is other rackets'
  );
  for (const bad of [{ limit: '0' }, { limit: '51' }, { limit: 'many' }, { offset: '-1' }, { q: 'x'.repeat(101) }]) {
    const res = await client.get(reference('/rackets', bad));
    assertStatus(res, 400);
    assertEq(res.data.code, 'validation_error', `code for ${JSON.stringify(bad)}`);
  }
  assertStatus(await client.get(reference('/strings', { type: 'rope' })), 400);
});
test('Reference', 'says what it holds, and may be kept for a while', async (ctx) => {
  const { client } = await register(ctx);
  const res = await client.get('/api/reference');
  assertStatus(res, 200);
  assertTrue(res.data.rackets.count > 100 && res.data.strings.count > 50, 'a list of each');
  assertTrue(res.data.rackets.brands.includes('Babolat') && res.data.strings.brands.includes('Luxilon'), 'with their brands');
  assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(res.data.updated), 'and when it was made');
  assertEq(res.headers.get('cache-control'), 'private, max-age=3600', 'cache-control');
});

// ---------------------------------------------------------------------------
// Starter catalog: a new account begins with common rackets and strings, none in stock. The rest of these tests run
// with it off, so each of the ones here starts a server of its own with it on, on the port that the rate limit test
// uses (they run one after the other). Never on 4000: that is the dev server's, and it would take their place.
// ---------------------------------------------------------------------------
async function withStarterCatalog(run) {
  const server = await startServer({ port: CONFIG.port + 1, env: { STARTER_CATALOG: 'true' } });
  try {
    const client = new Client(server.base);
    assertStatus(await client.post('/api/auth/register', { email: newEmail(), password }), 201);
    await run(client);
  } finally {
    await server.stop();
  }
}

test('Starter catalog', 'is not made when it is turned off', async (ctx) => {
  const { client } = await register(ctx);
  assertEq((await client.get('/api/rackets')).data.items, [], 'no rackets');
  assertEq((await client.get('/api/strings')).data.items, [], 'no strings');
});
test('Starter catalog', 'a new account starts with common rackets and strings, none in stock', async () => {
  await withStarterCatalog(async (client) => {
    const rackets = (await client.get('/api/rackets?kind=catalog')).data.items;
    assertTrue(rackets.length >= 50, `rackets: ${rackets.length}`);
    assertTrue(
      rackets.every((r) => r.client_id === null && r.track_stock && r.stock === 0 && !r.available),
      'counted, none in stock, none of a client'
    );
    assertTrue(rackets.some((r) => r.brand === 'Babolat' && r.model === 'Pure Drive'), 'a racket of the list');
    assertEq((await client.get('/api/rackets?kind=client')).data.items, [], 'no racket of a client');

    const strings = (await client.get('/api/strings')).data.items;
    assertTrue(strings.length >= 50, `strings: ${strings.length}`);
    assertTrue(strings.every((s) => s.track_stock && s.stock === 0 && !s.available), 'counted, none in stock');
    const alu = strings.filter((s) => s.brand === 'Luxilon' && s.model === 'ALU Power');
    assertEq(alu.map((s) => s.gauge).sort(), ['1.25 mm', '1.30 mm'], 'a string for each size');
    assertEq(alu[0].type, 'polyester', 'with its type');
    assertEq(alu[0].default_price, null, 'and no price: that is the stringer\'s');
    assertEq((await client.get('/api/rackets?in_stock=1')).data.items, [], 'so nothing is offered as in stock');
    assertEq((await client.get('/api/services')).data.items.length, 3, 'the services are made as before');
  });
});
test('Starter catalog', 'is an ordinary catalog: an order can use it once it has a count', async () => {
  await withStarterCatalog(async (client) => {
    const racket = (await client.get('/api/rackets?q=pure%20drive')).data.items.find((r) => r.model === 'Pure Drive');
    const string = (await client.get('/api/strings?q=alu%20power')).data.items.find((s) => s.gauge === '1.25 mm');
    const customer = (await client.post('/api/clients', { name: 'Iga', phone: '+380501112233' })).data;
    const order = { client_id: customer.id, racket_id: racket.id, main_string_id: string.id };

    const refused = await client.post('/api/orders', order);
    assertStatus(refused, 409);
    assertEq(refused.data.code, 'out_of_stock', 'nothing is in stock yet');

    assertStatus(await client.patch(`/api/rackets/${racket.id}`, { stock: 1 }), 200);
    assertStatus(await client.patch(`/api/strings/${string.id}`, { stock: 2 }), 200);
    assertStatus(await client.post('/api/orders', order), 201);
    assertEq((await client.get(`/api/rackets/${racket.id}`)).data.stock, 0, 'the racket went');
    assertEq((await client.get(`/api/strings/${string.id}`)).data.stock, 1, 'and a set of the string');
  });
});
test('Starter catalog', 'each account has its own', async () => {
  const server = await startServer({ port: CONFIG.port + 1, env: { STARTER_CATALOG: 'true' } });
  try {
    const first = new Client(server.base);
    const second = new Client(server.base);
    assertStatus(await first.post('/api/auth/register', { email: newEmail(), password }), 201);
    assertStatus(await second.post('/api/auth/register', { email: newEmail(), password }), 201);

    const mine = (await first.get('/api/rackets?q=pure%20drive')).data.items.find((r) => r.model === 'Pure Drive');
    assertStatus(await first.patch(`/api/rackets/${mine.id}`, { stock: 5 }), 200);
    const theirs = (await second.get('/api/rackets?q=pure%20drive')).data.items.find((r) => r.model === 'Pure Drive');
    assertTrue(theirs.id !== mine.id, 'another racket');
    assertEq(theirs.stock, 0, 'still none');
    assertStatus(await second.get(`/api/rackets/${mine.id}`), 404);
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------
test('Insights', 'need a signed-in stringer, and each has their own', async (ctx) => {
  // A client of its own: the shared anonymous one may have signed in by an earlier test.
  assertStatus(await new Client(ctx.server.base).get('/api/insights'), 401);
  const s = await shop(ctx);
  await s.client.post('/api/orders', minimalOrder(s, { labor_price: 100 }));
  assertEq((await s.client.get('/api/insights')).data.receivables.unpaid_total, 100, 'their own order');
  const other = (await register(ctx)).client;
  const { data } = await other.get('/api/insights');
  assertEq([data.receivables.unpaid_total, data.revenue.total, data.workload.overdue], [0, 0, 0], 'another stringer has none');
});
test('Insights', 'revenue is what was paid, on the day it was paid, in the stringer\'s month', async (ctx) => {
  const s = await shop(ctx);
  const make = async (extra) => (await s.client.post('/api/orders', minimalOrder(s, extra))).data;
  const now = new Date();
  const [year, month, day] = [now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()];
  const iso = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  const paidAt = (order, date) => dbExec(`UPDATE orders SET paid_at = '${date} 12:00:00+00' WHERE id='${order.id}'`);

  await make({ labor_price: 100, is_paid: true }); // paid now
  paidAt(await make({ labor_price: 200, is_paid: true }), iso(year, month, 1)); // the first of this month
  paidAt(await make({ labor_price: 400, is_paid: true }), iso(year, month - 1, 1)); // the first of last month
  paidAt(await make({ labor_price: 800, is_paid: true }), iso(year, month, 0)); // the last day of last month
  await make({ labor_price: 1600 }); // not paid: not revenue
  await make({ is_paid: true }); // paid, but with no price: nothing

  const { revenue } = (await s.client.get('/api/insights')).data;
  assertEq(revenue.days.length, new Date(Date.UTC(year, month + 1, 0)).getUTCDate(), 'a day of the month each');
  assertEq(revenue.days[0].date, iso(year, month, 1), 'from the first');
  assertEq(revenue.total, 300, 'this month: what was paid');
  assertEq(revenue.days[0].total, 200 + (day === 1 ? 100 : 0), 'the first');
  assertEq(revenue.days[day - 1].total, 100 + (day === 1 ? 200 : 0), 'today');
  // Last month is counted up to the same day of the month as today: all of it, once this day is past its last.
  const lastMonthLength = new Date(Date.UTC(year, month, 0)).getUTCDate();
  assertEq(revenue.previous_total, 400 + (day >= lastMonthLength ? 800 : 0), 'the same days of last month');
});
test('Insights', 'the week ahead counts the work still to do on each day, and what is late', async (ctx) => {
  const s = await shop(ctx);
  const make = async (extra) => (await s.client.post('/api/orders', minimalOrder(s, extra))).data;
  const today = new Date().toISOString().slice(0, 10); // the stringer's zone is UTC
  const plus = (days) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  await make({ due_date: today });
  await make({ due_date: today });
  await make({ due_date: plus(2) });
  await make({ due_date: plus(6) });
  await make({ due_date: plus(7) }); // after the week
  await make({ due_date: plus(-1) }); // late
  const ready = await make({ due_date: today });
  await s.client.patch(`/api/orders/${ready.id}`, { status: 'ready' }); // done: it waits to be picked up
  const handedOver = await make({ due_date: plus(-3) });
  await s.client.patch(`/api/orders/${handedOver.id}`, { status: 'completed' });
  await make({}); // no day promised

  const { workload } = (await s.client.get('/api/insights')).data;
  assertEq(workload.days.map((d) => d.date), [0, 1, 2, 3, 4, 5, 6].map(plus), 'seven days from today');
  assertEq(workload.days.map((d) => d.count), [2, 0, 1, 0, 0, 0, 1], 'work to do on each');
  assertEq(workload.overdue, 1, 'late');
});
test('Insights', 'what is unpaid, who owes it and who pays the most', async (ctx) => {
  const s = await shop(ctx);
  const racketOf = async (name, phone) => {
    const client = (await s.client.post('/api/clients', { name, phone })).data;
    const racket = (await s.client.post('/api/rackets', { client_id: client.id, brand: 'Babolat', model: 'Pure Drive' })).data;
    return { client, racket };
  };
  const make = (who, extra) => s.client.post('/api/orders', { client_id: who.client.id, racket_id: who.racket.id, ...extra });
  const maria = { client: s.customer, racket: s.racket };
  const serena = await racketOf('Serena Williams', '+380501112244');
  const gone = await racketOf('Gone', '+380501112255');

  await make(maria, { labor_price: 100 });
  await make(maria, { labor_price: 50 });
  await make(maria, {}); // no price: nothing owed yet
  await make(serena, { labor_price: 70 });
  await make(serena, { labor_price: 500, is_paid: true });
  await make(maria, { labor_price: 30, is_paid: true });
  await make(gone, { labor_price: 25 });
  assertStatus(await s.client.delete(`/api/clients/${gone.client.id}`), 200);

  const { receivables } = (await s.client.get('/api/insights')).data;
  assertEq([receivables.unpaid_total, receivables.unpaid_orders], [245, 4], 'all that is unpaid');
  const rows = (list) => list.map((row) => [row.client.name, row.total, row.orders]);
  assertEq(rows(receivables.debtors), [['Maria Sharapova', 150, 2], ['Serena Williams', 70, 1]], 'who owes: a removed client is left out');
  assertEq(rows(receivables.top_clients), [['Serena Williams', 500, 1], ['Maria Sharapova', 30, 1]], 'the best clients');
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
test('Bootstrap', 'the first admin from SEED_ADMIN_* can sign in', async (ctx) => {
  const res = await new Client(ctx.server.base).post('/api/auth/login', {
    email: CONFIG.seedAdmin.email,
    password: CONFIG.seedAdmin.password,
  });
  assertStatus(res, 200);
  assertEq(res.data.user.role, 'admin', 'role');
});

// ---------------------------------------------------------------------------
// Rate limit: needs a server of its own, with a low limit
// ---------------------------------------------------------------------------
test('Rate limit', 'login is answered with 429 after too many attempts', async () => {
  const server = await startServer({ port: CONFIG.port + 1, env: { AUTH_RATE_LIMIT_MAX: '3' } });
  try {
    const client = new Client(server.base);
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await client.post('/api/auth/login', { email: 'a@test.local', password: 'x' })).status);
    }
    assertEq(statuses, [401, 401, 401, 429, 429], 'statuses');
  } finally {
    await server.stop();
  }
});
test('Rate limit', 'Sign in with Apple is counted too', async (ctx) => {
  const server = await startServer({ port: CONFIG.port + 1, env: { ...ctx.apple.env, AUTH_RATE_LIMIT_MAX: '3' } });
  try {
    const client = new Client(server.base);
    const answers = [];
    for (let i = 0; i < 5; i++) answers.push(await client.post('/api/auth/apple', { identity_token: 'not.a.jwt' }));
    assertEq(answers.map((r) => r.status), [401, 401, 401, 429, 429], 'statuses');
    assertEq(answers[3].data.code, 'rate_limited', 'code');
    // A good token does not get past it either.
    const good = await client.post('/api/auth/apple', { identity_token: await ctx.apple.identityToken(appleUser()) });
    assertEq(good.status, 429, 'nor does a good token');
  } finally {
    await server.stop();
  }
});
test('Rate limit', 'the address in the configured header is what is counted, and without it no header is believed', async () => {
  const attempt = (client, address) =>
    client.post('/api/auth/login', { email: 'a@test.local', password: 'x' }, address && { 'x-real-ip': address });

  // A host's edge names the client in x-real-ip: each address has a count of its own.
  const named = await startServer({ port: CONFIG.port + 1, env: { AUTH_RATE_LIMIT_MAX: '2', CLIENT_IP_HEADER: 'X-Real-IP' } });
  try {
    const client = new Client(named.base);
    const first = [];
    for (let i = 0; i < 3; i++) first.push((await attempt(client, '198.51.100.1')).status);
    assertEq(first, [401, 401, 429], 'one address runs out');
    assertEq((await attempt(client, '198.51.100.2')).status, 401, 'another has its own count');
    assertEq((await attempt(client, 'not-an-address')).status, 401, 'a header with no address falls back to req.ip, which has not run out');
  } finally {
    await named.stop();
  }

  // Not named: the header is only a header, and cannot be used to get a count of one's own.
  const plain = await startServer({ port: CONFIG.port + 1, env: { AUTH_RATE_LIMIT_MAX: '2' } });
  try {
    const client = new Client(plain.base);
    const statuses = [];
    for (const address of ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4']) {
      statuses.push((await attempt(client, address)).status);
    }
    assertEq(statuses, [401, 401, 429, 429], 'every address counts as the same client');
  } finally {
    await plain.stop();
  }
});

// ---------------------------------------------------------------------------
// Email through Resend, and the page behind the link of a password reset
// ---------------------------------------------------------------------------
/** A server of its own with a Resend key, and a stand-in for Resend that records what it is asked to send. */
async function withResend(run) {
  const resend = await startFakeResend();
  const server = await startServer({
    port: CONFIG.port + 1,
    env: {
      RESEND_API_KEY: 're_test_key_123',
      RESEND_API_URL: resend.apiUrl,
      EMAIL_FROM_NAME: 're:string',
      EMAIL_FROM_ADDRESS: 'noreply@mail.test',
      APP_URL: 'https://api.app.test',
    },
  });
  try {
    await run({ server, resend });
  } finally {
    await server.stop();
    await resend.stop();
  }
}
/** The email goes out after the answer, so a test waits for it. */
async function until(condition, what) {
  for (let i = 0; i < 50; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

test('Email', 'a password reset is sent through Resend, and its link leads back into the app', () =>
  withResend(async ({ server, resend }) => {
    const { client, email } = await register({ server });
    assertStatus(await client.post('/api/auth/forgot-password', { email }), 200);
    await until(() => resend.sent.length === 1, 'the email');

    const [mail] = resend.sent;
    assertEq([mail.method, mail.url, mail.authorization], ['POST', '/emails', 'Bearer re_test_key_123'], 'the request');
    assertEq(mail.body.from, '"re:string" <noreply@mail.test>', 'from');
    assertEq(mail.body.to, [email], 'to');
    assertTrue(mail.body.subject.includes('Password reset'), 'subject, in English for an account that has no other language');
    const link = mail.body.text.match(/https:\/\/api\.app\.test\/reset-password\?token=([\w-]+)/);
    assertTrue(link, 'the text has a link to the page, on the address of the app');
    assertTrue(mail.body.html.includes(link[0]), 'and so has the html');

    // The page hands the token to the app, and the token still does its job.
    const token = link[1];
    const page = await new Client(server.base).get(`/reset-password?token=${token}`);
    assertStatus(page, 200);
    assertTrue(page.data.includes(`systema://reset-password?token=${token}`), 'the page opens the app with the token');
    assertStatus(await new Client(server.base).post('/api/auth/reset-password', { token, password: 'a-brand-new-pass-2' }), 200);
    assertStatus(await new Client(server.base).post('/api/auth/login', { email, password: 'a-brand-new-pass-2' }), 200);
  }));
test('Email', 'a password reset email is in the language of the account', () =>
  withResend(async ({ server, resend }) => {
    const subjects = new Set();
    const buttons = new Set();
    for (const language of LANGUAGES) {
      const { client, email } = await register({ server }, newEmail(), { language, full_name: 'Ann' });
      const sentBefore = resend.sent.length;
      assertStatus(await client.post('/api/auth/forgot-password', { email }), 200);
      await until(() => resend.sent.length === sentBefore + 1, `the email in ${language}`);

      const { subject, text, html } = resend.sent[sentBefore].body;
      assertTrue(subject.includes(RESET_SUBJECT_WORD[language]), `${language}: the subject is in the language (${subject})`);
      assertTrue(text.includes('Ann') && text.includes('/reset-password?token='), `${language}: the greeting names the person, and the link is there`);
      assertTrue(!/\{\w+\}/.test(subject + text + html), `${language}: every placeholder is filled`);
      subjects.add(subject);
      buttons.add(html.match(/<a [^>]*>([^<]*)<\/a>/)[1]);
    }
    assertEq([subjects.size, buttons.size], [LANGUAGES.length, LANGUAGES.length], 'and no two languages share their words');
  }));
test('Email', 'an address with no account gets nothing', () =>
  withResend(async ({ server, resend }) => {
    assertStatus(await new Client(server.base).post('/api/auth/forgot-password', { email: 'nobody@test.local' }), 200);
    await new Promise((resolve) => setTimeout(resolve, 600));
    assertEq(resend.sent.length, 0, 'no email was asked for');
  }));
test('Email', 'a mail service that refuses does not break the request, and its key is not logged', () =>
  withResend(async ({ server, resend }) => {
    resend.answer(403, { name: 'validation_error', message: 'The mail.test domain is not verified' });
    const { client, email } = await register({ server });
    assertStatus(await client.post('/api/auth/forgot-password', { email }), 200);
    await until(() => resend.sent.length === 1, 'the email');
    await until(() => server.logs().includes('[email] Could not send'), 'the failure in the log');
    assertTrue(!server.logs().includes('re_test_key_123'), 'the key is nowhere in the log');
  }));
test('Email', 'the page behind the reset link opens the app with the token, and nothing else', async (ctx) => {
  const token = 'Zk3_-aB9xY2mQ7pLwE5rT8uNcV1dHfGjK4sOiUyA6bX';
  const page = await new Client(ctx.server.base).get(`/reset-password?token=${token}`);
  assertStatus(page, 200);
  assertTrue((page.headers.get('content-type') || '').includes('text/html'), 'html');
  assertEq(page.headers.get('cache-control'), 'no-store', 'not kept');
  assertTrue(page.data.includes(`systema://reset-password?token=${token}`), 'the link into the app');

  for (const bad of ['', 'short', encodeURIComponent('"><script>alert(1)</script>')]) {
    const refused = await new Client(ctx.server.base).get(`/reset-password?token=${bad}`);
    assertStatus(refused, 200);
    assertTrue(!refused.data.includes('systema://') && !refused.data.includes('<script'), `nothing is opened for "${bad}"`);
  }
  assertTrue(!(await new Client(ctx.server.base).get('/reset-password')).data.includes('systema://'), 'no token');
});
test('Email', 'the reset page speaks the language of the browser, and the bare domain leads to the website', async (ctx) => {
  const token = 'Zk3_-aB9xY2mQ7pLwE5rT8uNcV1dHfGjK4sOiUyA6bX';
  const ask = (language) =>
    new Client(ctx.server.base).get(`/reset-password?token=${token}`, language ? { 'accept-language': language } : {});

  const ukrainian = await ask('uk-UA,uk;q=0.9,en;q=0.5');
  assertTrue(ukrainian.data.includes('<html lang="uk">'), 'Ukrainian for a Ukrainian browser');
  const english = await ask('en-US,en;q=0.9');
  assertTrue(english.data.includes('<html lang="en">') && english.data.includes('Opening'), 'English for an English browser');
  // Every language of the app, asked for the way a phone does it (with a region).
  const browsers = {
    en: 'en-US,en;q=0.9', de: 'de-DE,de;q=0.9,en;q=0.5', fr: 'fr-CA,fr;q=0.9', es: 'es-MX,es;q=0.9', it: 'it-IT,it;q=0.9',
    pt: 'pt-BR,pt;q=0.9', ja: 'ja-JP,ja;q=0.9,en;q=0.5', uk: 'uk-UA,uk;q=0.9', pl: 'pl-PL,pl;q=0.9',
  };
  const headings = new Set();
  for (const [language, header] of Object.entries(browsers)) {
    const page = (await ask(header)).data;
    assertTrue(page.includes(`<html lang="${language}">`), `${language} for a browser that asks for it`);
    assertTrue(!page.includes('{name}') && page.includes(`systema://reset-password?token=${token}`), `${language}: the page is whole`);
    headings.add(page.match(/<h1>(.*?)<\/h1>/)[1]);
  }
  assertEq([Object.keys(browsers), headings.size], [LANGUAGES, LANGUAGES.length], 'every language of the app, each in its own words');
  assertTrue((await ask('ko-KR,ko;q=0.9')).data.includes('<html lang="uk">'), 'Ukrainian for a language the app does not have');
  assertTrue((await ask('ko-KR,ko;q=0.9,pl;q=0.5')).data.includes('<html lang="pl">'), 'but the first it has, if the browser also asks for one');
  assertTrue((await ask(undefined)).data.includes('<html lang="uk">'), 'and when the browser says nothing');
  assertTrue((english.headers.get('vary') || '').toLowerCase().includes('accept-language'), 'a cache keeps the languages apart');
  assertTrue(english.data.includes(`systema://reset-password?token=${token}`), 'the link into the app is the same');

  // Someone who typed the domain of the server into a browser: not followed here, the test only looks where it points.
  const home = await fetch(`${ctx.server.base}/`, { redirect: 'manual' });
  assertEq(home.status, 302, 'the domain itself redirects');
  assertEq(home.headers.get('location'), 'https://tryrestring.com/', 'to the website');
});

// ---------------------------------------------------------------------------
async function main() {
  resetDatabase();
  const google = await startFakeGoogle();
  const apple = await startFakeApple();
  const server = await startServer({
    env: { GOOGLE_CLIENT_IDS: google.clientId, GOOGLE_CERTS_URL: google.certsUrl, ...apple.env },
  });
  const ctx = { server, anon: new Client(server.base), google, apple };

  let failed = 0;
  let lastGroup;
  for (const { group, name, fn } of tests) {
    if (group !== lastGroup) {
      console.log(`\n${group}`);
      lastGroup = group;
    }
    try {
      await fn(ctx);
      console.log(`  PASS  ${name}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${name}\n        ${err.message.split('\n').join('\n        ')}`);
    }
  }

  await server.stop();
  await google.stop();
  await apple.stop();
  console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
