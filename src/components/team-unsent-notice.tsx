import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { colors } from '@/components/ui/colors';
import { FormError } from '@/components/ui/input';
import Shortcut from '@/components/ui/shortcut';
import { useI18n } from '@/lib/i18n';

/**
 * Said where joining or leaving a workshop was turned back because changes had not reached the server yet (see `nothingUnsent` in
 * lib/team-support.ts): what to wait for, and the way to the queue of them, where the ones the server turned down can be dealt with.
 */
export default function TeamUnsentNotice() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <View className="gap-2">
      <FormError message={t('team_unsent')} />
      <Shortcut compact color={colors.surface} contentColor={colors.ink} label={t('team_unsent_open')} onPress={() => router.push('/sync')} />
    </View>
  );
}
