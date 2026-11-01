/**
 * API integration tests.
 *
 * Starts the real server against a dedicated test database and exercises the API end to end.
 *
 *   npm run test:api
 *
 * Exits with a non-zero code if any test fails.
 */
import {
  CONFIG, Client, assertEq, assertStatus, assertTrue,
  dbExec, dbScalar, resetDatabase, startServer,
} from './harness.mjs';

const tests = [];
const test = (group, name, fn) => tests.push({ group, name, fn });

const password = 'correct-horse-1';
let counter = 0;
const newEmail = () => `user${++counter}@test.local`;

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
// Bootstrap
// ---------------------------------------------------------------------------
test('Bootstrap', 'the first admin from SEED_ADMIN_* can sign in', async (ctx) => {
  const res = await ctx.anon.post('/api/auth/login', {
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

// ---------------------------------------------------------------------------
async function main() {
  resetDatabase();
  const server = await startServer();
  const ctx = { server, anon: new Client(server.base) };

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
  console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
