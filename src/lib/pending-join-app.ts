import { getItem, removeItem, setItem } from '@/lib/local-storage';
import { createPendingJoin } from '@/lib/pending-join';

/** The invitation code that waits for the person to be able to use it, kept on this device (see pending-join.ts). */
export const pendingJoin = createPendingJoin({ getItem, setItem, removeItem });
