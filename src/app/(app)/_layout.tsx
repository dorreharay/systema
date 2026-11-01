import { Stack } from 'expo-router';

// Everything here needs a signed-in user: the guard is in the root layout.
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
