import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Banknote, Bell, Gauge, Languages, LogOut, ShieldCheck, Store, Tags } from '@/components/icons';
import {
  AccountSheet,
  CurrencySheet,
  LanguageSheet,
  ProfileSheet,
  WorkshopSheet,
} from '@/components/settings-sheets';
import AppSwitch from '@/components/ui/app-switch';
import { Segmented } from '@/components/ui/chips';
import { useConfirm } from '@/components/ui/confirm';
import ListRow, { ListGroup } from '@/components/ui/list-row';
import { Screen, ScreenHeader, TAB_HEADER_DROP } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { LANGUAGES, useI18n } from '@/lib/i18n';
import { requestReminderPermission } from '@/lib/reminders';
import type { TensionUnit } from '@/lib/types';

type OpenSheet = 'profile' | 'workshop' | 'currency' | 'language' | 'account' | null;

export default function Settings() {
  const { user, signOut, updateProfile } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  if (!user) return null;

  const save = (patch: Parameters<typeof updateProfile>[0]) =>
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
      message: t('sign_out_message'),
      confirmLabel: t('sign_out'),
      destructive: true,
    });
    if (ok) await signOut();
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
          <ListRow
            icon={Store}
            label={t('settings_workshop_row')}
            value={user.workshop_name ?? ''}
            onPress={() => setSheet('workshop')}
          />
          <ListRow icon={Tags} label={t('settings_services')} onPress={() => router.push('/settings/services')} />
          <ListRow icon={Banknote} label={t('settings_currency')} value={user.currency} onPress={() => setSheet('currency')} />
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
          <ListRow icon={ShieldCheck} label={t('settings_account')} onPress={() => setSheet('account')} />
          <ListRow icon={LogOut} label={t('sign_out')} destructive onPress={() => void askSignOut()} />
        </ListGroup>

        <Text className="text-center text-[14.3px] text-muted">
          re:string {Constants.expoConfig?.version ?? ''}
        </Text>
      </ScrollView>

      <ProfileSheet visible={sheet === 'profile'} onClose={() => setSheet(null)} />
      <WorkshopSheet visible={sheet === 'workshop'} onClose={() => setSheet(null)} />
      <CurrencySheet visible={sheet === 'currency'} onClose={() => setSheet(null)} />
      <LanguageSheet visible={sheet === 'language'} onClose={() => setSheet(null)} />
      <AccountSheet visible={sheet === 'account'} onClose={() => setSheet(null)} />
    </Screen>
  );
}
