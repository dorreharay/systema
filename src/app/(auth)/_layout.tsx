import { Stack } from 'expo-router';

import AuthShell from '@/components/auth-shell';

// The sign-in screens, for a person who is signed out (the root layout guards the group). The photo stays in place while the
// content of the welcome, login and register screens fades in and out over it, see AuthShell.
export default function AuthGroupLayout() {
  return (
    <AuthShell>
      {/* Sign in and sign up are one step from the welcome screen: swiping from the left edge goes back to it. */}
      <Stack.Screen name="login" options={{ gestureEnabled: true }} />
      <Stack.Screen name="register" options={{ gestureEnabled: true }} />
    </AuthShell>
  );
}
