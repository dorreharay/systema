import type { ComponentType } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { BUTTON_RADIUS } from '@/components/ui/button-radius';
import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';

type MiniButtonProps = {
  // Without one the button is a square with its icon alone: say what it does in `accessibilityLabel`.
  label?: string;
  // After the label (or alone).
  icon?: ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
  loading?: boolean;
  // The smaller one, for a row of a table.
  small?: boolean;
  // Grey, the secondary kind, where no colour is given; a colour says what the button is for (the status it moves an order to).
  color?: string;
  accessibilityLabel?: string;
};

/**
 * A small button for the line at the foot of a card or the cell of a table: black on grey (the secondary kind), or on the colour it is
 * given. The text is black on every colour.
 */
export default function MiniButton({ label, icon: Icon, onPress, loading, small, color, accessibilityLabel }: MiniButtonProps) {
  const size = small ? 'h-7' : 'h-9';
  const room = !label ? (small ? 'w-7' : 'w-9') : Icon ? (small ? 'min-w-14 gap-1 px-3' : 'min-w-16 gap-1 px-3') : small ? 'min-w-14 px-3' : 'min-w-16 px-4';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: !!loading, disabled: !!loading }}
      disabled={loading}
      hitSlop={6}
      onPress={onPress}
      style={{ backgroundColor: color ?? colors.surface }}
      className={`flex-row items-center justify-center ${BUTTON_RADIUS.lg} hover:opacity-90 active:opacity-70 ${size} ${room} ${
        loading ? 'opacity-60' : ''
      }`}>
      {loading ? (
        <ActivityIndicator size="small" color={colors.ink} />
      ) : (
        <>
          {label ? (
            <Text className={`${small ? 'text-[13px]' : 'text-[14.3px]'} font-semibold`} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {label}
            </Text>
          ) : null}
          {Icon ? <Icon size={small ? 15 : 17} color={colors.ink} /> : null}
        </>
      )}
    </Pressable>
  );
}
