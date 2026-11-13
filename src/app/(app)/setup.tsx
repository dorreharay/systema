import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceFields } from '@/components/settings-sheets';
import { BLOCK, BLOCK_ROOM } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import EnterSubmits from '@/components/ui/enter-submits';
import { FormError, Input, NumberInput } from '@/components/ui/input';
import PickerField from '@/components/ui/picker-field';
import { RevealContext, usePageReveal } from '@/components/ui/reveal';
import SearchPicker from '@/components/ui/search-picker';
import { Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { CURRENCIES, currencyOfCountry, deviceTimeZone, tensionUnitOfCountry } from '@/lib/choices';
import { canonicalZone, countryOfZone } from '@/lib/countries';
import { describeError } from '@/lib/errors';
import { currencyLabel, currencySymbol, formatNumber, parseDecimal } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';
import { useServices, useUpdateService } from '@/lib/queries';
import type { TensionUnit } from '@/lib/types';

// Where the setup starts: the zone the account has, or the phone's while the account has only UTC (it has not been set up).
const startZone = (timezone: string | null | undefined) => canonicalZone(timezone && timezone !== 'UTC' ? timezone : deviceTimeZone());

export default function Setup() {
  const { user, updateProfile } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  // A currency that the account already holds (anything but the server's USD) is the person's own and stays. Otherwise the currency is the
  // one of the country (US dollars where the app has none for it), and it goes on following the country until the person chooses one.
  const held = user?.currency && user.currency !== 'USD' ? user.currency : undefined;
  const [name, setName] = useState(user?.full_name ?? '');
  const [currency, setCurrency] = useState(() => held ?? currencyOfCountry(countryOfZone(startZone(user?.timezone))));
  const [currencyChosen, setCurrencyChosen] = useState(held !== undefined);
  // The tension unit follows the country in the same way, until the person chooses one: it is the usual one of the country, and kilograms
  // where the app knows nothing of it. The server starts every account with kilograms, so only another unit counts as the person's own.
  const heldUnit = user?.tension_unit && user.tension_unit !== 'kg' ? user.tension_unit : undefined;
  const [unit, setUnit] = useState<TensionUnit>(() => heldUnit ?? tensionUnitOfCountry(countryOfZone(startZone(user?.timezone))));
  const [unitChosen, setUnitChosen] = useState(heldUnit !== undefined);
  const [zone, setZone] = useState(() => startZone(user?.timezone));
  const [nameError, setNameError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState<'currency' | null>(null);
  const [currencyQuery, setCurrencyQuery] = useState('');
  // The service price is at the foot of the page, so on Android a field that gets the cursor is brought into sight above the keyboard
  // (the same help as the new order's); iOS scrolls to it by itself.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const pageReveal = usePageReveal(scrollRef);
  // The base service, the stringing work that every order gets (kind labor), is priced here, at once, so that its price fills every new
  // order. Only its price is asked for: the name stays as the server made it (it is changed in Settings, under Services & Pricing). The
  // price is what the person has typed, and until they type, what the service has, so a service left alone is not written.
  const services = useServices();
  const updateService = useUpdateService();
  const main = services.data?.find((service) => service.kind === 'labor');
  const [servicePrice, setServicePrice] = useState<string>();
  const [servicePriceError, setServicePriceError] = useState<string>();
  const shownPrice = servicePrice ?? (main?.price == null ? '' : formatNumber(main.price, 2));

  // A new country brings its currency and its tension unit with it, unless the person has chosen their own.
  const changeZone = (next: string) => {
    setZone(next);
    if (!currencyChosen) setCurrency(currencyOfCountry(countryOfZone(next)));
    if (!unitChosen) setUnit(tensionUnitOfCountry(countryOfZone(next)));
  };

  const save = async () => {
    if (saving) return;
    setFormError(undefined);
    // The price is checked only once the person has touched it.
    const typed = servicePrice !== undefined;
    const amount = parseDecimal(shownPrice);
    const problems = {
      name: name.trim() ? undefined : t('error_name_required'),
      servicePrice: typed && shownPrice.trim() && (amount === null || amount < 0) ? t('error_number') : undefined,
    };
    setNameError(problems.name);
    setServicePriceError(problems.servicePrice);
    // The name is the first field: with the page scrolled down to the price, its message would be out of sight.
    if (problems.name) scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (problems.name || problems.servicePrice) return;
    setSaving(true);
    try {
      // The price goes first: once the profile is saved the app moves on by itself (the setup screen is only for accounts without it).
      if (typed && main) await updateService.mutateAsync({ id: main.id, price: amount });
      await updateProfile({
        full_name: name,
        currency,
        tension_unit: unit,
        timezone: zone,
        setup_completed: true,
      });
      router.replace('/home');
    } catch (error) {
      setFormError(describeError(error, t));
      setSaving(false);
    }
  };

  const currencies = CURRENCIES.filter((code) =>
    `${code} ${currencySymbol(code, language)}`.toLowerCase().includes(currencyQuery.trim().toLowerCase())
  );

  return (
    <Screen
      // The way on stands under the page, on the dark ground, like the buttons of the other pages: it steps aside
      // while the keyboard is up.
      dock={
        <Shortcut
          label={t('continue')}
          color={colors.newOrder}
          contentColor={colors.ink}
          className="px-5 py-5 w-full"
          onPress={save}
          loading={saving}
        />
      }
      footer={<View style={{ height: Math.max(insets.bottom, 12) + 24 }} />}>
      {/* The keyboard covers the foot of the page on Android as well (the window is edge to edge and does not shrink for it). */}
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} className="flex-1">
        {/* Enter in a field of one line continues, on the web. */}
        <EnterSubmits
          className="flex-1"
          onSubmit={() => {
            if (!saving) void save();
          }}>
        <RevealContext value={pageReveal.reveal}>
        <ScrollView ref={scrollRef} {...pageReveal.scrollProps} bounces={false} overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          // On a wide screen it is a card in the middle of the page.
          contentContainerClassName="gap-6 px-page pb-8 pt-6 md:grow md:items-center md:justify-center md:px-8 md:py-12">
          <View className="w-full gap-6 md:max-w-[520px]">
          <View className="gap-1.5">
            <Text accessibilityRole="header" className="text-[28px] font-semibold">
              {t('setup_title')}
            </Text>
            <Text className="text-base text-muted">{t('setup_subtitle')}</Text>
          </View>

          <View className={`${BLOCK} ${BLOCK_ROOM} gap-4`}>
            <Input
              label={t('field_full_name')}
              value={name}
              onChangeText={(value) => {
                setName(value);
                setNameError(undefined);
              }}
              error={nameError}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="done"
            />
            <PickerField
              label={t('settings_currency')}
              value={currencyLabel(currency, language)}
              placeholder=""
              onPress={() => setChoosing('currency')}
            />
            {/* The country is above the tension unit: the unit follows it. */}
            <PlaceFields zone={zone} onChange={changeZone} />
            <View className="gap-1.5">
              <Text className="text-[14.3px] font-medium text-muted">{t('settings_tension_unit')}</Text>
              <Segmented<TensionUnit>
                options={[
                  { value: 'kg', label: 'kg' },
                  { value: 'lbs', label: 'lbs' },
                ]}
                value={unit}
                onChange={(value) => {
                  setUnit(value);
                  setUnitChosen(true);
                }}
              />
              <Text className="text-xs text-muted">{t('setup_unit_hint')}</Text>
            </View>
          </View>
          {/* The base service: a question about its price, and under the field what makes it the one to set now. Drawn once the account's
              stringing service has come with the list of services (there is nothing to price before that). */}
          {main ? (
            <View className={`${BLOCK} ${BLOCK_ROOM} gap-3`}>
              <Text className="text-base font-semibold">{t('setup_service_question')}</Text>
              <NumberInput
                accessibilityLabel={t('setup_service_question')}
                value={shownPrice}
                onChangeText={(value) => {
                  setServicePrice(value);
                  setServicePriceError(undefined);
                }}
                error={servicePriceError}
                hint={t('setup_service_hint')}
                prefix={<Text className="text-base text-muted">{currencySymbol(currency, language)}</Text>}
                returnKeyType="done"
                onSubmitEditing={() => void save()}
              />
            </View>
          ) : null}
          <Text className="px-1 text-[14.3px] text-muted">{t('setup_hint')}</Text>
          {formError ? <FormError message={formError} /> : null}
          {/* On the phone the way on is under the page (the dock above); on a wide screen it is under the card. */}
          {wide ? (
            <Shortcut label={t('continue')} color={colors.newOrder} contentColor={colors.ink} onPress={save} loading={saving} />
          ) : null}
          </View>
        </ScrollView>
        </RevealContext>
        </EnterSubmits>
      </KeyboardAvoidingView>

      <SearchPicker
        visible={choosing === 'currency'}
        onClose={() => setChoosing(null)}
        title={t('settings_currency')}
        placeholder={t('search')}
        items={currencies}
        keyOf={(code) => code}
        selectedKey={currency}
        onQueryChange={setCurrencyQuery}
        renderItem={(code) => (
          <Text className="text-base">{currencyLabel(code, language)}</Text>
        )}
        onSelect={(code) => {
          setCurrency(code);
          setCurrencyChosen(true);
          setChoosing(null);
        }}
      />
    </Screen>
  );
}
