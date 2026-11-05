import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Clock, TriangleAlert, WifiOff } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useSyncSummary } from '@/lib/offline/react';

// The colours of the badges (see badge.tsx), so that the mark reads as one of them.
const TONES = {
  danger: { box: 'bg-red-50', ink: 'text-red-600', icon: '#dc2626' },
  warning: { box: 'bg-amber-50', ink: 'text-amber-700', icon: '#b45309' },
  neutral: { box: 'bg-neutral-100', ink: 'text-neutral-600', icon: '#525252' },
} as const;

/**
 * The small mark in the headers that says the phone and the server are not in step: there is no connection, some changes have
 * not been sent, or the server refused some. A tap opens the list of them. When everything is sent and the server answers, it is
 * not there.
 */
export default function SyncPill() {
  const { t } = useI18n();
  const router = useRouter();
  const sync = useSyncSummary();

  if (sync.online && sync.unsynced === 0) return null;

  const attention = sync.failed > 0;
  const tone = TONES[attention ? 'danger' : sync.online ? 'neutral' : 'warning'];
  const Icon = attention ? TriangleAlert : sync.online ? Clock : WifiOff;
  const label = sync.unsynced > 0 ? String(sync.unsynced) : t('sync_offline');
  const spoken = attention
    ? t('sync_status_failed', { count: sync.failed })
    : sync.unsynced > 0
      ? t('sync_status_waiting', { count: sync.unsynced })
      : t('sync_status_offline');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      hitSlop={8}
      onPress={() => router.push('/sync')}
      className="active:opacity-60">
      <View className={`h-8 flex-row items-center gap-1.5 rounded-full px-3 ${tone.box}`}>
        <Icon size={15} color={tone.icon} />
        <Text className={`text-[14px] font-semibold ${tone.ink}`} maxFontSizeMultiplier={1.2}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
