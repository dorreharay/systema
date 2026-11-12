import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PersonBadge } from '@/components/person-badge';
import TeamUnsentNotice from '@/components/team-unsent-notice';
import { colors } from '@/components/ui/colors';
import { FormError, Input } from '@/components/ui/input';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { useI18n, type TKey } from '@/lib/i18n';
import { useTeamActions, type InvitePreview } from '@/lib/team-api';
import { describeTeamError, formatInviteCode, isInviteCodeComplete, nothingUnsent } from '@/lib/team-support';
import { useSubscription } from '@/lib/use-subscription';
import { useWorkshop } from '@/lib/use-workshop';

/**
 * Join a workshop with the code its owner gave out (or the link that carries it: `/join?code=ABCDE-FGHJK` fills the field). Two steps: the
 * code is checked, and the page says who invites the person and in what role; then they join. Before they do, the phone is made to have
 * nothing unsent: what it holds belongs to the workshop it works in now. Nothing here exists where Studio does not
 * (`plan.studioAvailable`).
 */
export default function Join() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const plan = useSubscription();
  const caps = useWorkshop();
  const params = useLocalSearchParams<{ code?: string }>();
  const actions = useTeamActions();
  const linked = typeof params.code === 'string' ? params.code : undefined;
  const [code, setCode] = useState(() => formatInviteCode(linked ?? ''));
  const [found, setFound] = useState<InvitePreview | null>(null);
  const [unsent, setUnsent] = useState(false);
  // The phone is sending what it holds before the person joins.
  const [syncing, setSyncing] = useState(false);

  // The link is opened again while this page is there: it brings another code. (Worked out while drawing, not in an effect: the page is
  // drawn once with the new code.)
  const [seenLink, setSeenLink] = useState(linked);
  if (linked !== seenLink) {
    setSeenLink(linked);
    if (linked) {
      setCode(formatInviteCode(linked));
      setFound(null);
      setUnsent(false);
    }
  }

  if (!user || !plan.enabled || !plan.studioAvailable) return <Redirect href="/home" />;

  // Someone who works in a workshop, or runs a team, cannot join another one: the server says so, and so does this page, before anything is typed.
  const blocked: TKey | null = caps.member ? 'join_member_note' : caps.team ? 'team_error_has_team' : null;

  const edit = (text: string) => {
    setCode(formatInviteCode(text));
    setFound(null);
    setUnsent(false);
    actions.clearError();
  };

  const check = async () => {
    setUnsent(false);
    const preview = await actions.preview(code);
    if (preview) setFound(preview);
  };

  const join = async () => {
    setUnsent(false);
    setSyncing(true);
    try {
      if (!(await nothingUnsent())) {
        setUnsent(true);
        return;
      }
    } finally {
      setSyncing(false);
    }
    if (await actions.join(code)) {
      toast.success(t('join_done'));
      router.replace('/home');
    }
  };

  const proceed = () => {
    if (blocked || actions.busy || syncing) return;
    if (found) void join();
    else if (isInviteCodeComplete(code)) void check();
  };

  const dock = blocked ? (
    <Shortcut
      label={t('studio_open_team')}
      color={colors.newOrder}
      contentColor={colors.ink}
      className="w-full px-5 py-5"
      onPress={() => router.replace('/team')}
    />
  ) : (
    <Shortcut
      label={t(found ? 'join_confirm' : 'join_check')}
      color={colors.catalog}
      contentColor={colors.ink}
      className="w-full px-5 py-5"
      disabled={!found && !isInviteCodeComplete(code)}
      loading={actions.busy || syncing}
      onPress={proceed}
    />
  );

  return (
    <Screen flush dock={dock} footer={<View style={{ height: Math.max(insets.bottom, 12) + 24 }} />}>
      <DetailHeader floating title={t('join_title')} />
      <DetailScroll
        contentContainerClassName="gap-page p-page pb-28 md:pb-12"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {blocked ? (
          <Text className="px-1 text-[16.5px] leading-6 text-muted">{t(blocked)}</Text>
        ) : (
          <>
            <Text className="px-1 text-[16.5px] leading-6 text-muted">{t('join_intro')}</Text>
            <Input
              label={t('join_code')}
              value={code}
              onChangeText={edit}
              placeholder="ABCDE-FGHJK"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              returnKeyType="done"
              onSubmitEditing={proceed}
            />

            {found ? (
              <View className="gap-3 rounded-[18px] border border-line bg-white p-5">
                <View className="flex-row items-center gap-3.5">
                  <PersonBadge person={{ id: found.workshop.owner_name, name: found.workshop.owner_name }} size={48} />
                  <Text accessibilityRole="header" className="min-w-0 flex-1 text-[17px] font-bold leading-[22px]">
                    {t('join_invites_you', { name: found.workshop.owner_name })}
                  </Text>
                </View>
                {found.workshop.name ? (
                  <Text className="text-[14.3px] font-medium text-secondary">{t('team_workshop_of', { name: found.workshop.name })}</Text>
                ) : null}
                <View className="gap-0.5 rounded-xl bg-surface px-4 py-3">
                  <Text className="text-[15px] font-semibold">{t('team_your_role', { role: t(`role_${found.role}`) })}</Text>
                  <Text className="text-[13.5px] leading-[18px] text-muted">{t(`role_${found.role}_hint`)}</Text>
                </View>
                <Text className="text-[13.5px] leading-[18px] text-muted">{t('join_own_data')}</Text>
              </View>
            ) : null}

            {unsent ? <TeamUnsentNotice /> : null}
            {actions.error ? <FormError message={describeTeamError(actions.error, t)} /> : null}
          </>
        )}
      </DetailScroll>
    </Screen>
  );
}
