import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';

type Option<T extends string> = { value: T; label: string };

type ChipsProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** A row of filters that scrolls sideways; the chosen one is filled with the accent color. */
export function FilterChips<T extends string>({ options, value, onChange }: ChipsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-page"
      keyboardShouldPersistTaps="handled">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => onChange(option.value)}
            className={`min-h-10 justify-center rounded-full border px-4 ${
              selected ? 'border-primary bg-primary' : 'border-line bg-white active:bg-surface'
            }`}>
            <Text className={`text-[15px] font-medium ${selected ? 'text-white' : 'text-ink'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Two to four choices side by side, one always chosen: kg | lbs, Rackets | Strings. */
export function Segmented<T extends string>({ options, value, onChange }: ChipsProps<T>) {
  return (
    <View className="flex-row rounded-xl bg-neutral-200 p-1" accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`min-h-10 flex-1 items-center justify-center rounded-lg px-3 ${
              selected ? 'bg-white' : ''
            }`}>
            <Text className={`text-[15px] ${selected ? 'font-semibold text-ink' : 'font-medium text-muted'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
