import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { colors, statusButton } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/types';

const DOT = 28;
const LINE = 3;

/**
 * Where an order is on its way, as steps: the ones behind it are ticked, the one it is at is ringed in the colour of
 * its status, the ones ahead are empty. A handed-over order has every step ticked.
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
        const ring = statusButton[step];
        // A line between two steps is solid once the order has got past the first of them.
        const before = index <= current;
        const after = index < current;

        return (
          <View key={step} className="flex-1 items-center gap-2">
            <View className="w-full items-center justify-center" style={{ height: DOT }}>
              {index > 0 ? (
                <View
                  className="absolute left-0 right-1/2"
                  style={{ height: LINE, backgroundColor: before ? colors.primary : colors.line }}
                />
              ) : null}
              {index < ORDER_STATUSES.length - 1 ? (
                <View
                  className="absolute left-1/2 right-0"
                  style={{ height: LINE, backgroundColor: after ? colors.primary : colors.line }}
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
                  style={{ width: DOT, height: DOT, backgroundColor: ring.fill, borderWidth: 3, borderColor: ring.ink }}>
                  <View className="rounded-full" style={{ width: 10, height: 10, backgroundColor: ring.ink }} />
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
