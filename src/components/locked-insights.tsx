import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Lock } from '@/components/icons';
import { BLOCK_ROOM_X } from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { SURFACE_EDGE } from '@/components/ui/paper';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';

// A stand-in for the charts, grey: a month of bars, nothing of the stringer's own.
const BARS = [34, 58, 22, 80, 46, 64, 30];

/**
 * Where the plan has no overview of the month (Free): the place the charts of the home page are in, with a grey sketch of them, what
 * Pro shows there, and a way to it. It opens the page of the subscription.
 */
export default function LockedInsights() {
  const { t } = useI18n();
  const router = useRouter();
  const wide = useIsWide();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('overview_locked_title')}
      onPress={() => router.push('/subscription')}
      // On a wide page it is a card among the others; on the phone it fills what the charts fill, inside the block of the page.
      className={
        wide
          ? `h-[340px] overflow-hidden rounded-[18px] bg-white ${BLOCK_ROOM_X} pt-5 ${SURFACE_EDGE}`
          : `min-h-[280px] flex-1 ${BLOCK_ROOM_X} pt-1`
      }>
      <View className="flex-row items-center justify-between">
        <Text className="text-[14.5px] font-semibold text-muted">{t('insights_month')}</Text>
        <View className="flex-row items-center gap-1.5 rounded-full bg-primary px-2.5 py-1">
          <Lock size={12} color={colors.white} />
          <Text className="text-[12.5px] font-bold text-white">{t('plan_pro')}</Text>
        </View>
      </View>

      <View pointerEvents="none" className="mt-4 h-[88px] flex-row items-end gap-2.5 opacity-50">
        {BARS.map((height, index) => (
          <View key={index} className="flex-1 rounded-b-[4px] rounded-t-[7px] bg-[#d0d5dd]" style={{ height }} />
        ))}
      </View>

      <View className="flex-1 items-center justify-center gap-1 pb-3">
        <Text accessibilityRole="header" className="text-center text-base font-bold">
          {t('overview_locked_title')}
        </Text>
        <Text className="text-center text-[13.5px] leading-[18px] text-secondary">{t('overview_locked_text')}</Text>
        <View className="mt-3 h-[42px] items-center justify-center rounded-[14px] bg-primary px-5">
          <Text className="text-[14.5px] font-bold text-white">{t('strip_try')}</Text>
        </View>
      </View>
    </Pressable>
  );
}
