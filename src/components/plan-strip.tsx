import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { tidy, UsageBar, useResetDate } from '@/components/plan-usage';
import { Text } from '@/components/ui/text';
import { SELLS_PLANS } from '@/lib/billing';
import { useI18n } from '@/lib/i18n';
import { useSubscription } from '@/lib/use-subscription';

/**
 * On the home page of an account whose plan limits the orders: the plan, how much of the month is used and when the count starts
 * again. It opens the page of the subscription. It is nothing for an account that nothing limits (Pro, or a server with the plans off).
 */
export default function PlanStrip({ framed }: { framed?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const plan = useSubscription();
  const resetDate = useResetDate();
  const usage = plan.usage;
  if (!usage) return null;

  const strip = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('strip_label', { plan: t('plan_free') })}. ${t('usage_line', { used: usage.used, limit: usage.limit })}`}
      onPress={() => router.push('/subscription')}
      className={`gap-1.5 px-5 pb-3.5 pt-4 active:bg-surface ${framed ? '' : 'border-b border-line'}`}>
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="text-[13.5px] text-muted">{t('strip_label', { plan: t('plan_free') })}</Text>
        {/* (Where Pro cannot be bought, the page it leads to only shows the plans.) */}
        <Text className="text-sm font-bold text-primary">{SELLS_PLANS ? t('strip_try') : t('subscription_compare')}</Text>
      </View>
      <Text className="text-base font-semibold">{t('usage_line', { used: usage.used, limit: usage.limit })}</Text>
      <UsageBar used={usage.used} limit={usage.limit} />
      <Text className="text-[12.5px] leading-4 text-muted">{tidy(t('usage_resets', { date: resetDate(usage.resetsAt) }))}</Text>
    </Pressable>
  );

  return framed ? <View className="overflow-hidden rounded-[18px] border border-line bg-white">{strip}</View> : strip;
}
