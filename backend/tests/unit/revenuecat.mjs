import assert from 'node:assert/strict';
import { accountIdsOf, planFromSubscriber } from '../../src/utils/revenuecat.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-10T12:00:00.000Z');
const iso = (ms) => new Date(now.getTime() + ms).toISOString();
const settings = { proEntitlement: 'pro', studioEntitlement: 'studio' };
const plan = (subscriber) => planFromSubscriber(subscriber, now, settings);

const FREE = { plan: 'free', plan_period: null, plan_expires_at: null, plan_trial: false, plan_renews: false };

/** A customer as RevenueCat's GET /v1/subscribers/{id} gives it: one entitlement, and the subscription that gives it. */
function customer({ entitlement = 'pro', product = 'restring_pro_monthly', expires = 20 * DAY, purchased = -10 * DAY, grace = null, subscription = {} } = {}) {
  const end = expires === null ? null : iso(expires);
  return {
    entitlements: {
      [entitlement]: {
        product_identifier: product,
        purchase_date: iso(purchased),
        expires_date: end,
        grace_period_expires_date: grace === null ? null : iso(grace),
      },
    },
    subscriptions: {
      [product]: {
        store: 'app_store',
        period_type: 'normal',
        purchase_date: iso(purchased),
        expires_date: end,
        unsubscribe_detected_at: null,
        billing_issues_detected_at: null,
        refunded_at: null,
        ...subscription,
      },
    },
  };
}

// Nothing bought
assert.deepEqual(plan({ entitlements: {}, subscriptions: {} }), FREE, 'no entitlement: Free');
assert.deepEqual(plan({}), FREE, 'an empty customer: Free');
assert.deepEqual(plan(null), FREE, 'no customer: Free');
assert.deepEqual(plan(customer({ entitlement: 'something_else' })), FREE, 'an entitlement of no plan of ours is not a plan');

// Pro, a month, running
{
  const got = plan(customer());
  assert.deepEqual(
    [got.plan, got.plan_period, got.plan_trial, got.plan_renews, got.plan_expires_at.toISOString()],
    ['pro', 'month', false, true, iso(20 * DAY)],
    'Pro by the month, renewing, to its end'
  );
}

// The year is told by the name of the product
assert.equal(plan(customer({ product: 'restring_pro_yearly' })).plan_period, 'year', 'yearly');
assert.equal(plan(customer({ product: 'com.velar.restring.pro.annual' })).plan_period, 'year', 'annual');
assert.equal(plan(customer({ product: 'restring_pro_monthly' })).plan_period, 'month', 'monthly');
assert.equal(plan(customer({ product: 'restring_pro_1m' })).plan_period, 'month', 'anything else is a month');

// The free days Apple gives
assert.equal(plan(customer({ subscription: { period_type: 'trial' } })).plan_trial, true, 'a trial');
assert.equal(plan(customer({ subscription: { period_type: 'TRIAL' } })).plan_trial, true, 'in capitals too');
assert.equal(plan(customer({ subscription: { period_type: 'intro' } })).plan_trial, false, 'a paid introductory price is not a trial');

// Turned off in the store: holds to the end, does not renew
{
  const got = plan(customer({ subscription: { unsubscribe_detected_at: iso(-DAY) } }));
  assert.deepEqual([got.plan, got.plan_renews, got.plan_expires_at.toISOString()], ['pro', false, iso(20 * DAY)], 'cancelled, held to the end');
}
assert.equal(plan(customer({ subscription: { refunded_at: iso(-DAY) } })).plan_renews, false, 'a refunded one does not renew');
assert.equal(plan(customer({ subscription: { billing_issues_detected_at: iso(-DAY) } })).plan_renews, true, 'a card that failed is tried again: it still renews');

// Ended: the plan stays with its end in the past, so that the app can say that it ran out (utils/plans.js then counts the grace)
{
  const got = plan(customer({ expires: -5 * DAY }));
  assert.deepEqual([got.plan, got.plan_expires_at.toISOString()], ['pro', iso(-5 * DAY)], 'ended five days ago');
}

// The days the store gives to retry a card hold it, past the end
{
  const got = plan(customer({ expires: -2 * DAY, grace: 5 * DAY }));
  assert.equal(got.plan_expires_at.toISOString(), iso(5 * DAY), 'to the end of the days of grace');
}

// Studio over Pro, and what is held over what ended
{
  const both = {
    entitlements: {
      ...customer({ entitlement: 'pro', product: 'restring_pro_monthly' }).entitlements,
      ...customer({ entitlement: 'studio', product: 'restring_studio_monthly', expires: 15 * DAY }).entitlements,
    },
    subscriptions: {
      ...customer({ entitlement: 'pro', product: 'restring_pro_monthly' }).subscriptions,
      ...customer({ entitlement: 'studio', product: 'restring_studio_monthly', expires: 15 * DAY }).subscriptions,
    },
  };
  assert.equal(plan(both).plan, 'studio', 'both running: Studio');

  const studioEnded = structuredClone(both);
  studioEnded.entitlements.studio.expires_date = iso(-3 * DAY);
  assert.equal(plan(studioEnded).plan, 'pro', 'Studio ended, Pro running: Pro');

  const bothEnded = structuredClone(both);
  bothEnded.entitlements.studio.expires_date = iso(-3 * DAY);
  bothEnded.entitlements.pro.expires_date = iso(-9 * DAY);
  const got = plan(bothEnded);
  assert.deepEqual([got.plan, got.plan_expires_at.toISOString()], ['studio', iso(-3 * DAY)], 'both ended: the one that ended last');
}

// A plan granted from the dashboard (a founder's year): no subscription, or a promotional one
{
  const forGood = plan({
    entitlements: { pro: { product_identifier: 'rc_promo_pro_lifetime', purchase_date: iso(-DAY), expires_date: null } },
    subscriptions: { rc_promo_pro_lifetime: { store: 'promotional', period_type: 'normal', expires_date: null } },
  });
  assert.deepEqual(forGood, { plan: 'pro', plan_period: 'month', plan_expires_at: null, plan_trial: false, plan_renews: false }, 'for good, no renewal');

  const year = plan({
    entitlements: { pro: { product_identifier: 'rc_promo_pro_cat_yearly', purchase_date: iso(-DAY), expires_date: iso(364 * DAY) } },
    subscriptions: { rc_promo_pro_cat_yearly: { store: 'promotional', period_type: 'normal', expires_date: iso(364 * DAY) } },
  });
  assert.deepEqual([year.plan, year.plan_period, year.plan_renews, year.plan_trial], ['pro', 'year', false, false], 'a promotional year is a year');

  const week = plan({
    entitlements: { pro: { product_identifier: 'rc_promo_pro_week', purchase_date: iso(-DAY), expires_date: iso(6 * DAY) } },
    subscriptions: { rc_promo_pro_week: { store: 'promotional', period_type: 'trial', expires_date: iso(6 * DAY) } },
  });
  assert.deepEqual([week.plan_period, week.plan_trial], ['month', false], 'a promotional week is not a year, and not a trial');

  const orphan = plan({
    entitlements: { pro: { product_identifier: 'gone', purchase_date: iso(-DAY), expires_date: iso(10 * DAY) } },
    subscriptions: {},
  });
  assert.deepEqual([orphan.plan, orphan.plan_trial, orphan.plan_renews], ['pro', false, false], 'an entitlement with no subscription neither renews nor is a trial');
}

// The names of the entitlements are the ones that are set
{
  const named = planFromSubscriber(customer({ entitlement: 'restring_plus' }), now, { proEntitlement: 'restring_plus', studioEntitlement: 'studio' });
  assert.equal(named.plan, 'pro', 'the dashboard may call it anything');
}

// Whom a notice is about
{
  const a = '0b9d6f1e-5f2a-4b3c-9d4e-1a2b3c4d5e6f';
  const b = '7C1D2E3F-4A5B-4C6D-8E7F-9A0B1C2D3E4F';
  assert.deepEqual(accountIdsOf({ app_user_id: a, original_app_user_id: a, aliases: [a, '$RCAnonymousID:abc'] }), [a], 'the same one once, an anonymous one is nobody');
  assert.deepEqual(accountIdsOf({ app_user_id: '$RCAnonymousID:abc', original_app_user_id: a }), [a], 'found by the first id the customer had');
  assert.deepEqual(accountIdsOf({ app_user_id: a, transferred_from: [b], transferred_to: [a] }), [a, b.toLowerCase()], 'a transfer is about both');
  assert.deepEqual(accountIdsOf({ app_user_id: 'guest', aliases: 'x' }), [], 'nothing that is an account');
  assert.deepEqual(accountIdsOf({}), [], 'an empty notice');
}

console.log('revenuecat: ok');
