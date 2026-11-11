/**
 * What the store says about an account, read from RevenueCat (https://www.revenuecat.com/docs/api-v1).
 *
 * The app buys through RevenueCat's SDK with the account's id as the customer id (`Purchases.logIn(user.id)`), and the server asks
 * RevenueCat what that customer holds now. It does so after a purchase or a restore (the app calls POST /api/billing/sync) and
 * whenever RevenueCat sends a notice (POST /api/billing/revenuecat). A notice is only a reason to ask: what it says is not used,
 * so that notices that come late or out of order cannot put an old state back (RevenueCat itself advises this).
 *
 * What it writes are the `plan*` columns of `users` (see utils/plans.js, which reads them).
 */
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { HttpError, isUuid } from './http.js';

const TIMEOUT_MS = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;

// The products are named by whoever sets them up in the store: one with "year" or "annual" in its name is the yearly one.
const YEARLY_PRODUCT = /year|annual/i;
// A plan granted by hand from RevenueCat's dashboard (a founder's year) has no product to tell its length from: a year is long.
const YEAR_LONG_MS = 300 * DAY_MS;

const FREE = { plan: 'free', plan_period: null, plan_expires_at: null, plan_trial: false, plan_renews: false };

const dateOf = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * The `plan*` columns for what RevenueCat says a customer holds (`subscriber` of its answer). The plan is the one whose entitlement
 * is active at `now` (Studio before Pro); when none is, the one that ended last, so that the app can say that it ran out; when there
 * never was one, Free. The end is the end of the entitlement, or of the days the store gives to retry a card, whichever is later;
 * with no date it is for good. Trial, renewal and month or year come from the subscription that gives the entitlement.
 */
export function planFromSubscriber(subscriber, now = new Date(), settings = config.billing.revenuecat) {
  const held = [
    { plan: 'studio', entitlement: subscriber?.entitlements?.[settings.studioEntitlement] },
    { plan: 'pro', entitlement: subscriber?.entitlements?.[settings.proEntitlement] },
  ]
    .filter(({ entitlement }) => entitlement)
    .map(({ plan, entitlement }) => {
      const expires = dateOf(entitlement.expires_date);
      const grace = dateOf(entitlement.grace_period_expires_date);
      const end = expires === null && grace === null ? null : new Date(Math.max(expires?.getTime() ?? 0, grace?.getTime() ?? 0));
      return { plan, entitlement, end };
    });

  const active = held.filter(({ end }) => end === null || end.getTime() > now.getTime());
  const chosen = active[0] ?? held.sort((a, b) => b.end.getTime() - a.end.getTime())[0];
  if (!chosen) return { ...FREE };

  const { entitlement, end } = chosen;
  const subscription = subscriber?.subscriptions?.[entitlement.product_identifier];
  // A plan with no subscription behind it (granted from the dashboard) neither is a trial nor renews.
  const promotional = !subscription || subscription.store === 'promotional';
  const purchased = dateOf(entitlement.purchase_date);
  const year = promotional
    ? Boolean(purchased && end && end.getTime() - purchased.getTime() >= YEAR_LONG_MS)
    : YEARLY_PRODUCT.test(entitlement.product_identifier ?? '');

  return {
    plan: chosen.plan,
    plan_period: year ? 'year' : 'month',
    plan_expires_at: end,
    plan_trial: !promotional && String(subscription.period_type).toLowerCase() === 'trial',
    // Turned off in the store (`unsubscribe_detected_at`): it holds to the end of what was paid for and does not renew.
    plan_renews: !promotional && !subscription.unsubscribe_detected_at && !subscription.refunded_at,
  };
}

/** Asks RevenueCat what the customer holds. `fetchImpl` is for a test. Throws an HttpError that tells what went wrong. */
export async function fetchSubscriber(appUserId, settings = config.billing.revenuecat, fetchImpl = fetch) {
  if (!settings.secretKey) {
    throw new HttpError(503, 'Purchases are not connected at this server', { code: 'billing_unavailable' });
  }

  let response;
  try {
    response = await fetchImpl(`${settings.apiUrl}/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { authorization: `Bearer ${settings.secretKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`[billing] RevenueCat could not be reached: ${error?.message}`);
    throw new HttpError(502, 'RevenueCat could not be reached', { code: 'billing_unreachable' });
  }
  if (!response.ok) {
    // 401: the key is wrong. Nothing of it is in what is logged or said.
    console.error(`[billing] RevenueCat answered ${response.status}`);
    throw new HttpError(502, `RevenueCat answered ${response.status}`, { code: 'billing_unreachable' });
  }

  const body = await response.json().catch(() => null);
  if (!body?.subscriber || typeof body.subscriber !== 'object') {
    console.error('[billing] RevenueCat answered with something that is not a customer');
    throw new HttpError(502, 'RevenueCat answered with something that is not a customer', { code: 'billing_unreachable' });
  }
  return body.subscriber;
}

/** Reads what the store says about the account and writes it to the account. Returns the account as it is now (null: no such one). */
export async function syncPlan(userId, { settings = config.billing.revenuecat, fetchImpl = fetch, now = new Date() } = {}) {
  const subscriber = await fetchSubscriber(userId, settings, fetchImpl);
  const [user] = await db.update(users).set(planFromSubscriber(subscriber, now, settings)).where(eq(users.id, userId)).returning();
  return user ?? null;
}

/**
 * The ids of the accounts a notice is about. The customer id is the account's id (a UUID); the ones RevenueCat makes up for a
 * customer who is not signed in (`$RCAnonymousID:…`) are not accounts. A transfer names both the one that gave and the one that took.
 */
export function accountIdsOf(event) {
  const ids = [
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
    ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
    ...(Array.isArray(event.transferred_to) ? event.transferred_to : []),
  ];
  return [...new Set(ids.filter(isUuid).map((id) => id.toLowerCase()))];
}
