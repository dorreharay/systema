import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Check } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { LIST_PRICES, TRIAL_DAYS } from '@/lib/billing';
import { useI18n, type Language } from '@/lib/i18n';
import type { Plan } from '@/lib/subscription';
import { useStorePrices } from '@/lib/use-store-prices';

// The three plans as the cards of the offer and of the subscription page say them. The prices of Pro are the store's own, in the money of
// the person's country, once it has said (lib/use-store-prices.ts); until then, and where there is no store, the list prices in dollars
// (lib/billing.ts).

export type PlanCardDef = {
  plan: Plan;
  name: string;
  price: string;
  sub: string;
  bullets: string[];
  // Not there yet: shown, and not to be chosen.
  soon: boolean;
};

/** A price in dollars, the short way: "$9.99", with the decimal mark of the language ("$9,99"). */
function dollars(amount: number, language: Language) {
  const digits = Number.isInteger(amount) ? 0 : 2;
  try {
    const number = new Intl.NumberFormat(language === 'pt' ? 'pt-BR' : language, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
    return '$' + number;
  } catch {
    return '$' + amount.toFixed(digits);
  }
}

/** The prices as text: the store's for Pro ("₴249,99", as it writes it), the list's in dollars for the rest ("$9.99"). */
export function usePrices() {
  const { language } = useI18n();
  const store = useStorePrices();
  const money = (amount: number) => dollars(amount, language);
  return {
    proMonth: store?.month?.text ?? money(LIST_PRICES.pro.month),
    proYear: store?.year?.text ?? money(LIST_PRICES.pro.year),
    studioMonth: money(LIST_PRICES.studio.month),
    studioYear: money(LIST_PRICES.studio.year),
  };
}

export function usePlanCards(): PlanCardDef[] {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const prices = usePrices();
  // What Free allows is the server's word; the number here is only for a profile that does not say.
  const freeLimit = user?.subscription?.free.orders_per_month ?? 15;

  return [
    {
      plan: 'free',
      name: t('plan_free'),
      price: dollars(0, language),
      sub: t('plan_free_sub'),
      bullets: [
        t('plan_free_orders', { count: freeLimit }),
        t('plan_bullet_clients'),
        t('plan_bullet_messages'),
        t('plan_bullet_offline'),
      ],
      soon: false,
    },
    {
      plan: 'pro',
      name: t('plan_pro'),
      price: t('plan_per_month', { price: prices.proMonth }),
      sub: t('plan_pro_sub', { yearly: prices.proYear, days: TRIAL_DAYS }),
      bullets: [
        t('plan_bullet_unlimited'),
        t('plan_bullet_stock'),
        t('plan_bullet_overview'),
        t('plan_bullet_soon'),
      ],
      soon: false,
    },
    {
      plan: 'studio',
      name: t('plan_studio'),
      price: t('plan_per_month', { price: prices.studioMonth }),
      sub: t('plan_studio_sub', { yearly: prices.studioYear }),
      bullets: [t('plan_bullet_all_pro'), t('plan_bullet_team'), t('plan_bullet_team_stock')],
      soon: true,
    },
  ];
}

/** What a plan has, one line each, with a tick. */
export function PlanBullets({ items, tight }: { items: string[]; tight?: boolean }) {
  return (
    <View className={tight ? 'gap-1.5' : 'gap-2'}>
      {items.map((item) => (
        <View key={item} className="flex-row items-start gap-2.5">
          <View className="mt-[3px]">
            <Check size={15} color={colors.primary} />
          </View>
          <Text className="flex-1 text-[14.3px] leading-[20px] text-secondary">{item}</Text>
        </View>
      ))}
    </View>
  );
}

type PlanCardProps = {
  def: PlanCardDef;
  badge?: { label: string; tone: 'success' | 'neutral' };
  // The card can be chosen (the offer): it shows a round mark, and the chosen one is framed.
  selectable?: boolean;
  selected?: boolean;
  onPress?: () => void;
  // Under the list of what the plan has: the choice of the period, a button.
  children?: ReactNode;
};

/** One plan: its name, its price, what it has. */
export function PlanCard({ def, badge, selectable, selected, onPress, children }: PlanCardProps) {
  const { t } = useI18n();
  const inactive = def.soon;

  const body = (
    <View className={`gap-2 ${inactive ? 'opacity-60' : ''}`}>
      <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
        {selectable ? (
          <View
            className={`size-5 items-center justify-center rounded-full border-2 ${selected ? 'border-primary' : 'border-neutral-400'}`}>
            {selected ? <View className="size-2.5 rounded-full bg-primary" /> : null}
          </View>
        ) : null}
        <Text className="text-[19px] font-bold">{def.name}</Text>
        {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
        <Text className="ml-auto text-[19px] font-bold">{def.price}</Text>
      </View>
      <Text className={`text-[13.5px] text-muted ${selectable ? 'ml-[30px]' : ''}`}>{def.sub}</Text>
      <View className={selectable ? 'ml-[30px] mt-1' : 'mt-1'}>
        <PlanBullets items={def.bullets} tight />
      </View>
    </View>
  );

  const frame = `rounded-[19px] border-2 ${selected ? 'border-primary' : 'border-transparent'}`;

  return (
    <View className={frame}>
      <View className="rounded-[17px] border border-line bg-white px-5 py-4">
        {onPress && !inactive ? (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: !!selected }}
            accessibilityLabel={`${def.name}, ${def.price}`}
            onPress={onPress}
            className="active:opacity-70">
            {body}
          </Pressable>
        ) : (
          <View accessibilityLabel={inactive ? `${def.name}, ${t('plan_soon')}` : undefined}>{body}</View>
        )}
        {children ? <View className="mt-3">{children}</View> : null}
      </View>
    </View>
  );
}
