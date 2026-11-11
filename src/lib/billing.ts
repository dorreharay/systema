/**
 * Buying a plan. The store is Apple's, reached through RevenueCat's SDK (store.ts): the store's own sheet takes the payment, and then the
 * server is asked to read what the store says about the account (POST /api/billing/sync), which is what decides the plan. Where there is
 * no store (a build without the SDK or without its key, see `storeAvailable`), a development build has the server give the account the plan
 * by hand, so that every state of the screens can be tried, and any other build says that the store is not available.
 * docs/subscriptions.md says what has to be set up in the store first.
 */
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import type { User } from '@/lib/auth-api';
import { openUrl } from '@/lib/contact';
import { buyPackage, restoreStore, storeAvailable, storePackages } from '@/lib/store';
import { PurchaseNotSyncedError, StoreUnavailableError } from '@/lib/store-errors';
import type { Period } from '@/lib/subscription';

export { StoreUnavailableError };

/** The days of Pro that a first subscription costs nothing for. */
export const TRIAL_DAYS = 14;

/**
 * The list prices in US dollars, for the screens to show until the store names them in the money of the country (the store's own
 * price string replaces these when it is connected).
 */
export const LIST_PRICES = {
  pro: { month: 9.99, year: 69.99 },
  studio: { month: 24.99, year: 249.99 },
} as const;

/** How much cheaper a year of Pro is than twelve months of it, in whole percent. */
export const YEAR_SAVING = Math.round((1 - LIST_PRICES.pro.year / (LIST_PRICES.pro.month * 12)) * 100);

/** Where a person turns a subscription off or changes it: Apple's page for it, which only they can open (the app cannot cancel for them). */
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

/**
 * Has the server read what the store says about the account, and answers with the profile it then has. When it cannot (no connection,
 * RevenueCat slow), what was bought is bought all the same: RevenueCat tells the server itself in a moment, and the app reads the
 * profile again whenever it comes to the front; the person is told that it takes a moment.
 */
async function readStore(token: string): Promise<User> {
  try {
    return await api<User>('/api/billing/sync', { method: 'POST', token });
  } catch (reason) {
    // A token that is no longer good is for the sign-in to deal with.
    if (reason instanceof ApiError && reason.status === 401) throw reason;
    throw new PurchaseNotSyncedError();
  }
}

/**
 * Buys Pro (with its free days for a first subscription) and answers with the profile as the server now has it. `userId` is the account's
 * id, which is the customer's id in the store.
 */
export async function purchasePro(token: string, period: Period, userId: string): Promise<User> {
  if (storeAvailable()) {
    const item = (await storePackages())[period];
    // The store has no such product (it is not set up there yet).
    if (!item) throw new StoreUnavailableError();
    await buyPackage(item, userId);
    return readStore(token);
  }
  if (__DEV__) {
    // The server gives the plan by hand where it is set to (BILLING_DEV_GRANTS); anywhere else it answers 404.
    return api<User>('/api/billing/dev-grant', {
      method: 'POST',
      token,
      body: { plan: 'pro', period, trial: true, renews: true },
    });
  }
  throw new StoreUnavailableError();
}

/** Asks the store for what the person has bought before (a new phone, a reinstalled app), and answers with the profile the server then has. */
export async function restorePurchases(token: string, userId: string): Promise<User> {
  if (storeAvailable()) {
    await restoreStore(userId);
    return readStore(token);
  }
  if (__DEV__) return api<User>('/api/auth/me', { token });
  throw new StoreUnavailableError();
}

/** Opens Apple's page of the person's subscriptions. */
export const openManageSubscriptions = () => openUrl(MANAGE_SUBSCRIPTIONS_URL);

/**
 * Development builds only: gives the account a plan in a state of the screens' choosing, so that every one of them can be looked at.
 * Anything else is a no-op that says so.
 */
export type DevState = 'free' | 'trial' | 'active' | 'cancelled' | 'expired';

export async function grantForDevelopment(token: string, state: DevState): Promise<User> {
  if (!__DEV__) throw new StoreUnavailableError();
  const bodies: Record<DevState, object> = {
    free: { plan: 'free' },
    trial: { plan: 'pro', period: 'year', trial: true, renews: true, days: 9 },
    active: { plan: 'pro', period: 'year', trial: false, renews: true, days: 200 },
    cancelled: { plan: 'pro', period: 'month', trial: false, renews: false, days: 12 },
    expired: { plan: 'pro', period: 'month', trial: false, renews: true, days: -10 },
  };
  return api<User>('/api/billing/dev-grant', { method: 'POST', token, body: bodies[state] });
}
