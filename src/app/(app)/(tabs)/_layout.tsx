import { Tabs } from 'expo-router';

import AppTabBar from '@/components/app-tab-bar';
import { colors } from '@/components/ui/colors';
import { useI18n } from '@/lib/i18n';

// How round the bottom of the page container is, where it meets the navigation.
const PAGE_RADIUS = 24;

// The main places of the app. Each page is a light container with rounded bottom corners, standing on
// the dark band that holds the navigation (see AppTabBar). Settings is a tab too, so it keeps its place
// in the navigation, but the bar does not show it. The bar is hidden on the pages opened from here (an
// order, a client, the order form) because those are in the stack above this one.
export default function TabsLayout() {
  const { t } = useI18n();

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Switching tabs is instant: the pill in the navigation is what moves.
        animation: 'none',
        sceneStyle: {
          backgroundColor: colors.surface,
          borderBottomLeftRadius: PAGE_RADIUS,
          borderBottomRightRadius: PAGE_RADIUS,
          overflow: 'hidden',
        },
      }}>
      <Tabs.Screen name="home" options={{ title: t('tab_home') }} />
      <Tabs.Screen name="orders" options={{ title: t('tab_orders') }} />
      <Tabs.Screen name="clients" options={{ title: t('tab_clients') }} />
      <Tabs.Screen name="catalog" options={{ title: t('tab_catalog') }} />
      <Tabs.Screen name="settings" options={{ title: t('tab_settings') }} />
    </Tabs>
  );
}
