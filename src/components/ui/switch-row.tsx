import { View } from 'react-native';

import AppSwitch from '@/components/ui/app-switch';
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
      <AppSwitch accessibilityLabel={label} value={value} onValueChange={onValueChange} />
    </View>
  );
}
