import { useMemo } from 'react';

import { useAuth } from '@/lib/auth';
import { capabilitiesOf, personOf, type Capabilities } from '@/lib/workshop';

/** What the person at the phone may do in their workshop (see lib/workshop.ts). */
export function useWorkshop(): Capabilities {
  const { user } = useAuth();
  const workshop = user?.workshop;
  return useMemo(() => capabilitiesOf(workshop), [workshop]);
}

/** The person at the phone, as the orders name people. */
export function useSelf() {
  const { user } = useAuth();
  return useMemo(() => personOf(user), [user]);
}
