import { Pressable } from 'react-native';

import { Check, Minus } from '@/components/icons';
import { BUTTON_RADIUS } from '@/components/ui/button-radius';
import { colors } from '@/components/ui/colors';

type CheckboxProps = {
  checked: boolean;
  // Only some of what the box stands for are ticked: a dash in place of the tick.
  mixed?: boolean;
  onChange: () => void;
  // What a screen reader says: the box has no text of its own.
  label: string;
};

/** A square box that is ticked or not. On, it is one flat colour (the brand's) with a white tick; off, a white box with a thin outline. */
export default function Checkbox({ checked, mixed = false, onChange, label }: CheckboxProps) {
  const on = checked || mixed;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: mixed ? 'mixed' : checked }}
      hitSlop={8}
      onPress={onChange}
      className={`size-5 items-center justify-center border ${BUTTON_RADIUS.md} ${
        on ? 'border-primary bg-primary' : 'border-[#cfd4da] bg-white hover:bg-surface'
      }`}>
      {mixed ? <Minus size={12} color={colors.white} /> : checked ? <Check size={12} color={colors.white} /> : null}
    </Pressable>
  );
}
