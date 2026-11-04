import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import AuthBackground from '@/components/auth-background';
import AuthScrim from '@/components/auth-scrim';

// The stack paints its screens with the theme background; make it transparent so the photo
// shows through.
const TRANSPARENT_THEME = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent' },
};

// What every layout of screens that stand on the photo has in common (the sign-in screens, and the page of the password
// reset link): the photo and the dark bottom of it stay in place while the content of the screens fades in and out over
// them. The shade over the upper part of a form is the screen's own. `children` are the `Stack.Screen`s that have options
// of their own.
export default function AuthShell({ children }: { children?: ReactNode }) {
  return (
    <View className="flex-1">
      <StatusBar style="light" />
      <AuthBackground />
      <AuthScrim />
      <ThemeProvider value={TRANSPARENT_THEME}>
        <Stack
          screenOptions={{
            headerShown: false,
            // The screens animate their own content, see AuthLayout.
            animation: 'none',
            gestureEnabled: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}>
          {children}
        </Stack>
      </ThemeProvider>
    </View>
  );
}
