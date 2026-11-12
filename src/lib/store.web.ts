/**
 * The web has no store: Apple's rules keep the purchase in the iPhone app, and the web page only shows the plan the account holds.
 * The same names as store.ts, so that nothing of RevenueCat's SDK is in the web bundle.
 */
import { StoreUnavailableError } from '@/lib/store-errors';

export type StorePrice = { text: string; amount: number; currency: string };
export type StorePackages = Partial<Record<'month' | 'year', never>>;
export type StorePlan = 'pro' | 'studio';

export const storeAvailable = () => false;
export const identifyStore = async (userId: string): Promise<void> => void userId;
export const forgetStore = async (): Promise<void> => undefined;
export const storePackages = async (plan: StorePlan = 'pro'): Promise<StorePackages> => {
  void plan;
  return {};
};
export const priceOf = (item: undefined): StorePrice | undefined => item;
export const buyPackage = async (item: never, userId: string): Promise<void> => {
  void item;
  void userId;
  throw new StoreUnavailableError();
};
export const restoreStore = async (userId: string): Promise<void> => {
  void userId;
  throw new StoreUnavailableError();
};
