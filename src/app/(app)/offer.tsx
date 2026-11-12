import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlanCard, usePlanCards, usePrices } from '@/components/plan-cards';
import { Segmented } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import { FormError } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { TRIAL_DAYS } from '@/lib/billing';
import { useI18n } from '@/lib/i18n';
import { useOfferSeen } from '@/lib/offer';
import type { Period } from '@/lib/subscription';
import { usePurchase } from '@/lib/use-purchase';
import { useYearSaving } from '@/lib/use-store-prices';
import SubscriptionTerms from '@/components/subscription-terms';

type Choice = 'free' | 'pro';

/**
 * The screen after the first-run setup: the three plans side by side, Free chosen to begin with, Pro recommended, Studio on its way.
 * Continuing with Free is one tap; Pro starts its free days. It is shown once for an account (see offer.ts), and the plan can be changed
 * later in Settings, Subscription.
 */
export default function Offer() {
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const cards = usePlanCards();
  const prices = usePrices();
  const purchase = usePurchase();
  const yearSaving = useYearSaving();
  const offer = useOfferSeen(user?.id);
  const [selected, setSelected] = useState<Choice>('free');
  const [period, setPeriod] = useState<Period>('year');

  const proceed = async () => {
    if (selected === 'free') {
      offer.markSeen();
    } else if (await purchase.buy(period)) {
      offer.markSeen();
    }
  };

  return (
    <Screen
      dock={
        <Shortcut
          label={selected === 'free' ? t('offer_continue_free') : t('plan_try_pro', { days: TRIAL_DAYS })}
          color={colors.catalog}
          contentColor={colors.ink}
          className="w-full px-5 py-5"
          onPress={proceed}
          loading={purchase.busy === 'buy'}
        />
      }
      footer={<View style={{ height: Math.max(insets.bottom, 12) + 24 }} />}>
      <ScrollView
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        // On a wide screen it is a column in the middle of the page.
        contentContainerClassName="gap-4 px-page pb-8 pt-6 md:grow md:items-center md:justify-center md:px-8 md:py-12">
        <View className="w-full gap-4 md:max-w-[520px]">
          <View className="gap-1.5">
            <Text accessibilityRole="header" className="text-[28px] font-semibold">
              {t('offer_title')}
            </Text>
            <Text className="text-base text-muted">{t('offer_subtitle', { days: TRIAL_DAYS })}</Text>
          </View>

          <View accessibilityRole="radiogroup" className="gap-3">
            {cards.map((def) => (
              <PlanCard
                key={def.plan}
                def={def}
                selectable
                selected={selected === def.plan}
                badge={
                  def.plan === 'free'
                    ? { label: t('plan_badge_default'), tone: 'neutral' }
                    : def.plan === 'pro'
                      ? { label: t('plan_badge_recommended'), tone: 'success' }
                      : { label: t('plan_soon'), tone: 'warning' }
                }
                onPress={def.plan === 'studio' ? undefined : () => setSelected(def.plan as Choice)}>
                {def.plan === 'pro' && selected === 'pro' ? (
                  <Segmented<Period>
                    options={[
                      { value: 'year', label: t('period_year_saving', { percent: yearSaving }) },
                      { value: 'month', label: t('period_month') },
                    ]}
                    value={period}
                    onChange={setPeriod}
                  />
                ) : null}
              </PlanCard>
            ))}
          </View>

          <Text className="px-1 text-[12.5px] leading-4 text-muted">
            {selected === 'free'
              ? t('offer_fine_free')
              : t('plan_then_price', { yearly: prices.proYear, monthly: prices.proMonth })}
          </Text>
          <SubscriptionTerms />
          {purchase.error ? <FormError message={purchase.error} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
