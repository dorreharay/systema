import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import AppShell from '@/components/app-shell';
import DueReminders from '@/components/due-reminders';
import { JoinLinkKeeper, PendingJoinOpener } from '@/components/join-link';
import StoreIdentity from '@/components/store-identity';
import { colors } from '@/components/ui/colors';
import KeyboardWarmUp from '@/components/ui/keyboard-warm-up';
import { useAuth } from '@/lib/auth';
import { SELLS_PLANS } from '@/lib/billing';
import { useIsWide } from '@/lib/layout';
import { useOfferSeen } from '@/lib/offer';

// Everything here needs a signed-in user: the guard is in the root layout. A new account has to finish
// the setup (name, currency, tension unit, time zone) before it gets to the app, and then, where the server has plans on, is shown
// them once (the offer).
export default function AppLayout() {
  const { user } = useAuth();
  const setupDone = !!user?.setup_completed;
  const wide = useIsWide();
  // The offer is for a platform where a plan is bought (the iPhone: SELLS_PLANS), and is shown once to an account that the plans apply to and
  // that has no plan yet (not one that holds Pro, or that had it and lost it: that has its own page in Settings).
  const offer = useOfferSeen(user?.id);
  const subscription = user?.subscription;
  const offerNeeded =
    setupDone &&
    SELLS_PLANS &&
    !!subscription?.enabled &&
    subscription.plan === 'free' &&
    !subscription.expired &&
    offer.loaded &&
    !offer.seen;
  // Whether the pages of the app are open (the guard of most of the screens below). A link to join a workshop that was opened before they
  // were is kept and opened once they are, after the offer is answered or known not to be due (the offer is read from the device, and
  // until it has been the guard cannot tell).
  const pagesOpen = setupDone && !offerNeeded;

  return (
    <>
      {/* The app is light, and so is the frosted header over it: dark clock and battery. */}
      <StatusBar style="dark" />
      {/* Tells the store whose purchases these are (nothing where there is no store). */}
      <StoreIdentity />
      {setupDone ? <DueReminders /> : null}
      {setupDone ? <KeyboardWarmUp /> : null}
      <JoinLinkKeeper turnedAway={!pagesOpen} />
      <PendingJoinOpener ready={pagesOpen && offer.loaded} />
      {/* On a wide screen the pages stand in a pane beside the sidebar; on the phone this is nothing (see AppShell). */}
      <AppShell sidebar={pagesOpen}>
      <Stack
      screenOptions={{
        headerShown: false,
        // Pages cross-fade, fast: no sliding. (The duration applies on iOS; Android's fade is short already.)
        animation: 'fade',
        animationDuration: 120,
        contentStyle: { backgroundColor: colors.page },
      }}>
      <Stack.Protected guard={pagesOpen} redirectTo={setupDone ? '/offer' : '/setup'}>
        {/* Dark behind the tabs: it shows around the rounded corners of the page and under the navigation. (A wide screen has the
            sidebar instead, and the pane is light all the way.) */}
        <Stack.Screen name="(tabs)" options={{ contentStyle: { backgroundColor: wide ? colors.page : colors.chrome } }} />
        {/* Opened from the home screen, with no navigation: they come in from the side, as the platform
            does it, so that a swipe from the edge takes them away again. (A fade has no swipe back.) A new
            order is the same, and so is an order that is opened from a list. */}
        <Stack.Screen name="clients/index" options={{ animation: 'default', gestureEnabled: true }} />
        <Stack.Screen name="catalog" options={{ animation: 'default', gestureEnabled: true }} />
        <Stack.Screen name="orders/new" options={{ animation: 'default', gestureEnabled: true }} />
        <Stack.Screen name="orders/[id]/index" options={{ animation: 'default', gestureEnabled: true }} />
        <Stack.Screen name="orders/[id]/edit" />
        <Stack.Screen name="clients/[id]" />
        <Stack.Screen name="rackets/[id]" />
        <Stack.Screen name="settings/services" />
        {/* The plan of the account: opened from Settings, from the strip on the home page and from the sheet of the limit. */}
        <Stack.Screen name="subscription" options={{ animation: 'default', gestureEnabled: true }} />
        {/* What Studio will be, and the list to hear when it is there: opened from the card of Studio on the page of the subscription. */}
        <Stack.Screen name="studio" options={{ animation: 'default', gestureEnabled: true }} />
        {/* The people of a Studio workshop (opened from Settings, the sidebar and the page of Studio), and the page that takes the code of an
            invitation (Settings, or the link of the invitation). Neither exists where Studio does not. */}
        <Stack.Screen name="team" options={{ animation: 'default', gestureEnabled: true }} />
        <Stack.Screen name="join" options={{ animation: 'default', gestureEnabled: true }} />
        {/* The month by person (a Studio workshop's owner, and a master's own line): opened from the home screen. */}
        <Stack.Screen name="team-report" options={{ animation: 'default', gestureEnabled: true }} />
        {/* The changes that have not reached the server: opened from the mark in the headers and from Settings. */}
        <Stack.Screen name="sync" options={{ animation: 'default', gestureEnabled: true }} />
      </Stack.Protected>
      {/* The plans, offered once after the setup: nothing else of the app is open until the person has answered. */}
      <Stack.Protected guard={offerNeeded} redirectTo="/home">
        <Stack.Screen name="offer" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!setupDone} redirectTo="/home">
        <Stack.Screen name="setup" />
      </Stack.Protected>
      </Stack>
      </AppShell>
    </>
  );
}
