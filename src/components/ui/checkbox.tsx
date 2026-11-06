import { Pressable } from 'react-native';

import { Check, Minus } from '@/components/icons';
import { colors } from '@/components/ui/colors';

type CheckboxProps = {
  checked: boolean;
  // Only some of what the box stands for are ticked: a dash in place of the tick.
  mixed?: boolean;
  onChange: () => void;
  // What a screen reader says: the box has no text of its own.
  label: string;
};

/**
 * A round tick, as in the lists of iOS: off, an empty ring; on, a full circle of the brand's colour with a white tick (a dash when only some
 * of what it stands for are ticked). One flat colour each, no gradient.
 */
export default function Checkbox({ checked, mixed = false, onChange, label }: CheckboxProps) {
  const on = checked || mixed;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      // (react-native-web has no `accessibilityState`: the state a screen reader hears is `aria-checked`.)
      aria-checked={mixed ? 'mixed' : checked}
      hitSlop={8}
      onPress={onChange}
      className={`size-[22px] items-center justify-center rounded-full transition-colors duration-150 ${
        on ? 'bg-primary' : 'border-[1.5px] border-[#c7c7cc] hover:border-[#aeaeb2]'
      }`}>
      {mixed ? <Minus size={12} color={colors.white} /> : checked ? <Check size={13} color={colors.white} /> : null}
    </Pressable>
  );
}
