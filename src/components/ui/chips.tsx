import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

type Option<T extends string> = { value: T; label: string };

type ChipsProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  // 88% of every size, for a control that stands in a row of a list.
  compact?: boolean;
};

/** Two to four choices side by side, one always chosen: kg | lbs, Rackets | Strings. */
export function Segmented<T extends string>({ options, value, onChange, compact }: ChipsProps<T>) {
  return (
    <View
      className={`flex-row bg-neutral-200 ${compact ? 'rounded-lg p-[3px]' : 'rounded-xl p-1'}`}
      accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`flex-1 items-center justify-center ${
              compact ? 'min-h-[31px] rounded-md px-1.5' : 'min-h-10 rounded-lg px-3'
            } ${selected ? 'bg-white' : ''}`}>
            <Text
              className={`${compact ? 'text-[13.2px]' : 'text-[15px]'} ${
                selected ? 'font-semibold text-ink' : 'font-medium text-muted'
              }`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
