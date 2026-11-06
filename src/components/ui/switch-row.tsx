import { View } from 'react-native';

import AppSwitch from '@/components/ui/app-switch';
import { Text } from '@/components/ui/text';

type SwitchRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

// The switch is on the line of the label, and stays there when there is a hint under it: the first line of the
// text and the switch have the same middle, 24 pt from the top of the row. (On a wide web screen the switch is an iOS one drawn by
// app-switch.web.tsx, 51 by 31: it fits the row as the system's own does on the phone.)
export default function SwitchRow({ label, description, value, onValueChange }: SwitchRowProps) {
  return (
    <View className="flex-row items-start justify-between gap-4">
      <View className="flex-1 py-3">
        <Text className="text-base font-medium leading-[24px]">{label}</Text>
        {description ? <Text className="text-[14.3px] text-muted">{description}</Text> : null}
      </View>
      {/* The text of this font sits a little low in its line: the switch goes down with it. */}
      <View className="h-12 justify-center ios:pt-1">
        <AppSwitch accessibilityLabel={label} value={value} onValueChange={onValueChange} />
      </View>
    </View>
  );
}
