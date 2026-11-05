import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Banknote, Bell, ClipboardList, Clock, Eye, Gauge, Globe, Languages, LogOut, RotateCcw, ShieldCheck, Tags } from '@/components/icons';
import {
  AccountSheet,
  CountrySettingsSheet,
  CurrencySheet,
  LanguageSheet,
  ProfileSheet,
  TimeZoneSettingsSheet,
} from '@/components/settings-sheets';
import AppSwitch from '@/components/ui/app-switch';
import { Segmented } from '@/components/ui/chips';
import { useConfirm } from '@/components/ui/confirm';
import ListRow, { ListGroup } from '@/components/ui/list-row';
import { Screen, ScreenHeader, TAB_HEADER_DROP } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { timeZoneLabel } from '@/lib/choices';
import { countryName, countryOfAccount, zoneChoices } from '@/lib/countries';
import { describeError } from '@/lib/errors';
import { LANGUAGES, useI18n } from '@/lib/i18n';
import { openLegalPage, type LegalPage } from '@/lib/legal';
import { useSyncSummary } from '@/lib/offline/react';
import { requestReminderPermission } from '@/lib/reminders';
import type { TensionUnit } from '@/lib/types';

type OpenSheet = 'profile' | 'currency' | 'country' | 'zone' | 'language' | 'account' | null;

export default function Settings() {
  const { user, signOut, updateProfile } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const sync = useSyncSummary();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  if (!user) return null;

  // The country is read from the time zone of the account (an account that has only UTC gets the country of the phone).
  const country = countryOfAccount(user.timezone);

  const save =(patch: Parameters<typeof updateProfile>[0]) =>
    updateProfile(patch).catch((error) => toast.error(describeError(error, t)));

  const changeReminders = async (enabled: boolean) => {
    if (enabled && !(await requestReminderPermission())) {
      toast.error(t('notifications_denied'));
      return;
    }
    await save({ notifications_enabled: enabled });
  };

  const askSignOut = async () => {
    const ok = await confirm({
      title: t('sign_out_title'),
      // Changes that have not reached the server go with the session: the person is told before it is ended.
      message: sync.unsynced > 0 ? t('sign_out_unsynced', { count: sync.unsynced }) : t('sign_out_message'),
      confirmLabel: t('sign_out'),
      destructive: true,
    });
    if (ok) await signOut();
  };

  const openLegal = async (page: LegalPage) => {
    if (!(await openLegalPage(page, language))) toast.error(t('legal_open_failed'));
  };

  return (
    <Screen>
      <ScreenHeader drop={TAB_HEADER_DROP} title={t('tab_settings')} />
      <ScrollView
        bounces={false}
        overScrollMode="never"
        contentContainerClassName="gap-page px-page pb-10"
        showsVerticalScrollIndicator={false}
        // It stands still when the list fits in the page, and scrolls when it does not (a small screen): the foot of
        // it must be within reach.
        scrollEnabled={contentHeight > pageHeight + 1}
        onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => setContentHeight(height)}>
        <ListGroup>
          <ListRow icon={Tags} label={t('settings_services')} onPress={() => router.push('/settings/services')} />
          <ListRow
            icon={RotateCcw}
            label={t('settings_sync')}
            value={sync.failed > 0 ? t('sync_status_failed', { count: sync.failed }) : sync.unsynced > 0 ? String(sync.unsynced) : ''}
            onPress={() => router.push('/sync')}
          />
          <ListRow icon={Banknote} label={t('settings_currency')} value={user.currency} onPress={() => setSheet('currency')} />
          <ListRow
            icon={Globe}
            label={t('settings_country')}
            value={country ? countryName(country, language) : ''}
            onPress={() => setSheet('country')}
          />
          {country && zoneChoices(country).length > 1 ? (
            <ListRow icon={Clock} label={t('field_timezone')} value={timeZoneLabel(user.timezone)} onPress={() => setSheet('zone')} />
          ) : null}
          <ListRow
            icon={Gauge}
            label={t('settings_tension_unit')}
            trailing={
              <View className="w-[86px]">
                <Segmented<TensionUnit>
                  compact
                  options={[
                    { value: 'kg', label: 'kg' },
                    { value: 'lbs', label: 'lbs' },
                  ]}
                  value={user.tension_unit}
                  onChange={(tension_unit) => void save({ tension_unit })}
                />
              </View>
            }
          />
          <ListRow
            icon={Languages}
            label={t('settings_language')}
            value={LANGUAGES.find((item) => item.code === language)?.label}
            onPress={() => setSheet('language')}
          />
          <ListRow
            icon={Bell}
            label={t('settings_notifications')}
            trailing={
              <AppSwitch
                compact
                accessibilityLabel={t('settings_notifications')}
                value={user.notifications_enabled}
                onValueChange={(enabled) => void changeReminders(enabled)}
              />
            }
          />
        </ListGroup>
        <Text className="-mt-3 px-1 text-[14.3px] text-muted">{t('settings_notifications_hint')}</Text>

        <ListGroup>
          <ListRow icon={Eye} label={t('settings_privacy_policy')} onPress={() => void openLegal('privacy')} />
          <ListRow icon={ClipboardList} label={t('settings_terms')} onPress={() => void openLegal('terms')} />
        </ListGroup>

        <ListGroup>
          <ListRow icon={ShieldCheck} label={t('settings_account')} onPress={() => setSheet('account')} />
          <ListRow icon={LogOut} label={t('sign_out')} destructive onPress={() => void askSignOut()} />
        </ListGroup>

        <Text className="text-center text-[14.3px] text-muted">
          re:string {Constants.expoConfig?.version ?? ''}
        </Text>
      </ScrollView>

      <ProfileSheet visible={sheet === 'profile'} onClose={() => setSheet(null)} />
      <CurrencySheet visible={sheet === 'currency'} onClose={() => setSheet(null)} />
      <CountrySettingsSheet visible={sheet === 'country'} onClose={() => setSheet(null)} />
      <TimeZoneSettingsSheet visible={sheet === 'zone'} onClose={() => setSheet(null)} />
      <LanguageSheet visible={sheet === 'language'} onClose={() => setSheet(null)} />
      <AccountSheet visible={sheet === 'account'} onClose={() => setSheet(null)} />
    </Screen>
  );
}
