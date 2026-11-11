import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { getItem, setItem } from '@/lib/local-storage';

// Whether this person has been shown the offer of the plans (the screen after the first-run setup), and said what they wanted with it. It is
// kept on the device, one answer for each account that has used it, and read once; the app layout and the offer screen share the answer.

const keyOf = (userId: string) => `offer_seen_${userId}`;

// The answers read so far. An account that is not in it has not been read yet.
let known: ReadonlyMap<string, boolean> = new Map();
const listeners = new Set<() => void>();

function remember(userId: string, seen: boolean) {
  known = new Map(known).set(userId, seen);
  for (const listener of [...listeners]) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Whether the offer was shown to this account: `loaded` is false until the device has been asked. `markSeen` records that it was. */
export function useOfferSeen(userId: string | undefined) {
  const answers = useSyncExternalStore(subscribe, () => known, () => known);

  useEffect(() => {
    if (!userId || answers.has(userId)) return;
    void getItem(keyOf(userId)).then((value) => {
      if (!known.has(userId)) remember(userId, value === '1');
    });
  }, [userId, answers]);

  const markSeen = useCallback(() => {
    if (!userId) return;
    remember(userId, true);
    void setItem(keyOf(userId), '1');
  }, [userId]);

  return { loaded: !!userId && answers.has(userId), seen: !!userId && answers.get(userId) === true, markSeen };
}
