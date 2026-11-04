import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import type { OrderStatus } from '@/lib/types';

const STATUS_STYLES: Record<OrderStatus, { container: string; dot: string; label: string }> = {
  received: { container: 'bg-blue-50', dot: 'bg-blue-500', label: 'text-blue-500' },
  in_progress: { container: 'bg-amber-50', dot: 'bg-amber-500', label: 'text-amber-700' },
  ready: { container: 'bg-teal-50', dot: 'bg-teal-500', label: 'text-teal-700' },
  completed: { container: 'bg-neutral-100', dot: 'bg-neutral-400', label: 'text-neutral-600' },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const style = STATUS_STYLES[status];
  return (
    <View
      accessibilityLabel={t('order_status_label', { status: t(`status_${status}`) })}
      className={`flex-row items-center gap-2 self-start rounded-full px-3.5 py-1.5 ${style.container}`}>
      <View className={`size-2.5 rounded-full ${style.dot}`} />
      <Text className={`text-[15px] font-medium ${style.label}`} maxFontSizeMultiplier={1.3}>
        {t(`status_${status}`)}
      </Text>
    </View>
  );
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
const TONES: Record<Tone, { container: string; label: string }> = {
  success: { container: 'bg-emerald-50', label: 'text-emerald-700' },
  warning: { container: 'bg-amber-50', label: 'text-amber-700' },
  danger: { container: 'bg-red-50', label: 'text-red-600' },
  info: { container: 'bg-teal-50', label: 'text-teal-700' },
  neutral: { container: 'bg-neutral-100', label: 'text-neutral-600' },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View className={`self-start rounded-full px-3.5 py-1.5 ${TONES[tone].container}`}>
      <Text className={`text-[15px] font-medium ${TONES[tone].label}`} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}
