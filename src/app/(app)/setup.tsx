import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceFields } from '@/components/settings-sheets';
import { BLOCK, BLOCK_ROOM } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import EnterSubmits from '@/components/ui/enter-submits';
import { FormError, Input } from '@/components/ui/input';
import PickerField from '@/components/ui/picker-field';
import SearchPicker from '@/components/ui/search-picker';
import { Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { CURRENCIES, currencyOfCountry, deviceTimeZone } from '@/lib/choices';
import { canonicalZone, countryOfZone } from '@/lib/countries';
import { describeError } from '@/lib/errors';
import { currencyLabel, currencySymbol } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';
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
  const [unit, setUnit] = useState<TensionUnit>(user?.tension_unit ?? 'kg');
  const [zone, setZone] = useState(() => startZone(user?.timezone));
  const [nameError, setNameError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState<'currency' | null>(null);
  const [currencyQuery, setCurrencyQuery] = useState('');

  // A new country brings its currency with it, unless the person has chosen a currency of their own.
  const changeZone = (next: string) => {
    setZone(next);
    if (!currencyChosen) setCurrency(currencyOfCountry(countryOfZone(next)));
  };

  const save = async () => {
    if (saving) return;
    setFormError(undefined);
    if (!name.trim()) {
      setNameError(t('error_name_required'));
      return;
    }
    setSaving(true);
    try {
      // Once this is saved the app moves on by itself: the setup screen is only for accounts without it.
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
        <ScrollView bounces={false} overScrollMode="never"
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
            <View className="gap-1.5">
              <Text className="text-[14.3px] font-medium text-muted">{t('settings_tension_unit')}</Text>
              <Segmented<TensionUnit>
                options={[
                  { value: 'kg', label: 'kg' },
                  { value: 'lbs', label: 'lbs' },
                ]}
                value={unit}
                onChange={setUnit}
              />
              <Text className="text-xs text-muted">{t('setup_unit_hint')}</Text>
            </View>
            <PlaceFields zone={zone} onChange={changeZone} />
          </View>
          <Text className="px-1 text-[14.3px] text-muted">{t('setup_hint')}</Text>
          {formError ? <FormError message={formError} /> : null}
          {/* On the phone the way on is under the page (the dock above); on a wide screen it is under the card. */}
          {wide ? (
            <Shortcut label={t('continue')} color={colors.newOrder} contentColor={colors.ink} onPress={save} loading={saving} />
          ) : null}
          </View>
        </ScrollView>
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
