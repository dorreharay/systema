import { useRouter } from 'expo-router';
import { Library, Users, type LucideIcon } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { Screen } from '@/components/ui/screen';
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

type StatProps = { value: number | undefined; failed: boolean; label: string; onPress: () => void };

function Stat({ value, failed, label, onPress }: StatProps) {
  return (
    <Card onPress={onPress} className="flex-1 gap-1 px-3 py-3" accessibilityLabel={`${label}: ${value ?? ''}`}>
      {value === undefined && !failed ? (
        <Skeleton className="my-1 h-7 w-10" />
      ) : (
        <Text className="text-[26px] font-semibold text-primary">{value ?? '—'}</Text>
      )}
      <Text className="text-[12px] leading-4 text-muted" numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Card>
  );
}

// The colours of the two shortcuts.
const CLIENTS_COLOR = '#F3D590';
const CATALOG_COLOR = '#CCE7AC';

type ShortcutProps = { icon: LucideIcon; label: string; color: string; onPress: () => void };

// A way into a part of the app that is not in the navigation bar: half the width of the page, and two
// thirds as tall as it is wide. Its corners are those of the container it is in (see Screen).
function Shortcut({ icon: Icon, label, color, onPress }: ShortcutProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ backgroundColor: color }}
      className=" flex-1 self-start gap-2 rounded-[24px] p-6 active:opacity-80">
      <View className="size-11 items-center justify-center rounded-full bg-white/30">
        <Icon size={22} color={colors.ink} />
      </View>
      <Text className="text-[19px] font-semibold text-primary" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

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
      // Set apart from the orders, in a container of its own: they scroll above it, it is always there.
      dock={
        <View className="flex-row gap-1">
          <Shortcut
            icon={Users}
            label={t('tab_clients')}
            color={CLIENTS_COLOR}
            onPress={() => router.navigate('/clients')}
          />
          <Shortcut
            icon={Library}
            label={t('tab_catalog')}
            color={CATALOG_COLOR}
            onPress={() => router.navigate('/catalog')}
          />
        </View>
      }>
      <ScrollView
        contentContainerClassName="gap-page pb-4"
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={dashboard.isRefetching && !dashboard.isLoading}
            onRefresh={() => void dashboard.refetch()}
            tintColor={colors.primary}
          />
        }>

        <View className="gap-page px-page">
          <View className="flex-row gap-3">
            <Stat
              value={data?.active_orders}
              failed={dashboard.isError}
              label={t('stat_active')}
              onPress={() => router.navigate({ pathname: '/orders', params: { status: 'active' } })}
            />
            <Stat
              value={data?.ready_for_pickup}
              failed={dashboard.isError}
              label={t('stat_ready')}
              onPress={() => router.navigate({ pathname: '/orders', params: { status: 'ready' } })}
            />
            <Stat
              value={data?.completed_this_month}
              failed={dashboard.isError}
              label={t('stat_completed_month')}
              onPress={() => router.navigate({ pathname: '/orders', params: { status: 'completed' } })}
            />
          </View>

          {/* The numbers above are all there is to load here, so a failure gets its retry here. */}
          {dashboard.isError && !data ? (
            <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
