import { Tabs, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps, type ComponentType } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeIcon from '@/components/icons/home-icon';
import ListIcon from '@/components/icons/list-icon';
import SettingsIcon from '@/components/icons/settings-icon';
import { colors } from '@/components/ui/colors';
import { useI18n } from '@/lib/i18n';
import { useKeyboardHeight } from '@/lib/use-keyboard';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// The three places that are in the bar. (Clients and the catalog are opened from the home screen, over
// the bar: they show it again themselves, see StackNavBar.)
type NavIcon = ComponentType<{ size?: number; color?: string }>;

const ICONS: Record<string, NavIcon> = {
  home: HomeIcon,
  orders: ListIcon,
  settings: SettingsIcon,
};

const PILL_WIDTH = 100;
const PILL_HEIGHT = 45;
const BAR_HEIGHT = 60;
// The distance between the tabs, as a share of an even spread: 1 fills the bar, less gathers them towards the middle.
const SPREAD = 1;
// From the page above down to the top of the pill (it was 23.5, then 21, now ten percent less again).
const GAP_ABOVE_PILL = 14;
const MOVE_MS = 200;
const ICON_SIZE = 27;
// How far a tab reaches past its column to be pressed: up to the page, down into the room under the bar
// (the first and the last also to the edge of the screen), so that a thumb need not aim at the icon.
const HIT_ABOVE = 6;
const HIT_SIDE = 12;

/** A tab's icon: white, turning dark and a little larger as the light pill arrives under it. */
function TabIcon({ icon: Icon, focused }: { icon: NavIcon; focused: boolean }) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(focused ? 1 : 0, { duration: MOVE_MS }));
  }, [focused, progress]);

  const size = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.1 * progress.get() }] }));
  const light = useAnimatedStyle(() => ({ opacity: 1 - progress.get() }));
  const dark = useAnimatedStyle(() => ({ opacity: progress.get() }));

  return (
    <Animated.View style={[{ width: ICON_SIZE, height: ICON_SIZE }, size]}>
      <Animated.View className="absolute inset-0" style={light}>
        <Icon size={ICON_SIZE} color={colors.white} />
      </Animated.View>
      <Animated.View className="absolute inset-0" style={dark}>
        <Icon size={ICON_SIZE} color={colors.chrome} />
      </Animated.View>
    </Animated.View>
  );
}

type NavPlace = { key: string; name: string; label: string };

type NavBarProps = {
  places: NavPlace[];
  // The place that is lit; none when the page is not one of them.
  activeKey: string | undefined;
  onPress: (place: NavPlace) => void;
};

/**
 * The navigation: a dark band under the page, with an icon for each of the three places in equal columns.
 * The place you are on sits in a light pill that slides to the next one when you move. The page above is a light container with rounded bottom
 * corners (see the tabs layout).
 */
function NavBar({ places, activeKey, onPress }: NavBarProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  const activeIndex = places.findIndex((place) => place.key === activeKey);

  // The pill: where it is, and whether it shows (it does not on pages that are not in the bar).
  const [rowWidth, setRowWidth] = useState(0);
  const x = useSharedValue(0);
  const shown = useSharedValue(0);
  const placed = useRef(false);
  const inset = (rowWidth * (1 - SPREAD)) / 2;
  const column = (rowWidth * SPREAD) / places.length;
  // On a narrow screen the pill gives way a little, so it always stays inside the bar.
  const pillWidth = Math.min(PILL_WIDTH, rowWidth / places.length - 4);
  const target = inset + Math.max(activeIndex, 0) * column + (column - pillWidth) / 2;

  useEffect(() => {
    if (column === 0) return;
    if (!placed.current) {
      // The first time it is put in place, not slid there.
      placed.current = true;
      x.set(target);
      shown.set(activeIndex >= 0 ? 1 : 0);
      return;
    }
    x.set(withTiming(target, { duration: MOVE_MS, easing: Easing.out(Easing.cubic) }));
    shown.set(withTiming(activeIndex >= 0 ? 1 : 0, { duration: MOVE_MS }));
  }, [column, target, activeIndex, x, shown]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateX: x.get() }],
  }));

  if (keyboardHeight > 0) {
    return null;
  }

  return (
    <View
      className="px-3"
      // The colour is set here, not by a class, so the bar can never fall back to another one.
      style={{
        backgroundColor: colors.chrome,
        paddingTop: GAP_ABOVE_PILL - (BAR_HEIGHT - PILL_HEIGHT) / 2,
        paddingBottom: Math.max(insets.bottom, 12) + 8,
      }}>
      <View
        className="flex-row items-center"
        style={{ height: BAR_HEIGHT, paddingHorizontal: inset }}
        onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
        <Animated.View
          pointerEvents="none"
          className="absolute left-0 rounded-full bg-chrome-pill"
          style={[{ width: pillWidth, height: PILL_HEIGHT, top: (BAR_HEIGHT - PILL_HEIGHT) / 2 }, pillStyle]}
        />

        {places.map((place, index) => {
          const focused = place.key === activeKey;
          return (
            <Pressable
              key={place.key}
              hitSlop={{
                top: HIT_ABOVE,
                bottom: Math.max(insets.bottom, 12),
                left: index === 0 ? HIT_SIDE : 0,
                right: index === places.length - 1 ? HIT_SIDE : 0,
              }}
              accessibilityRole="tab"
              accessibilityLabel={place.label}
              accessibilityState={{ selected: focused }}
              onPress={() => onPress(place)}
              className="flex-1 items-center justify-center"
              style={{ height: BAR_HEIGHT }}>
              <TabIcon icon={ICONS[place.name]} focused={focused} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The navigation of the tabs: it follows the tab you are on, and moves between them. */
export default function AppTabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const places = state.routes
    .filter((route) => route.name in ICONS)
    .map((route) => ({
      key: route.key,
      name: route.name,
      label: descriptors[route.key].options.title ?? route.name,
    }));
  const activeKey = state.routes[state.index]?.key;

  return (
    <NavBar
      places={places}
      activeKey={activeKey}
      onPress={(place) => {
        const event = emitter.emit({ type: 'tabPress', target: place.key, canPreventDefault: true });
        if (place.key !== activeKey && !event.defaultPrevented) {
          navigateToTab(place.key);
        }
      }}
    />
  );
}

const HREFS = { home: '/home', orders: '/orders', settings: '/settings' } as const;

/**
 * The same navigation on a page that opens over the tabs, from the home screen (the clients, the catalog),
 * with Home lit: each place takes you back into the tabs.
 */
export function StackNavBar() {
  const router = useRouter();
  const { t } = useI18n();
  const places: NavPlace[] = [
    { key: 'home', name: 'home', label: t('tab_home') },
    { key: 'orders', name: 'orders', label: t('tab_orders') },
    { key: 'settings', name: 'settings', label: t('tab_settings') },
  ];

  return (
    <NavBar
      places={places}
      activeKey="home"
      onPress={(place) => router.navigate(HREFS[place.key as keyof typeof HREFS])}
    />
  );
}
