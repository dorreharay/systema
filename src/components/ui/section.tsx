import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

type SectionProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
  className?: string;
};

// A heading with an optional action on the right ("See All"), and the content below it.
export default function Section({ title, actionLabel, onAction, children, className = '' }: SectionProps) {
  return (
    <View className={`gap-3 ${className}`}>
      <View className="min-h-6 flex-row items-center justify-between">
        <Text accessibilityRole="header" className="text-[17px] font-semibold">
          {title}
        </Text>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
            onPress={onAction}
            className="active:opacity-60">
            <Text className="text-[15px] font-medium text-primary">{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
