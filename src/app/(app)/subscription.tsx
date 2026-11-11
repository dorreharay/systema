import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Check, ClipboardList, Eye, RotateCcw, Store } from '@/components/icons';
import { PlanBullets, PlanCard, usePlanCards, usePrices } from '@/components/plan-cards';
import { tidy, UsageBar, useResetDate } from '@/components/plan-usage';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import { FormError } from '@/components/ui/input';
import ListRow, { ListGroup } from '@/components/ui/list-row';
import Section from '@/components/ui/section';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import {
  grantForDevelopment,
  openManageSubscriptions,
  TRIAL_DAYS,
  type DevState,
} from '@/lib/billing';
import { describeError } from '@/lib/errors';
import { formatTimestamp } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { openLegalPage, type LegalPage } from '@/lib/legal';
import type { Period } from '@/lib/subscription';
import { usePurchase } from '@/lib/use-purchase';
import { useYearSaving } from '@/lib/use-store-prices';
import { useSubscription } from '@/lib/use-subscription';

const DEV_STATES: DevState[] = ['free', 'trial', 'active', 'cancelled', 'expired'];

/**
 * Settings, Subscription: the plan the account holds, how much of the month is used, a way to Pro, and what each plan has. The plan is
 * bought through the store (lib/billing.ts); the store also turns it off, which is Apple's page and not ours.
 */
export default function Subscription() {
  const { t, language } = useI18n();
  const { user, token, setUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const plan = useSubscription();
  const cards = usePlanCards();
  const prices = usePrices();
  const purchase = usePurchase();
  const yearSaving = useYearSaving();
  const resetDate = useResetDate();
  const [period, setPeriod] = useState<Period>('year');
  // The store is the phone's: on the web the page shows the plan and says where to change it.
  const web = Platform.OS === 'web';

  // A server with the plans off has nothing to show (a link to this page, kept from a time when it had).
  if (!user || !plan.enabled) return <Redirect href="/home" />;

  const when = (ms: number) => formatTimestamp(new Date(ms).toISOString(), language, user.timezone);
  const freeLimit = user.subscription?.free.orders_per_month ?? 15;
  const paid = plan.plan !== 'free';
  const periodPrice = (value: Period | null) =>
    value === 'month' ? t('plan_price_month', { price: prices.proMonth }) : t('plan_price_year', { price: prices.proYear });

  const openLegal = async (page: LegalPage) => {
    if (!(await openLegalPage(page, language))) toast.error(t('legal_open_failed'));
  };

  const restore = async () => {
    const restored = await purchase.restore();
    if (restored) toast.success(t(restored.subscription?.plan !== 'free' ? 'subscription_restore_done' : 'subscription_restore_none'));
  };

  const grant = async (state: DevState) => {
    if (!token) return;
    try {
      setUser(await grantForDevelopment(token, state));
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  // --- What the account holds ------------------------------------------------------------------

  const statusLabel = plan.trial ? t('status_trial') : !plan.renews ? t('status_cancelled') : t('status_active');
  const status = paid ? (
    <View className="gap-2.5">
      <View className="flex-row items-center gap-2.5">
        <Badge label={t(plan.plan === 'studio' ? 'plan_studio' : 'plan_pro')} tone="success" />
        <Text className="text-[13.5px] text-muted">{statusLabel}</Text>
      </View>
      {plan.trial && plan.daysLeft !== null ? (
        <Text className="text-[17px] font-bold">{t('plan_days_left', { days: plan.daysLeft })}</Text>
      ) : null}
      {plan.endsAt !== null ? (
        <Text className="text-[14.3px] leading-5 text-secondary">
          {!plan.renews
            ? tidy(t('subscription_cancelled_note', { date: when(plan.endsAt) }))
            : plan.trial
              ? t('subscription_after_trial', { price: periodPrice(plan.period) })
              : `${t('subscription_renews', { date: when(plan.endsAt) })}, ${periodPrice(plan.period)}`}
        </Text>
      ) : null}
    </View>
  ) : (
    <View className="gap-2.5">
      {plan.expired ? (
        <>
          <Text className="text-[17px] font-bold">{t('subscription_expired_title')}</Text>
          <Text className="text-[14.3px] leading-5 text-secondary">{t('subscription_expired_message', { limit: freeLimit })}</Text>
        </>
      ) : (
        <View className="flex-row items-center gap-2.5">
          <Badge label={t('plan_free')} tone="neutral" />
          <Text className="text-[13.5px] text-muted">{t('plan_free_sub')}</Text>
        </View>
      )}
      {plan.usage ? (
        <View className="gap-2">
          <Text className="text-[17px] font-bold">{t('usage_line', { used: plan.usage.used, limit: plan.usage.limit })}</Text>
          <UsageBar used={plan.usage.used} limit={plan.usage.limit} />
          <Text className="text-[13px] leading-[17px] text-muted">{tidy(t('usage_resets', { date: resetDate(plan.usage.resetsAt) }))}</Text>
        </View>
      ) : null}
    </View>
  );

  // --- The way to Pro: Free, and a Pro that has run out ----------------------------------------

  const promo = paid ? null : (
    <View className="gap-3 rounded-[18px] border border-[#cfe0d8] bg-primary-soft p-5">
      <Text accessibilityRole="header" className="text-[17.5px] font-bold leading-[23px] text-primary">
        {plan.expired ? t('subscription_return_pro') : t('plan_try_pro', { days: TRIAL_DAYS })}
      </Text>
      <PlanBullets items={[t('plan_bullet_unlimited'), t('plan_bullet_stock'), t('plan_bullet_overview')]} tight />
      {web ? (
        <Text className="text-[13.5px] leading-[18px] text-secondary">{t('subscription_web_note')}</Text>
      ) : (
        <>
          <Segmented<Period>
            options={[
              { value: 'year', label: t('period_year_saving', { percent: yearSaving }) },
              { value: 'month', label: t('period_month') },
            ]}
            value={period}
            onChange={setPeriod}
          />
          <Text className="text-[13.5px] leading-[18px] text-secondary">
            {t('plan_then_price', { yearly: prices.proYear, monthly: prices.proMonth })}
          </Text>
          {purchase.error ? <FormError message={purchase.error} /> : null}
          <Shortcut
            compact
            color={colors.primary}
            contentColor={colors.white}
            label={plan.expired ? t('subscription_return_pro') : t('strip_try')}
            loading={purchase.busy === 'buy'}
            onPress={() => void purchase.buy(period)}
          />
        </>
      )}
    </View>
  );

  return (
    <Screen flush footer={<View style={{ height: Math.max(insets.bottom, 12) + 24 }} />}>
      <DetailHeader floating title={t('subscription_title')} />
      <DetailScroll contentContainerClassName="gap-page p-page pb-12" showsVerticalScrollIndicator={false}>
        <View className="rounded-[18px] border border-line bg-white p-5">{status}</View>
        {promo}

        <Section title={t('subscription_compare')}>
          <View className="gap-3">
            {cards.map((def) => (
              <PlanCard
                key={def.plan}
                def={def}
                badge={
                  def.plan === plan.plan
                    ? { label: t('plan_badge_current'), tone: 'success' }
                    : def.soon
                      ? { label: t('plan_soon'), tone: 'neutral' }
                      : undefined
                }
                selected={def.plan === plan.plan}
              />
            ))}
          </View>
        </Section>

        <ListGroup>
          {web ? null : <ListRow icon={RotateCcw} label={t('subscription_restore')} onPress={() => void restore()} />}
          {web ? null : <ListRow icon={Store} label={t('subscription_manage')} onPress={() => void openManageSubscriptions()} />}
          <ListRow icon={ClipboardList} label={t('settings_terms')} onPress={() => void openLegal('terms')} />
          <ListRow icon={Eye} label={t('settings_privacy_policy')} onPress={() => void openLegal('privacy')} />
        </ListGroup>
        {web || !purchase.error || !paid ? null : <FormError message={purchase.error} />}

        <Text className="px-1 text-[12.5px] leading-[17px] text-muted">{t('subscription_footer')}</Text>

        {/* Development builds only: every state of this page can be looked at. (Not in the texts of the app: nobody else sees it.) */}
        {__DEV__ ? (
          <View className="gap-2 rounded-[18px] border border-dashed border-line p-4">
            <Text className="text-[13px] font-semibold text-muted">Development only: give this account a plan</Text>
            <View className="flex-row flex-wrap gap-2">
              {DEV_STATES.map((state) => (
                <Pressable
                  key={state}
                  accessibilityRole="button"
                  onPress={() => void grant(state)}
                  className="flex-row items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 active:opacity-60">
                  <Check size={13} color={colors.primary} />
                  <Text className="text-[14px] font-medium">{state}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/home')} className="self-start py-1 active:opacity-60">
              <Text className="text-[13px] text-muted">Home</Text>
            </Pressable>
          </View>
        ) : null}
      </DetailScroll>
    </Screen>
  );
}
