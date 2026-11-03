import { Pressable, View } from 'react-native';

import type { IconComponent } from '@/components/icons';
import { colors } from '@/components/ui/colors';

type IconButtonProps = {
  icon: IconComponent;
  label: string;
  onPress: () => void;
  color?: string;
  filled?: boolean;
  // The icon on a round, light grey ground: the close button of a sheet, the call button of an order.
  round?: boolean;
  // A button that has to be easy to hit: a touch target twice as big, and an icon 1.6 times as big.
  large?: boolean;
  disabled?: boolean;
};

// A 48 x 48 touch target around a 22 pt icon, and 8 pt more on every side that also takes the touch. Large, it is 96 x 96
// around a 35.2 pt icon (a fifth less than twice as big), and 16 pt more on every side.
export default function IconButton({
  icon: Icon,
  label,
  onPress,
  color = colors.ink,
  filled = false,
  round = false,
  large = false,
  disabled,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={large ? 16 : 8}
      className={`${large ? 'size-24' : 'size-12'} items-center justify-center active:opacity-60 ${
        round ? '' : 'rounded-lg'
      } ${filled && !round ? 'bg-primary' : ''} ${disabled ? 'opacity-40' : ''}`}>
      {round ? (
        <View className="size-9 items-center justify-center rounded-full bg-[#ECEEF1]">
          <Icon size={18} color={color} />
        </View>
      ) : (
        <Icon size={large ? 35.2 : 22} color={filled ? colors.white : color} />
      )}
    </Pressable>
  );
}
