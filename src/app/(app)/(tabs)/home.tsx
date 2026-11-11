import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeInsights from '@/components/home-insights';
import LockedInsights from '@/components/locked-insights';
import CatalogIcon from '@/components/icons/catalog-icon';
import PlusIcon from '@/components/icons/plus-icon';
import PlanStrip from '@/components/plan-strip';
import SyncPill from '@/components/sync-pill';
import UserIcon from '@/components/icons/user-icon';
import { colors } from '@/components/ui/colors';
import { PAGE_CONTENT } from '@/components/ui/page';
import { SURFACE_EDGE } from '@/components/ui/paper';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { useI18n, type TKey } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';
import { useDashboard } from '@/lib/queries';
import { useSubscription } from '@/lib/use-subscription';

/** The hour where the stringer is, so the greeting matches their morning and not the server's. */
function hourIn(timeZone: string | undefined) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date())
      .find((p) => p.type === 'hour');
    if (part) return Number(part.value) % 24;
  } catch {
    // an unknown time zone: use the device's clock
  }
  return new Date().getHours();
}

function greetingKey(hour: number): TKey {
  if (hour < 5) return 'greeting_night';
  if (hour < 12) return 'greeting_morning';
  if (hour < 18) return 'greeting_afternoon';
  return 'greeting_evening';
}

type StatProps = {
  value: number | undefined;
  failed: boolean;
  label: string;
  onPress?: () => void;
  // The room of the number, where it is not the one of a third of the row (on a wide page it is a card of its own).
  className?: string;
  // Not a button: a number to read (on a wide page, where the pointer would say that it can be pressed).
  inert?: boolean;
};

// One third of the row of numbers: each of them presses on its own. The number and its name are in the middle of the
// third, so that the dividers are the same distance from what stands on both sides of them.
function Stat({ value, failed, label, onPress, className = 'flex-1 px-3 py-3', inert }: StatProps) {
  const content = (
    <>
      {value === undefined && !failed ? (
        <Skeleton className="my-1 h-7 w-10" />
      ) : (
        <Text className="text-[28.6px] font-semibold text-primary">{value ?? '-'}</Text>
      )}
      <Text className="text-center text-[13.2px] leading-4 text-muted" numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </>
  );

  if (inert) {
    return (
      <View accessible accessibilityLabel={`${label}: ${value ?? ''}`} className={`items-center gap-1 ${className}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? ''}`}
      onPress={onPress}
      className={`items-center gap-1 ${className}`}>
      {content}
    </Pressable>
  );
}

function StatDivider() {
  return <View className="my-3 w-px bg-line" />;
}

// A way into a part of the app that is not in the navigation bar: half the width of the page. Its
// corners are those of the container it is in (see Screen).
const SHORTCUT_SIZE = 'flex-1 px-8 py-6';

export default function Home() {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dashboard = useDashboard();
  const plan = useSubscription();
  const data = dashboard.data;

  const firstName = user?.full_name?.trim().split(/\s+/)[0];
  const greeting = t(greetingKey(hourIn(user?.timezone)));
  const wide = useIsWide();

  // A wide page: the numbers as three cards over the three cards of the insights; the way to the clients, the stock and a new order is
  // the sidebar's, so there is no dock.
  if (wide) {
    const numbers: { value: number | undefined; label: string }[] = [
      { value: data?.active_orders, label: t('stat_active') },
      { value: data?.ready_for_pickup, label: t('stat_ready') },
      { value: data?.completed_this_month, label: t('stat_completed_month') },
    ];

    return (
      <Screen width="wide" wideDock={false}>
        <ScreenHeader title={t('tab_home')} />
        <ScrollView
          bounces={false}
          overScrollMode="never"
          contentContainerClassName={`${PAGE_CONTENT} gap-4 pb-12`}>
          {dashboard.isError && !data ? (
            <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
          ) : (
            <>
              {/* Where the plan limits the orders: how much of the month is used. */}
              <PlanStrip framed />
              <View className="flex-row gap-4">
                {numbers.map((number) => (
                  <View key={number.label} className={`min-w-0 flex-1 overflow-hidden rounded-[18px] bg-white ${SURFACE_EDGE}`}>
                    <Stat
                      inert
                      value={number.value}
                      failed={dashboard.isError}
                      label={number.label}
                      className="px-4 py-5"
                    />
                  </View>
                ))}
              </View>
              {/* The charts of the month are Pro's: Free has a place for them that says so. */}
              {plan.entitlements.month_overview ? <HomeInsights /> : <LockedInsights />}
            </>
          )}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen
      logo
      // Set apart from the orders, in a container of its own: they scroll above it, it is always there.
      dock={
        <View className="flex-row flex-wrap gap-1">
          <Shortcut
            icon={PlusIcon}
            label={t('new_order')}
            color={colors.newOrder}
            contentColor="#000000"
            className="px-5 py-5 w-full"
            onPress={() => router.push('/orders/new')}
          />
          <View className="flex-row gap-1 w-full">
            <Shortcut
              icon={UserIcon}
              label={t('tab_clients')}
              color={colors.clients}
              className={SHORTCUT_SIZE}
              onPress={() => router.navigate('/clients')}
            />
            <Shortcut
              icon={() => <CatalogIcon size={24} />}
              label={t('tab_catalog')}
              color={colors.catalog}
              className={SHORTCUT_SIZE}
              onPress={() => router.navigate('/catalog')}
            />
          </View>
        </View>
      }
    >
      {/* The home page has the logo where other pages have a title: the mark of the queue (see SyncPill) stands in line with it. */}
      <View pointerEvents="box-none" className="absolute z-10" style={{ right: 16, top: insets.top + 6 }}>
        <SyncPill />
      </View>

      {/* All of the page, from under the logo to the shortcuts, is in one white block, rounded at the top and at the
          foot (the radius of the containers it sits among: see Screen), on the colour of the page. It runs from edge to edge of
          the screen, with no gutter at the sides (the cards of the other pages have one: BLOCK_SHAPE in card.tsx). */}
      <View className={`flex-1 overflow-hidden rounded-[18px] bg-white ${SURFACE_EDGE}`}>
        {/* The numbers rest at the foot of the page, just above the shortcuts; the insights fill the room above them.
            On a screen too short for both, the page scrolls instead of squeezing the insights. */}
        <ScrollView
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          // (With the strip of the plan at the top of the block, it is the block's own top and the page's gap is not added above it.)
          contentContainerClassName={plan.usage ? 'grow pb-page' : 'grow py-page'}>
          {/* Where the plan limits the orders: how much of the month is used, at the top of the block. */}
          <PlanStrip />
          {/* When the numbers cannot be loaded, the retry takes the place of the insights: both need the same connection. */}
          {dashboard.isError && !data ? (
            <View className="flex-1 justify-center">
              <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
            </View>
          ) : plan.entitlements.month_overview ? (
            <HomeInsights />
          ) : (
            // The charts of the month are Pro's: Free has a place for them that says so.
            <LockedInsights />
          )}

          {/* The three thirds are equal. */}
          <View className="flex-row">
            <Stat
              value={data?.active_orders}
              failed={dashboard.isError}
              label={t('stat_active')}
            />
            <StatDivider />
            <Stat
              value={data?.ready_for_pickup}
              failed={dashboard.isError}
              label={t('stat_ready')}
            />
            <StatDivider />
            <Stat
              value={data?.completed_this_month}
              failed={dashboard.isError}
              label={t('stat_completed_month')}
            />
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}
