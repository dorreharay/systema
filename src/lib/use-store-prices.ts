import { useEffect, useState } from 'react';

import { STUDIO_YEAR_SAVING, YEAR_SAVING } from '@/lib/billing';
import { priceOf, storeAvailable, storePackages, type StorePlan, type StorePrice } from '@/lib/store';
import type { Period } from '@/lib/subscription';

export type StorePrices = Partial<Record<Period, StorePrice>>;

// What the store said, kept for the next screen: it does not change while the app is open.
const known: Partial<Record<StorePlan, StorePrices>> = {};

/**
 * What the store asks for Pro (or Studio), in the money and the words of the person's own country. `undefined` while it has not said, and
 * where there is no store (the web, a build without it): the screens then show the list prices of lib/billing.ts. `enabled` is off for a
 * plan that is not sold at this server, so that the store is not asked about it.
 */
export function useStorePrices(plan: StorePlan = 'pro', enabled = true): StorePrices | undefined {
  const [prices, setPrices] = useState(known[plan]);

  useEffect(() => {
    if (!enabled || known[plan] || !storeAvailable()) return;
    let current = true;
    storePackages(plan)
      .then((found) => {
        const said = { month: priceOf(found.month), year: priceOf(found.year) };
        known[plan] = said;
        if (current) setPrices(said);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [plan, enabled]);

  return prices;
}

/**
 * How much cheaper a year of Pro (or Studio) is than twelve months of it, in whole percent: by the store's prices once it has named them
 * (they can differ a little from the list in another country), else by the list.
 */
export function useYearSaving(plan: StorePlan = 'pro', enabled = true): number {
  const prices = useStorePrices(plan, enabled);
  const month = prices?.month;
  const year = prices?.year;
  if (month && year && month.currency === year.currency && month.amount > 0) {
    return Math.max(0, Math.round((1 - year.amount / (month.amount * 12)) * 100));
  }
  return plan === 'studio' ? STUDIO_YEAR_SAVING : YEAR_SAVING;
}
