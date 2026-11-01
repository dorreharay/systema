import '@/global.css';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppHeader from '@/components/app-header';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'EuclidCircularA-Light': require('@/assets/fonts/EuclidCircularA-Light.ttf'),
    'EuclidCircularA-Regular': require('@/assets/fonts/EuclidCircularA-Regular.ttf'),
    'EuclidCircularA-Medium': require('@/assets/fonts/EuclidCircularA-Medium.ttf'),
    'EuclidCircularA-SemiBold': require('@/assets/fonts/EuclidCircularA-SemiBold.ttf'),
    'EuclidCircularA-Bold': require('@/assets/fonts/EuclidCircularA-Bold.ttf'),
    'EuclidCircularA-Italic': require('@/assets/fonts/EuclidCircularA-Italic.ttf'),
    'FixelStylistic-Bold': require('@/assets/fonts/FixelStylistic-Bold.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const ready = status !== 'loading';

  // The splash screen stays until the saved session has been checked, so the first screen is the
  // right one and the sign-in screens do not flash for someone who is signed in.
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <View className="h-full w-full bg-background font-sans">
      <AppHeader />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: '#0b1210' },
        }}>
        <Stack.Protected guard={!signedIn} redirectTo="/home">
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn} redirectTo="/">
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}
