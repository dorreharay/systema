// Tests of the offline layer (src/lib/offline) against the real backend:
//
//   node scripts/test-offline.mjs
//
// The layer is plain TypeScript with no React Native in it, so it runs here as it is: a "device" is a store with its own memory
// for files, an engine and the actions the screens use, talking to the real server (started on the test database, like the API
// tests do; stop the dev server of the tests first if it is running: they share the port). The tests switch a device's
// connection off and on, lose the server's answers, and put two devices up against one server, and they check what the server
// ends up with and what the phone shows.
//
// Needs `psql` and a reachable PostgreSQL, exactly as `npm run test:api` in backend/ does.
import './register-ts.mjs';

import assert from 'node:assert/strict';

import { CONFIG, resetDatabase, startServer } from '../backend/tests/api/harness.mjs';

const { ApiError } = await import('../src/lib/api-error.ts');
const { createActions } = await import('../src/lib/offline/actions.ts');
const { blockedBy, discardSet, inOrder } = await import('../src/lib/offline/outbox.ts');
const { applyOp, replay } = await import('../src/lib/offline/reduce.ts');
const { selectClient, selectDashboard, selectOrders, selectQueue, selectRackets, selectStrings } = await import('../src/lib/offline/select.ts');
const { MemoryStorage } = await import('../src/lib/offline/storage.ts');
const { OfflineStore } = await import('../src/lib/offline/store.ts');
const { SyncEngine, requestFor } = await import('../src/lib/offline/sync.ts');
const { emptyTables } = await import('../src/lib/offline/types.ts');
const { newId } = await import('../src/lib/offline/ids.ts');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

let server;
let counter = 0;
// The phones of the test that is running: what is in their queues is printed when it fails.
let phones = [];

// --- A server and its people -------------------------------------------------------------------

async function call(token, method, path, body, base = server.base) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  return { status: response.status, data };
}

/** A stringer with an account at the server (`base`: at another server, the one of a Studio test). */
async function stringer(base = server.base) {
  const email = `offline${++counter}@test.local`;
  const { status, data } = await call(null, 'POST', '/api/auth/register', { email, password: 'correct-horse-1' }, base);
  assert.equal(status, 201);
  const api = (method, path, body) => call(data.token, method, path, body, base).then((r) => r);
  const made = async (method, path, body) => {
    const r = await api(method, path, body);
    assert.ok(r.status < 300, `${method} ${path}: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  };
  return { id: data.user.id, token: data.token, api, made };
}

/**
 * A phone: a store with files of its own, an engine and the screens' actions, with a connection that can be cut (`net.offline`),
 * and an answer that can be lost on the way back (`net.lose`: that many requests are done by the server and their answer is not
 * heard).
 */
async function phone(person, { time, timers = false, base = server.base, firstTryMs = 0 } = {}) {
  const net = { offline: false, lose: 0, unauthorized: false, sent: [] };
  const clock = { now: time ?? Date.now() };
  const storage = new MemoryStorage();
  const store = new OfflineStore(storage, () => clock.now);
  const transport = async ({ method, path, body }) => {
    if (net.offline) throw new ApiError(0, 'The server could not be reached', 'network');
    if (net.unauthorized) throw new ApiError(401, 'Unauthorized');
    net.sent.push(`${method} ${path}`);
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        authorization: `Bearer ${person.token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;
    if (net.lose > 0) {
      net.lose--;
      throw new ApiError(0, 'The server could not be reached', 'network');
    }
    if (!response.ok) throw new ApiError(response.status, data?.error ?? response.statusText, data?.code, data?.fields, data?.data);
    return data;
  };
  const phoneObject = { net, clock, storage, store, person, unauthorized: 0 };
  const engine = new SyncEngine(store, transport, {
    onUnauthorized: () => phoneObject.unauthorized++,
    timers,
  });
  const actions = createActions(store, engine, { firstTryMs });
  Object.assign(phoneObject, {
    engine,
    actions,
    tables: () => store.getSnapshot().tables,
    snap: () => store.getSnapshot(),
    sync: () => engine.syncNow({ pull: true }),
    transport,
  });
  await store.open(person.id);
  engine.start();
  await engine.syncNow();
  phones.push(phoneObject);
  return phoneObject;
}

/** The same phone after it was switched off and on: its files kept, everything in memory new. */
async function restart(old) {
  await old.store.flush();
  old.engine.stop();
  const net = old.net;
  const store = new OfflineStore(old.storage, () => old.clock.now);
  const engine = new SyncEngine(store, old.transport, { onUnauthorized: () => undefined, timers: false });
  const actions = createActions(store, engine, { firstTryMs: 0 });
  const fresh = {
    ...old,
    store,
    engine,
    actions,
    net,
    tables: () => store.getSnapshot().tables,
    snap: () => store.getSnapshot(),
    sync: () => engine.syncNow({ pull: true }),
  };
  phones.push(fresh);
  await store.open(old.person.id);
  engine.start();
  await engine.syncNow();
  return fresh;
}

/** A shop with a client, a racket of theirs, a string that is counted, and a labor service. */
async function shop(person, { stock = 5 } = {}) {
  const client = await person.made('POST', '/api/clients', { name: 'Ivan Petrenko', phone: '0501234567' });
  const racket = await person.made('POST', '/api/rackets', { client_id: client.id, brand: 'Babolat', model: 'Pure Drive' });
  const string = await person.made('POST', '/api/strings', {
    brand: 'Luxilon', model: 'ALU Power', gauge: '1.25 mm', type: 'polyester', default_price: 12, track_stock: true, stock,
  });
  const labor = await person.made('POST', '/api/services', { name: 'Stringing', price: 20, kind: 'labor' });
  const extra = await person.made('POST', '/api/services', { name: 'Grip', price: 5, kind: 'extra' });
  return { client, racket, string, labor, extra };
}

/** Lets the runs that the actions started finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits, looking every so often, until `done()` is true; false when `ms` ran out first. */
async function until(done, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (done()) return true;
    await wait(100);
  }
  return done();
}

const orderInput = (shopData, extra = {}) => ({
  client_id: shopData.client.id,
  racket_id: shopData.racket.id,
  customer_strings: false,
  hybrid: false,
  main_string_id: shopData.string.id,
  main_string_name: 'Luxilon ALU Power 1.25 mm',
  main_tension: 24,
  knots: 2,
  labor_price: 20,
  string_price: 12,
  services: [{ service_id: shopData.extra.id, name: 'Grip', price: 5 }],
  received_date: '2026-11-05',
  ...extra,
});

/** The names of the two files a stringer's data is kept in (see `filesOf` in the store). */
const filesOf = (person) => ({
  base: `restring-offline-base-${person.id}.json`,
  outbox: `restring-offline-outbox-${person.id}.json`,
});

/** The phone has found out that it has no connection (the first request that fails says so), as it has after a minute offline. */
async function goOffline(p) {
  p.net.offline = true;
  await p.sync();
  assert.equal(p.snap().net.online, false);
}

const serverOrders = (person) => person.made('GET', '/api/orders?limit=100&details=1').then((data) => data.items);
const serverString = (person, id) => person.made('GET', `/api/strings/${id}`);

// --- Pure logic --------------------------------------------------------------------------------

test('an operation that is applied twice does its work once', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);
  const op = { id: newId(), at: new Date().toISOString(), type: 'order.create', subject: newId(), input: orderInput(data), snapshot: {
    client: { id: data.client.id, name: 'Ivan Petrenko', phone: null, email: null },
    racket: { id: data.racket.id, brand: 'Babolat', model: 'Pure Drive', client_id: data.client.id },
  } };
  const once = applyOp(p.tables(), op);
  const twice = applyOp(once, op);
  assert.equal(twice, once);
  assert.equal(once.strings[data.string.id].stock, 4);
  assert.equal(once.clients[data.client.id].orders_count, 1);
  await p.store.close();
});

test('what waits for a refused operation is blocked, and the rest goes on', () => {
  const at = new Date().toISOString();
  const clientId = newId();
  const racketId = newId();
  const ops = [
    { id: 'a', at, type: 'client.create', subject: clientId, fields: { name: 'X', phone: '1', email: null, notes: null }, failure: { status: 409, at, message: 'x' } },
    { id: 'b', at, type: 'racket.create', subject: racketId, fields: { client_id: clientId, brand: 'B', model: 'M', notes: null, track_stock: false, stock: 0 } },
    { id: 'c', at, type: 'string.stock', subject: newId(), delta: 2 },
    { id: 'd', at, type: 'order.create', subject: newId(), input: { client_id: clientId, racket_id: racketId }, snapshot: {} },
    { id: 'e', at, type: 'client.update', subject: clientId, patch: { name: 'Y' } },
  ];
  const blocked = blockedBy(ops);
  assert.deepEqual([...blocked.keys()].sort(), ['b', 'd', 'e']);
  assert.equal(blocked.get('d'), 'a');
  assert.deepEqual([...discardSet(ops, 'a')].sort(), ['a', 'b', 'd', 'e']);
  // Giving up an order does not take with it the racket another order of the client uses.
  assert.deepEqual([...discardSet(ops, 'c')], ['c']);
});

test('stock never goes below nothing, and a hybrid takes half a set of each string', async () => {
  const person = await stringer();
  const data = await shop(person, { stock: 1 });
  const second = await person.made('POST', '/api/strings', { brand: 'Wilson', model: 'Natural Gut', type: 'natural_gut', track_stock: true, stock: 1 });
  const p = await phone(person);
  await p.actions.createOrder(orderInput(data, { hybrid: true, cross_string_id: second.id, cross_string_name: 'Wilson Natural Gut' }));
  assert.equal(p.tables().strings[data.string.id].stock, 0.5);
  assert.equal(p.tables().strings[second.id].stock, 0.5);
  // The first set is half-used by each string; a second hybrid order needs half of each again, and each has only half left, so it
  // goes; a third has nothing to take from.
  await p.actions.createOrder(orderInput(data, { hybrid: true, cross_string_id: second.id, cross_string_name: 'x' }));
  assert.equal(p.tables().strings[data.string.id].stock, 0);
  await assert.rejects(
    () => p.actions.createOrder(orderInput(data, { hybrid: true, cross_string_id: second.id, cross_string_name: 'x' })),
    (error) => error instanceof ApiError && error.code === 'out_of_stock'
  );
});

// --- The phone and the server -------------------------------------------------------------------

test('the first start reads everything the server has', async () => {
  const person = await stringer();
  const data = await shop(person);
  const created = await person.made('POST', '/api/orders', orderInput(data));
  const p = await phone(person);
  const t = p.tables();
  assert.ok(p.snap().hasData);
  assert.equal(Object.keys(t.clients).length, 1);
  assert.equal(Object.keys(t.services).length, 5, 'the three it starts with, and two');
  assert.equal(t.orders[created.id].number, 1);
  assert.equal(t.orders[created.id].services[0].name, 'Grip');
  assert.equal(selectOrders(t, { status: 'active', q: '#1' }).length, 1);
  assert.equal(selectOrders(t, { q: 'ivan pure' }).length, 1);
  assert.equal(selectOrders(t, { q: 'nobody' }).length, 0);
  assert.equal(selectDashboard(t, 'UTC', Date.now()).active_orders, 1);
  await p.store.close();
});

test('everything done without a connection reaches the server by itself, once, in order', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);
  p.net.offline = true;

  // A new client with a new racket, an order for them with a string and a service, moved on and paid, and stock restocked.
  const client = await p.actions.createClient({ name: 'Olena Kovalenko', phone: '+380671112233', email: 'olena@example.com' });
  const racket = await p.actions.createRacket({ client_id: client.id, brand: 'Wilson', model: 'Pro Staff 97' });
  const order = await p.actions.createOrder({
    ...orderInput(data, { client_id: client.id, racket_id: racket.id, main_tension: 25, due_date: '2026-11-08' }),
  });
  const named = await p.actions.createOrder({
    ...orderInput(data, { new_racket: { brand: 'Head', model: 'Speed MP' }, main_tension: 23 }),
    racket_id: undefined,
  });
  assert.equal(order.number, null);
  assert.equal(p.tables().strings[data.string.id].stock, 3, 'two sets are taken at once');
  assert.equal(p.tables().clients[client.id].orders_count, 1);
  assert.equal(Object.values(p.tables().rackets).filter((r) => r.brand === 'Head').length, 1);
  await p.actions.updateOrder(order.id, { status: 'in_progress' });
  await p.actions.updateOrder(order.id, { status: 'ready' });
  await p.actions.updateOrder(order.id, { is_paid: true });
  await p.actions.updateString(data.string.id, { stock: 7 });
  assert.equal(p.tables().strings[data.string.id].stock, 7);
  const waiting = p.snap().outbox.length;
  assert.equal(waiting, 8);

  await p.sync();
  assert.equal(p.snap().outbox.length, waiting, 'still all there: nothing was lost on the way');
  assert.equal(p.snap().net.online, false);
  assert.equal((await serverOrders(person)).length, 0, 'the server has heard nothing');

  p.net.offline = false;
  await p.sync();
  assert.equal(p.snap().outbox.length, 0);
  assert.equal(p.snap().net.online, true);

  const orders = await serverOrders(person);
  assert.equal(orders.length, 2);
  const first = orders.find((o) => o.id === order.id);
  assert.equal(first.status, 'ready');
  assert.equal(first.is_paid, true);
  assert.equal(first.number, 1);
  assert.equal(orders.find((o) => o.id === named.id).number, 2);
  assert.deepEqual(orders.find((o) => o.id === named.id).racket.brand, 'Head');
  // Two sets were taken by the orders and five were added: 5 - 2 + 4 = 7 on the phone, and the same on the server.
  assert.equal((await serverString(person, data.string.id)).stock, 7);
  assert.equal(p.tables().strings[data.string.id].stock, 7);
  assert.equal(p.tables().orders[order.id].number, 1, 'the number the server gave is on the phone');
  await p.store.close();
});

test('what the phone shows before it is sent is what the server has after', async () => {
  const person = await stringer();
  const data = await shop(person, { stock: 6 });
  const p = await phone(person);
  p.net.offline = true;
  const a = await p.actions.createOrder(orderInput(data, { due_date: '2026-11-09', labor_price: 25 }));
  await p.actions.updateOrder(a.id, { status: 'in_progress' });
  const b = await p.actions.createOrder(orderInput(data, { hybrid: false, main_tension: 22, services: [] }));
  await p.actions.updateOrder(b.id, { status: 'completed', is_paid: true });
  await p.actions.updateOrder(a.id, { ...orderInput(data, { due_date: '2026-11-10', labor_price: 30 }) });
  await p.actions.createRacket({ brand: 'Yonex', model: 'VCORE', track_stock: true, stock: 3 });
  await p.actions.updateClient(data.client.id, { name: 'Ivan P.' });
  const before = structuredClone(p.tables());

  p.net.offline = false;
  await p.sync();
  const after = p.tables();
  assert.equal(p.snap().outbox.length, 0);

  const pick = (item, keys) => Object.fromEntries(keys.map((k) => [k, item[k]]));
  for (const id of Object.keys(after.orders)) {
    const keys = ['status', 'is_paid', 'total', 'labor_price', 'string_price', 'due_date', 'main_tension', 'main_string_name', 'received_date'];
    assert.deepEqual(pick(before.orders[id], keys), pick(after.orders[id], keys), `order ${id}`);
    assert.deepEqual(before.orders[id].services.map((s) => [s.name, s.price]), after.orders[id].services.map((s) => [s.name, s.price]));
    assert.equal(before.orders[id].client.name, after.orders[id].client.name);
  }
  for (const id of Object.keys(after.strings)) assert.equal(before.strings[id].stock, after.strings[id].stock, 'string stock');
  for (const id of Object.keys(after.rackets)) {
    const keys = ['stock', 'available', 'orders_count', 'track_stock', 'client_name'];
    assert.deepEqual(pick(before.rackets[id], keys), pick(after.rackets[id], keys), `racket ${id}`);
    assert.equal(before.rackets[id].last_setup?.main_tension, after.rackets[id].last_setup?.main_tension, 'last setup');
  }
  for (const id of Object.keys(after.clients)) {
    const keys = ['name', 'rackets_count', 'orders_count', 'last_order_date'];
    assert.deepEqual(pick(before.clients[id], keys), pick(after.clients[id], keys), `client ${id}`);
  }
  await p.store.close();
});

test('an answer that is lost on the way back is not paid for twice: one order, the stock taken once', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);
  p.net.lose = 1;
  const order = await p.actions.createOrder(orderInput(data));
  // The run that the change started: the server does it, and the answer does not come.
  await settle();
  assert.equal(p.snap().outbox.length, 1, 'the phone does not know that the server has it');
  assert.equal((await serverOrders(person)).length, 1, 'the server has it');
  assert.equal((await serverString(person, data.string.id)).stock, 4);

  await p.sync();
  assert.equal(p.snap().outbox.length, 0);
  assert.equal((await serverOrders(person)).length, 1, 'still one order');
  assert.equal((await serverString(person, data.string.id)).stock, 4, 'the stock was taken once');
  assert.equal(p.tables().orders[order.id].number, 1);

  // And a stock change whose answer is lost is not added twice.
  p.net.lose = 1;
  await p.actions.updateString(data.string.id, { stock: 9 });
  await settle();
  assert.equal(p.snap().outbox.length, 1);
  await p.sync();
  assert.equal((await serverString(person, data.string.id)).stock, 9);
  await p.store.close();
});

test('nobody does anything, and the changes made without a connection are sent within seconds of the connection coming back', async () => {
  const person = await stringer();
  const data = await shop(person);
  // The engine as the app runs it: its own timer, no one calling it.
  const p = await phone(person, { timers: true });
  p.net.offline = true;
  const order = await p.actions.createOrder(orderInput(data));
  await p.actions.updateOrder(order.id, { status: 'in_progress' });
  await p.actions.updateString(data.string.id, { stock: 9 });
  await wait(600);
  assert.equal(p.snap().outbox.length, 3);
  assert.equal(p.snap().net.online, false);
  assert.equal((await serverOrders(person)).length, 0, 'the server has heard nothing');

  // The connection comes back. Nothing is pressed, nothing is called.
  p.net.offline = false;
  const back = Date.now();
  assert.ok(await until(() => p.snap().outbox.length === 0, 15_000), 'sent by itself');
  const seconds = (Date.now() - back) / 1000;
  assert.ok(seconds <= 11, `within ten seconds (it took ${seconds})`);
  assert.equal(p.snap().net.online, true);
  const [saved] = await serverOrders(person);
  assert.equal(saved.status, 'in_progress');
  assert.equal(saved.number, 1);
  // The stock was set to 9 after the order had taken a set: what was asked for is what is there.
  assert.equal((await serverString(person, data.string.id)).stock, 9);
  p.engine.stop();
  await p.store.close();
});

test('the app coming back to the front sends at once, and so does opening it again', async () => {
  const person = await stringer();
  const data = await shop(person);
  let p = await phone(person);
  p.net.offline = true;
  await p.actions.createOrder(orderInput(data));
  await settle();
  assert.equal(p.snap().outbox.length, 1);

  // Back in front, the connection is there: no timer is waited for.
  p.net.offline = false;
  p.engine.resume();
  assert.ok(await until(() => p.snap().outbox.length === 0, 3000), 'sent when the app came to the front');
  assert.equal((await serverOrders(person)).length, 1);

  // Made offline, the app closed, opened again with a connection.
  p.net.offline = true;
  await p.actions.createOrder(orderInput(data, { main_tension: 22 }));
  await settle();
  await p.store.flush();
  p.net.offline = false;
  p = await restart(p);
  assert.ok(await until(() => p.snap().outbox.length === 0, 3000), 'sent when the app was opened');
  assert.equal((await serverOrders(person)).length, 2);
  await p.store.close();
});

test('the phone is closed and opened again: the unsent changes are still there', async () => {
  const person = await stringer();
  const data = await shop(person);
  let p = await phone(person);
  p.net.offline = true;
  const order = await p.actions.createOrder(orderInput(data));
  await p.actions.updateOrder(order.id, { status: 'in_progress' });
  await p.store.flush();

  p = await restart(p);
  assert.equal(p.snap().outbox.length, 2);
  assert.ok(p.tables().orders[order.id], 'the order is on the screens without a connection, on a cold start');
  assert.equal(p.tables().orders[order.id].status, 'in_progress');
  assert.equal(p.tables().strings[data.string.id].stock, 4);

  p.net.offline = false;
  await p.sync();
  assert.equal(p.snap().outbox.length, 0);
  assert.equal((await serverOrders(person))[0].status, 'in_progress');
  await p.store.close();
});

test('a phone that stopped between the two files does not play a sent change again', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);
  const files = filesOf(person);
  await goOffline(p);
  await p.actions.createOrder(orderInput(data));
  await p.store.flush();
  const outboxBefore = await p.storage.read(files.outbox);
  p.net.offline = false;
  await p.sync();
  await p.store.flush();
  // The base was saved after the change was sent; the queue file is the old one that still has it.
  await p.storage.write(files.outbox, outboxBefore);
  const base = JSON.parse(await p.storage.read(files.base));
  base.meta.applied = JSON.parse(outboxBefore).ops.map((op) => op.id);
  await p.storage.write(files.base, JSON.stringify(base));

  p.net.offline = true;
  const again = await restart(p);
  assert.equal(again.snap().outbox.length, 0);
  assert.equal(again.tables().strings[data.string.id].stock, 4, 'taken once, not twice');
  // The queue in its file is rid of the change at once, so that a later write of the base (which forgets what was applied) cannot
  // leave a file that has it with nothing to say it was sent.
  await again.store.flush();
  assert.equal(JSON.parse(await again.storage.read(files.outbox)).ops.length, 0);
  await again.store.close();
});

test('not enough in stock at the server: the order is put aside, the rest goes on, and a restock lets it through', async () => {
  const person = await stringer();
  const data = await shop(person, { stock: 1 });
  const a = await phone(person);
  const b = await phone(person);
  a.net.offline = true;

  // Both think there is one set. A makes an order for it offline; B, online, gets there first.
  const mine = await a.actions.createOrder(orderInput(data, { main_tension: 21 }));
  await a.actions.updateOrder(mine.id, { status: 'in_progress' });
  const other = await person.made('GET', '/api/strings/' + data.string.id);
  assert.equal(other.stock, 1);
  await b.actions.createOrder(orderInput(data, { main_tension: 26 }));
  await b.sync();
  assert.equal((await serverString(person, data.string.id)).stock, 0);
  // Something else A did meanwhile, which has nothing to do with the order.
  const extra = await person.made('POST', '/api/strings', { brand: 'Head', model: 'Hawk', type: 'polyester', track_stock: true, stock: 0 });
  await a.sync();
  await a.actions.createClient({ name: 'Another One', phone: '0990000001' });

  a.net.offline = false;
  await a.sync();
  const failed = a.snap().outbox.filter((op) => op.failure);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].failure.code, 'out_of_stock');
  assert.equal(failed[0].type, 'order.create');
  const stuck = [...a.snap().blocked.keys()];
  assert.equal(stuck.length, 1, 'the status change of the order waits');
  assert.equal(a.snap().outbox.length, 2, 'the order and its status change: the client went through');
  assert.ok(Object.values((await person.made('GET', '/api/clients')).items).some((c) => c.name === 'Another One'));
  assert.equal(a.snap().marks.get(mine.id), 'failed');
  assert.equal(extra.stock, 0);

  // A restock (it is added to what is there), and the retry.
  await a.actions.updateString(data.string.id, { stock: 2 });
  await a.sync();
  assert.equal((await serverString(person, data.string.id)).stock, 2, 'the restock went through the refused order');
  await a.store.retry(failed[0].id);
  await a.sync();
  assert.equal(a.snap().outbox.length, 0);
  const orders = await serverOrders(person);
  assert.equal(orders.length, 2);
  assert.deepEqual(orders.map((o) => o.number).sort(), [1, 2]);
  assert.equal(orders.find((o) => o.id === mine.id).status, 'in_progress');
  assert.equal((await serverString(person, data.string.id)).stock, 1);
  await a.store.close();
  await b.store.close();
});

test('an order that cannot be had is discarded, and the screens go back to how they were', async () => {
  const person = await stringer();
  const data = await shop(person, { stock: 1 });
  const a = await phone(person);
  const b = await phone(person);
  a.net.offline = true;
  const mine = await a.actions.createOrder(orderInput(data));
  await b.actions.createOrder(orderInput(data));
  await b.sync();
  a.net.offline = false;
  await a.sync();
  const [op] = a.snap().outbox;
  assert.ok(op.failure);
  assert.equal(await a.store.discard(op.id), 1);
  assert.equal(a.snap().outbox.length, 0);
  assert.equal(a.tables().orders[mine.id], undefined);
  assert.equal(a.tables().strings[data.string.id].stock, 0, 'as the server has it');
  assert.equal((await serverOrders(person)).length, 1);
  await a.store.close();
  await b.store.close();
});

test('a phone number that another phone took first: the client waits, so do their racket and order, and fixing the number frees them', async () => {
  const person = await stringer();
  const data = await shop(person);
  const a = await phone(person);
  const b = await phone(person);
  a.net.offline = true;

  const client = await a.actions.createClient({ name: 'New Person', phone: '0931112233' });
  const racket = await a.actions.createRacket({ client_id: client.id, brand: 'Prince', model: 'Phantom' });
  const order = await a.actions.createOrder(orderInput(data, { client_id: client.id, racket_id: racket.id }));
  // B, online, makes a client with that very number.
  await b.actions.createClient({ name: 'Taken First', phone: '+38 (093) 111-22-33' });
  await b.sync();
  a.net.offline = false;
  await a.sync();

  const failed = a.snap().outbox.filter((op) => op.failure);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].failure.code, 'phone_taken');
  assert.equal(failed[0].failure.data.client.name, 'Taken First');
  assert.equal(a.snap().outbox.length, 3);
  assert.equal(a.snap().blocked.size, 2, 'the racket and the order wait');
  assert.equal((await serverOrders(person)).length, 0);

  // The number is corrected in the form of the client: it goes into the client that was refused, and everything follows.
  await a.actions.updateClient(client.id, { phone: '0931112244' });
  assert.equal(a.snap().outbox.length, 3, 'edited in place, not added');
  await a.sync();
  assert.equal(a.snap().outbox.length, 0);
  const orders = await serverOrders(person);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].client.name, 'New Person');
  assert.equal(orders[0].id, order.id);
  await a.store.close();
  await b.store.close();
});

test('a number the phone knows is taken is refused at once, as the server would', async () => {
  const person = await stringer();
  await shop(person);
  const p = await phone(person);
  p.net.offline = true;
  await assert.rejects(
    () => p.actions.createClient({ name: 'Copy', phone: '+38 050 123 45 67' }),
    (error) => error instanceof ApiError && error.code === 'phone_taken' && error.data.client.name === 'Ivan Petrenko'
  );
  assert.equal(p.snap().outbox.length, 0);
  await p.store.close();
});

test('the limit of orders in a month that a plan sets is checked on the phone as the server would, and what was made without a connection counts', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);
  const capped = createActions(p.store, p.engine, { firstTryMs: 0, orderCap: () => ({ limit: 2, timeZone: 'UTC' }) });
  const order = () => ({ client_id: data.client.id, racket_id: data.racket.id });

  p.net.offline = true;
  await capped.createOrder(order());
  const second = await capped.createOrder(order());
  assert.equal(p.snap().outbox.length, 2);
  await assert.rejects(
    () => capped.createOrder(order()),
    (error) =>
      error instanceof ApiError &&
      error.status === 402 &&
      error.code === 'order_limit_reached' &&
      error.data.limit === 2 &&
      error.data.used === 2 &&
      /^\d{4}-\d{2}-01$/.test(error.data.resets_on)
  );
  assert.equal(p.snap().outbox.length, 2, 'the refused order was not queued');

  // Deleting one that was not sent gives its place back; with no limit (the plans off, or Pro) nothing is refused.
  await capped.deleteOrder(second.id);
  await capped.createOrder(order());
  assert.equal(Object.keys(p.tables().orders).length, 2);
  await p.actions.createOrder(order());
  assert.equal(Object.keys(p.tables().orders).length, 3);
  await p.store.close();
});

test('where the plan does not count the stock, an order is not refused for what is not in it', async () => {
  const person = await stringer();
  const data = await shop(person, { stock: 0 });
  const p = await phone(person);
  p.net.offline = true;
  const order = () => ({ client_id: data.client.id, racket_id: data.racket.id, main_string_id: data.string.id });

  // Counted, and none left: refused at once, as the server would.
  await assert.rejects(
    () => p.actions.createOrder(order()),
    (error) => error instanceof ApiError && error.code === 'out_of_stock'
  );
  assert.equal(p.snap().outbox.length, 0);

  // Paused (Free): let through.
  const paused = createActions(p.store, p.engine, { firstTryMs: 0, stockOn: () => false });
  const made = await paused.createOrder(order());
  assert.ok(made, 'the order was made');
  assert.equal(p.snap().outbox.length, 1);
  await p.store.close();
});

test('two phones change one stock: neither undoes the other', async () => {
  const person = await stringer();
  const data = await shop(person, { stock: 10 });
  const a = await phone(person);
  const b = await phone(person);
  a.net.offline = true;
  await a.actions.updateString(data.string.id, { stock: 12 });
  await b.actions.updateString(data.string.id, { stock: 7 });
  await b.sync();
  a.net.offline = false;
  await a.sync();
  await b.sync();
  assert.equal((await serverString(person, data.string.id)).stock, 9);
  assert.equal(a.tables().strings[data.string.id].stock, 9);
  assert.equal(b.tables().strings[data.string.id].stock, 9);
  await a.store.close();
  await b.store.close();
});

test('the server dates a status by the phone clock, not by when it was sent', async () => {
  const person = await stringer();
  const data = await shop(person);
  const earlier = Date.now() - 3 * 3600_000;
  const p = await phone(person, { time: earlier });
  p.net.offline = true;
  const order = await p.actions.createOrder(orderInput(data));
  await p.actions.updateOrder(order.id, { status: 'in_progress' });
  p.clock.now = earlier + 3600_000;
  await p.actions.updateOrder(order.id, { status: 'ready', is_paid: true });
  p.net.offline = false;
  await p.sync();
  const [saved] = await serverOrders(person);
  assert.ok(Math.abs(Date.parse(saved.started_at) - earlier) < 5000, 'started when it was started');
  assert.ok(Math.abs(Date.parse(saved.ready_at) - (earlier + 3600_000)) < 5000, 'ready when it was made ready');
  assert.ok(Math.abs(Date.parse(saved.paid_at) - (earlier + 3600_000)) < 5000, 'paid when it was paid');
  assert.ok(Math.abs(Date.parse(saved.created_at) - earlier) < 5000, 'made when it was made');
  await p.store.close();
});

test('an order made and deleted before it was sent never reaches the server and uses no number', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);
  await goOffline(p);
  const gone = await p.actions.createOrder(orderInput(data));
  await p.actions.updateOrder(gone.id, { status: 'in_progress' });
  await p.actions.deleteOrder(gone.id);
  assert.equal(p.snap().outbox.length, 0);
  assert.equal(p.tables().strings[data.string.id].stock, 5);
  const kept = await p.actions.createOrder(orderInput(data));
  p.net.offline = false;
  await p.sync();
  const orders = await serverOrders(person);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, kept.id);
  assert.equal(orders[0].number, 1);
  await p.store.close();
});

test('editing something that has not been sent changes the change, it does not add one', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);
  await goOffline(p);
  const client = await p.actions.createClient({ name: 'First Name', phone: '0970000001' });
  await p.actions.updateClient(client.id, { name: 'Second Name' });
  await p.actions.updateClient(client.id, { notes: 'likes 24 kg' });
  const order = await p.actions.createOrder(orderInput(data, { client_id: client.id, racket_id: undefined, new_racket: { brand: 'Head', model: 'Gravity' } }));
  await p.actions.updateOrder(order.id, orderInput(data, { client_id: client.id, racket_id: undefined, new_racket: { brand: 'Head', model: 'Gravity' }, main_tension: 27, notes: 'rush' }));
  assert.equal(p.snap().outbox.length, 2);
  assert.equal(p.snap().outbox[0].fields.name, 'Second Name');
  assert.equal(p.tables().orders[order.id].main_tension, 27);

  p.net.offline = false;
  await p.sync();
  const [saved] = await serverOrders(person);
  assert.equal(saved.main_tension, 27);
  assert.equal(saved.notes, 'rush');
  assert.equal(saved.client.name, 'Second Name');
  await p.store.close();
});

test('an answer that is lost, and then an edit of the same new thing: the edit is kept, and a delete reaches the server too', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);

  // A client: the server makes it, the answer is lost, and the stringer corrects the name before the request is sent again.
  p.net.lose = 1;
  const client = await p.actions.createClient({ name: 'First Name', phone: '0970000002' });
  await settle();
  assert.equal((await person.made('GET', '/api/clients')).items.some((c) => c.id === client.id), true, 'the server has it');
  assert.equal(p.snap().outbox[0].sent, true, 'and the phone knows that it may');
  await p.actions.updateClient(client.id, { name: 'Second Name' });
  assert.deepEqual(p.snap().outbox.map((op) => op.type), ['client.create', 'client.update'], 'the edit is a change of its own');
  await p.sync();
  assert.equal(p.snap().outbox.length, 0);
  assert.equal((await person.made('GET', `/api/clients/${client.id}`)).name, 'Second Name', 'the server has the edit');
  assert.equal(p.tables().clients[client.id].name, 'Second Name', 'and so does the phone');

  // An order, edited after its answer was lost.
  p.net.lose = 1;
  const order = await p.actions.createOrder(orderInput(data));
  await settle();
  await p.actions.updateOrder(order.id, orderInput(data, { main_tension: 27, notes: 'rush' }));
  await p.sync();
  const [saved] = await serverOrders(person);
  assert.equal(saved.main_tension, 27);
  assert.equal(saved.notes, 'rush');
  assert.equal(p.tables().orders[order.id].notes, 'rush');

  // And an order deleted after its answer was lost: the server has it, so it is deleted there, and the stock is back.
  p.net.lose = 1;
  const doomed = await p.actions.createOrder(orderInput(data));
  await settle();
  assert.equal((await serverOrders(person)).length, 2, 'the server has both');
  await p.actions.deleteOrder(doomed.id);
  assert.equal(p.snap().outbox.some((op) => op.type === 'order.delete'), true, 'a delete, not a forgetting');
  await p.sync();
  assert.deepEqual((await serverOrders(person)).map((o) => o.id), [order.id]);
  assert.equal((await serverString(person, data.string.id)).stock, 4, 'the one order has its string, the other gave it back');
  assert.equal(p.tables().orders[doomed.id], undefined);
  await p.store.close();
});

test('an order changed to point at something made after it is sent after it, and nothing is refused', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);
  await goOffline(p);

  // A client made after the order, and the order then given to them.
  const order = await p.actions.createOrder(orderInput(data));
  const other = await p.actions.createClient({ name: 'Second Client', phone: '0970000003' });
  await p.actions.updateOrder(
    order.id,
    orderInput(data, { client_id: other.id, racket_id: undefined, new_racket: { brand: 'Head', model: 'Gravity' } })
  );
  assert.deepEqual(p.snap().outbox.map((op) => op.type), ['client.create', 'order.create'], 'the order moved after its client');

  // A string made after an order, chosen for it, and a change of the order that comes after that.
  const plain = await p.actions.createOrder(orderInput(data, { main_string_id: undefined, main_string_name: undefined }));
  const gut = await p.actions.createString({ brand: 'Wilson', model: 'Natural Gut', type: 'natural_gut' });
  await p.actions.updateOrder(plain.id, orderInput(data, { main_string_id: gut.id, main_string_name: 'Wilson Natural Gut' }));
  await p.actions.updateOrder(plain.id, { status: 'in_progress' });
  const types = p.snap().outbox.map((op) => op.type);
  assert.ok(types.indexOf('string.create') < types.indexOf('order.create', types.indexOf('string.create')), 'the string comes first');
  assert.equal(types.at(-1), 'order.update', 'and what was done to the order after it stays after it');

  p.net.offline = false;
  await p.sync();
  assert.equal(p.snap().outbox.length, 0, 'everything went through');
  assert.equal(p.snap().outbox.filter((op) => op.failure).length, 0);
  const orders = await serverOrders(person);
  assert.equal(orders.length, 2);
  assert.equal(orders.find((o) => o.id === order.id).client.id, other.id);
  const second = orders.find((o) => o.id === plain.id);
  assert.equal(second.main_string_id, gut.id);
  assert.equal(second.status, 'in_progress');
  await p.store.close();
});

test('the queue is put in order only when it has to be', () => {
  const at = new Date().toISOString();
  const order = { id: 'a', at, type: 'order.create', subject: 'o', input: { client_id: 'c' }, snapshot: {} };
  const client = { id: 'b', at, type: 'client.create', subject: 'c', fields: {} };
  const later = { id: 'd', at, type: 'order.update', subject: 'o', patch: { status: 'ready' } };

  // The order points at a client that comes after it, and its later change follows the order.
  assert.deepEqual(inOrder([order, later, client]).map((op) => op.id), ['b', 'a', 'd']);
  // Nothing to put right: the very same queue comes back.
  const fine = [client, order, later];
  assert.equal(inOrder(fine), fine);
  // Two that each wait for the other cannot be put in order: they are left as they are, and it does not loop.
  const one = { id: 'x', at, type: 'order.create', subject: 'o1', input: { client_id: 'c', racket_id: 'r2' }, snapshot: {} };
  const two = { id: 'y', at, type: 'order.create', subject: 'o2', input: { client_id: 'c', new_racket: { id: 'r2', brand: 'A', model: 'B' }, services: [{ service_id: 'o1', name: 'x' }] }, snapshot: {} };
  assert.deepEqual(inOrder([one, two]).map((op) => op.id), ['x', 'y']);
  // Changes of the stock go where they are.
  const stock = { id: 's', at, type: 'string.stock', subject: 'str', delta: 1 };
  const stockAgain = { id: 't', at, type: 'string.stock', subject: 'str', delta: 2 };
  assert.deepEqual(inOrder([stockAgain, stock]).map((op) => op.id), ['t', 's']);
});

test('a change made as the store closes is saved, and a write that failed is tried again by the next flush', async () => {
  const person = await stringer();
  const p = await phone(person);
  await goOffline(p);
  const files = filesOf(person);
  const saved = async () => JSON.parse((await p.storage.read(files.outbox)) ?? '{"ops":[]}').ops.length;

  // The storage fails once: the change is on the screen but not in the file, and the next flush writes it.
  const write = p.storage.write.bind(p.storage);
  let failures = 1;
  p.storage.write = async (name, text) => {
    if (failures-- > 0) throw new Error('The storage is full');
    return write(name, text);
  };
  await p.actions.createClient({ name: 'First', phone: '0970000010' });
  assert.equal(await saved(), 0, 'not written yet');
  await p.store.flush();
  assert.equal(await saved(), 1, 'written by the flush');

  // A change that comes in while the store waits to close is written too.
  const closing = p.store.close();
  await p.actions.createClient({ name: 'Second', phone: '0970000011' });
  await closing;
  assert.equal(await saved(), 2);
});

test('a racket the client already has, named in an order, is used and not made again', async () => {
  const person = await stringer();
  const data = await shop(person);
  const a = await phone(person);
  const b = await phone(person);
  a.net.offline = true;
  // A does not know yet that B gave this client a second racket of that name.
  await b.actions.createRacket({ client_id: data.client.id, brand: 'Wilson', model: 'Blade 98' });
  await b.sync();
  await a.actions.createOrder(orderInput(data, { racket_id: undefined, new_racket: { brand: 'WILSON', model: 'blade 98' } }));
  a.net.offline = false;
  await a.sync();
  const rackets = (await person.made('GET', '/api/rackets?client_id=' + data.client.id)).items;
  assert.equal(rackets.filter((r) => r.model.toLowerCase() === 'blade 98').length, 1);
  const [saved] = await serverOrders(person);
  assert.equal(saved.racket.model, 'Blade 98');
  assert.equal(Object.values(a.tables().rackets).filter((r) => r.model.toLowerCase() === 'blade 98').length, 1);
  assert.equal(a.snap().outbox.length, 0);
  await a.store.close();
  await b.store.close();
});

test('when the session is over the engine stops, and what was not sent stays', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);
  p.net.unauthorized = true;
  await p.actions.createOrder(orderInput(data));
  await p.sync();
  assert.ok(p.unauthorized >= 1);
  assert.equal(p.snap().outbox.length, 1);
  assert.equal(p.snap().outbox[0].failure, undefined);
  await p.store.close();
});

test('the data of one stringer is not given to the next on the same phone, and what they had not sent is not lost', async () => {
  const first = await stringer();
  await shop(first);
  const p = await phone(first);
  await goOffline(p);
  const kept = await p.actions.createClient({ name: 'Made Offline', phone: '0970000009' });
  await p.store.close();

  // The next stringer finds nothing of the first's, and does not send it either.
  const second = await stringer();
  const store = new OfflineStore(p.storage, () => Date.now());
  await store.open(second.id);
  assert.equal(store.getSnapshot().hasData, false);
  assert.equal(Object.keys(store.getSnapshot().tables.clients).length, 0);
  assert.equal(store.getSnapshot().outbox.length, 0);
  await settle();
  const theirs = filesOf(first);
  assert.notEqual(await p.storage.read(theirs.outbox), null, 'the first one\'s unsent change is still on the phone');
  assert.notEqual(await p.storage.read(theirs.base), null, 'with the copy it is played on');
  await store.close();

  // When the first signs in again it is there, and goes to the server (theirs).
  const again = await restart(p);
  assert.equal(again.snap().outbox.length, 1);
  assert.equal(again.tables().clients[kept.id].name, 'Made Offline');
  again.net.offline = false;
  await again.sync();
  assert.equal(again.snap().outbox.length, 0);
  assert.equal((await first.made('GET', '/api/clients')).items.some((client) => client.id === kept.id), true);
  assert.equal((await second.made('GET', '/api/clients')).items.some((client) => client.id === kept.id), false);

  // A stringer who has nothing waiting leaves nothing behind when somebody else signs in.
  await again.store.close();
  const third = await stringer();
  const next = new OfflineStore(p.storage, () => Date.now());
  await next.open(third.id);
  await settle();
  assert.equal(await p.storage.read(theirs.outbox), null, 'nothing was waiting: the files are gone');
  assert.equal(await p.storage.read(theirs.base), null);
  await next.close();
});

test('the lists are in the order the server puts them in', async () => {
  const person = await stringer();
  const data = await shop(person);
  const soon = await person.made('POST', '/api/orders', orderInput(data, { due_date: '2026-11-06' }));
  const later = await person.made('POST', '/api/orders', orderInput(data, { due_date: '2026-11-20' }));
  const none = await person.made('POST', '/api/orders', orderInput(data, { due_date: null }));
  const done = await person.made('POST', '/api/orders', orderInput(data));
  await person.made('PATCH', `/api/orders/${done.id}`, { status: 'completed' });
  const p = await phone(person);
  const ids = (list) => list.map((o) => o.id);
  const fromServer = (await person.made('GET', '/api/orders?limit=100')).items;
  assert.deepEqual(ids(selectOrders(p.tables())), ids(fromServer));
  assert.deepEqual(ids(selectOrders(p.tables(), { status: 'completed' })), [done.id]);
  assert.deepEqual(ids(selectOrders(p.tables(), { status: 'active' })).slice(0, 3), [soon.id, later.id, none.id]);
  const strings = selectStrings(p.tables());
  assert.equal(strings.length, 1);
  assert.equal(selectRackets(p.tables(), { kind: 'client' }).length, 1);
  assert.equal(selectClient(p.tables(), data.client.id).orders.length, 4);
  await p.store.close();
});

// --- Studio: several people in one workshop -----------------------------------------------------

test('giving an order, and returning it to the queue, change the order on the phone and go to the server as one request', async () => {
  const person = await stringer();
  const data = await shop(person);
  const p = await phone(person);
  const order = await p.actions.createOrder(orderInput(data));
  const olena = { id: newId(), name: 'Olena' };
  const at = new Date().toISOString();
  const op = { id: newId(), at, type: 'order.assign', subject: order.id, assignee: olena };

  const given = applyOp(p.tables(), op);
  assert.deepEqual(given.orders[order.id].assignee, olena);
  assert.equal(given.orders[order.id].assigned_at, at, 'since the moment it was given');
  const back = applyOp(given, { ...op, id: newId(), assignee: null });
  assert.equal(back.orders[order.id].assignee, null);
  assert.equal(back.orders[order.id].assigned_at, null, 'back in the queue: nobody, since never');
  assert.deepEqual(applyOp(given, op).orders[order.id], given.orders[order.id], 'the same change twice is one change');
  assert.equal(applyOp(p.tables(), { ...op, subject: newId() }), p.tables(), 'an order that is not there is left alone');

  assert.deepEqual(requestFor(op), { method: 'POST', path: `/api/orders/${order.id}/assign`, body: { assignee_id: olena.id, at } });
  assert.deepEqual(requestFor({ ...op, assignee: null }).body, { assignee_id: null, at });

  // Giving an order to who has it already does nothing: no change is queued.
  const before = p.snap().outbox.length;
  assert.equal((await p.actions.assignOrder(order.id, null)).id, order.id);
  assert.equal(p.snap().outbox.length, before);
  await p.store.close();
});

test('a new order carries who took it in and who strings it, by the role of the person', async () => {
  const person = await stringer();
  const data = await shop(person, { stock: 9 });
  const p = await phone(person);
  const me = { id: person.id, name: 'Ivan' };
  const as = (role) => createActions(p.store, p.engine, { firstTryMs: 0, self: () => ({ person: me, role }) });

  const alone = await p.actions.createOrder(orderInput(data));
  assert.equal(p.tables().orders[alone.id].accepted_by, null, 'a workshop of one names nobody');
  assert.equal(p.tables().orders[alone.id].assignee, null);

  const master = await as('master').createOrder(orderInput(data));
  assert.deepEqual(p.tables().orders[master.id].accepted_by, me);
  assert.deepEqual(p.tables().orders[master.id].assignee, me, 'a master\'s own order is theirs');
  assert.ok(p.tables().orders[master.id].assigned_at);

  const reception = await as('receptionist').createOrder(orderInput(data));
  assert.deepEqual(p.tables().orders[reception.id].accepted_by, me);
  assert.equal(p.tables().orders[reception.id].assignee, null, 'a receptionist\'s goes to the queue');

  const owner = await as('owner').createOrder(orderInput(data));
  assert.equal(p.tables().orders[owner.id].assignee, null, 'the owner leaves it for the queue unless they choose');
  const chosen = await as('owner').createOrder({ ...orderInput(data), assignee: me });
  assert.deepEqual(p.tables().orders[chosen.id].assignee, me);

  // The queue, as the lists filter it.
  const t = p.tables();
  assert.deepEqual(selectOrders(t, { queue: 'none' }).map((o) => o.id).sort(), [alone.id, owner.id, reception.id].sort());
  assert.deepEqual(selectOrders(t, { queue: 'mine', me: me.id }).map((o) => o.id).sort(), [chosen.id, master.id].sort());
  assert.equal(selectOrders(t, { queue: 'mine' }).length, 0, 'whose "mine" is not known: none');
  assert.equal(selectOrders(t, {}).length, 5, 'no filter: all of them');
  const done = await p.actions.updateOrder(owner.id, { status: 'completed' });
  assert.equal(done.status, 'completed');
  assert.equal(selectOrders(p.tables(), { queue: 'none' }).some((o) => o.id === owner.id), false, 'a finished order is not in the queue');
  assert.deepEqual(
    [selectQueue(p.tables(), me.id).queue, selectQueue(p.tables(), me.id).mine, selectQueue(p.tables(), me.id).people.map((x) => x.count)],
    [2, 2, [2]]
  );

  // What the server has after: the same people.
  await p.sync();
  assert.equal(p.snap().outbox.length, 0);
  const saved = await serverOrders(person);
  const find = (id) => saved.find((o) => o.id === id);
  assert.equal(find(master.id).assignee.id, person.id);
  assert.equal(find(master.id).accepted_by.id, person.id);
  assert.equal(find(reception.id).assignee, null);
  assert.equal(find(reception.id).accepted_by.id, person.id);
  assert.equal(find(chosen.id).assignee.id, person.id);
  await p.store.close();
});

test('two masters reach for one order: the first has it, the second is told it is taken and the refused change leaves the queue', async () => {
  const team = await startServer({
    port: CONFIG.port + 1,
    env: { BILLING_ENABLED: 'true', BILLING_DEV_GRANTS: 'true', FREE_ORDERS_PER_MONTH: '50', STUDIO_ENABLED: 'true' },
  });
  try {
    const owner = await stringer(team.base);
    assert.equal((await owner.api('POST', '/api/billing/dev-grant', { plan: 'studio' })).status, 200);
    const data = await shop(owner);
    const join = async (role) => {
      const { invite } = await owner.made('POST', '/api/team/invites', { role });
      const member = await stringer(team.base);
      await member.made('POST', '/api/team/join', { code: invite.code });
      return member;
    };
    const first = await join('master');
    const second = await join('master');
    const queued = await owner.made('POST', '/api/orders', orderInput(data));
    const other = await owner.made('POST', '/api/orders', orderInput(data, { main_tension: 22 }));
    const person = (member, name) => ({ id: member.id, name });

    // Each phone has read the queue: the order is nobody's on both.
    const a = await phone(first, { base: team.base, firstTryMs: 3000 });
    const b = await phone(second, { base: team.base, firstTryMs: 3000 });
    assert.equal(a.tables().orders[queued.id].assignee, null);
    assert.equal(b.tables().orders[queued.id].assignee, null);

    // The first takes it: at once on the phone, and the server has it.
    await a.actions.assignOrder(queued.id, person(first, 'First'));
    assert.equal(a.tables().orders[queued.id].assignee.id, first.id);
    assert.equal(a.snap().outbox.length, 0);
    assert.equal((await owner.made('GET', `/api/orders/${queued.id}`)).assignee.id, first.id);

    // The second still sees it in the queue, and takes it: the server says it is taken. The refusal reaches the screen as an error, and
    // the change is taken out of the queue of the phone, so that it is not played again and again.
    await assert.rejects(
      () => b.actions.assignOrder(queued.id, person(second, 'Second')),
      (error) => error instanceof ApiError && error.status === 409 && error.code === 'order_taken'
    );
    assert.equal(b.snap().outbox.length, 0, 'nothing refused is left to be played again');
    await b.sync();
    assert.equal(b.tables().orders[queued.id], undefined, 'the order is the first one\'s now: the second does not see it');

    // The first lets go of it: it is in the queue again, and the second can have it.
    await a.actions.assignOrder(queued.id, null);
    assert.equal((await owner.made('GET', `/api/orders/${queued.id}`)).assignee, null);
    await b.sync();
    await b.actions.assignOrder(queued.id, person(second, 'Second'));
    assert.equal((await owner.made('GET', `/api/orders/${queued.id}`)).assignee.id, second.id);

    // A master cannot give an order to someone else, but the owner can.
    await assert.rejects(
      () => b.actions.assignOrder(other.id, person(first, 'First')),
      (error) => error instanceof ApiError && error.status === 403 && error.code === 'forbidden_role'
    );
    const o = await phone(owner, { base: team.base, firstTryMs: 3000 });
    await o.actions.assignOrder(other.id, person(first, 'First'));
    assert.equal((await owner.made('GET', `/api/orders/${other.id}`)).assignee.id, first.id);
    assert.equal(o.snap().outbox.length, 0);
    for (const phoneOf of [a, b, o]) await phoneOf.store.close();
  } finally {
    await team.stop();
  }
});

test('the requests are the ones the server takes', () => {
  const at = new Date().toISOString();
  const op = { id: newId(), at, type: 'string.stock', subject: newId(), delta: -1.5 };
  assert.deepEqual(requestFor(op), { method: 'POST', path: `/api/strings/${op.subject}/stock`, body: { delta: -1.5, op_id: op.id } });
  assert.equal(replay(emptyTables(), []).clients && true, true);
});

// ------------------------------------------------------------------------------------------------

async function main() {
  resetDatabase();
  server = await startServer({ port: CONFIG.port });
  let failed = 0;
  // `ONLY=text node scripts/test-offline.mjs` runs the tests whose name has the text.
  const wanted = tests.filter(({ name }) => !process.env.ONLY || name.includes(process.env.ONLY));
  for (const { name, fn } of wanted) {
    phones = [];
    try {
      await fn();
      console.log(`  PASS  ${name}`);
    } catch (error) {
      failed++;
      console.log(`  FAIL  ${name}\n        ${String(error.stack ?? error).split('\n').slice(0, 8).join('\n        ')}`);
      for (const phone of phones) {
        const queue = phone.store.getSnapshot().outbox.map((op) => `${op.type}${op.failure ? ` FAILED ${op.failure.status} ${op.failure.code ?? ''} ${op.failure.message}` : ''}${op.tries ? ` tries=${op.tries}` : ''}`);
        if (queue.length) console.log(`        queue: ${JSON.stringify(queue)}`);
      }
    }
  }
  await server.stop();
  console.log(`\n${wanted.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
