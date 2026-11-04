import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import AuthBackground from '@/components/auth-background';
import AuthScrim from '@/components/auth-scrim';

// The stack paints its screens with the theme background; make it transparent so the photo
// shows through.
const TRANSPARENT_THEME = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent' },
};

// The photo and the dark bottom of it stay in place while the content of the welcome, login and register
// screens fades in and out over them. The shade over the upper part of a form is the screen's own.
export default function AuthGroupLayout() {
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
          {/* Sign in and sign up are one step from the welcome screen: swiping from the left edge goes back to it. */}
          <Stack.Screen name="login" options={{ gestureEnabled: true }} />
          <Stack.Screen name="register" options={{ gestureEnabled: true }} />
        </Stack>
      </ThemeProvider>
    </View>
  );
}
