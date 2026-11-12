// Tests of the code of an invitation that waits for the person to sign in (src/lib/pending-join.ts), in plain Node:
//
//   node scripts/test-pending-join.mjs
//
// What of a link's `code` is kept, that it is given out once, that a newer one replaces an older one, that signing out drops it, that one
// older than an invitation lives is not given out, and that a slow write cannot bring back a code that was forgotten after it. Nothing
// here needs a server, a database or a device: the place the code is kept in is a stand-in that answers later, as a storage does.
import './register-ts.mjs';

import assert from 'node:assert/strict';

const { PENDING_JOIN_KEY, PENDING_JOIN_MS, createPendingJoin, joinCodeOf } = await import('../src/lib/pending-join.ts');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A storage that answers a moment later; `slowWrites` makes a write take longer than what is asked after it. */
function fakeStore() {
  const items = new Map();
  return {
    items,
    slowWrites: 0,
    async getItem(key) {
      await wait(1);
      return items.get(key) ?? null;
    },
    async setItem(key, value) {
      await wait(this.slowWrites || 1);
      items.set(key, value);
    },
    async removeItem(key) {
      await wait(1);
      items.delete(key);
    },
  };
}

test('what of a link is taken for a code', () => {
  assert.equal(joinCodeOf('ABCDE-FGHJK'), 'ABCDEFGHJK', 'the dash is not part of it');
  assert.equal(joinCodeOf('abcde-fghjk'), 'ABCDEFGHJK', 'capitals');
  assert.equal(joinCodeOf(' ab cde fghjk '), 'ABCDEFGHJK', 'anything that is not a letter or a digit is left out');
  assert.equal(joinCodeOf('ABCDEFGHJKLMNOP'), 'ABCDEFGHJK', 'ten at the most, as the page of joining has it');
  assert.equal(joinCodeOf(['ABCDE-FGHJK', 'OTHER-CODE1']), 'ABCDEFGHJK', 'a code given twice in the link: the first');
  assert.equal(joinCodeOf('ABCDE'), null, 'too short to be asked about (the server wants six)');
  assert.equal(joinCodeOf('ABCDEF'), 'ABCDEF');
  assert.equal(joinCodeOf(''), null);
  assert.equal(joinCodeOf('--- ---'), null);
  assert.equal(joinCodeOf(undefined), null);
  assert.equal(joinCodeOf(null), null);
  assert.equal(joinCodeOf(12345678), null);
  assert.equal(joinCodeOf({}), null);
  assert.equal(joinCodeOf([]), null);
});

test('a code is given out once', async () => {
  const store = fakeStore();
  const pending = createPendingJoin(store);
  await pending.remember('ABCDE-FGHJK');
  assert.ok(store.items.has(PENDING_JOIN_KEY), 'it is kept under the key of the app');
  assert.equal(await pending.take(), 'ABCDEFGHJK');
  assert.equal(await pending.take(), null, 'and forgotten by being taken');
  assert.equal(store.items.size, 0, 'nothing is left in the storage');
});

test('nothing waiting is nothing', async () => {
  const store = fakeStore();
  const pending = createPendingJoin(store);
  assert.equal(await pending.take(), null);
  await pending.forget();
  assert.equal(store.items.size, 0);
});

test('a link without a usable code leaves nothing', async () => {
  const store = fakeStore();
  const pending = createPendingJoin(store);
  await pending.remember('AB');
  await pending.remember(undefined);
  await pending.remember(['']);
  assert.equal(store.items.size, 0);
  assert.equal(await pending.take(), null);
});

test('a newer code replaces the one before it', async () => {
  const store = fakeStore();
  const pending = createPendingJoin(store);
  await pending.remember('AAAAA-BBBBB');
  await pending.remember('CCCCC-DDDDD');
  assert.equal(store.items.size, 1, 'one code at a time');
  assert.equal(await pending.take(), 'CCCCCDDDDD');
  assert.equal(await pending.take(), null);
});

test('signing out drops the code', async () => {
  const store = fakeStore();
  const pending = createPendingJoin(store);
  await pending.remember('ABCDE-FGHJK');
  await pending.forget();
  assert.equal(store.items.size, 0);
  assert.equal(await pending.take(), null);
});

test('a slow write does not bring back a code that was forgotten after it', async () => {
  const store = fakeStore();
  const pending = createPendingJoin(store);
  store.slowWrites = 40;
  const writing = pending.remember('ABCDE-FGHJK');
  const forgetting = pending.forget();
  await Promise.all([writing, forgetting]);
  assert.equal(store.items.size, 0, 'asked in that order, done in that order');
  assert.equal(await pending.take(), null);

  const first = pending.forget();
  const second = pending.remember('ABCDE-FGHJK');
  await Promise.all([first, second]);
  assert.equal(await pending.take(), 'ABCDEFGHJK', 'and the other way round: the code asked for last stays');
});

test('a code older than an invitation lives is not given out, and is gone all the same', async () => {
  const store = fakeStore();
  let now = Date.parse('2026-11-12T10:00:00.000Z');
  const pending = createPendingJoin(store, () => now);

  await pending.remember('ABCDE-FGHJK');
  now += PENDING_JOIN_MS - 1000;
  assert.equal(await pending.take(), 'ABCDEFGHJK', 'still within its days');

  await pending.remember('ABCDE-FGHJK');
  now += PENDING_JOIN_MS + 1000;
  assert.equal(await pending.take(), null, 'past them');
  assert.equal(store.items.size, 0, 'and not kept for the next time');

  // A clock that went back is not a reason to drop it
  await pending.remember('ABCDE-FGHJK');
  now -= 3 * 24 * 60 * 60 * 1000;
  assert.equal(await pending.take(), 'ABCDEFGHJK');
});

test('what was left in the storage by something else is not taken for a code', async () => {
  for (const raw of ['', 'not json', '{}', '{"code":"ABCDEFGHJK"}', '{"code":"AB","at":1}', '{"code":7,"at":1}', 'null', '[]', '"ABCDEFGHJK"']) {
    const store = fakeStore();
    store.items.set(PENDING_JOIN_KEY, raw);
    const pending = createPendingJoin(store, () => 1);
    assert.equal(await pending.take(), null, JSON.stringify(raw));
    assert.equal(store.items.size, 0, `${JSON.stringify(raw)} is cleared`);
  }
});

test('a storage that fails is nothing kept, never an error', async () => {
  const broken = {
    getItem: async () => {
      throw new Error('no keychain');
    },
    setItem: async () => {
      throw new Error('no keychain');
    },
    removeItem: async () => {
      throw new Error('no keychain');
    },
  };
  const pending = createPendingJoin(broken);
  await pending.remember('ABCDE-FGHJK');
  assert.equal(await pending.take(), null);
  await pending.forget();
  // And one failure does not stop what is asked after it
  const flaky = fakeStore();
  let failNext = true;
  const realSet = flaky.setItem.bind(flaky);
  flaky.setItem = async (key, value) => {
    if (failNext) {
      failNext = false;
      throw new Error('once');
    }
    return realSet(key, value);
  };
  const again = createPendingJoin(flaky);
  await again.remember('AAAAA-BBBBB');
  await again.remember('CCCCC-DDDDD');
  assert.equal(await again.take(), 'CCCCCDDDDD');
});

// ------------------------------------------------------------------------------------------------

let failed = 0;
// `ONLY=text node scripts/test-pending-join.mjs` runs the tests whose name has the text.
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
