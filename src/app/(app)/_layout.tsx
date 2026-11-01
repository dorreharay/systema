import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import DueReminders from '@/components/due-reminders';
import { colors } from '@/components/ui/colors';
import { useAuth } from '@/lib/auth';

// Everything here needs a signed-in user: the guard is in the root layout. A new account has to finish
// the setup (name, currency, tension unit, time zone) before it gets to the app.
export default function AppLayout() {
  const { user } = useAuth();
  const setupDone = !!user?.setup_completed;

  return (
    <>
      {/* The app is light, and so is the frosted header over it: dark clock and battery. */}
      <StatusBar style="dark" />
      {setupDone ? <DueReminders /> : null}
      <Stack
      screenOptions={{
        headerShown: false,
        // Pages cross-fade, fast: no sliding. (The duration applies on iOS; Android's fade is short already.)
        animation: 'fade',
        animationDuration: 120,
        contentStyle: { backgroundColor: '#f4f5f6' },
      }}>
      <Stack.Protected guard={setupDone} redirectTo="/setup">
        {/* Dark behind the tabs: it shows around the rounded corners of the page and under the navigation. */}
        <Stack.Screen name="(tabs)" options={{ contentStyle: { backgroundColor: colors.chrome } }} />
        <Stack.Screen name="orders/new" />
        <Stack.Screen name="orders/[id]/index" />
        <Stack.Screen name="orders/[id]/edit" />
        <Stack.Screen name="clients/[id]" />
        <Stack.Screen name="rackets/[id]" />
        <Stack.Screen name="settings/services" />
      </Stack.Protected>
      <Stack.Protected guard={!setupDone} redirectTo="/home">
        <Stack.Screen name="setup" />
      </Stack.Protected>
      </Stack>
    </>
  );
}
