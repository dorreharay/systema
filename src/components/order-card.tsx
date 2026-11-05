import { router } from 'expo-router';
import { memo } from 'react';
import { View } from 'react-native';

import { CalendarDays, Check, Clock } from '@/components/icons';
import SyncBadge from '@/components/sync-badge';
import { StatusBadge } from '@/components/ui/badge';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { addDays, formatDate, formatMoney, formatTimestamp, isOverdue, racketName, todayIso } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useMark } from '@/lib/offline/react';
import { describeSetup } from '@/lib/order-text';
import type { Order } from '@/lib/types';

// How many orders of a history (a client's, a racket's) its page opens with. Someone who comes often has many, and each is
// a card with a lot in it: all of them at once made the page open with a pause. The rest is one tap away.
export const HISTORY_SHOWN = 5;

/** A date as "Today", "Tomorrow" or the date; `dueText` is the same for a due date, "No due date" when none was set. */
export function useDueText() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const today = todayIso(user?.timezone);
  const dateText = (iso: string) => {
    if (iso === today) return t('date_today');
    if (iso === addDays(today, 1)) return t('date_tomorrow');
    return formatDate(iso, language, today);
  };
  return {
    today,
    dateText,
    dueText: (iso: string | null) => (iso ? dateText(iso) : t('order_no_due_date')),
  };
}

// The line above the name says where the order stands (the status, as a badge) and when it was received. Then who it is
// for and what it costs, and what is being strung; the numbers, the price and the number to quote, are in a column on
// the right. The last line is the day it is to be handed over (red when it is late), or, once it has been, the day it
// was; it is left out when there is no such day. A tap opens the order. A card changes only with its order, so a page
// with many of them (a letter typed in a search, a sheet opened) does not draw them all again.
const OrderCard = memo(function OrderCard({ order, fill }: { order: Order; fill?: boolean }) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { dateText, today } = useDueText();
  const mark = useMark(order.id);
  const handover = order.completed_at
    ? {
        text: t('order_card_issued', { date: formatTimestamp(order.completed_at, language, user?.timezone) }),
        late: false,
        issued: true,
      }
    : order.due_date
      ? {
          text: t('order_card_due', {
            date: `${dateText(order.due_date)}${order.due_time ? `, ${order.due_time}` : ''}`,
          }),
          late: isOverdue(order, today),
          issued: false,
        }
      : null;

  return (
    <Card
      onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
      className={`gap-1 ${fill ? 'flex-1' : ''}`}
      accessibilityLabel={t('order_card_label', { number: order.number ?? '—', client: order.client.name })}>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <StatusBadge status={order.status} />
          {mark ? <SyncBadge mark={mark} /> : null}
        </View>
        <View className="min-w-0 shrink flex-row items-center gap-1.5">
          <CalendarDays size={15} color={colors.muted} />
          <Text className="shrink text-[14.3px] text-muted" numberOfLines={1}>
            {t('order_received', { date: dateText(order.received_date) })}
          </Text>
        </View>
      </View>
      <View className="mt-2 flex-row items-baseline justify-between gap-3">
        <Text className="flex-1 text-[18.7px] font-semibold" numberOfLines={1}>
          {order.client.name}
        </Text>
        <Text className="text-[18.7px] font-semibold">
          {formatMoney(order.total, user?.currency ?? 'USD', language)}
        </Text>
      </View>
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="flex-1 text-[16.5px]" numberOfLines={1}>
          {racketName(order.racket)}
        </Text>
        <Text className="text-[14.3px] text-muted">{t('order_number', { number: order.number ?? '—' })}</Text>
      </View>
      <Text className="text-[15.4px] text-muted" numberOfLines={2}>
        {describeSetup(order, user?.tension_unit ?? 'kg', t)}
      </Text>
      {handover ? (
        <View className="mt-1 flex-row items-center gap-1.5">
          {handover.issued ? (
            <Check size={15} color={colors.muted} />
          ) : (
            <Clock size={15} color={handover.late ? colors.danger : colors.muted} />
          )}
          <Text className={`shrink text-[14.3px] ${handover.late ? 'text-danger' : 'text-muted'}`} numberOfLines={1}>
            {handover.text}
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

export default OrderCard;
