import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Check } from '@/components/icons';
import { tidy, UsageBar, useResetDate } from '@/components/plan-usage';
import { colors } from '@/components/ui/colors';
import { FormError } from '@/components/ui/input';
import Sheet from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { SELLS_PLANS, TRIAL_DAYS } from '@/lib/billing';
import { useI18n } from '@/lib/i18n';
import { usePurchase } from '@/lib/use-purchase';
import { useSubscription } from '@/lib/use-subscription';
import SubscriptionTerms from '@/components/subscription-terms';

type PlanLimitSheetProps = {
  visible: boolean;
  /** The sheet is put away (swiped down, the dark behind it touched). */
  onClose: () => void;
  /** "Not now": the person does not want a plan. Without it the sheet is only put away. */
  onDecline?: () => void;
  /** What the server said about the month, where the phone's own count may be older than that. */
  used?: number;
  limit?: number;
};

/**
 * What a stringer on Free sees when a new order would be one too many for the month: how much is used, when it starts again, what keeps
 * working, and a way to Pro. Shown over the form of the new order (see order-form.tsx). A failure of the purchase is said here, in the
 * sheet: a toast would be behind it.
 */
export default function PlanLimitSheet({ visible, onClose, onDecline, used: knownUsed, limit: knownLimit }: PlanLimitSheetProps) {
  const { t } = useI18n();
  const router = useRouter();
  const plan = useSubscription();
  const purchase = usePurchase();
  const resetDate = useResetDate();

  const limit = knownLimit ?? plan.usage?.limit;
  const used = Math.max(knownUsed ?? 0, plan.usage?.used ?? 0);
  const decline = onDecline ?? onClose;

  return (
    // (A person who works in someone else's workshop has no plan of their own: the sheet never opens for them.)
    <Sheet visible={visible && !plan.member} onClose={onClose}>
      {limit === undefined || plan.member ? null : (
        <View className="gap-3.5 pb-2">
          <View className="flex-row items-center gap-3.5">
            <View className="size-[52px] items-center justify-center rounded-2xl" style={{ backgroundColor: colors.clients }}>
              <Text className="text-[22px] font-bold">{limit}</Text>
            </View>
            <Text accessibilityRole="header" className="flex-1 text-[21px] font-bold leading-[26px]">
              {t('limit_title', { used: Math.min(used, limit), limit })}
            </Text>
          </View>

          <View className="gap-2">
            <UsageBar used={used} limit={limit} />
            {plan.usage ? (
              <Text className="text-[13.5px] leading-[18px] text-muted">{tidy(t('limit_resets', { date: resetDate(plan.usage.resetsAt) }))}</Text>
            ) : null}
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-bold">{t('limit_still_title')}</Text>
            {[t('limit_still_orders'), t('limit_still_clients')].map((line) => (
              <View key={line} className="flex-row items-start gap-2">
                <View className="mt-[3px]">
                  <Check size={16} color={colors.primary} />
                </View>
                <Text className="flex-1 text-sm leading-[19px] text-secondary">{line}</Text>
              </View>
            ))}
          </View>

          {purchase.error ? <FormError message={purchase.error} /> : null}
          {SELLS_PLANS ? <SubscriptionTerms /> : null}

          <View className="gap-2 pt-1">
            {/* (Where Pro cannot be bought, the web and Android, there is only the page that compares the plans.) */}
            {SELLS_PLANS ? (
              <Shortcut
                compact
                color={colors.primary}
                contentColor={colors.white}
                label={t('plan_try_pro', { days: TRIAL_DAYS })}
                loading={purchase.busy === 'buy'}
                onPress={async () => {
                  if (await purchase.buy('year')) onClose();
                }}
              />
            ) : null}
            <Shortcut
              compact
              color={colors.surface}
              contentColor={colors.ink}
              label={t('subscription_compare')}
              onPress={() => {
                onClose();
                router.push('/subscription');
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={decline}
              className="h-11 items-center justify-center active:opacity-60">
              <Text className="text-[15.5px] font-semibold text-muted">{t('not_now')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Sheet>
  );
}
