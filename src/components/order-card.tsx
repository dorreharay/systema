import { CalendarDays, TriangleAlert } from 'lucide-react-native';
import { View } from 'react-native';

import { StatusBadge } from '@/components/ui/badge';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { addDays, formatDate, formatMoney, isOverdue, racketName, todayIso } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { describeSetup } from '@/lib/order-text';
import type { Order } from '@/lib/types';

/** "Today", "Tomorrow" or the date; "No due date" when none was set. */
export function useDueText() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const today = todayIso(user?.timezone);
  return {
    today,
    dueText: (iso: string | null) => {
      if (!iso) return t('order_no_due_date');
      if (iso === today) return t('date_today');
      if (iso === addDays(today, 1)) return t('date_tomorrow');
      return formatDate(iso, language, today);
    },
  };
}

type OrderCardProps = { order: Order; onPress: () => void };

// The line above the name says where the order stands (the status, as a badge) and when it is due, red when it is late. Then who it is for and what it costs, and what is being strung; the numbers, the price
// and the number to quote, are in a column on the right.
export default function OrderCard({ order, onPress }: OrderCardProps) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { today, dueText } = useDueText();
  const overdue = isOverdue(order, today);
  const done = order.status === 'completed';

  return (
    <Card
      onPress={onPress}
      className="gap-1"
      accessibilityLabel={t('order_card_label', { number: order.number, client: order.client.name })}>
      <View className="flex-row items-center justify-between gap-3">
        <StatusBadge status={order.status} />
        {done ? null : (
          <View className="min-w-0 shrink flex-row items-center gap-1.5">
            {overdue ? (
              <TriangleAlert size={15} color={colors.danger} />
            ) : (
              <CalendarDays size={15} color={colors.muted} />
            )}
            <Text
              className={`shrink text-[14.3px] ${overdue ? 'font-semibold text-danger' : 'text-muted'}`}
              numberOfLines={1}>
              {overdue
                ? t('order_overdue_since', { date: dueText(order.due_date) })
                : order.due_date
                  ? t('order_due', { date: dueText(order.due_date) })
                  : t('order_no_due_date')}
            </Text>
          </View>
        )}
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
        <Text className="text-[14.3px] text-muted">{t('order_number', { number: order.number })}</Text>
      </View>
      <Text className="text-[15.4px] text-muted" numberOfLines={2}>
        {describeSetup(order, user?.tension_unit ?? 'kg', t)}
      </Text>
    </Card>
  );
}
