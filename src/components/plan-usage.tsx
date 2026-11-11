import { View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { formatTimestamp } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

/** How much of the month's orders is used: a bar that fills as they are made. */
export function UsageBar({ used, limit }: { used: number; limit: number }) {
  const share = limit <= 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: Math.max(limit, 1), now: Math.min(used, limit) }}
      className="h-2 overflow-hidden rounded-full bg-line">
      <View className="h-2 rounded-full bg-primary" style={{ width: `${share}%` }} />
    </View>
  );
}

/** A sentence that ends in a date written with an abbreviation ("… 1 груд.") has two full stops in a row: one. */
export const tidy = (text: string) => text.replace(/\.\.(?=\s|$)/g, '.');

/** The day the count of the month begins again, as the stringer reads a date ("1 Dec"). */
export function useResetDate() {
  const { language } = useI18n();
  const { user } = useAuth();
  return (resetsAt: number) => formatTimestamp(new Date(resetsAt).toISOString(), language, user?.timezone);
}
