import { useEffect } from 'react';

import { useAuth } from '@/lib/auth';
import { forgetStore, identifyStore, storeAvailable } from '@/lib/store';

/**
 * Tells the store whose purchases these are while an account is signed in (the account's id is the customer's id in RevenueCat, which is
 * how the server finds what was bought), and lets go of it when the account signs out. It draws nothing, and does nothing where there is
 * no store (the web, a build without the SDK or its key).
 */
export default function StoreIdentity() {
  const { user } = useAuth();
  const id = user?.id;

  useEffect(() => {
    if (!id || !storeAvailable()) return;
    void identifyStore(id).catch(() => undefined);
    return () => {
      void forgetStore();
    };
  }, [id]);

  return null;
}
