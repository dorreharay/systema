import { View } from 'react-native';

import { Check } from '@/components/icons';
import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/types';

const DOT = 28;
const LINE = 3;
// The room a name has under its step: more than the longest of them, so that it stays on one line.
const LABEL = 84;

// A name stands under its step: the first at the left edge, the last at the right edge, the others centred on theirs.
const SIDES = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/**
 * Where an order is on its way, as steps, over the whole width: the first step at the left edge, the last at the right
 * edge, the others evenly between them. The ones behind the order are ticked, the one it is at is filled, with its
 * number in white, and the ones ahead have theirs. All in the brand colour, whatever the status. A handed-over order
 * has every step ticked.
 */
export default function StatusSteps({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const current = ORDER_STATUSES.indexOf(status);
  const finished = status === 'completed';
  const last = ORDER_STATUSES.length - 1;
  // How far along the line the order is: 0 at the middle of the first step, 1 at the middle of the last.
  const progress = current / last;

  return (
    <View
      accessible
      accessibilityLabel={t('order_status_label', { status: t(`status_${status}`) })}
      className="gap-2">
      <View style={{ height: DOT }}>
        {/* One line behind all the steps, from the middle of the first to the middle of the last, so that it has no
            seams where two steps meet: grey, and in the brand colour as far as the step the order is at. */}
        <View
          className="absolute"
          style={{
            left: DOT / 2,
            right: DOT / 2,
            top: (DOT - LINE) / 2,
            height: LINE,
            backgroundColor: colors.line,
          }}>
          <View style={{ width: `${progress * 100}%`, height: LINE, backgroundColor: colors.primary }} />
        </View>
        <View className="flex-row justify-between">
          {ORDER_STATUSES.map((step, index) => {
            const done = index < current || finished;
            const here = index === current && !finished;

            return done ? (
              <View
                key={step}
                className="items-center justify-center rounded-full"
                style={{ width: DOT, height: DOT, backgroundColor: colors.primary }}>
                <Check size={16} color={colors.white} />
              </View>
            ) : here ? (
              <View
                key={step}
                className="items-center justify-center rounded-full"
                style={{ width: DOT, height: DOT, backgroundColor: colors.primary }}>
                <Text className="text-[13px] font-semibold text-white">{index + 1}</Text>
              </View>
            ) : (
              <View
                key={step}
                className="items-center justify-center rounded-full bg-white"
                style={{ width: DOT, height: DOT, borderWidth: 2, borderColor: colors.line }}>
                <Text className="text-[13px] font-medium text-muted">{index + 1}</Text>
              </View>
            );
          })}
        </View>
      </View>
      {/* The names: a slot as wide as a dot under each, in the same places, so that a name is centred on its dot. */}
      <View className="flex-row justify-between">
        {ORDER_STATUSES.map((step, index) => {
          const done = index < current || finished;
          const here = index === current && !finished;
          const align = index === 0 ? 'left' : index === last ? 'right' : 'center';

          return (
            <View key={step} style={{ width: DOT, alignItems: SIDES[align] }}>
              <Text
                numberOfLines={2}
                // `maxWidth` too: on the web a text with `numberOfLines` is at most as wide as its parent, which is a dot, and would be
                // squeezed into it.
                style={{ width: LABEL, maxWidth: LABEL, textAlign: align }}
                className={`text-[14px] ${here ? 'font-semibold text-ink' : done ? 'font-medium text-ink' : 'text-muted'}`}>
                {t(`status_${step}`)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
