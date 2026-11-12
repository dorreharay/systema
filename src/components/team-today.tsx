import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { PersonBadge } from '@/components/person-badge';
import { BLOCK_ROOM_X } from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { SURFACE_EDGE } from '@/components/ui/paper';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useQueueSummary } from '@/lib/queries';
import { useSelf, useWorkshop } from '@/lib/use-workshop';

// The home screen of a workshop with a team. Everything here is counted from the orders on the phone: no request, so it is the same
// offline. The owner has "Team today" (who has how much in hand, what waits in the queue, a way to the report); a master has the
// short "Mine / in the queue" in place of the money of the month, which is not theirs to see. Nothing in a workshop of one.

/** Opens the orders on a filter: the home screen leads to the queue and to a person's own orders. */
function useOpenOrders() {
  const router = useRouter();
  return (queue: 'mine' | 'none') => router.navigate({ pathname: '/orders', params: { queue } });
}

function ReportLink({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
      // (The route is made by the file `app/(app)/team-report.tsx`; the typed routes are written again by `expo start`.)
      onPress={() => router.push('/team-report' as Href)}
      className="hover:opacity-80 active:opacity-60">
      <Text className="text-[14.3px] font-semibold text-primary">{label}</Text>
    </Pressable>
  );
}

/** For the owner of a team: "Team today". */
export function TeamToday({ framed }: { framed?: boolean }) {
  const { t } = useI18n();
  const { team, role } = useWorkshop();
  const self = useSelf();
  const open = useOpenOrders();
  const shown = team && role === 'owner';
  const summary = useQueueSummary(self?.id, shown);
  const data = summary.data;
  if (!shown || !data) return null;

  const nobody = data.people.length === 0 && data.queue === 0;

  return (
    <View
      className={
        framed
          ? `overflow-hidden rounded-[18px] bg-white pb-2 pt-4 ${SURFACE_EDGE}`
          : 'border-b border-line pb-2 pt-1'
      }>
      <View className={`flex-row items-center justify-between gap-3 pb-2 ${BLOCK_ROOM_X}`}>
        <Text accessibilityRole="header" className="text-[15.4px] font-semibold">
          {t('team_today_title')}
        </Text>
        <ReportLink label={t('team_today_report')} />
      </View>

      {nobody ? <Text className={`pb-3 text-[14.3px] text-muted ${BLOCK_ROOM_X}`}>{t('team_today_nobody')}</Text> : null}

      {data.people.map(({ person, count }) => (
        <View key={person.id} className={`min-h-12 flex-row items-center gap-3 ${BLOCK_ROOM_X}`}>
          <PersonBadge person={person} size={32} />
          <Text className="min-w-0 flex-1 text-[16px] font-medium" numberOfLines={1}>
            {person.id === self?.id ? t('queue_you') : person.name}
          </Text>
          <Text className="text-[14.3px] text-muted">{t('team_today_in_work', { count })}</Text>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('queue_none')}: ${t('team_today_queue', { count: data.queue })}`}
        onPress={() => open('none')}
        className={`min-h-12 flex-row items-center gap-3 hover:bg-surface active:bg-surface ${BLOCK_ROOM_X}`}>
        <PersonBadge person={null} size={32} />
        <Text className="min-w-0 flex-1 text-[16px] font-medium" numberOfLines={1}>
          {t('queue_none')}
        </Text>
        <View
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: data.queue > 0 ? colors.clients : colors.surface }}>
          <Text className="text-[13.5px] font-semibold">{t('team_today_queue', { count: data.queue })}</Text>
        </View>
      </Pressable>
    </View>
  );
}

function Tile({ value, label, onPress }: { value: number; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      className="min-w-0 flex-1 items-center gap-1 rounded-[18px] bg-surface px-3 py-5 hover:opacity-90 active:opacity-80">
      <Text className="text-[34px] font-semibold text-primary">{value}</Text>
      <Text className="text-center text-[14px] leading-[18px] text-muted" numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Pressable>
  );
}

/** For a master: their own orders and the queue, in the place of the money of the month. */
export function MasterToday({ framed }: { framed?: boolean }) {
  const { t } = useI18n();
  const { team, role, canSeeReport } = useWorkshop();
  const self = useSelf();
  const open = useOpenOrders();
  const shown = team && role === 'master';
  const summary = useQueueSummary(self?.id, shown);
  const data = summary.data;
  if (!shown || !data) return <View className={framed ? '' : 'flex-1'} />;

  return (
    <View
      className={
        framed
          ? `gap-3 rounded-[18px] bg-white py-5 ${BLOCK_ROOM_X} ${SURFACE_EDGE}`
          : `min-h-[200px] flex-1 justify-center gap-3 ${BLOCK_ROOM_X}`
      }>
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="text-[15.4px] font-semibold">
          {t('team_today_title')}
        </Text>
        {canSeeReport ? <ReportLink label={t('report_title_mine')} /> : null}
      </View>
      <View className="flex-row gap-3">
        <Tile value={data.mine} label={t('queue_mine')} onPress={() => open('mine')} />
        <Tile value={data.queue} label={t('team_today_in_queue')} onPress={() => open('none')} />
      </View>
    </View>
  );
}
