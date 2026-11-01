import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TimeZoneSheet } from '@/components/settings-sheets';
import AppButton from '@/components/ui/app-button';
import { Segmented } from '@/components/ui/chips';
import { FormError, Input } from '@/components/ui/input';
import PickerField from '@/components/ui/picker-field';
import SearchPicker from '@/components/ui/search-picker';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { CURRENCIES, deviceTimeZone, timeZoneLabel } from '@/lib/choices';
import { describeError } from '@/lib/errors';
import { currencySymbol } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { TensionUnit } from '@/lib/types';

export default function Setup() {
  const { user, updateProfile } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(user?.full_name ?? '');
  const [workshop, setWorkshop] = useState(user?.workshop_name ?? '');
  const [currency, setCurrency] = useState(user?.currency ?? 'USD');
  const [unit, setUnit] = useState<TensionUnit>(user?.tension_unit ?? 'kg');
  const [zone, setZone] = useState(user?.timezone && user.timezone !== 'UTC' ? user.timezone : deviceTimeZone());
  const [nameError, setNameError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState<'currency' | 'zone' | null>(null);
  const [currencyQuery, setCurrencyQuery] = useState('');

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
        workshop_name: workshop,
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
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="gap-6 px-page pb-8 pt-6">
          <View className="gap-1.5">
            <Text accessibilityRole="header" className="text-[28px] font-semibold">
              {t('setup_title')}
            </Text>
            <Text className="text-base text-muted">{t('setup_subtitle')}</Text>
          </View>

          <View className="gap-4 rounded-2xl border border-line bg-white p-4">
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
              returnKeyType="next"
            />
            <Input
              label={`${t('field_workshop_name')} · ${t('optional')}`}
              value={workshop}
              onChangeText={setWorkshop}
              autoCapitalize="words"
              returnKeyType="done"
            />
            <PickerField
              label={t('settings_currency')}
              value={`${currency} · ${currencySymbol(currency, language)}`}
              placeholder=""
              onPress={() => setChoosing('currency')}
            />
            <View className="gap-1.5">
              <Text className="text-[13px] font-medium text-muted">{t('settings_tension_unit')}</Text>
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
            <PickerField
              label={t('field_timezone')}
              value={timeZoneLabel(zone)}
              placeholder=""
              onPress={() => setChoosing('zone')}
            />
          </View>
          <Text className="px-1 text-[13px] text-muted">{t('setup_hint')}</Text>
          {formError ? <FormError message={formError} /> : null}
        </ScrollView>

        <View
          className="border-t border-line bg-white px-page pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <AppButton large title={t('continue')} onPress={save} loading={saving} />
        </View>
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
          <Text className="text-base">
            {code} · {currencySymbol(code, language)}
          </Text>
        )}
        onSelect={(code) => {
          setCurrency(code);
          setChoosing(null);
        }}
      />
      <TimeZoneSheet
        visible={choosing === 'zone'}
        onClose={() => setChoosing(null)}
        value={zone}
        onChoose={setZone}
      />
    </Screen>
  );
}
