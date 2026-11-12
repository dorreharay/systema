import '@/global.css';
import '@/lib/web-styles';

import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Image, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppHeader from '@/components/app-header';
import { JoinLinkKeeper } from '@/components/join-link';
import { ConfirmProvider } from '@/components/ui/confirm';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { emailConfirmed } from '@/lib/auth-api';
import { I18nProvider } from '@/lib/i18n';
import { OfflineProvider } from '@/lib/offline/react';
import { queryClient } from '@/lib/query-client';

SplashScreen.preventAutoHideAsync();

// A font the native build already embeds (the expo-font plugin in app.json) is never read from here: it is known to the phone by name.
// One it does not embed yet (a build older than the list in app.json) is loaded from its file at run time, and expo-asset 58 cannot
// find that file from the module id on the phone: it reads `AssetRegistry` from 'react-native', which React Native 0.88 does not
// export ("Cannot read property 'getAssetByID' of undefined"). So on the phone React Native itself is asked where the file is.
// The web keeps the module id.
const font = (module: number) => {
  const uri = Platform.OS === 'web' ? undefined : Image.resolveAssetSource(module)?.uri;
  return uri ? { uri } : module;
};

const FONTS = {
  'EuclidCircularA-Light': font(require('@/assets/fonts/EuclidCircularA-Light.ttf')),
  'EuclidCircularA-Regular': font(require('@/assets/fonts/EuclidCircularA-Regular.ttf')),
  'EuclidCircularA-Medium': font(require('@/assets/fonts/EuclidCircularA-Medium.ttf')),
  'EuclidCircularA-SemiBold': font(require('@/assets/fonts/EuclidCircularA-SemiBold.ttf')),
  'EuclidCircularA-Bold': font(require('@/assets/fonts/EuclidCircularA-Bold.ttf')),
  'EuclidCircularA-Italic': font(require('@/assets/fonts/EuclidCircularA-Italic.ttf')),
  'FixelStylistic-Bold': font(require('@/assets/fonts/FixelStylistic-Bold.ttf')),
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONTS);

  if (fontError) {
    // A font that cannot be loaded must not keep the app on the splash screen for good: the text is drawn in the system font instead.
    console.warn('[fonts] could not load a font:', fontError);
  }
  if (!fontsLoaded && !fontError) {
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
  const { status, user } = useAuth();
  const signedIn = status === 'signedIn';
  const ready = status !== 'loading';
  // An account made with an email and a password has to confirm the address with the code that was emailed before it gets to the app
  // (the server asks for it in production only): until then it has the screen for the code and nothing else.
  const confirmed = emailConfirmed(user);
  const inApp = signedIn && confirmed;
  const askForCode = signedIn && !confirmed;

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
      {/* The link of an invitation to a workshop (/join?code=ABCDE-FGHJK) opened before the person is in the app is turned away by the guards
          below, and the code with it: this keeps it for after the sign-in (see components/join-link.tsx). */}
      <JoinLinkKeeper turnedAway={!inApp} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: '#FFF' },
        }}>
        <Stack.Protected guard={!signedIn} redirectTo={confirmed ? '/home' : '/confirm-email'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={inApp} redirectTo={signedIn ? '/confirm-email' : '/'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={askForCode} redirectTo={signedIn ? '/home' : '/'}>
          <Stack.Screen name="(confirm)" />
        </Stack.Protected>
        {/* The page of the password reset link opens for a signed-in person too (they can ask for the link in Settings),
            so it is in neither of the groups above. It signs them out once the password is changed. */}
        <Stack.Screen name="(reset)" />
      </Stack>
    </View>
  );
}
