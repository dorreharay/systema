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
    'EuclidCircularA-Light': require('@/assets/fonts/EuclidCircularA-Light.ttf'),
    'EuclidCircularA-Regular': require('@/assets/fonts/EuclidCircularA-Regular.ttf'),
    'EuclidCircularA-Medium': require('@/assets/fonts/EuclidCircularA-Medium.ttf'),
    'EuclidCircularA-SemiBold': require('@/assets/fonts/EuclidCircularA-SemiBold.ttf'),
    'EuclidCircularA-Bold': require('@/assets/fonts/EuclidCircularA-Bold.ttf'),
    'EuclidCircularA-Italic': require('@/assets/fonts/EuclidCircularA-Italic.ttf'),
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
