import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';
import { OFFLINE_AFTER_MS, activePlan, entitlementsOf, madeOffline, stockTracked, subscriptionOf } from '../../src/utils/plans.js';

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const now = new Date('2026-11-10T12:00:00.000Z');
const ago = (ms) => new Date(now.getTime() - ms);
const ahead = (ms) => new Date(now.getTime() + ms);

const on = { enabled: true, freeOrdersPerMonth: 15, graceDays: 3 };
const off = { ...on, enabled: false };
const EVERYTHING = { orders_per_month: null, stock: true, month_overview: true };
const FREE = { orders_per_month: 15, stock: false, month_overview: false };

/** An account row as the database gives it. */
const account = (extra = {}) => ({
  plan: 'free',
  plan_period: null,
  plan_expires_at: null,
  plan_trial: false,
  plan_renews: false,
  ...extra,
});

// What each plan allows
assert.deepEqual(entitlementsOf('free', on), FREE, 'Free: 15 new orders a month, no stock, no overview');
assert.deepEqual(entitlementsOf('pro', on), EVERYTHING, 'Pro has everything');
assert.deepEqual(entitlementsOf('studio', on), EVERYTHING, 'so does Studio');
assert.deepEqual(entitlementsOf('free', off), EVERYTHING, 'with plans off nothing is limited');
assert.deepEqual(entitlementsOf('free', { ...on, freeOrdersPerMonth: 7 }).orders_per_month, 7, 'the limit is a setting');

// The configuration
assert.equal(loadConfig({}).billing.enabled, false, 'plans are off until they are turned on');
assert.equal(loadConfig({}).billing.freeOrdersPerMonth, 15);
assert.equal(loadConfig({ FREE_ORDERS_PER_MONTH: '20' }).billing.freeOrdersPerMonth, 20);
assert.equal(loadConfig({ FREE_ORDERS_PER_MONTH: 'many' }).billing.freeOrdersPerMonth, 15, 'what is not a number falls back');
assert.equal(loadConfig({ FREE_ORDERS_PER_MONTH: '-4' }).billing.freeOrdersPerMonth, 0, 'never below none');
assert.equal(loadConfig({ BILLING_ENABLED: 'true' }).billing.enabled, true);
assert.equal(loadConfig({ BILLING_GRACE_DAYS: '5' }).billing.graceDays, 5);
assert.equal(loadConfig({ BILLING_DEV_GRANTS: 'true' }).billing.devGrants, true, 'a developer can give plans by hand');
assert.equal(
  loadConfig({ NODE_ENV: 'production', BILLING_DEV_GRANTS: 'true' }).billing.devGrants,
  false,
  'never in production, whatever is set'
);

// The plan an account holds
assert.equal(activePlan(account(), now, on), 'free');
assert.equal(activePlan(account({ plan: 'pro', plan_expires_at: ahead(10 * DAY) }), now, on), 'pro', 'until it runs out');
assert.equal(activePlan(account({ plan: 'studio', plan_expires_at: ahead(MINUTE) }), now, on), 'studio');
assert.equal(activePlan(account({ plan: 'pro', plan_expires_at: ago(DAY) }), now, on), 'pro', 'a day past the end is within the grace');
assert.equal(activePlan(account({ plan: 'pro', plan_expires_at: ago(3 * DAY - MINUTE) }), now, on), 'pro', 'to the last minute of it');
assert.equal(activePlan(account({ plan: 'pro', plan_expires_at: ago(3 * DAY + MINUTE) }), now, on), 'free', 'then Free');
assert.equal(activePlan(account({ plan: 'pro', plan_expires_at: ago(DAY) }), now, { ...on, graceDays: 0 }), 'free', 'no grace');
assert.equal(activePlan(account({ plan: 'pro', plan_expires_at: null }), now, on), 'pro', 'no end date: for good');
assert.equal(activePlan(account({ plan: 'gold', plan_expires_at: ahead(DAY) }), now, on), 'free', 'a plan nobody knows is Free');
assert.equal(activePlan(account({ plan: 'pro', plan_expires_at: ahead(DAY).toISOString() }), now, on), 'pro', 'a date as text too');

// Whether the stock of the catalog is counted
assert.equal(stockTracked(account(), now, on), false, 'paused on Free');
assert.equal(stockTracked(account({ plan: 'pro', plan_expires_at: ahead(DAY) }), now, on), true, 'counted on Pro');
assert.equal(stockTracked(account({ plan: 'pro', plan_expires_at: ago(10 * DAY) }), now, on), false, 'paused again once Pro has run out');
assert.equal(stockTracked(account(), now, off), true, 'always counted with the plans off');

// What the API says about it
const free = subscriptionOf(account(), now, on);
assert.deepEqual(free, {
  enabled: true,
  plan: 'free',
  trial: false,
  renews: false,
  period: null,
  expires_at: null,
  holds_until: null,
  expired: false,
  checked_at: now.toISOString(),
  entitlements: FREE,
  free: FREE,
});

const trial = subscriptionOf(
  account({ plan: 'pro', plan_period: 'year', plan_expires_at: ahead(9 * DAY), plan_trial: true, plan_renews: true }),
  now,
  on
);
assert.deepEqual(
  [trial.plan, trial.trial, trial.renews, trial.period, trial.expires_at, trial.expired],
  ['pro', true, true, 'year', ahead(9 * DAY).toISOString(), false],
  'a trial of Pro that renews'
);
assert.deepEqual(trial.entitlements, EVERYTHING);
assert.deepEqual(trial.free, FREE, 'what it falls back to is Free, whatever it holds now');
assert.equal(trial.holds_until, ahead(12 * DAY).toISOString(), 'a phone counts on it to the end and the three days of grace after');

const cancelled = subscriptionOf(
  account({ plan: 'pro', plan_period: 'month', plan_expires_at: ahead(5 * DAY), plan_renews: false }),
  now,
  on
);
assert.deepEqual([cancelled.plan, cancelled.renews, cancelled.expired], ['pro', false, false], 'turned off, but held to the end');

const lapsed = subscriptionOf(
  account({ plan: 'pro', plan_period: 'month', plan_expires_at: ago(10 * DAY), plan_trial: true, plan_renews: true }),
  now,
  on
);
assert.deepEqual(
  [lapsed.plan, lapsed.trial, lapsed.renews, lapsed.period, lapsed.expires_at, lapsed.expired],
  ['free', false, false, null, null, true],
  'it ran out: Free, and the app is told that it had a plan'
);
assert.equal(lapsed.holds_until, null, 'nothing is held any more');
assert.deepEqual(lapsed.entitlements, FREE);

const unlimited = subscriptionOf(account(), now, off);
assert.deepEqual([unlimited.enabled, unlimited.plan], [false, 'free']);
assert.deepEqual([unlimited.entitlements, unlimited.free], [EVERYTHING, EVERYTHING], 'plans off: nothing is limited, even on the way down');

// An order made while the phone had no connection
assert.equal(madeOffline(undefined, now), false, 'no moment: made now');
assert.equal(madeOffline('not a date', now), false);
assert.equal(madeOffline(ago(MINUTE).toISOString(), now), false, 'a minute ago: made online');
assert.equal(madeOffline(ago(OFFLINE_AFTER_MS - 1000).toISOString(), now), false, 'just under the margin');
assert.equal(madeOffline(ago(OFFLINE_AFTER_MS + 1000).toISOString(), now), true, 'just over it');
assert.equal(madeOffline(ago(2 * 60 * MINUTE).toISOString(), now), true, 'hours ago');
assert.equal(madeOffline(ago(89 * DAY).toISOString(), now), true, 'a long time without a connection');
assert.equal(madeOffline(ago(100 * DAY).toISOString(), now), false, 'a clock that is wrong is not believed (see eventTime)');
assert.equal(madeOffline(ahead(DAY).toISOString(), now), false, 'nor one that is ahead');

console.log('plans: ok');
