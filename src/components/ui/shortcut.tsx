import type { ComponentType } from 'react';
import { Pressable } from 'react-native';

import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';

type ShortcutProps = {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  // The colour of the button.
  color: string;
  // The colour of the icon and the label, where they are not to be the app's own.
  contentColor?: string;
  onPress: () => void;
  // The size and the room around the content; the caller says how big the button is.
  className?: string;
};

// A button in the style of the shortcuts of the home screen: a block of colour with rounded corners, an
// icon and a label side by side, in the middle of it.
export default function Shortcut({ icon: Icon, label, color, contentColor, onPress, className = '' }: ShortcutProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ backgroundColor: color }}
      className={`flex-row items-center h-18 justify-center gap-3 rounded-[18px] active:opacity-80 ${className}`}>
      <Icon size={22} color={contentColor ?? colors.ink} />
      <Text
        className="text-[19px] font-semibold text-primary"
        style={contentColor ? { color: contentColor } : undefined}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
