import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

type ButtonProps = ComponentProps<typeof Pressable> & {
  title: string;
  variant?: 'primary' | 'outline';
  icon?: ReactNode;
  // Shows a spinner and ignores presses while a request is in flight.
  loading?: boolean;
};

const VARIANT_CLASSES = {
  primary: { container: 'bg-white active:opacity-90', label: 'text-primary', spinner: '#173c32' },
  outline: {
    container: 'border border-white/25 bg-white/10 active:bg-white/20',
    label: 'text-white',
    spinner: '#ffffff',
  },
} as const;

export default function Button({
  title,
  variant = 'primary',
  icon,
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const classes = VARIANT_CLASSES[variant];
  const inactive = loading || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: !!inactive }}
      disabled={inactive}
      className={`h-14 flex-row items-center justify-center gap-3 rounded-lg ${classes.container} ${
        inactive ? 'opacity-70' : ''
      }`}
      {...props}>
      {loading ? <ActivityIndicator color={classes.spinner} /> : icon}
      <Text className={`text-lg font-medium ${classes.label}`}>{title}</Text>
    </Pressable>
  );
}
