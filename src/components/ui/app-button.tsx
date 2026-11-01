import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'dangerOutline';

type AppButtonProps = Omit<ComponentProps<typeof Pressable>, 'children'> & {
  title: string;
  variant?: Variant;
  icon?: ReactNode;
  // Shows a spinner and ignores presses while a request is in flight.
  loading?: boolean;
  large?: boolean;
  className?: string;
};

const VARIANTS: Record<Variant, { container: string; label: string; spinner: string }> = {
  primary: { container: 'bg-primary active:opacity-85', label: 'text-white', spinner: colors.white },
  secondary: {
    container: 'border border-line bg-white active:bg-surface',
    label: 'text-ink',
    spinner: colors.primary,
  },
  soft: { container: 'bg-primary-soft active:opacity-80', label: 'text-primary', spinner: colors.primary },
  ghost: { container: 'active:bg-surface', label: 'text-primary', spinner: colors.primary },
  danger: { container: 'bg-danger active:opacity-85', label: 'text-white', spinner: colors.white },
  dangerOutline: {
    container: 'border border-danger/30 bg-white active:bg-red-50',
    label: 'text-danger',
    spinner: colors.danger,
  },
};

export default function AppButton({
  title,
  variant = 'primary',
  icon,
  loading = false,
  large = false,
  disabled,
  className = '',
  ...props
}: AppButtonProps) {
  const classes = VARIANTS[variant];
  const inactive = loading || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ busy: loading, disabled: !!inactive }}
      disabled={inactive}
      className={`flex-row items-center justify-center gap-2 rounded-xl px-4 ${
        large ? 'min-h-[52px]' : 'min-h-12'
      } ${classes.container} ${inactive ? 'opacity-60' : ''} ${className}`}
      {...props}>
      {loading ? <ActivityIndicator color={classes.spinner} /> : icon}
      <Text className={`text-base font-semibold ${classes.label}`} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}
