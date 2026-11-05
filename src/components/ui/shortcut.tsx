import type { ComponentType } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';

type ShortcutProps = {
  // Without one, the label is all there is: the buttons of the sign-in screens.
  icon?: ComponentType<{ size?: number; color?: string }>;
  label: string;
  // What a screen reader says, where the label shown is shorter than that (a brand name on its own, say).
  accessibilityLabel?: string;
  // The colour of the button.
  color: string;
  // The colour of the icon and the label, where they are not to be the app's own.
  contentColor?: string;
  // Not given where a link puts its own on the button (`asChild`).
  onPress?: () => void;
  // The size and the room around the content; the caller says how big the button is.
  className?: string;
  // A smaller button, for what is secondary to the one beside it.
  compact?: boolean;
  // Lower still than the compact one (44 pt, where that is 52, the least iOS asks of a button to touch), with the corners in
  // proportion: a stack of secondary buttons, like the ways to send the message that an order is ready.
  dense?: boolean;
  // 15% lower than the large one (54 pt, where that is 63), with the corners in proportion (15 pt, where those are 18): the
  // buttons of the welcome and sign-in screens.
  slim?: boolean;
  // Shows a spinner in place of the icon and ignores presses while a request is in flight.
  loading?: boolean;
  disabled?: boolean;
};

const SIZES = {
  large: { box: 'h-18 gap-3', radius: 'rounded-[18px]', icon: 22, label: 'text-[19px]' },
  slim: { box: 'h-[54px] gap-3', radius: 'rounded-[15px]', icon: 22, label: 'text-[19px]' },
  compact: { box: 'h-[52px] gap-2.5', radius: 'rounded-[18px]', icon: 20, label: 'text-[17px]' },
  dense: { box: 'h-[44px] gap-2', radius: 'rounded-[15px]', icon: 18, label: 'text-[16px]' },
} as const;

// A button in the style of the shortcuts of the home screen: a block of colour with rounded corners, an
// icon and a label side by side, in the middle of it.
export default function Shortcut({
  icon: Icon,
  label,
  accessibilityLabel,
  color,
  contentColor,
  onPress,
  className = '',
  compact = false,
  dense = false,
  slim = false,
  loading = false,
  disabled,
}: ShortcutProps) {
  const size = SIZES[dense ? 'dense' : compact ? 'compact' : slim ? 'slim' : 'large'];
  const inactive = loading || disabled;
  const ink = contentColor ?? colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: loading, disabled: !!inactive }}
      disabled={inactive}
      onPress={onPress}
      style={{ backgroundColor: color }}
      className={`flex-row items-center justify-center active:opacity-80 ${size.radius} ${size.box} ${
        inactive ? 'opacity-60' : ''
      } ${className}`}>
      {loading ? <ActivityIndicator color={ink} /> : Icon ? <Icon size={size.icon} color={ink} /> : null}
      <Text
        className={`${size.label} font-semibold text-ink`}
        style={contentColor ? { color: contentColor } : undefined}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
