import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import HomeInsights from '@/components/home-insights';
import CatalogIcon from '@/components/icons/catalog-icon';
import PlusIcon from '@/components/icons/plus-icon';
import UserIcon from '@/components/icons/user-icon';
import { colors } from '@/components/ui/colors';
import { Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { useI18n, type TKey } from '@/lib/i18n';
import { useDashboard } from '@/lib/queries';

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

type StatProps = { value: number | undefined; failed: boolean; label: string; onPress?: () => void };

// One third of the row of numbers: each of them presses on its own. The number and its name are in the middle of the
// third, so that the dividers are the same distance from what stands on both sides of them.
function Stat({ value, failed, label, onPress }: StatProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? ''}`}
      onPress={onPress}
      className="flex-1 items-center gap-1 px-3 py-3">
      {value === undefined && !failed ? (
        <Skeleton className="my-1 h-7 w-10" />
      ) : (
        <Text className="text-[28.6px] font-semibold text-primary">{value ?? '—'}</Text>
      )}
      <Text className="text-center text-[13.2px] leading-4 text-muted" numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
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
  const dashboard = useDashboard();
  const data = dashboard.data;

  const firstName = user?.full_name?.trim().split(/\s+/)[0];
  const greeting = t(greetingKey(hourIn(user?.timezone)));

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
              icon={() => <CatalogIcon size={28} />}
              label={t('tab_catalog')}
              color={colors.catalog}
              className={SHORTCUT_SIZE}
              onPress={() => router.navigate('/catalog')}
            />
          </View>
        </View>
      }
    >
      {/* The numbers rest at the foot of the page, just above the shortcuts; the insights fill the room above them.
          On a screen too short for both, the page scrolls instead of squeezing the insights. */}
      <ScrollView
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow p-page">
        {/* When the numbers cannot be loaded, the retry takes the place of the insights: both need the same connection. */}
        {dashboard.isError && !data ? (
          <View className="flex-1 justify-center">
            <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
          </View>
        ) : (
          <HomeInsights />
        )}

        {/* Edge to edge: it takes back the margin of the page, and the three thirds are equal. */}
        <View className="-mx-page flex-row">
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
    </Screen>
  );
}
