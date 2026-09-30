import '@/global.css';

import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Slot, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import Sidebar, { SIDEBAR_ITEMS } from '@/components/sidebar';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const pathname = usePathname();
  const activeItem = SIDEBAR_ITEMS.find((item) => item.href === pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarClosedFor, setSidebarClosedFor] = useState(pathname);
  if (pathname !== sidebarClosedFor) {
    setSidebarClosedFor(pathname);
    setSidebarOpen(false);
  }

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
      <View
        onLayout={onLayout}
        className="h-full w-full flex flex-row font-sans relative overflow-hidden">
        <Pressable
          onPress={() => setSidebarOpen(false)}
          className={`absolute inset-0 z-10 bg-black/40 transition-opacity duration-300 md:hidden ${
            sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        />
        <View
          className={`absolute inset-y-0 left-0 z-20 transition-transform duration-300 ease-out md:relative md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}>
          <Sidebar />
        </View>
        <View className="flex-1">
          <View className="w-full h-16 bg-white px-6 border-b-1 border-b-[#E1E1E1] flex-row items-center gap-3">
            <Pressable
              onPress={() => setSidebarOpen((open) => !open)}
              hitSlop={8}
              className="md:hidden">
              <Ionicons name="menu-outline" size={22} color="#000000" />
            </Pressable>
            <Text className="font-medium text-xl">{activeItem?.label ?? 'Systema'}</Text>
          </View>
          <Slot />
        </View>
      </View>
    </GestureHandlerRootView>
  );
}
