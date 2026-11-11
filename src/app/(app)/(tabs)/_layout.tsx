import { Tabs } from 'expo-router';

import AppTabBar from '@/components/app-tab-bar';
import { colors } from '@/components/ui/colors';
import { useI18n } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';

// How round the bottom of the page container is, where it meets the navigation.
const PAGE_RADIUS = 18;

// The three places of the navigation: home, orders, settings. Each page is a light container with
// rounded bottom corners, standing on the dark band that holds the navigation (see AppTabBar). The bar
// is hidden on the pages opened from here (an order, a client, the clients, the catalog, the order form)
// because those are in the stack above this one.
export default function TabsLayout() {
  const { t } = useI18n();
  // A wide screen has the sidebar (see AppShell) in place of the bar, and its pane has the rounded corners.
  const wide = useIsWide();

  return (
    <Tabs
      tabBar={(props) => (wide ? null : <AppTabBar {...props} />)}
      screenOptions={{
        headerShown: false,
        // Switching tabs is instant: the pill in the navigation is what moves.
        animation: 'none',
        sceneStyle: wide
          ? { backgroundColor: colors.page }
          : {
              backgroundColor: colors.page,
              borderBottomLeftRadius: PAGE_RADIUS,
              borderBottomRightRadius: PAGE_RADIUS,
              overflow: 'hidden',
            },
      }}>
      <Tabs.Screen name="home" options={{ title: t('tab_home') }} />
      <Tabs.Screen name="orders" options={{ title: t('tab_orders') }} />
      <Tabs.Screen name="settings" options={{ title: t('tab_settings') }} />
    </Tabs>
  );
}
