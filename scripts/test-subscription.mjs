// Tests of the plan logic of the app (src/lib/subscription.ts), in plain Node:
//
//   node scripts/test-subscription.mjs
//
// What a phone makes of the server's word about the plan, how it counts the orders of the stringer's month, and how long it counts on a
// paid plan that it cannot confirm.
import './register-ts.mjs';

import assert from 'node:assert/strict';

const { ApiError } = await import('../src/lib/api-error.ts');
const { assertOrderAllowed, nextMonthStart, orderCapOf, planStateOf, stockOnOf, usageOf, TRUST_DAYS } = await import('../src/lib/subscription.ts');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-10T12:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

const FREE = { orders_per_month: 15, stock: false, month_overview: false };
const EVERYTHING = { orders_per_month: null, stock: true, month_overview: true };

/** What the server sends, with whatever is different about the account. */
const sub = (extra = {}) => ({
  enabled: true,
  plan: 'free',
  trial: false,
  renews: false,
  period: null,
  expires_at: null,
  holds_until: null,
  expired: false,
  checked_at: iso(NOW),
  entitlements: FREE,
  free: FREE,
  ...extra,
});
const pro = (extra = {}) =>
  sub({
    plan: 'pro',
    period: 'year',
    renews: true,
    expires_at: iso(NOW + 200 * DAY),
    holds_until: iso(NOW + 203 * DAY),
    entitlements: EVERYTHING,
    ...extra,
  });

const madeOn = (day, hour = 10) => ({ created_at: `2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z` });

// A profile with no word about plans, and a server with the plans off, are the same: nothing is limited and nothing is said.
for (const missing of [undefined, sub({ enabled: false, entitlements: EVERYTHING, free: EVERYTHING })]) {
  const state = planStateOf(missing, [madeOn(1), madeOn(2)], 'UTC', NOW);
  assert.equal(state.enabled, false);
  assert.equal(state.usage, null);
  assert.equal(state.entitlements.orders_per_month, null);
  assert.equal(orderCapOf(missing, 'UTC', NOW), null);
}

// Free: the orders of the month are counted, and only those
{
  const orders = [madeOn(1, 0), madeOn(9), madeOn(10, 11), { created_at: '2026-10-31T23:59:59.000Z' }, { created_at: '2026-09-15T10:00:00.000Z' }];
  const state = planStateOf(sub(), orders, 'UTC', NOW);
  assert.deepEqual([state.enabled, state.plan, state.expired, state.trial, state.endsAt, state.daysLeft], [true, 'free', false, false, null, null]);
  assert.deepEqual(
    [state.usage.used, state.usage.limit, state.usage.left, state.usage.reached],
    [3, 15, 12, false],
    'three orders of November'
  );
  assert.equal(iso(state.usage.resetsAt), '2026-12-01T00:00:00.000Z', 'the count begins again on the first of the next month');
}

// The month is the stringer's own: the same moment is in different months in different zones
{
  // 22:30 on the 31st of October in UTC is half past midnight on the 1st of November in Kyiv (two hours ahead).
  const edge = [{ created_at: '2026-10-31T22:30:00.000Z' }];
  assert.equal(usageOf(edge, 15, 'UTC', NOW).used, 0, 'October in UTC');
  assert.equal(usageOf(edge, 15, 'Europe/Kyiv', NOW).used, 1, 'but November in Kyiv');
  assert.equal(iso(nextMonthStart('Europe/Kyiv', NOW)), '2026-11-30T22:00:00.000Z', 'Kyiv begins December two hours before UTC does');
  assert.equal(usageOf(edge, 15, undefined, NOW).used, 0, 'no zone is UTC');
}

// The limit is reached at the number, not after it
{
  const full = Array.from({ length: 15 }, (_, i) => madeOn(1 + (i % 9)));
  const state = planStateOf(sub(), full, 'UTC', NOW);
  assert.deepEqual([state.usage.used, state.usage.left, state.usage.reached], [15, 0, true]);
  assert.throws(
    () => assertOrderAllowed(full, orderCapOf(sub(), 'UTC', NOW), NOW),
    (error) =>
      error instanceof ApiError &&
      error.status === 402 &&
      error.code === 'order_limit_reached' &&
      error.data.limit === 15 &&
      error.data.used === 15 &&
      error.data.resets_on === '2026-12-01'
  );
  assert.doesNotThrow(() => assertOrderAllowed(full.slice(1), orderCapOf(sub(), 'UTC', NOW), NOW), 'fourteen: one more is allowed');
}

// Pro: no limit, a trial, a plan that is turned off, a plan that has run out
{
  const state = planStateOf(pro(), [madeOn(1)], 'UTC', NOW);
  assert.deepEqual([state.plan, state.usage, state.period, state.renews, state.expired], ['pro', null, 'year', true, false]);
  assert.equal(state.daysLeft, 200);
  assert.equal(orderCapOf(pro(), 'UTC', NOW), null, 'nothing limits an order');

  const trial = planStateOf(pro({ trial: true, expires_at: iso(NOW + 9 * DAY - 60 * 1000) }), [], 'UTC', NOW);
  assert.deepEqual([trial.trial, trial.daysLeft], [true, 9], 'a started day counts as a day');

  const off = planStateOf(pro({ renews: false }), [], 'UTC', NOW);
  assert.deepEqual([off.plan, off.renews], ['pro', false]);

  const ran = planStateOf(sub({ expired: true }), [], 'UTC', NOW);
  assert.deepEqual([ran.plan, ran.expired, ran.usage.limit], ['free', true, 15], 'the server said it ran out');
}

// A phone that cannot reach the server counts on a paid plan for a while, and no longer than its end and the days of grace
{
  const heardAt = (days) => iso(NOW - days * DAY);
  assert.equal(planStateOf(pro({ checked_at: heardAt(TRUST_DAYS - 1) }), [], 'UTC', NOW).plan, 'pro', 'heard from a day ago short of the limit');
  const stale = planStateOf(pro({ checked_at: heardAt(TRUST_DAYS + 1) }), [madeOn(1)], 'UTC', NOW);
  assert.deepEqual([stale.plan, stale.expired, stale.usage.limit], ['free', true, 15], 'not heard from for too long: Free here');
  assert.equal(orderCapOf(pro({ checked_at: heardAt(TRUST_DAYS + 1) }), 'UTC', NOW).limit, 15, 'and the limit holds for a new order');

  const lapsed = pro({ expires_at: iso(NOW - 5 * DAY), holds_until: iso(NOW - 2 * DAY) });
  assert.equal(planStateOf(lapsed, [], 'UTC', NOW).plan, 'free', 'past its end and the days of grace');
  const grace = pro({ expires_at: iso(NOW - 1 * DAY), holds_until: iso(NOW + 2 * DAY) });
  assert.equal(planStateOf(grace, [], 'UTC', NOW).plan, 'pro', 'within the days of grace');
  assert.equal(planStateOf(pro({ holds_until: null, expires_at: null }), [], 'UTC', NOW).plan, 'pro', 'a plan with no end');
  // The clock of the phone is behind the server's: not a reason to doubt
  assert.equal(planStateOf(pro({ checked_at: iso(NOW + 3 * DAY) }), [], 'UTC', NOW).plan, 'pro');
}

// Whether the stock of the catalog is counted: Pro counts it, Free pauses it, and a Pro that a phone cannot confirm is Free there
{
  assert.equal(stockOnOf(undefined, NOW), true, 'a profile that knows nothing of plans: counted');
  assert.equal(stockOnOf(sub({ enabled: false, entitlements: EVERYTHING, free: EVERYTHING }), NOW), true, 'plans off: counted');
  assert.equal(stockOnOf(sub(), NOW), false, 'Free: paused');
  assert.equal(stockOnOf(pro(), NOW), true, 'Pro: counted');
  assert.equal(stockOnOf(pro({ checked_at: iso(NOW - (TRUST_DAYS + 1) * DAY) }), NOW), false, 'a Pro the phone cannot confirm: paused');
  assert.equal(planStateOf(sub(), [], 'UTC', NOW).entitlements.month_overview, false, 'Free has no overview of the month');
  assert.equal(planStateOf(pro(), [], 'UTC', NOW).entitlements.month_overview, true, 'Pro has it');
}

console.log('subscription: ok');
