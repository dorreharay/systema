import { View } from 'react-native';

import { Lock } from '@/components/icons';
import { colors } from '@/components/ui/colors';
import { SURFACE_EDGE } from '@/components/ui/paper';
import { DetailHeader, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useWorkshop } from '@/lib/use-workshop';

/**
 * For a person who works in someone else's workshop whose owner no longer has Studio: the workshop is paused, they can read everything and
 * change nothing. A calm note, not an alarm: nothing is lost, and when the owner has Studio again everything is as it was. It is nothing
 * for everyone else. (The server refuses the changes anyway: 403 `workshop_paused`; this only says why the buttons are off.)
 */
export default function WorkshopPausedBanner({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const { paused } = useWorkshop();
  if (!paused) return null;

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${t('paused_title')}. ${t('paused_text')}`}
      className={`flex-row items-start gap-3 rounded-[18px] bg-white px-5 py-4 ${SURFACE_EDGE} ${className}`}>
      <View className="mt-0.5 size-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.clients }}>
        <Lock size={18} color={colors.ink} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-[16.5px] font-semibold">{t('paused_title')}</Text>
        <Text className="text-[14.3px] leading-5 text-muted">{t('paused_text')}</Text>
      </View>
    </View>
  );
}

/**
 * A page that a person may not use: the form of an order while the workshop is paused, or the form of an order that a master may not
 * change. It says why, and the back button of its header leads away. (The buttons that lead here are off already; this is for a link, a
 * saved route, or a window that was left open.)
 */
export function ReadOnlyPage({ title, message }: { title: string; message?: string }) {
  return (
    <Screen>
      <DetailHeader title={title} />
      <View className="gap-4 p-page">
        <WorkshopPausedBanner />
        {message ? <Text className="px-1 text-[16.5px] text-muted">{message}</Text> : null}
      </View>
    </Screen>
  );
}
