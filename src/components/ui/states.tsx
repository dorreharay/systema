import { View } from 'react-native';

import { RotateCcw, SearchX, TriangleAlert, WifiOff, type IconComponent } from '@/components/icons';
import { colors } from '@/components/ui/colors';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { describeError, isOffline } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

type EmptyStateProps = {
  icon: IconComponent;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

// What a list says when there is nothing in it: what that means, and the next step.
export function EmptyState({ icon: Icon, title, message }: EmptyStateProps) {
  return (
    <View className="items-center justify-center gap-3 px-6 py-12 h-[45vh]">
      <View className="size-16 items-center justify-center rounded-full bg-white">
        <Icon size={28} color={colors.primary} />
      </View>
      <Text className="text-center text-[18.7px] font-semibold">{title}</Text>
      {message ? <Text className="text-center text-[16.5px] text-muted">{message}</Text> : null}
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
    <View className="items-center gap-3 px-6 py-12 mt-[30vh]">
      <View className="size-16 items-center justify-center rounded-full bg-red-50">
        {offline ? (
          <WifiOff size={28} color={colors.danger} />
        ) : (
          <TriangleAlert size={28} color={colors.danger} />
        )}
      </View>
      <Text className="text-center text-[18.7px] font-semibold">
        {offline ? t('error_offline_title') : t('error_load_title')}
      </Text>
      <Text className="text-center text-[16.5px] text-muted">
        {offline ? t('error_offline_message') : describeError(error, t)}
      </Text>
      <Shortcut
        compact
        icon={RotateCcw}
        label={t('retry')}
        color={colors.surface}
        contentColor={colors.ink}
        onPress={onRetry}
        className="mt-2 self-stretch"
      />
    </View>
  );
}
