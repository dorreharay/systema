// Tests of the web build's offline storage (src/lib/offline/file-storage.web.ts), of the offline store on top of it, and of the
// helper that signing out leans on (src/lib/best-effort.ts), in plain Node:
//
//   node scripts/test-web-storage.mjs
//
// Node has no IndexedDB, so the storage is given a stand-in (`FakeIdb`) that does what the storage asks of the browser's, and fails
// the way a browser does: it runs out of room, takes the connection away, will not open. Nothing here needs a server or a database,
// so this runs beside the other tests (it uses no port). What the real IndexedDB does with the same code is looked at in a browser
// (docs/offline.md, "Як перевірити").
import './register-ts.mjs';

import assert from 'node:assert/strict';

const { FileStorage } = await import('../src/lib/offline/file-storage.web.ts');
const { bestEffort } = await import('../src/lib/best-effort.ts');
const { newId } = await import('../src/lib/offline/ids.ts');
const { OfflineStore } = await import('../src/lib/offline/store.ts');
const { emptyTables } = await import('../src/lib/offline/types.ts');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- A stand-in for the browser's IndexedDB -----------------------------------------------------

/**
 * Only what the storage uses: `open` (with the upgrade that makes the store), `transaction`, and `get`, `put`, `delete` and
 * `getAllKeys` on the store, each answered later and not at once, as a browser answers. The database outlives the connections to
 * it, as the browser's does the page, so a "page that is opened again" is a new `FileStorage` on the same `FakeIdb`.
 */
class FakeIdb {
  databases = new Map();
  connections = new Set();
  opens = 0;
  // The next this many `open`s fail.
  openFailures = 0;
  // A request of this kind (`get`, `put`, `delete`, `getAllKeys`) is refused with an error of this name while one is set here.
  fail = {};
  // Every connection says it is closing, however new.
  alwaysClosing = false;

  open(name) {
    this.opens++;
    const request = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => {
      if (this.openFailures > 0) {
        this.openFailures--;
        request.error = new DOMException('The database could not be opened', 'UnknownError');
        request.onerror?.();
        return;
      }
      const existing = this.databases.get(name);
      const database = new FakeDatabase(this, existing ?? new Map());
      request.result = database;
      if (!existing) {
        this.databases.set(name, database.stores);
        request.onupgradeneeded?.();
      }
      this.connections.add(database);
      request.onsuccess?.();
    }, 0);
    return request;
  }

  /** The browser takes the connections away (the site's data was cleared, say); `tell` is whether it says so. */
  dropConnections({ tell }) {
    for (const database of [...this.connections]) {
      database.closed = true;
      this.connections.delete(database);
      if (tell) database.onclose?.();
    }
  }

  /** Another tab asks for a newer version of the database: every connection is asked to let go. */
  newerVersion() {
    for (const database of [...this.connections]) database.onversionchange?.();
  }
}

class FakeDatabase {
  closed = false;
  onclose = null;
  onversionchange = null;

  constructor(idb, stores) {
    this.idb = idb;
    this.stores = stores;
    this.objectStoreNames = { contains: (name) => stores.has(name) };
  }

  createObjectStore(name) {
    this.stores.set(name, new Map());
  }

  close() {
    this.closed = true;
    this.idb.connections.delete(this);
  }

  transaction(name) {
    if (this.closed || this.idb.alwaysClosing) throw new DOMException('The database connection is closing.', 'InvalidStateError');
    if (!this.stores.has(name)) throw new DOMException('No such object store', 'NotFoundError');
    const transaction = { error: null, oncomplete: null, onabort: null };
    transaction.objectStore = () => {
      const run = (kind, work) => {
        const request = { result: undefined, error: null, onsuccess: null, onerror: null };
        setTimeout(() => {
          const refused = this.idb.fail[kind];
          if (refused) {
            // The request is refused, and so the whole transaction: nothing of it is kept.
            transaction.error = request.error = new DOMException('Refused', refused);
            transaction.onabort?.();
            return;
          }
          request.result = work(this.stores.get(name));
          request.onsuccess?.();
          transaction.oncomplete?.();
        }, 0);
        return request;
      };
      return {
        get: (key) => run('get', (table) => table.get(key)),
        put: (value, key) => run('put', (table) => (table.set(key, value), key)),
        delete: (key) => run('delete', (table) => (table.delete(key), undefined)),
        getAllKeys: () => run('getAllKeys', (table) => [...table.keys()].sort()),
      };
    };
    return transaction;
  }
}

// --- The storage -------------------------------------------------------------------------------

test('a file is written, read, listed and removed, and one that is not there reads as nothing', async () => {
  const storage = new FileStorage(new FakeIdb());
  assert.equal(await storage.read('a.json'), null);
  assert.deepEqual(await storage.list(), []);
  await storage.write('a.json', 'one');
  await storage.write('b.json', 'two');
  assert.equal(await storage.read('a.json'), 'one');
  assert.deepEqual(await storage.list(), ['a.json', 'b.json']);
  await storage.remove('a.json');
  assert.equal(await storage.read('a.json'), null);
  assert.deepEqual(await storage.list(), ['b.json']);
  // Already gone: nothing to remove, and nothing to say about it.
  await storage.remove('a.json');
});

test('the files are still there when the page is opened again', async () => {
  const idb = new FakeIdb();
  await new FileStorage(idb).write('a.json', 'kept');
  assert.equal(await new FileStorage(idb).read('a.json'), 'kept');
});

test('a write puts the whole new text in place of the old; one that is refused says so and leaves the old', async () => {
  const idb = new FakeIdb();
  const storage = new FileStorage(idb);
  await storage.write('a.json', 'old text');
  await storage.write('a.json', 'new');
  assert.equal(await storage.read('a.json'), 'new');

  // The browser has no room: the write rejects (the store keeps what it could not write, and tries again), and the file is as it was.
  idb.fail.put = 'QuotaExceededError';
  await assert.rejects(() => storage.write('a.json', 'a text that does not fit'), { name: 'QuotaExceededError' });
  idb.fail.put = null;
  assert.equal(await storage.read('a.json'), 'new');
  await storage.write('a.json', 'a text that fits now');
  assert.equal(await storage.read('a.json'), 'a text that fits now');
});

test('where there is no IndexedDB (a build in Node, a browser that forbids it) nothing throws but a write', async () => {
  assert.equal(globalThis.indexedDB, undefined, 'this test is for a place that has none');
  // Made, as the app makes it at start, before anything has asked for the database.
  const storage = new FileStorage();
  assert.equal(await storage.read('a.json'), null);
  assert.deepEqual(await storage.list(), []);
  await storage.remove('a.json');
  await assert.rejects(() => storage.write('a.json', 'x'), /not available/);
});

test('reads, lists and removals that fail are "nothing", as on the phone; the failed removal leaves the file', async () => {
  const idb = new FakeIdb();
  const storage = new FileStorage(idb);
  await storage.write('a.json', 'one');
  idb.fail.get = idb.fail.getAllKeys = idb.fail.delete = 'UnknownError';
  assert.equal(await storage.read('a.json'), null);
  assert.deepEqual(await storage.list(), []);
  await storage.remove('a.json');
  idb.fail = {};
  assert.equal(await storage.read('a.json'), 'one');
});

test('a connection that could not be opened is tried again at the next use', async () => {
  const idb = new FakeIdb();
  idb.openFailures = 1;
  const storage = new FileStorage(idb);
  await assert.rejects(() => storage.write('a.json', 'x'), { name: 'UnknownError' });
  await storage.write('a.json', 'x');
  assert.equal(await storage.read('a.json'), 'x');
  assert.equal(idb.opens, 2);
});

test('requests made together share one connection', async () => {
  const idb = new FakeIdb();
  const storage = new FileStorage(idb);
  await Promise.all([storage.write('a.json', '1'), storage.write('b.json', '2'), storage.read('a.json'), storage.list()]);
  assert.equal(idb.opens, 1);
});

test('a connection the browser took away is opened again, whether it said so or not', async () => {
  const idb = new FakeIdb();
  const storage = new FileStorage(idb);
  await storage.write('a.json', 'one');
  idb.dropConnections({ tell: true });
  assert.equal(await storage.read('a.json'), 'one');
  assert.equal(idb.opens, 2);
  // Not told: the first use finds it out ("the connection is closing"), and is not lost for it.
  idb.dropConnections({ tell: false });
  await storage.write('a.json', 'two');
  assert.equal(await storage.read('a.json'), 'two');
  assert.equal(idb.opens, 3);
});

test('a connection that is closing every time is tried once more, not for ever', async () => {
  const idb = new FakeIdb();
  idb.alwaysClosing = true;
  const storage = new FileStorage(idb);
  await assert.rejects(() => storage.write('a.json', 'x'), { name: 'InvalidStateError' });
  assert.equal(idb.opens, 2);
  assert.equal(await storage.read('a.json'), null);
});

test('another tab asking for a newer version is let in, and the next use opens a new connection', async () => {
  const idb = new FakeIdb();
  const storage = new FileStorage(idb);
  await storage.write('a.json', 'one');
  idb.newerVersion();
  assert.equal(idb.connections.size, 0, 'it let go of the database');
  assert.equal(await storage.read('a.json'), 'one');
  assert.equal(idb.opens, 2);
});

test('a file of several megabytes is kept whole (the base of a stringer with a few thousand orders)', async () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ i, name: `Client ${i}`, filler: 'x'.repeat(1300) }));
  const text = JSON.stringify({ rows });
  assert.ok(text.length > 6_000_000);
  const storage = new FileStorage(new FakeIdb());
  await storage.write('restring-offline-base-1.json', text);
  const read = await storage.read('restring-offline-base-1.json');
  assert.equal(read, text);
  assert.equal(JSON.parse(read).rows.length, 5000);
});

// --- The offline store on it -------------------------------------------------------------------

const clientOp = (name) => ({
  id: newId(),
  at: new Date().toISOString(),
  type: 'client.create',
  subject: newId(),
  fields: { name, phone: '+380501112233', email: null, notes: null },
});

/** A stringer who opened the store, has a copy of the server's data, and has made a change that was not sent. */
async function stringerWithUnsent(storage, userId, name) {
  const store = new OfflineStore(storage);
  await store.open(userId);
  await store.replaceBase(emptyTables(), {});
  const op = clientOp(name);
  await store.enqueue(op);
  await store.flush();
  return { store, op };
}

test('what a stringer has made and not sent is there when the page is opened again', async () => {
  const idb = new FakeIdb();
  const { op } = await stringerWithUnsent(new FileStorage(idb), 'user-a', 'Ivan Petrenko');

  // The page is closed and opened again: a new store, on a new storage, over the browser's database as it was left.
  const reopened = new OfflineStore(new FileStorage(idb));
  await reopened.open('user-a');
  const snap = reopened.getSnapshot();
  assert.deepEqual(snap.outbox.map((queued) => queued.id), [op.id]);
  assert.ok(snap.hasData, 'the copy of the server is there');
  assert.equal(Object.values(snap.tables.clients).map((client) => client.name).join(), 'Ivan Petrenko', 'and the change is on the screen');
});

test('signing out removes the files of the stringer who signed out, and the next stringer finds nothing of theirs', async () => {
  const idb = new FakeIdb();
  const storage = new FileStorage(idb);
  const { store } = await stringerWithUnsent(storage, 'user-a', 'Ivan Petrenko');
  assert.equal((await storage.list()).length, 2, 'a base and a queue');

  await store.wipe();
  assert.deepEqual(await storage.list(), []);
  assert.equal(store.getSnapshot().userId, null);

  const next = new OfflineStore(new FileStorage(idb));
  await next.open('user-b');
  const snap = next.getSnapshot();
  assert.equal(snap.hasData, false);
  assert.equal(snap.outbox.length, 0);
  assert.equal(Object.keys(snap.tables.clients).length, 0);
});

test('two stringers on one browser keep to their own files: a session that was ended keeps the unsent, signing out removes', async () => {
  const idb = new FakeIdb();
  const storage = new FileStorage(idb);
  const a = await stringerWithUnsent(storage, 'user-a', 'Ivan Petrenko');
  // A's session was ended by the server (a 401): the memory is let go and the files stay.
  await a.store.close();

  const b = new OfflineStore(new FileStorage(idb));
  await b.open('user-b');
  assert.equal(b.getSnapshot().outbox.length, 0, 'B does not read what A left');
  assert.equal(Object.keys(b.getSnapshot().tables.clients).length, 0);
  await wait(50);
  assert.equal((await storage.list()).length, 2, 'what A has not sent is kept for them');
  await b.wipe();
  assert.equal((await storage.list()).length, 2, 'and B signing out removes only B');

  const again = new OfflineStore(new FileStorage(idb));
  await again.open('user-a');
  assert.deepEqual(again.getSnapshot().outbox.map((queued) => queued.id), [a.op.id], 'A signs in again and has it');
});

test('a wipe that cannot remove the files still ends: the memory is empty, and the files wait for the next start', async () => {
  const idb = new FakeIdb();
  const storage = new FileStorage(idb);
  const { store } = await stringerWithUnsent(storage, 'user-a', 'Ivan Petrenko');

  idb.fail.delete = 'UnknownError';
  await store.wipe();
  assert.equal(store.getSnapshot().userId, null);
  assert.equal(store.getSnapshot().outbox.length, 0);
  assert.equal(Object.keys(store.getSnapshot().tables.clients).length, 0);
  idb.fail = {};
  assert.equal((await storage.list()).length, 2, 'they could not be removed');

  // Whoever signs in next does not read them, and does not take them for their own: A's have a change waiting, so they stay.
  const next = new OfflineStore(new FileStorage(idb));
  await next.open('user-b');
  assert.equal(next.getSnapshot().outbox.length, 0);
});

test('a write that could not be made is tried again by the next flush, and is not lost', async () => {
  const idb = new FakeIdb();
  const storage = new FileStorage(idb);
  const store = new OfflineStore(storage);
  await store.open('user-a');
  idb.fail.put = 'QuotaExceededError';
  const op = clientOp('Ivan Petrenko');
  await store.enqueue(op); // does not reject: the change is on the screen, and waits to be written
  assert.deepEqual(store.getSnapshot().outbox.map((queued) => queued.id), [op.id]);
  assert.deepEqual(await storage.list(), []);
  idb.fail = {};
  await store.flush();
  assert.equal((await storage.list()).length, 1);
  const reopened = new OfflineStore(new FileStorage(idb));
  await reopened.open('user-a');
  assert.deepEqual(reopened.getSnapshot().outbox.map((queued) => queued.id), [op.id]);
});

// --- Signing out never ends in the app ---------------------------------------------------------

test('bestEffort lets go of a step that throws, rejects or never ends, and always answers', async () => {
  const heard = [];
  await bestEffort(() => {
    throw new Error('sync');
  }, 50, (error) => heard.push(error.message));
  await bestEffort(async () => {
    throw new Error('async');
  }, 50, (error) => heard.push(error.message));
  await bestEffort(() => Promise.reject(new Error('rejected')), 50, (error) => heard.push(error.message));
  assert.deepEqual(heard, ['sync', 'async', 'rejected']);

  // A step that does not end is waited for only so long.
  const started = Date.now();
  await bestEffort(() => new Promise(() => undefined), 40);
  const waited = Date.now() - started;
  assert.ok(waited >= 30 && waited < 1000, `waited ${waited} ms`);

  // One that ends in time is not waited for any longer than that (and leaves no timer to keep the process up).
  const quick = Date.now();
  await bestEffort(() => wait(5), 2000);
  assert.ok(Date.now() - quick < 1000);

  // One that fails after it was let go is not an unhandled rejection (that would end this process), and a listener that throws
  // does not stop it either.
  await bestEffort(() => new Promise((_, reject) => setTimeout(() => reject(new Error('late')), 60)), 10);
  await bestEffort(() => {
    throw new Error('x');
  }, 50, () => {
    throw new Error('the listener');
  });
  await wait(120);
});

// ------------------------------------------------------------------------------------------------

let failed = 0;
// `ONLY=text node scripts/test-web-storage.mjs` runs the tests whose name has the text.
const wanted = tests.filter(({ name }) => !process.env.ONLY || name.includes(process.env.ONLY));
for (const { name, fn } of wanted) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.stack ?? error).split('\n').slice(0, 8).join('\n        ')}`);
  }
}
console.log(`\n${wanted.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
