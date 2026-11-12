import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { joinCodeOf } from '@/lib/pending-join';
import { pendingJoin } from '@/lib/pending-join-app';

// The link of an invitation (`/join?code=ABCDE-FGHJK`) opened by someone who cannot get to that page yet. The guards of the root layout and of the
// app layout turn such a link away to the page the person is due at (the welcome screen, the code of the email, the setup, the offer) and
// the code is gone with it. These two keep it: one remembers it while the link is turned away, the other opens the page with it once the
// person is let in. They are components of their own, drawing nothing, so that the route hooks they use do not draw the layouts again with
// every move of the navigation.

/**
 * Remembers the code of an invitation link while it is being turned away (`turnedAway`: the guard that stands in front of /join is
 * closed). A link opened by someone who can use it is left alone. Put it in each layout that has such a guard.
 */
export function JoinLinkKeeper({ turnedAway }: { turnedAway: boolean }) {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ code?: string | string[] }>();
  const code = joinCodeOf(params.code);

  useEffect(() => {
    if (turnedAway && pathname === '/join' && code) void pendingJoin.remember(code);
  }, [turnedAway, pathname, code]);

  return null;
}

/**
 * Once the person is let in to the app (`ready`: signed in, address confirmed, setup done, the offer answered), opens the page of joining
 * with the code that was remembered, and forgets it: it is taken out of the storage in the same step, so it is used once.
 */
export function PendingJoinOpener({ ready }: { ready: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    // (Not cancelled when the effect runs again: the code is taken out of the storage by the first run, and a second one finds nothing.)
    void pendingJoin.take().then((code) => {
      if (code) router.push({ pathname: '/join', params: { code } });
    });
  }, [ready, router]);

  return null;
}
