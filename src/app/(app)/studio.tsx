import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChartColumn, Check, Smartphone, type IconComponent } from '@/components/icons';
import UserIcon from '@/components/icons/user-icon';
import WarehouseIcon from '@/components/icons/warehouse-icon';
import { CardNote, usePrices } from '@/components/plan-cards';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import { FormError } from '@/components/ui/input';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { SELLS_PLANS, TRIAL_DAYS } from '@/lib/billing';
import { useI18n } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';
import type { Period } from '@/lib/subscription';
import { usePurchase } from '@/lib/use-purchase';
import { useYearSaving } from '@/lib/use-store-prices';
import { useStudioWaitlist } from '@/lib/use-studio-waitlist';
import { useSubscription } from '@/lib/use-subscription';
import SubscriptionTerms from '@/components/subscription-terms';

/**
 * Studio, the plan for a workshop with several stringers. Where the server does not have it yet (`plan.studioAvailable` is false) this page
 * says what it will have, what it costs, and keeps a list of those who want to hear when it is there (the server holds the list, see
 * routes/billing.js). Where it does, the page is the way to it: whoever works in a workshop is sent to its team; the owner who holds
 * Studio is told it is on, with the way to the team; everyone else can start it, the way Pro is started (the store's own sheet; where plans
 * are not bought, the web and Android, the page says where it is). Opened from the card of Studio on the page of the subscription. The
 * look is the one of the team page in the design (the team, the shared stock, the reports by stringer).
 */
export default function Studio() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const plan = useSubscription();
  const prices = usePrices();
  const list = useStudioWaitlist();
  const purchase = usePurchase();
  const yearSaving = useYearSaving('studio', plan.studioAvailable);
  const wide = useIsWide();
  const [period, setPeriod] = useState<Period>('year');

  // A server with the plans off has nothing to show.
  if (!user || !plan.enabled) return <Redirect href="/home" />;
  // Studio is there, and this person works in a workshop that has it: the team is the page for them, and there is nothing to buy.
  if (plan.studioAvailable && plan.member) return <Redirect href="/team" />;

  const features: { icon: IconComponent; tint: string; title: string; text: string }[] = [
    { icon: UserIcon, tint: colors.newOrder, title: t('studio_feature_team_title'), text: t('studio_feature_team_text') },
    { icon: WarehouseIcon, tint: colors.catalog, title: t('studio_feature_stock_title'), text: t('studio_feature_stock_text') },
    { icon: ChartColumn, tint: colors.clients, title: t('studio_feature_reports_title'), text: t('studio_feature_reports_text') },
  ];

  const featureList = (
    <View className="rounded-[18px] border border-line bg-white px-5">
      {features.map((feature, index) => (
        <View key={feature.title} className={`flex-row items-center gap-3.5 py-4 ${index > 0 ? 'border-t border-line' : ''}`}>
          <View className="size-11 items-center justify-center rounded-full" style={{ backgroundColor: feature.tint }}>
            <feature.icon size={20} color={colors.ink} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-base font-semibold">{feature.title}</Text>
            <Text className="text-[13.5px] leading-[18px] text-muted">{feature.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const footer = <View style={{ height: Math.max(insets.bottom, 12) + 24 }} />;

  // --- Studio is not at this server yet: the list ---------------------------------------------------------

  if (!plan.studioAvailable) {
    // Asking is the yellow button of the page; once on the list, taking it back is the grey one (the secondary kind). On a wide page the
    // button is in the header, on the page's own grey: it is white there, or it would not show.
    const dock = plan.studioWaitlist ? (
      <Shortcut
        label={t('studio_leave')}
        color={wide ? colors.white : colors.surface}
        contentColor={colors.ink}
        className="w-full px-5 py-5"
        loading={list.busy}
        onPress={() => void list.leave()}
      />
    ) : (
      <Shortcut
        label={t('studio_notify')}
        color={colors.clients}
        contentColor={colors.ink}
        className="w-full px-5 py-5"
        loading={list.busy}
        onPress={() => void list.join()}
      />
    );

    return (
      <Screen flush dock={dock} footer={footer}>
        <DetailHeader floating title={t('plan_studio')} />
        <DetailScroll contentContainerClassName="gap-page p-page pb-12" showsVerticalScrollIndicator={false}>
          <View className="gap-3 rounded-[18px] border border-line bg-white p-5">
            <View className="flex-row items-center gap-2.5">
              <Text className="text-[22px] font-bold">{t('plan_studio')}</Text>
              <Badge label={t('plan_soon')} tone="warning" />
            </View>
            <Text className="text-[15px] leading-[21px] text-secondary">{t('studio_lead')}</Text>
            <View>
              <Text className="text-[22px] font-bold">{t('plan_per_month', { price: prices.studioMonth })}</Text>
              <Text className="text-[13.5px] text-muted">{t('plan_studio_sub', { yearly: prices.studioYear })}</Text>
            </View>
          </View>

          {plan.studioWaitlist ? (
            <View className="flex-row items-start gap-3 rounded-[18px] border border-[#cfe0d8] bg-primary-soft p-5">
              <View className="mt-0.5">
                <Check size={18} color={colors.primary} />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-base font-bold text-primary">{t('studio_listed_title')}</Text>
                <Text className="text-[14px] leading-5 text-secondary">{t('studio_listed_text', { email: user.email })}</Text>
              </View>
            </View>
          ) : null}

          {featureList}

          {list.error ? <FormError message={list.error} /> : null}
          <Text className="px-1 text-[12.5px] leading-[17px] text-muted">{t('studio_footnote')}</Text>
        </DetailScroll>
      </Screen>
    );
  }

  // --- Studio is held: it is on, and the team is one tap away ------------------------------------------------

  if (plan.plan === 'studio') {
    return (
      <Screen
        flush
        dock={
          <Shortcut
            label={t('studio_open_team')}
            color={colors.clients}
            contentColor={colors.ink}
            className="w-full px-5 py-5"
            onPress={() => router.push('/team')}
          />
        }
        footer={footer}>
        <DetailHeader floating title={t('plan_studio')} />
        <DetailScroll contentContainerClassName="gap-page p-page pb-12" showsVerticalScrollIndicator={false}>
          <View className="flex-row items-start gap-3 rounded-[18px] border border-[#cfe0d8] bg-primary-soft p-5">
            <View className="mt-0.5">
              <Check size={18} color={colors.primary} />
            </View>
            <View className="flex-1 gap-1">
              <Text accessibilityRole="header" className="text-base font-bold text-primary">
                {t('studio_on_title')}
              </Text>
              <Text className="text-[14px] leading-5 text-secondary">{t('studio_on_text', { seats: plan.seats })}</Text>
            </View>
          </View>

          {featureList}
        </DetailScroll>
      </Screen>
    );
  }

  // --- Studio can be had: the way Pro is started ---------------------------------------------------------------

  // The free days are a store's first-subscription offer, once for each subscription group: not promised to someone who has held a plan.
  const firstPlan = plan.plan === 'free' && !plan.expired;

  const dock = SELLS_PLANS ? (
    <Shortcut
      label={firstPlan ? t('studio_try', { days: TRIAL_DAYS }) : t('studio_get')}
      color={colors.clients}
      contentColor={colors.ink}
      className="w-full px-5 py-5"
      loading={purchase.busy === 'buy'}
      onPress={() => void purchase.buy(period, 'studio')}
    />
  ) : undefined;

  return (
    <Screen flush dock={dock} footer={footer}>
      <DetailHeader floating title={t('plan_studio')} />
      <DetailScroll contentContainerClassName="gap-page p-page pb-28 md:pb-12" showsVerticalScrollIndicator={false}>
        <View className="gap-3 rounded-[18px] border border-line bg-white p-5">
          <Text className="text-[22px] font-bold">{t('plan_studio')}</Text>
          <Text className="text-[15px] leading-[21px] text-secondary">{t('studio_lead')}</Text>
          <View>
            <Text className="text-[22px] font-bold">{t('plan_per_month', { price: prices.studioMonth })}</Text>
            <Text className="text-[13.5px] text-muted">{t('plan_studio_sub', { yearly: prices.studioYear })}</Text>
          </View>
          {SELLS_PLANS ? (
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
                {t('plan_then_price', { yearly: prices.studioYear, monthly: prices.studioMonth })}
              </Text>
            </>
          ) : (
            // The web points to the iPhone app; Android, which may be all the person has, says straight that there is no purchase yet.
            <CardNote tone="info" icon={Smartphone} label={t(Platform.OS === 'android' ? 'plan_buy_android' : 'plan_buy_in_app')} />
          )}
        </View>

        {featureList}

        {purchase.error ? <FormError message={purchase.error} /> : null}
        {SELLS_PLANS ? <SubscriptionTerms /> : null}
      </DetailScroll>
    </Screen>
  );
}
