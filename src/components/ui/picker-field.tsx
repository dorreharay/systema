import { ChevronDown } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';

type PickerFieldProps = {
  label?: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  error?: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
};

// Looks like a field, opens a sheet to pick from.
export default function PickerField({
  label,
  value,
  placeholder,
  onPress,
  error,
  icon,
  disabled,
  className = '',
}: PickerFieldProps) {
  return (
    <View className={`gap-1.5 ${className}`}>
      {label ? <Text className="text-[13px] font-medium text-muted">{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${value ?? placeholder}` : (value ?? placeholder)}
        disabled={disabled}
        onPress={onPress}
        className={`min-h-12 flex-row items-center gap-2 rounded-xl border bg-white px-3.5 py-2.5 active:bg-surface ${
          error ? 'border-danger' : 'border-line'
        } ${disabled ? 'opacity-50' : ''}`}>
        {icon}
        <Text
          className={`flex-1 text-base ${value ? 'text-ink' : 'text-neutral-400'}`}
          numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <ChevronDown size={18} color={colors.muted} />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" className="text-xs text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
