import { useRef, type ComponentRef } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';

import { Check, ChevronDown } from '@/components/icons';
import { STATUS_STYLES } from '@/components/ui/badge';
import { BUTTON_RADIUS } from '@/components/ui/button-radius';
import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/types';

/** Where something is in the window: what a menu opens under. */
export type Anchor = { x: number; y: number; width: number; height: number };

// The colour of the text of each status in badge.tsx, as a value for what takes a colour and not a class (the arrow).
const STATUS_INK: Record<OrderStatus, string> = {
  received: '#3B82F6',
  in_progress: '#B45309',
  ready: '#0F766E',
  completed: '#525252',
};

const MENU_WIDTH = 196;
const ITEM_HEIGHT = 40;
const MENU_PAD = 6;
const GAP = 6;
const EDGE = 8;

type KeyEvent = { key: string; preventDefault: () => void };

/**
 * The status of an order as a chip with a small arrow, in the colours of the badge it has on the phone's cards (a pale ground, a dot and
 * a text of the status's colour): a press tells where the chip is, so that a menu can open under it. (`dataSet` is react-native-web's:
 * the keys of the table find the chip of a row by it.)
 */
export function StatusChip({
  status,
  orderId,
  onOpen,
}: {
  status: OrderStatus;
  orderId: string;
  onOpen: (anchor: Anchor) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const style = STATUS_STYLES[status];

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`${t('order_status_label', { status: t(`status_${status}`) })}. ${t('orders_change_status')}`}
      onPress={() => ref.current?.measureInWindow((x, y, width, height) => onOpen({ x, y, width, height }))}
      {...({ dataSet: { statusChip: orderId } } as object)}
      className={`h-[30px] flex-row items-center gap-2 self-start pl-2.5 pr-2 hover:opacity-80 active:opacity-70 ${BUTTON_RADIUS.lg} ${style.container}`}>
      <View className={`size-2 rounded-full ${style.dot}`} />
      <Text className={`text-[13px] font-semibold ${style.label}`} numberOfLines={1}>
        {t(`status_${status}`)}
      </Text>
      <ChevronDown size={13} color={STATUS_INK[status]} />
    </Pressable>
  );
}

/**
 * The four statuses in a small white menu under the chip that was pressed (above it when there is no room below), each as the badge it
 * is on the phone, to move an order to one of them. A press on one, a key 1 to 4, or Escape; a click outside it closes it. It is a
 * modal, so it is over everything and keeps the keyboard.
 */
export function StatusMenu({
  anchor,
  current,
  onSelect,
  onClose,
}: {
  anchor: Anchor | null;
  current: OrderStatus;
  onSelect: (status: OrderStatus) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const window = useWindowDimensions();
  if (!anchor) return null;

  const height = ORDER_STATUSES.length * ITEM_HEIGHT + MENU_PAD * 2;
  const left = Math.max(EDGE, Math.min(anchor.x, window.width - MENU_WIDTH - EDGE));
  const below = anchor.y + anchor.height + GAP + height <= window.height - EDGE;
  const top = below ? anchor.y + anchor.height + GAP : Math.max(EDGE, anchor.y - GAP - height);

  // The digits choose, as the numbers beside the statuses say (`onKeyDown` is the web's, and not in React Native's own types).
  const keys = {
    onKeyDown: (event: KeyEvent) => {
      const status = ORDER_STATUSES[Number(event.key) - 1];
      if (status) {
        event.preventDefault();
        onSelect(status);
      }
    },
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      {/* A plain view, not a button: a button would be the first thing the modal gives the keyboard to. */}
      <View className="flex-1" {...({ onClick: onClose } as object)} />
      <View
        accessibilityRole="menu"
        accessibilityLabel={t('orders_change_status')}
        {...(keys as object)}
        className="absolute rounded-xl bg-white p-1.5"
        style={{
          left,
          top,
          width: MENU_WIDTH,
          boxShadow: '0 0 0 1px rgba(16,24,40,0.08), 0 2px 6px rgba(16,24,40,0.08), 0 24px 48px -12px rgba(16,24,40,0.35)',
        }}>
        {ORDER_STATUSES.map((status, index) => {
          const style = STATUS_STYLES[status];
          const here = status === current;
          return (
            <Pressable
              key={status}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: here }}
              onPress={() => onSelect(status)}
              className={`h-10 flex-row items-center gap-2.5 px-2 hover:bg-surface active:bg-surface ${BUTTON_RADIUS.lg}`}>
              <View className={`h-[26px] flex-row items-center gap-2 rounded-full px-2.5 ${style.container}`}>
                <View className={`size-2 rounded-full ${style.dot}`} />
                <Text className={`text-[13px] font-medium ${style.label}`} numberOfLines={1}>
                  {t(`status_${status}`)}
                </Text>
              </View>
              <View className="flex-1" />
              {here ? <Check size={14} color={colors.primary} /> : null}
              <View className="h-[22px] min-w-[22px] items-center justify-center rounded-md bg-surface px-1.5">
                <Text className="text-[11.5px] font-medium text-muted">{index + 1}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}
