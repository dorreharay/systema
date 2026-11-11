import { useMemo } from 'react';

import { useAuth } from '@/lib/auth';
import { useSnapshot } from '@/lib/offline/react';
import { planStateOf, type PlanState } from '@/lib/subscription';
import { useNow } from '@/lib/use-now';

/**
 * What the plan of the account allows, without the count of the month's orders: cheap, for what is drawn many times (the rows of a list)
 * and must not be drawn again each time the data changes. Where the server has no plans, everything.
 */
export function useEntitlements() {
  const { user } = useAuth();
  const subscription = user?.subscription;
  const timeZone = user?.timezone;
  // (Read once an hour: what a phone counts on changes over days, and the profile is read again whenever the app comes to the front.)
  const now = useNow(60 * 60_000);
  return useMemo(() => planStateOf(subscription, [], timeZone, now).entitlements, [subscription, timeZone, now]);
}

/**
 * The plan of the account, what it allows and how much of the month's orders is used, as this phone can tell it. Drawn again when
 * an order is made or deleted, and every minute (the month turns, a trial ends). With the server's plans off it says so (`enabled`).
 */
export function useSubscription(): PlanState {
  const { user } = useAuth();
  const { tables } = useSnapshot();
  const now = useNow(60_000);
  const subscription = user?.subscription;
  const timeZone = user?.timezone;
  return useMemo(
    () => planStateOf(subscription, Object.values(tables.orders), timeZone, now),
    [subscription, tables.orders, timeZone, now]
  );
}
