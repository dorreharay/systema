import { useState } from 'react';

import { useAuth } from '@/lib/auth';
import { joinStudioWaitlist, leaveStudioWaitlist } from '@/lib/billing';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

/**
 * Asking to be told when Studio is there, and taking that back. Both need the server (a list that lives on the phone would tell nobody
 * anything). The words for what goes wrong are returned, not shown: the screen shows them where the person is looking.
 */
export function useStudioWaitlist() {
  const { token, setUser } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const run = async (action: typeof joinStudioWaitlist) => {
    if (busy || !token) return;
    setBusy(true);
    setError(undefined);
    try {
      setUser(await action(token));
    } catch (reason) {
      setError(describeError(reason, t));
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, join: () => run(joinStudioWaitlist), leave: () => run(leaveStudioWaitlist) };
}
