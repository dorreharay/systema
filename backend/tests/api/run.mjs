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
  const racketOf = async (name) => {
    const client = (await s.client.post('/api/clients', { name, phone: '+380501112244' })).data;
    const racket = (await s.client.post('/api/rackets', { client_id: client.id, brand: 'Babolat', model: 'Pure Drive' })).data;
    return { client, racket };
  };
  const make = (who, extra) => s.client.post('/api/orders', { client_id: who.client.id, racket_id: who.racket.id, ...extra });
  const maria = { client: s.customer, racket: s.racket };
  const serena = await racketOf('Serena Williams');
  const gone = await racketOf('Gone');

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
