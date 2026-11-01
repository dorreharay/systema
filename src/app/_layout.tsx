import '@/global.css';

import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'FixelText-Light': require('@/assets/fonts/FixelText-Light.ttf'),
    'FixelText-Regular': require('@/assets/fonts/FixelText-Regular.ttf'),
    'FixelText-Medium': require('@/assets/fonts/FixelText-Medium.ttf'),
    'FixelText-SemiBold': require('@/assets/fonts/FixelText-SemiBold.ttf'),
    'FixelText-Bold': require('@/assets/fonts/FixelText-Bold.ttf'),
  });

  const onLayout = useCallback(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View onLayout={onLayout} className="h-full w-full font-sans">
        <Slot />
      </View>
    </GestureHandlerRootView>
  );
}
