import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';

type ListRowProps = {
  icon?: LucideIcon;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  trailing?: ReactNode;
};

// A line of a settings list: icon, label, the current value, and a chevron when it opens something.
export default function ListRow({ icon: Icon, label, value, onPress, destructive, trailing }: ListRowProps) {
  const content = (
    <>
      {Icon ? <Icon size={22} color={destructive ? colors.danger : colors.primary} /> : null}
      <Text className={`flex-1 text-base ${destructive ? 'font-medium text-danger' : ''}`} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text className="max-w-[45%] text-[15px] text-muted" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress && !destructive ? <ChevronRight size={18} color={colors.muted} /> : null}
    </>
  );
  const classes = 'min-h-14 flex-row items-center gap-3 px-4';
  if (!onPress) {
    return <View className={classes}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      className={`${classes} active:bg-surface`}>
      {content}
    </Pressable>
  );
}

/** Rows grouped in one rounded card with hairlines between them. */
export function ListGroup({ children }: { children: ReactNode[] | ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-white">
      {rows.map((row, index) => (
        <View key={index} className={index > 0 ? 'border-t border-line' : ''}>
          {row}
        </View>
      ))}
    </View>
  );
}
