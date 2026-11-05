import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import AppShell from '@/components/app-shell';
import DueReminders from '@/components/due-reminders';
import { colors } from '@/components/ui/colors';
import KeyboardWarmUp from '@/components/ui/keyboard-warm-up';
import { useAuth } from '@/lib/auth';
import { useIsWide } from '@/lib/layout';

// Everything here needs a signed-in user: the guard is in the root layout. A new account has to finish
// the setup (name, currency, tension unit, time zone) before it gets to the app.
export default function AppLayout() {
  const { user } = useAuth();
  const setupDone = !!user?.setup_completed;
  const wide = useIsWide();

  return (
    <>
      {/* The app is light, and so is the frosted header over it: dark clock and battery. */}
      <StatusBar style="dark" />
      {setupDone ? <DueReminders /> : null}
      {setupDone ? <KeyboardWarmUp /> : null}
      {/* On a wide screen the pages stand in a pane beside the sidebar; on the phone this is nothing (see AppShell). */}
      <AppShell sidebar={setupDone}>
      <Stack
      screenOptions={{
        headerShown: false,
        // Pages cross-fade, fast: no sliding. (The duration applies on iOS; Android's fade is short already.)
        animation: 'fade',
        animationDuration: 120,
        contentStyle: { backgroundColor: '#f4f5f6' },
      }}>
      <Stack.Protected guard={setupDone} redirectTo="/setup">
        {/* Dark behind the tabs: it shows around the rounded corners of the page and under the navigation. (A wide screen has the
            sidebar instead, and the pane is light all the way.) */}
        <Stack.Screen name="(tabs)" options={{ contentStyle: { backgroundColor: wide ? colors.surface : colors.chrome } }} />
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
        {/* The changes that have not reached the server: opened from the mark in the headers and from Settings. */}
        <Stack.Screen name="sync" options={{ animation: 'default', gestureEnabled: true }} />
      </Stack.Protected>
      <Stack.Protected guard={!setupDone} redirectTo="/home">
        <Stack.Screen name="setup" />
      </Stack.Protected>
      </Stack>
      </AppShell>
    </>
  );
}
