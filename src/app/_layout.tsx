import '@/global.css';
import '@/lib/web-styles';

import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppHeader from '@/components/app-header';
import { ConfirmProvider } from '@/components/ui/confirm';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { OfflineProvider } from '@/lib/offline/react';
import { queryClient } from '@/lib/query-client';

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
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OfflineProvider>
            <I18nProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <RootNavigator />
                </ConfirmProvider>
              </ToastProvider>
            </I18nProvider>
          </OfflineProvider>
        </AuthProvider>
      </QueryClientProvider>
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
      {/* The logo types itself out on every launch, then stays as the header over the pages (each
          page leaves room for it, see Screen) and over the photo of the sign-in screens. */}
      <AppHeader />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: '#FFF' },
        }}>
        <Stack.Protected guard={!signedIn} redirectTo="/home">
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn} redirectTo="/">
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        {/* The page of the password reset link opens for a signed-in person too (they can ask for the link in Settings),
            so it is in neither of the groups above. It signs them out once the password is changed. */}
        <Stack.Screen name="(reset)" />
      </Stack>
    </View>
  );
}
