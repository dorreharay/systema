import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { View } from 'react-native';

import AuthBackground from '@/components/auth-background';
import AuthScrim from '@/components/auth-scrim';

// The stack paints its screens with the theme background; make it transparent so the photo
// shows through.
const TRANSPARENT_THEME = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent' },
};

// The photo and its shade stay in place while the content of the welcome, login and register
// screens fades in and out over them.
export default function AuthGroupLayout() {
  return (
    <View className="flex-1">
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
          }}
        />
      </ThemeProvider>
    </View>
  );
}
