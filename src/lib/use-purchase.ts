import { useState } from 'react';

import { ApiError } from '@/lib/api-error';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/auth-api';
import { purchasePlan, restorePurchases, StoreUnavailableError } from '@/lib/billing';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { StorePlan } from '@/lib/store';
import { PurchaseCancelledError, PurchaseNotSyncedError, PurchasePendingError } from '@/lib/store-errors';
import type { Period } from '@/lib/subscription';

// How long after a purchase the server could not read, the profile is asked for again: RevenueCat has usually told it by then.
const REREAD_MS = 6000;

/**
 * Buying Pro or Studio and restoring what was bought, with the words for what goes wrong. The words are returned and not shown: a sheet hides
 * a toast behind it, so whoever asked shows them where the person is looking.
 */
export function usePurchase() {
  const { token, user: account, setUser, refreshUser } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [error, setError] = useState<string | undefined>();

  /** What to tell the person; nothing for a person who closed the store's sheet. */
  const failure = (reason: unknown): string | undefined => {
    if (reason instanceof PurchaseCancelledError) return undefined;
    if (reason instanceof PurchasePendingError) return t('subscription_purchase_pending');
    if (reason instanceof PurchaseNotSyncedError) {
      setTimeout(() => void refreshUser(), REREAD_MS);
      return t('subscription_not_synced');
    }
    // The store is not in this build, or this server gives no plan by hand: nothing the person can do about either.
    return reason instanceof StoreUnavailableError || (reason instanceof ApiError && reason.status === 404)
      ? t('subscription_store_unavailable')
      : describeError(reason, t);
  };

  async function run(kind: 'buy' | 'restore', action: (token: string, userId: string) => Promise<User>) {
    if (busy || !token || !account) return null;
    setBusy(kind);
    setError(undefined);
    try {
      const user = await action(token, account.id);
      setUser(user);
      return user;
    } catch (reason) {
      setError(failure(reason));
      return null;
    } finally {
      setBusy(null);
    }
  }

  return {
    busy,
    error,
    clearError: () => setError(undefined),
    /**
     * Buys Pro (or, when asked, Studio) for the period (its free days come with a first subscription). True once the account holds a paid
     * plan, and, for Studio, the Studio plan itself (an account that held Pro already is a paid one before it buys).
     */
    buy: async (period: Period, plan: StorePlan = 'pro') => {
      const user = await run('buy', (current, id) => purchasePlan(current, plan, period, id));
      return !!user && (plan === 'studio' ? user.subscription?.plan === 'studio' : user.subscription?.plan !== 'free');
    },
    /** Asks the store for earlier purchases. The profile as the server then has it, or `null` when that could not be done. */
    restore: () => run('restore', restorePurchases),
  };
}
