import { SearchX, WifiOff, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import AppButton from '@/components/ui/app-button';
import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import { describeError, isOffline } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

// What a list says when there is nothing in it: what that means, and the next step.
export function EmptyState({ icon: Icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="items-center gap-3 px-6 py-12">
      <View className="size-16 items-center justify-center rounded-full bg-primary-soft">
        <Icon size={28} color={colors.primary} />
      </View>
      <Text className="text-center text-[17px] font-semibold">{title}</Text>
      {message ? <Text className="text-center text-[15px] text-muted">{message}</Text> : null}
      {actionLabel && onAction ? (
        <AppButton title={actionLabel} onPress={onAction} className="mt-2 self-stretch" />
      ) : null}
    </View>
  );
}

export function NoResults({ query }: { query?: string }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={SearchX}
      title={t('no_results_title')}
      message={query ? t('no_results_for', { query }) : t('no_results_hint')}
    />
  );
}

// A request failed. Offline gets its own words, because the fix (get a connection) differs from the
// others (try again). The entered data is never thrown away: this replaces a list, not a form.
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n();
  const offline = isOffline(error);
  return (
    <View className="items-center gap-3 px-6 py-12">
      <View className="size-16 items-center justify-center rounded-full bg-red-50">
        {offline ? (
          <WifiOff size={28} color={colors.danger} />
        ) : (
          <TriangleAlert size={28} color={colors.danger} />
        )}
      </View>
      <Text className="text-center text-[17px] font-semibold">
        {offline ? t('error_offline_title') : t('error_load_title')}
      </Text>
      <Text className="text-center text-[15px] text-muted">
        {offline ? t('error_offline_message') : describeError(error, t)}
      </Text>
      <AppButton title={t('retry')} variant="secondary" onPress={onRetry} className="mt-2 self-stretch" />
    </View>
  );
}
