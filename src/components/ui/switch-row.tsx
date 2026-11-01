import { Switch, View } from 'react-native';

import { Text } from '@/components/ui/text';

type SwitchRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export default function SwitchRow({ label, description, value, onValueChange }: SwitchRowProps) {
  return (
    <View className="min-h-12 flex-row items-center justify-between gap-4">
      <View className="flex-1">
        <Text className="text-base font-medium">{label}</Text>
        {description ? <Text className="text-[13px] text-muted">{description}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#d0d5dd', true: '#173c32' }}
        thumbColor="#ffffff"
      />
    </View>
  );
}
