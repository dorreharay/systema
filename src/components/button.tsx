import type { ComponentProps, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

type ButtonProps = ComponentProps<typeof Pressable> & {
  title: string;
  variant?: 'primary' | 'outline';
  icon?: ReactNode;
};

const VARIANT_CLASSES = {
  primary: { container: 'bg-white active:opacity-90', label: 'text-primary' },
  outline: {
    container: 'border border-white/25 bg-white/10 active:bg-white/20',
    label: 'text-white',
  },
} as const;

export default function Button({ title, variant = 'primary', icon, ...props }: ButtonProps) {
  const classes = VARIANT_CLASSES[variant];

  return (
    <Pressable
      accessibilityRole="button"
      className={`h-14 flex-row items-center justify-center gap-3 rounded-lg ${classes.container}`}
      {...props}>
      {icon}
      <Text className={`text-lg font-medium ${classes.label}`}>{title}</Text>
    </Pressable>
  );
}
