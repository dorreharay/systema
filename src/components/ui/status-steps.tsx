import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { colors, statusColors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/types';

const DOT = 28;
const LINE = 3;

/**
 * Where an order is on its way, as steps: the ones behind it are ticked, the one it is at is filled with the colour of
 * its status, with its number in white, and the ones ahead have theirs. A handed-over order has every step ticked.
 */
export default function StatusSteps({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const current = ORDER_STATUSES.indexOf(status);
  const finished = status === 'completed';

  return (
    <View
      accessible
      accessibilityLabel={t('order_status_label', { status: t(`status_${status}`) })}
      className="flex-row py-4">
      {ORDER_STATUSES.map((step, index) => {
        const done = index < current || finished;
        const here = index === current && !finished;
        const color = statusColors[step];
        // A line between two steps is solid once the order has got past the first of them. The one that leads to the
        // step the order is at has the colour of that step; the ones further back are green.
        const reached = (to: number) => to <= current;
        const lineColor = (to: number) =>
          !reached(to) ? colors.line : to === current && !finished ? statusColors[ORDER_STATUSES[to]].solid : colors.primary;

        return (
          <View key={step} className="flex-1 items-center gap-2">
            <View className="w-full items-center justify-center" style={{ height: DOT }}>
              {index > 0 ? (
                <View
                  className="absolute left-0 right-1/2"
                  style={{ height: LINE, backgroundColor: lineColor(index) }}
                />
              ) : null}
              {index < ORDER_STATUSES.length - 1 ? (
                <View
                  className="absolute left-1/2 right-0"
                  style={{ height: LINE, backgroundColor: lineColor(index + 1) }}
                />
              ) : null}
              {done ? (
                <View
                  className="items-center justify-center rounded-full"
                  style={{ width: DOT, height: DOT, backgroundColor: colors.primary }}>
                  <Check size={16} color={colors.white} strokeWidth={3} />
                </View>
              ) : here ? (
                <View
                  className="items-center justify-center rounded-full"
                  style={{ width: DOT, height: DOT, backgroundColor: color.solid }}>
                  <Text className="text-[13px] font-semibold text-white">{index + 1}</Text>
                </View>
              ) : (
                <View
                  className="items-center justify-center rounded-full bg-white"
                  style={{ width: DOT, height: DOT, borderWidth: 2, borderColor: colors.line }}>
                  <Text className="text-[13px] font-medium text-muted">{index + 1}</Text>
                </View>
              )}
            </View>
            <Text
              numberOfLines={2}
              className={`text-center text-[14px] ${
                here ? 'font-semibold text-ink' : done ? 'font-medium text-ink' : 'text-muted'
              }`}>
              {t(`status_${step}`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
