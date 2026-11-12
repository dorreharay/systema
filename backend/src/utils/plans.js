/**
 * The plans (Free, Pro, Studio) and what each of them allows. Whether any of it applies is a setting of the server
 * (`config.billing.enabled`): while it is off every account has everything, nothing is counted and the app shows no plans.
 *
 * What an account holds is kept in the `plan*` columns of `users` and is written by the store's notices (see routes/billing.js).
 * It holds until `plan_expires_at` and a few days of grace after it; then the account is on Free again.
 */
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { orders } from '../db/schema.js';
import { EVENT_BACKDATE_DAYS, addDays, isValidTimeZone, monthOf, todayIn } from './dates.js';
import { HttpError } from './http.js';

export const PLANS = ['free', 'pro', 'studio'];
export const PERIODS = ['month', 'year'];

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * An order whose moment (`at`, the tap on the phone) is older than this when it arrives was made while the phone had no connection.
 * The phone checked the limit itself when the stringer made it, so the server does not turn it away now: that would throw away
 * work that was already done. A few minutes are allowed for a slow network, so that an order made online is still counted.
 */
export const OFFLINE_AFTER_MS = 5 * MINUTE_MS;

/** What an account may do. `null` is no limit. */
const EVERYTHING = { orders_per_month: null, stock: true, month_overview: true };

/**
 * What a plan allows. Pro and Studio hold everything the app has; Free holds a number of new orders a month, and not the stock
 * (counting, and taking from it with each order) or the overview of the month on the home screen. With plans off, everything.
 */
export function entitlementsOf(plan, billing = config.billing) {
  if (!billing.enabled || plan !== 'free') return { ...EVERYTHING };
  return { orders_per_month: billing.freeOrdersPerMonth, stock: false, month_overview: false };
}

/** The plan this account holds at `now`: the paid one until it runs out (and for the days of grace after), otherwise Free. */
export function activePlan(user, now = new Date(), billing = config.billing) {
  if (!PLANS.includes(user.plan) || user.plan === 'free') return 'free';
  // No date: a plan given by hand, for good.
  if (!user.plan_expires_at) return user.plan;
  const until = new Date(user.plan_expires_at).getTime() + billing.graceDays * DAY_MS;
  return now.getTime() < until ? user.plan : 'free';
}

/**
 * Whether this account runs a team: the server has Studio on (`config.billing.studioEnabled`, which needs the plans to be on) and the
 * account holds the Studio plan, its days of grace included. A workshop whose owner no longer does is paused for the people who work in it
 * (see utils/workshop.js); the owner keeps all the data and falls back to the plan they have.
 */
export const teamAllowed = (user, now = new Date(), billing = config.billing) =>
  Boolean(billing.enabled && billing.studioEnabled) && activePlan(user, now, billing) === 'studio';

/**
 * Whether the stock of this account's catalog is counted. On Free it is paused and not taken away: the counts stay as they were, an
 * order takes nothing from them and is never refused for what is not there, the lists show every item as available, and nothing a request
 * says about counting is written (a form that was made for a plan with the stock would otherwise switch it off). Back on Pro, the
 * counting goes on from the counts that were left. With the plans off the stock is always counted, as it was.
 */
export const stockTracked = (user, now = new Date(), billing = config.billing) =>
  entitlementsOf(activePlan(user, now, billing), billing).stock;

/** What the API says about an account's plan (part of the user): the app decides what to show and what to ask for from this. */
export function subscriptionOf(user, now = new Date(), billing = config.billing) {
  const plan = activePlan(user, now, billing);
  const paid = plan !== 'free';
  return {
    // False: plans are not on at this server. The app then shows none of this and nothing is limited.
    enabled: billing.enabled,
    plan,
    trial: paid && user.plan_trial,
    renews: paid && user.plan_renews,
    period: paid ? user.plan_period : null,
    expires_at: paid && user.plan_expires_at ? new Date(user.plan_expires_at).toISOString() : null,
    // The moment after which a phone that has not heard from the server stops counting on the plan: its end, and the days of grace.
    holds_until:
      paid && user.plan_expires_at ? new Date(new Date(user.plan_expires_at).getTime() + billing.graceDays * DAY_MS).toISOString() : null,
    // Had a plan once and it has run out: the app says so, and does not treat the account as if it had always been on Free.
    expired: !paid && PLANS.includes(user.plan) && user.plan !== 'free',
    // When this was worked out. A phone that keeps it can tell how old what it knows is.
    checked_at: now.toISOString(),
    entitlements: entitlementsOf(plan, billing),
    // What the account falls back to when the phone has not heard from the server for too long.
    free: entitlementsOf('free', billing),
    // The person asked to be told when Studio is there (POST /api/billing/studio-waitlist).
    studio_waitlist: Boolean(user.studio_waitlist_at),
    // Whether Studio is a plan that can be held at this server. False: it is only a waiting list, and the app says so.
    studio_available: Boolean(billing.enabled && billing.studioEnabled),
    // Whether this account runs a team now (it holds Studio), and how many people a workshop of its plan holds, the owner included.
    team: teamAllowed(user, now, billing),
    seats: billing.enabled && billing.studioEnabled && plan === 'studio' ? billing.studioSeats : 1,
  };
}

/** Whether an order made at `at` was made on a phone with no connection (see `OFFLINE_AFTER_MS`). */
export function madeOffline(at, now = new Date()) {
  if (!at) return false;
  const time = new Date(at).getTime();
  if (Number.isNaN(time)) return false;
  const age = now.getTime() - time;
  // An older moment than the server believes (see `eventTime`) is not believed here either.
  return age > OFFLINE_AFTER_MS && age <= EVENT_BACKDATE_DAYS * DAY_MS;
}

/**
 * How many orders the stringer has made in their current calendar month, in their own time zone ("this month" is theirs, not the
 * server's). The database works out where the month begins and ends: it knows the rules of every zone. An order counts by the moment
 * it was made, so deleting one gives its place back, and one made without a connection counts in the month it was made in.
 */
export async function ordersMadeThisMonth(executor, userId, timeZone, now = new Date()) {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const local = sql`date_trunc('month', ${now.toISOString()}::timestamptz at time zone ${zone})`;
  const [{ count }] = await executor
    .select({ count: sql`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.user_id, userId),
        gte(orders.created_at, sql`${local} at time zone ${zone}`),
        lt(orders.created_at, sql`(${local} + interval '1 month') at time zone ${zone}`)
      )
    );
  return count;
}

/**
 * Turns away a new order the account's plan does not allow: a 402 `order_limit_reached` that says how many it allows, how many
 * there are, and the day the month starts again. Call it inside the transaction that makes the order, once the row of the user is
 * locked (the update of the order counter does that), so that two orders made at once are counted one after the other.
 * An order made without a connection (see `madeOffline`) is never turned away.
 */
export async function assertCanMakeOrder(executor, user, { at, now = new Date() } = {}, billing = config.billing) {
  if (!billing.enabled) return;
  const limit = entitlementsOf(activePlan(user, now, billing), billing).orders_per_month;
  if (limit === null || madeOffline(at, now)) return;

  const used = await ordersMadeThisMonth(executor, user.id, user.timezone, now);
  if (used < limit) return;

  const zone = isValidTimeZone(user.timezone) ? user.timezone : 'UTC';
  throw new HttpError(402, `The Free plan allows ${limit} new orders a month`, {
    code: 'order_limit_reached',
    data: { limit, used, resets_on: addDays(monthOf(todayIn(zone)).end, 1) },
  });
}
