/**
 * The subscription plans as the app sees them: what the server says the account holds (`User.subscription`), what that allows on this
 * phone, and how much of the month's orders is used. Plain logic with no React in it, so that the offline layer, which checks the
 * limit before an order is put in the queue, can use it too.
 *
 * None of it applies while the server has plans off (`enabled`): nothing is limited and no screen speaks of plans.
 */
import { ApiError } from './api-error';
import { monthStart } from './offline/select';

export type Plan = 'free' | 'pro' | 'studio';
export type Period = 'month' | 'year';

export type Entitlements = {
  /** New orders in a calendar month of the stringer's own. `null`: no limit. */
  orders_per_month: number | null;
  /** Counting the stock, and taking from it with each order. */
  stock: boolean;
  /** The charts of the month on the home screen. */
  month_overview: boolean;
};

/** What the server says about the plan of the account (`subscription` of the user). */
export type Subscription = {
  enabled: boolean;
  plan: Plan;
  trial: boolean;
  renews: boolean;
  period: Period | null;
  expires_at: string | null;
  // The moment after which a phone that has not heard from the server stops counting on the plan.
  holds_until: string | null;
  expired: boolean;
  // When the server worked this out: how old what the phone knows is.
  checked_at: string;
  entitlements: Entitlements;
  // What the account falls back to.
  free: Entitlements;
  // The person asked to be told when Studio is there (the server before this was added does not say: not on the list).
  studio_waitlist?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a phone that cannot reach the server counts on what it last heard of a paid plan. */
export const TRUST_DAYS = 14;

const EVERYTHING: Entitlements = { orders_per_month: null, stock: true, month_overview: true };

/** How much of the month's limit is used. */
export type Usage = {
  used: number;
  limit: number;
  left: number;
  reached: boolean;
  /** The moment the month, and the count, begins again. */
  resetsAt: number;
};

/** What the screens need to know about the plan of the account, as this phone can tell it now. */
export type PlanState = {
  /** Whether plans are on at the server. When they are not nothing below applies and no screen speaks of plans. */
  enabled: boolean;
  plan: Plan;
  entitlements: Entitlements;
  trial: boolean;
  renews: boolean;
  period: Period | null;
  /** When the paid plan ends, or renews. `null` on Free (and for a plan with no end). */
  endsAt: number | null;
  /** Whole days from now to `endsAt`, never below 0. */
  daysLeft: number | null;
  /** Had a paid plan that has run out (or that this phone no longer counts on). */
  expired: boolean;
  /** The limit of orders of the month and what is used of it. `null` while nothing limits the orders. */
  usage: Usage | null;
  /** On the list of those who want to hear when Studio is there. */
  studioWaitlist: boolean;
};

const OFF: PlanState = {
  enabled: false,
  plan: 'free',
  entitlements: EVERYTHING,
  trial: false,
  renews: false,
  period: null,
  endsAt: null,
  daysLeft: null,
  expired: false,
  usage: null,
  studioWaitlist: false,
};

/**
 * Whether this phone counts on the plan the server last named. The server's word is kept on the phone, and a phone can be away for a
 * long time: a paid plan holds there until the server's own date for it (its end, and the days of grace after), and for no more than
 * `TRUST_DAYS` since the server last said so; after that the account is on Free here until the phone hears from the server again.
 * (The server never lets a plan that has run out hold: this only keeps a phone that was away from holding one for good.)
 */
function counts(sub: Subscription, now: number) {
  if (sub.plan === 'free') return true;
  const heard = Date.parse(sub.checked_at);
  if (Number.isFinite(heard) && now - heard > TRUST_DAYS * DAY_MS) return false;
  const until = sub.holds_until ? Date.parse(sub.holds_until) : NaN;
  return !(Number.isFinite(until) && now > until);
}

/** The moment the stringer's next month begins, wherever they are. */
export const nextMonthStart = (timeZone: string | undefined, now: number) =>
  // (32 days after the first is in the next month, whatever the month.)
  monthStart(timeZone, monthStart(timeZone, now) + 32 * DAY_MS);

type Dated = { created_at: string };

/** The orders made in the stringer's current month (counting those made without a connection), against the limit. */
export function usageOf(orders: Iterable<Dated>, limit: number, timeZone: string | undefined, now: number): Usage {
  const since = monthStart(timeZone, now);
  let used = 0;
  for (const order of orders) if (Date.parse(order.created_at) >= since) used++;
  return { used, limit, left: Math.max(0, limit - used), reached: used >= limit, resetsAt: nextMonthStart(timeZone, now) };
}

/** What the account holds, what it allows and how much of the month is used, as this phone can tell it at `now`. */
export function planStateOf(
  sub: Subscription | undefined,
  orders: Iterable<Dated>,
  timeZone: string | undefined,
  now: number
): PlanState {
  // A profile saved by a version of the app that knew nothing of plans has none either.
  if (!sub?.enabled) return OFF;
  const trusted = counts(sub, now);
  const plan = trusted ? sub.plan : 'free';
  const entitlements = trusted ? sub.entitlements : sub.free;
  const paid = plan !== 'free';
  const endsAt = paid && sub.expires_at ? Date.parse(sub.expires_at) : null;
  const limit = entitlements.orders_per_month;
  return {
    enabled: true,
    plan,
    entitlements,
    trial: paid && sub.trial,
    renews: paid && sub.renews,
    period: paid ? sub.period : null,
    endsAt,
    daysLeft: endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / DAY_MS)),
    expired: sub.expired || (!trusted && sub.plan !== 'free'),
    usage: limit === null ? null : usageOf(orders, limit, timeZone, now),
    studioWaitlist: sub.studio_waitlist === true,
  };
}

/** What stops a new order on this phone: the number of orders in a month, and whose month it is. */
export type OrderCap = { limit: number; timeZone: string };

/** The limit on the orders made now on this phone, or `null` while there is none. */
export function orderCapOf(sub: Subscription | undefined, timeZone: string | undefined, now: number): OrderCap | null {
  if (!sub?.enabled) return null;
  const limit = (counts(sub, now) ? sub.entitlements : sub.free).orders_per_month;
  return limit === null ? null : { limit, timeZone: timeZone || 'UTC' };
}

/** Whether the plan counts the stock now, as this phone can tell it (always, where the server has no plans). */
export function stockOnOf(sub: Subscription | undefined, now: number) {
  if (!sub?.enabled) return true;
  return (counts(sub, now) ? sub.entitlements : sub.free).stock;
}

/** A calendar day as `YYYY-MM-DD` in a time zone. */
function dayIn(ms: number, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/**
 * Throws what the server would answer (a 402 `order_limit_reached`) when one more order would be one too many for this month. The
 * orders are the copy on the phone with the queue played on it, so what was made without a connection counts.
 */
export function assertOrderAllowed(orders: Iterable<Dated>, cap: OrderCap, now: number) {
  const usage = usageOf(orders, cap.limit, cap.timeZone, now);
  if (!usage.reached) return;
  throw new ApiError(402, `The Free plan allows ${cap.limit} new orders a month`, 'order_limit_reached', undefined, {
    limit: cap.limit,
    used: usage.used,
    resets_on: dayIn(usage.resetsAt, cap.timeZone),
  });
}
