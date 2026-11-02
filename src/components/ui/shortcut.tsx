import type { ComponentType } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';

type ShortcutProps = {
  // Without one, the label is all there is: the buttons of the sign-in screens.
  icon?: ComponentType<{ size?: number; color?: string }>;
  label: string;
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
  // Shows a spinner in place of the icon and ignores presses while a request is in flight.
  loading?: boolean;
  disabled?: boolean;
};

const SIZES = {
  large: { box: 'h-18 gap-3', icon: 22, label: 'text-[19px]' },
  compact: { box: 'h-[52px] gap-2.5', icon: 20, label: 'text-[17px]' },
} as const;

// A button in the style of the shortcuts of the home screen: a block of colour with rounded corners, an
// icon and a label side by side, in the middle of it.
export default function Shortcut({
  icon: Icon,
  label,
  color,
  contentColor,
  onPress,
  className = '',
  compact = false,
  loading = false,
  disabled,
}: ShortcutProps) {
  const size = SIZES[compact ? 'compact' : 'large'];
  const inactive = loading || disabled;
  const ink = contentColor ?? colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: !!inactive }}
      disabled={inactive}
      onPress={onPress}
      style={{ backgroundColor: color }}
      className={`flex-row items-center justify-center rounded-[18px] active:opacity-80 ${size.box} ${
        inactive ? 'opacity-60' : ''
      } ${className}`}>
      {loading ? <ActivityIndicator color={ink} /> : Icon ? <Icon size={size.icon} color={ink} /> : null}
      <Text
        className={`${size.label} font-semibold text-primary`}
        style={contentColor ? { color: contentColor } : undefined}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
