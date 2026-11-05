import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Check, KeyRound, Trash2 } from '@/components/icons';
import EnterSubmits from '@/components/ui/enter-submits';
import { colors } from '@/components/ui/colors';
import { FormError, Input } from '@/components/ui/input';
import PickerField from '@/components/ui/picker-field';
import SearchPicker from '@/components/ui/search-picker';
import Sheet from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { CURRENCIES, deviceTimeZone, timeZoneLabel } from '@/lib/choices';
import {
  canonicalZone,
  countryList,
  countryName,
  countryOfAccount,
  countryOfZone,
  zoneChoices,
  zoneForCountry,
} from '@/lib/countries';
import { describeAuthError, describeError, isApiError } from '@/lib/errors';
import { currencySymbol } from '@/lib/format';
import { LANGUAGES, useI18n, type Language } from '@/lib/i18n';

type SheetProps = { visible: boolean; onClose: () => void };

/** A list to pick one from, searched as you type, with the current choice ticked. */
function ChoiceSheet<T extends string>({
  visible,
  onClose,
  title,
  placeholder,
  options,
  value,
  label,
  onChoose,
  matchCode = true,
}: SheetProps & {
  title: string;
  placeholder: string;
  options: T[];
  value: T;
  label: (option: T) => string;
  onChoose: (option: T) => void;
  // Whether what is typed is looked for in the code of an option too (a currency is found by its code); off where the code says
  // nothing to the person (the two letters of a country would match half of the names).
  matchCode?: boolean;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((option) => {
      const text = `${matchCode ? option : ''} ${label(option)}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    // `label` only depends on the language and does not change while the list is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, query]);

  return (
    <SearchPicker
      visible={visible}
      onClose={onClose}
      title={title}
      placeholder={placeholder}
      items={shown}
      keyOf={(option) => option}
      selectedKey={value}
      onQueryChange={setQuery}
      renderItem={(option) => (
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-base">{label(option)}</Text>
          {option === value ? <Check size={20} color={colors.primary} /> : null}
        </View>
      )}
      onSelect={(option) => {
        onChoose(option);
        onClose();
      }}
    />
  );
}

export function CurrencySheet({ visible, onClose }: SheetProps) {
  const { user, updateProfile } = useAuth();
  const { t, language } = useI18n();
  const toast = useToast();
  return (
    <ChoiceSheet
      visible={visible}
      onClose={onClose}
      title={t('settings_currency')}
      placeholder={t('search')}
      options={CURRENCIES}
      value={user?.currency ?? 'USD'}
      label={(code) => `${code} · ${currencySymbol(code, language)}`}
      onChoose={(currency) =>
        updateProfile({ currency }).then(
          () => toast.success(t('settings_saved')),
          (error) => toast.error(describeError(error, t))
        )
      }
    />
  );
}

export function LanguageSheet({ visible, onClose }: SheetProps) {
  const { updateProfile } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const toast = useToast();
  return (
    <ChoiceSheet<Language>
      visible={visible}
      onClose={onClose}
      title={t('settings_language')}
      placeholder={t('search')}
      options={LANGUAGES.map((item) => item.code)}
      value={language}
      label={(code) => LANGUAGES.find((item) => item.code === code)?.label ?? code}
      onChoose={(next) => {
        // The screen changes language at once; saving it to the account follows.
        setLanguage(next);
        updateProfile({ language: next }).catch((error) => toast.error(describeError(error, t)));
      }}
    />
  );
}

/** The countries of the world by name, to choose where the workshop is. */
export function CountrySheet({
  visible,
  onClose,
  value,
  onChoose,
}: SheetProps & { value?: string; onChoose: (country: string) => void }) {
  const { t, language } = useI18n();
  const options = useMemo(() => countryList(language), [language]);
  return (
    <ChoiceSheet
      visible={visible}
      onClose={onClose}
      title={t('settings_country')}
      placeholder={t('search')}
      options={options}
      value={value ?? ''}
      label={(code) => countryName(code, language)}
      onChoose={onChoose}
      matchCode={false}
    />
  );
}

/** The time zones of one country, for the large ones that have several. */
export function TimeZoneSheet({
  visible,
  onClose,
  country,
  value,
  onChoose,
}: SheetProps & { country: string; value: string; onChoose: (zone: string) => void }) {
  const { t } = useI18n();
  const options = useMemo(() => [...zoneChoices(country)], [country]);
  return (
    <ChoiceSheet
      visible={visible}
      onClose={onClose}
      title={t('field_timezone')}
      placeholder={t('search')}
      options={options}
      value={value}
      label={timeZoneLabel}
      onChoose={onChoose}
      matchCode={false}
    />
  );
}

/**
 * Where the workshop is, for a form: the country is chosen, and the time zone comes with it. A country with several time zones
 * shows a field for them under it, with one of them already set.
 */
export function PlaceFields({ zone, onChange }: { zone: string; onChange: (zone: string) => void }) {
  const { t, language } = useI18n();
  const [choosing, setChoosing] = useState<'country' | 'zone' | null>(null);
  const country = countryOfZone(zone);
  return (
    <>
      <PickerField
        label={t('settings_country')}
        value={country ? countryName(country, language) : undefined}
        placeholder={t('country_choose')}
        onPress={() => setChoosing('country')}
      />
      {country && zoneChoices(country).length > 1 ? (
        <PickerField label={t('field_timezone')} value={timeZoneLabel(zone)} placeholder="" onPress={() => setChoosing('zone')} />
      ) : null}
      <CountrySheet
        visible={choosing === 'country'}
        onClose={() => setChoosing(null)}
        value={country}
        onChoose={(next) => onChange(zoneForCountry(next, zone))}
      />
      {country ? (
        <TimeZoneSheet
          visible={choosing === 'zone'}
          onClose={() => setChoosing(null)}
          country={country}
          value={zone}
          onChoose={onChange}
        />
      ) : null}
    </>
  );
}

/** The country in Settings: it is saved as it is chosen, as a time zone of that country. */
export function CountrySettingsSheet({ visible, onClose }: SheetProps) {
  const { user, updateProfile } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  return (
    <CountrySheet
      visible={visible}
      onClose={onClose}
      value={countryOfAccount(user?.timezone)}
      onChoose={(country) =>
        updateProfile({ timezone: zoneForCountry(country, user?.timezone) }).then(
          () => toast.success(t('settings_saved')),
          (error) => toast.error(describeError(error, t))
        )
      }
    />
  );
}

/** The time zone in Settings, for a country that has several. */
export function TimeZoneSettingsSheet({ visible, onClose }: SheetProps) {
  const { user, updateProfile } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const country = countryOfAccount(user?.timezone);
  if (!country) return null;
  return (
    <TimeZoneSheet
      visible={visible}
      onClose={onClose}
      country={country}
      value={user?.timezone ?? ''}
      onChoose={(timezone) =>
        updateProfile({ timezone }).then(
          () => toast.success(t('settings_saved')),
          (error) => toast.error(describeError(error, t))
        )
      }
    />
  );
}

function ProfileForm({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(user?.full_name ?? '');
  const [zone, setZone] = useState(canonicalZone(user?.timezone && user.timezone !== 'UTC' ? user.timezone : deviceTimeZone()));
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setFormError(undefined);
    try {
      await updateProfile({ full_name: name, timezone: zone });
      toast.success(t('settings_saved'));
      onClose();
    } catch (error) {
      setFormError(describeError(error, t));
      setSaving(false);
    }
  };

  return (
    <>
      <EnterSubmits
        className="gap-3 pt-2"
        onSubmit={() => {
          if (!saving) void save();
        }}>
        <Input
          label={t('field_full_name')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <PlaceFields zone={zone} onChange={setZone} />
        {formError ? <FormError message={formError} /> : null}
      </EnterSubmits>
      <View className="pt-4">
        <Shortcut compact icon={Check} label={t('save')} color={colors.primary} contentColor={colors.white} onPress={save} loading={saving} />
      </View>
    </>
  );
}

export function ProfileSheet({ visible, onClose }: SheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} form title={t('settings_profile')}>
      <ProfileForm onClose={onClose} />
    </Sheet>
  );
}

function DeleteAccountForm() {
  const { user, deleteAccount } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  // An account made with Google has no password to ask for. A profile saved by an older version of the app does not say,
  // and is taken to have one.
  const needsPassword = user?.has_password !== false;

  const remove = async () => {
    if (deleting) return;
    if (needsPassword && !password) {
      setPasswordError(t('validation_password_required'));
      return;
    }
    setDeleting(true);
    setPasswordError(undefined);
    setFormError(undefined);
    try {
      await deleteAccount(needsPassword ? password : undefined);
      // The person is signed out by now and this form is gone: the message is shown over the sign-in screens.
      toast.success(t('account_deleted'));
    } catch (error) {
      if (isApiError(error, 'invalid_password')) {
        setPasswordError(describeError(error, t));
      } else {
        setFormError(describeAuthError(error, t));
      }
      setDeleting(false);
    }
  };

  return (
    <>
      <EnterSubmits
        className="gap-3 pt-2"
        onSubmit={() => {
          if (!deleting) void remove();
        }}>
        <Text className="text-[16.5px] text-muted">{t('account_delete_warning')}</Text>
        {needsPassword ? (
          <Input
            label={t('account_delete_password')}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setPasswordError(undefined);
            }}
            error={passwordError}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={remove}
          />
        ) : null}
        {formError ? <FormError message={formError} /> : null}
      </EnterSubmits>
      <View className="pt-4">
        <Shortcut
          compact
          icon={Trash2}
          label={t('account_delete_confirm')}
          color={colors.danger}
          contentColor={colors.white}
          onPress={remove}
          loading={deleting}
        />
      </View>
    </>
  );
}

function DeleteAccountSheet({ visible, onClose }: SheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} form title={t('account_delete')}>
      <DeleteAccountForm />
    </Sheet>
  );
}

function AccountBody({ onClose }: { onClose: () => void }) {
  const { user, requestPasswordReset } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sendReset = async () => {
    if (!user) return;
    setSending(true);
    try {
      await requestPasswordReset(user.email);
      toast.success(t('account_reset_sent'));
      onClose();
    } catch (error) {
      toast.error(describeAuthError(error, t));
      setSending(false);
    }
  };

  return (
    <View className="gap-4 pt-2">
      <View className="gap-0.5">
        <Text className="text-[14.3px] font-medium text-muted">{t('field_email')}</Text>
        <Text className="text-base">{user?.email}</Text>
      </View>
      <Text className="text-[16.5px] text-muted">{t('account_password_hint')}</Text>
      <Shortcut
        compact
        icon={KeyRound}
        label={t('account_reset_password')}
        color={colors.primary} contentColor={colors.white}
        onPress={sendReset}
        loading={sending}
      />
      <View className="border-t border-line pt-4">
        <Shortcut
          compact
          icon={Trash2}
          label={t('account_delete')}
          color={colors.surface}
          contentColor={colors.danger}
          onPress={() => setDeleting(true)}
        />
      </View>
      <DeleteAccountSheet visible={deleting} onClose={() => setDeleting(false)} />
    </View>
  );
}

export function AccountSheet({ visible, onClose }: SheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('settings_account')}>
      <AccountBody onClose={onClose} />
    </Sheet>
  );
}
