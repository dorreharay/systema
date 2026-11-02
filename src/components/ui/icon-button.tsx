import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { colors } from '@/components/ui/colors';

type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  color?: string;
  filled?: boolean;
  // The icon in a round, light grey outline: the close button of a sheet.
  outlined?: boolean;
  disabled?: boolean;
};

// A 48 x 48 touch target around a 22 pt icon, and 8 pt more on every side that also takes the touch.
export default function IconButton({
  icon: Icon,
  label,
  onPress,
  color = colors.ink,
  filled = false,
  outlined = false,
  disabled,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      className={`size-12 items-center justify-center active:opacity-60 ${
        outlined ? '' : 'rounded-lg'
      } ${filled && !outlined ? 'bg-primary' : ''} ${disabled ? 'opacity-40' : ''}`}>
      {outlined ? (
        <View className="size-9 items-center justify-center rounded-full border border-line">
          <Icon size={18} color={color} />
        </View>
      ) : (
        <Icon size={22} color={filled ? colors.white : color} />
      )}
    </Pressable>
  );
}
