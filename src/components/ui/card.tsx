import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  accessibilityLabel?: string;
};

// White, a hairline border, rounded; the only "elevation" the app uses.
export default function Card({ children, onPress, className = '', accessibilityLabel }: CardProps) {
  const base = `rounded-2xl border border-line bg-white p-4 ${className}`;
  if (!onPress) {
    return <View className={base}>{children}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={`${base} active:bg-surface`}>
      {children}
    </Pressable>
  );
}
