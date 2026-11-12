/**
 * The store, reached through RevenueCat's SDK (react-native-purchases). Nothing else in the app talks to it: `billing.ts` buys and
 * restores through this, and the screens read the prices through `use-store-prices.ts`. The web has none of it (store.web.ts).
 *
 * The SDK has native code, so a build that was made before it was added has no module for it. It is read when it is first needed, and a
 * build with no module (or with no key for this store) simply has no store: `storeAvailable()` says so, and the app does what it did
 * before (a development build asks the server to give the plan by hand, any other says that the store is not available).
 *
 * The customer id in RevenueCat is the account's id. That is how the server finds what a customer bought (see backend/src/utils/revenuecat.js).
 */
import { NativeModules, Platform } from 'react-native';
import type { PurchasesError, PurchasesPackage } from 'react-native-purchases';

import { PurchaseCancelledError, PurchasePendingError, StoreUnavailableError } from '@/lib/store-errors';
import type { Period } from '@/lib/subscription';

type Sdk = (typeof import('react-native-purchases'))['default'];

// The public key of the RevenueCat project for this store (it is made for the app to carry: it lets the app talk to RevenueCat as this app
// and nothing more). Set in .env, and in the environment of the build for the stores.
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

let loaded: Sdk | null | undefined;

/** The SDK, or null when this build has no native module for it. */
function sdk(): Sdk | null {
  if (loaded !== undefined) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = NativeModules.RNPurchases ? (require('react-native-purchases') as { default: Sdk }).default : null;
  } catch {
    loaded = null;
  }
  return loaded;
}

/** Whether this device can buy: the SDK is in the build and the key is set. */
export const storeAvailable = () => Boolean(API_KEY) && sdk() !== null;

let setUp: Promise<Sdk> | undefined;

/** The SDK, configured once. */
function purchases(): Promise<Sdk> {
  if (!setUp) {
    setUp = (async () => {
      const instance = sdk();
      if (!API_KEY || !instance) throw new StoreUnavailableError();
      if (!(await instance.isConfigured())) instance.configure({ apiKey: API_KEY });
      return instance;
    })();
    // A failed set-up is tried again by the next call.
    setUp.catch(() => {
      setUp = undefined;
    });
  }
  return setUp;
}

/** The SDK, signed in as this account (one that is not is made so). */
async function identify(userId: string): Promise<Sdk> {
  const instance = await purchases();
  if ((await instance.getAppUserID()) !== userId) await instance.logIn(userId);
  return instance;
}

/** Tells RevenueCat whose purchases these are. Called when an account is signed in. */
export async function identifyStore(userId: string): Promise<void> {
  await identify(userId);
}

/** Called when the account signs out: the next one must not be given its purchases. */
export async function forgetStore(): Promise<void> {
  const instance = sdk();
  if (!instance) return;
  try {
    if (await instance.isConfigured()) await instance.logOut();
  } catch {
    // It was not signed in there either.
  }
}

/** What a plan costs in the money of the person's store, as the store writes it. */
export type StorePrice = { text: string; amount: number; currency: string };

/** What the store sells for a plan, by period; one it does not have is left out. */
export type StorePackages = Partial<Record<Period, PurchasesPackage>>;

/** The plans the store sells. Each has an offering in the RevenueCat project: Pro the current one, Studio the one whose identifier is `studio`. */
export type StorePlan = 'pro' | 'studio';
const STUDIO_OFFERING = 'studio';

const packages: Partial<Record<StorePlan, Promise<StorePackages>>> = {};

/**
 * The packages of the offering of a plan (the monthly and the annual one): for Pro the current offering of the RevenueCat project, for
 * Studio the offering named `studio`. A plan whose offering is not there (not set up in the store yet) has no packages.
 */
export function storePackages(plan: StorePlan = 'pro'): Promise<StorePackages> {
  let found = packages[plan];
  if (!found) {
    found = purchases().then(async (instance) => {
      const { current, all } = await instance.getOfferings();
      const offering = plan === 'studio' ? all[STUDIO_OFFERING] : current;
      return { month: offering?.monthly ?? undefined, year: offering?.annual ?? undefined };
    });
    packages[plan] = found;
    found.catch(() => {
      delete packages[plan];
    });
  }
  return found;
}

export function priceOf(item: PurchasesPackage | undefined): StorePrice | undefined {
  return item ? { text: item.product.priceString, amount: item.product.price, currency: item.product.currencyCode } : undefined;
}

/**
 * Buys a package for the account: the store's own sheet is shown, and this answers when the person has paid or turned away. A person
 * who closes the sheet is a `PurchaseCancelledError`, one whose purchase waits for approval a `PurchasePendingError`.
 */
export async function buyPackage(item: PurchasesPackage, userId: string): Promise<void> {
  const instance = await identify(userId);
  try {
    await instance.purchasePackage(item);
  } catch (reason) {
    const error = reason as Partial<PurchasesError> | null;
    const codes = instance.PURCHASES_ERROR_CODE;
    if (error?.userCancelled || error?.code === codes.PURCHASE_CANCELLED_ERROR) throw new PurchaseCancelledError();
    if (error?.code === codes.PAYMENT_PENDING_ERROR) throw new PurchasePendingError();
    throw reason;
  }
}

/** Asks the store for what this Apple ID has bought before (a new phone, a reinstalled app). It shows the system's sign-in if it needs it. */
export async function restoreStore(userId: string): Promise<void> {
  const instance = await identify(userId);
  await instance.restorePurchases();
}
