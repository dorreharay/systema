import { Check } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import AppButton from '@/components/ui/app-button';
import { colors } from '@/components/ui/colors';
import { FormError, Input } from '@/components/ui/input';
import PickerField from '@/components/ui/picker-field';
import SearchPicker from '@/components/ui/search-picker';
import Sheet from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { CURRENCIES, TIME_ZONES, deviceTimeZone, timeZoneLabel } from '@/lib/choices';
import { describeError } from '@/lib/errors';
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
}: SheetProps & {
  title: string;
  placeholder: string;
  options: T[];
  value: T;
  label: (option: T) => string;
  onChoose: (option: T) => void;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((option) => {
      const text = `${option} ${label(option)}`.toLowerCase();
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

export function TimeZoneSheet({
  visible,
  onClose,
  value,
  onChoose,
}: SheetProps & { value: string; onChoose: (zone: string) => void }) {
  const { t } = useI18n();
  const options = useMemo(() => {
    const device = deviceTimeZone();
    return TIME_ZONES.includes(device) ? TIME_ZONES : [device, ...TIME_ZONES];
  }, []);
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
    />
  );
}

function ProfileForm({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(user?.full_name ?? '');
  const [zone, setZone] = useState(user?.timezone ?? deviceTimeZone());
  const [choosingZone, setChoosingZone] = useState(false);
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
      <View className="gap-3 pt-2">
        <Input
          label={t('field_full_name')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <PickerField
          label={t('field_timezone')}
          value={timeZoneLabel(zone)}
          placeholder=""
          onPress={() => setChoosingZone(true)}
        />
        {formError ? <FormError message={formError} /> : null}
      </View>
      <View className="pt-4">
        <AppButton large title={t('save')} onPress={save} loading={saving} />
      </View>
      <TimeZoneSheet
        visible={choosingZone}
        onClose={() => setChoosingZone(false)}
        value={zone}
        onChoose={setZone}
      />
    </>
  );
}

export function ProfileSheet({ visible, onClose }: SheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('settings_profile')}>
      <ProfileForm onClose={onClose} />
    </Sheet>
  );
}

function WorkshopForm({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(user?.workshop_name ?? '');
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setFormError(undefined);
    try {
      await updateProfile({ workshop_name: name });
      toast.success(t('settings_saved'));
      onClose();
    } catch (error) {
      setFormError(describeError(error, t));
      setSaving(false);
    }
  };

  return (
    <>
      <View className="gap-3 pt-2">
        <Input
          label={`${t('field_workshop_name')} · ${t('optional')}`}
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={save}
          hint={t('workshop_hint')}
        />
        {formError ? <FormError message={formError} /> : null}
      </View>
      <View className="pt-4">
        <AppButton large title={t('save')} onPress={save} loading={saving} />
      </View>
    </>
  );
}

export function WorkshopSheet({ visible, onClose }: SheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('settings_workshop')}>
      <WorkshopForm onClose={onClose} />
    </Sheet>
  );
}

function AccountBody({ onClose }: { onClose: () => void }) {
  const { user, requestPasswordReset } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  const sendReset = async () => {
    if (!user) return;
    setSending(true);
    try {
      await requestPasswordReset(user.email);
      toast.success(t('account_reset_sent'));
      onClose();
    } catch (error) {
      toast.error(describeError(error, t));
      setSending(false);
    }
  };

  return (
    <View className="gap-4 pt-2">
      <View className="gap-0.5">
        <Text className="text-[13px] font-medium text-muted">{t('field_email')}</Text>
        <Text className="text-base">{user?.email}</Text>
      </View>
      <Text className="text-[15px] text-muted">{t('account_password_hint')}</Text>
      <AppButton title={t('account_reset_password')} variant="secondary" onPress={sendReset} loading={sending} />
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
