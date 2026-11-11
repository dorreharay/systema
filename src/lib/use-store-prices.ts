import { useEffect, useState } from 'react';

import { YEAR_SAVING } from '@/lib/billing';
import { priceOf, storeAvailable, storePackages, type StorePrice } from '@/lib/store';
import type { Period } from '@/lib/subscription';

export type StorePrices = Partial<Record<Period, StorePrice>>;

// What the store said, kept for the next screen: it does not change while the app is open.
let known: StorePrices | undefined;

/**
 * What the store asks for Pro, in the money and the words of the person's own country. `undefined` while it has not said, and where
 * there is no store (the web, a build without it): the screens then show the list prices of lib/billing.ts.
 */
export function useStorePrices(): StorePrices | undefined {
  const [prices, setPrices] = useState(known);

  useEffect(() => {
    if (known || !storeAvailable()) return;
    let current = true;
    storePackages()
      .then((found) => {
        known = { month: priceOf(found.month), year: priceOf(found.year) };
        if (current) setPrices(known);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  return prices;
}

/**
 * How much cheaper a year of Pro is than twelve months of it, in whole percent: by the store's prices once it has named them (they can
 * differ a little from the list in another country), else by the list.
 */
export function useYearSaving(): number {
  const prices = useStorePrices();
  const month = prices?.month;
  const year = prices?.year;
  if (month && year && month.currency === year.currency && month.amount > 0) {
    return Math.max(0, Math.round((1 - year.amount / (month.amount * 12)) * 100));
  }
  return YEAR_SAVING;
}
