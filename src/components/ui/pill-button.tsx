import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';

type PillButtonProps = { icon: LucideIcon; label: string; onPress: () => void };

// A compact filled button for a header: "+ Add Client".
export default function PillButton({ icon: Icon, label, onPress }: PillButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-1.5 rounded-full bg-primary px-4 active:opacity-85">
      <Icon size={18} color={colors.white} />
      <Text className="text-[15px] font-semibold text-white" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
