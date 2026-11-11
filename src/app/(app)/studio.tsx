import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChartColumn, Check, type IconComponent } from '@/components/icons';
import UserIcon from '@/components/icons/user-icon';
import WarehouseIcon from '@/components/icons/warehouse-icon';
import { usePrices } from '@/components/plan-cards';
import { Badge } from '@/components/ui/badge';
import { colors } from '@/components/ui/colors';
import { FormError } from '@/components/ui/input';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';
import { useStudioWaitlist } from '@/lib/use-studio-waitlist';
import { useSubscription } from '@/lib/use-subscription';

/**
 * Studio, the plan for a workshop with several stringers: it does not exist yet, so this page says what it will have, what it costs, and
 * keeps a list of those who want to hear when it is there (the server holds the list, see routes/billing.js). Opened from the card of Studio
 * on the page of the subscription. The look is the one of the team page in the design (the team, the shared stock, the reports by stringer);
 * what the design shows working is only described here, because none of it works yet.
 */
export default function Studio() {
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const plan = useSubscription();
  const prices = usePrices();
  const list = useStudioWaitlist();
  const wide = useIsWide();

  // A server with the plans off has nothing to show.
  if (!user || !plan.enabled) return <Redirect href="/home" />;

  const features: { icon: IconComponent; tint: string; title: string; text: string }[] = [
    { icon: UserIcon, tint: colors.newOrder, title: t('studio_feature_team_title'), text: t('studio_feature_team_text') },
    { icon: WarehouseIcon, tint: colors.catalog, title: t('studio_feature_stock_title'), text: t('studio_feature_stock_text') },
    { icon: ChartColumn, tint: colors.clients, title: t('studio_feature_reports_title'), text: t('studio_feature_reports_text') },
  ];

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
    <Screen flush dock={dock} footer={<View style={{ height: Math.max(insets.bottom, 12) + 24 }} />}>
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

        {list.error ? <FormError message={list.error} /> : null}
        <Text className="px-1 text-[12.5px] leading-[17px] text-muted">{t('studio_footnote')}</Text>
      </DetailScroll>
    </Screen>
  );
}
