import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { colors } from '@/components/ui/colors';

type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  color?: string;
  filled?: boolean;
  disabled?: boolean;
};

// A 44 x 44 touch target around a 22 pt icon.
export default function IconButton({
  icon: Icon,
  label,
  onPress,
  color = colors.ink,
  filled = false,
  disabled,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`size-11 items-center justify-center rounded-full active:opacity-60 ${
        filled ? 'bg-primary' : ''
      } ${disabled ? 'opacity-40' : ''}`}>
      <Icon size={22} color={filled ? colors.white : color} />
    </Pressable>
  );
}
