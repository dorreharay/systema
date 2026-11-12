import { Redirect, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogOut, Lock, MoreHorizontal, Pencil, Trash2 } from '@/components/icons';
import PlusIcon from '@/components/icons/plus-icon';
import { PersonBadge } from '@/components/person-badge';
import { UsageBar } from '@/components/plan-usage';
import TeamInviteSheet from '@/components/team-invite-sheet';
import TeamUnsentNotice from '@/components/team-unsent-notice';
import ActionSheet, { type Action } from '@/components/ui/action-sheet';
import { BUTTON_RADIUS } from '@/components/ui/button-radius';
import { colors } from '@/components/ui/colors';
import { useConfirm } from '@/components/ui/confirm';
import IconButton from '@/components/ui/icon-button';
import { FormError } from '@/components/ui/input';
import Section from '@/components/ui/section';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { formatTimestamp } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';
import { useTeam, useTeamActions, type MemberRole, type TeamInvite, type TeamMember } from '@/lib/team-api';
import { describeTeamError, nothingUnsent } from '@/lib/team-support';
import { useSubscription } from '@/lib/use-subscription';
import { useWorkshop } from '@/lib/use-workshop';

/** A small grey button inside a row: a secondary action on a person or on an invitation. */
function PillButton({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`h-9 items-center justify-center bg-surface px-4 hover:opacity-80 active:opacity-60 ${BUTTON_RADIUS.full36} ${
        disabled ? 'opacity-50' : ''
      }`}>
      <Text className={`text-[14px] font-medium ${danger ? 'text-danger' : 'text-ink'}`} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A person of the workshop: the round mark, the name (and "You" beside it), the role, since when they have been on the team. */
function PersonRow({ person, trailing }: { person: TeamMember; trailing?: ReactNode }) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  return (
    <View className="flex-row items-center gap-3.5 border-t border-line px-5 py-4">
      <PersonBadge person={{ id: person.user_id, name: person.name }} size={44} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="shrink text-base font-semibold" numberOfLines={1}>
            {person.name}
          </Text>
          {person.you ? (
            <View className="rounded-full bg-surface px-2.5 py-0.5">
              <Text className="text-[12.5px] font-medium text-muted" maxFontSizeMultiplier={1.3}>
                {t('team_you')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-[14px] text-secondary">{t(`role_${person.role}`)}</Text>
        {/* (Only the owner is sent the addresses: it tells two people of the same name apart.) */}
        {person.email ? (
          <Text className="text-[13px] text-muted" numberOfLines={1}>
            {person.email}
          </Text>
        ) : null}
        {person.role !== 'owner' ? (
          <Text className="text-[13px] text-muted">{t('team_since', { date: formatTimestamp(person.joined_at, language, user?.timezone) })}</Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

/** An invitation that is waiting for someone to use it: an empty mark, the role, and until when it is good. */
function InviteRow({ invite, first, onRevoke, disabled }: { invite: TeamInvite; first: boolean; onRevoke: () => void; disabled: boolean }) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  return (
    <View className={`flex-row items-center gap-3.5 px-5 py-4 ${first ? '' : 'border-t border-line'}`}>
      <PersonBadge person={null} size={44} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-semibold" numberOfLines={1}>
          {t(`role_${invite.role}`)}
        </Text>
        <Text className="text-[13px] text-muted">{t('team_invite_until', { date: formatTimestamp(invite.expires_at, language, user?.timezone) })}</Text>
      </View>
      <PillButton label={t('team_invite_revoke')} onPress={onRevoke} disabled={disabled} />
    </View>
  );
}

/**
 * The team of the workshop (Studio): who is in it and in what role, the seats, and for the owner the invitations that wait and the ways to
 * change a role, remove someone and invite. A master or a receptionist sees the same list and can leave the workshop. A workshop whose owner
 * no longer has Studio is paused: the people in it look and change nothing, and the owner is asked to renew. Opened from Settings, the
 * sidebar and the page of Studio; nothing here exists where Studio does not (`plan.studioAvailable`).
 */
export default function Team() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  const plan = useSubscription();
  const caps = useWorkshop();
  // A team exists for someone who works in one, who has one, or who holds Studio.
  const available = !!user && plan.enabled && plan.studioAvailable;
  const involved = caps.member || caps.team || plan.team;
  const team = useTeam(available && involved);
  const actions = useTeamActions();
  const [inviting, setInviting] = useState(false);
  const [menu, setMenu] = useState<TeamMember | null>(null);
  const [unsent, setUnsent] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (!available || !involved) return <Redirect href="/home" />;

  const data = team.data;
  const owns = !caps.member;
  const owner = data?.members.find((person) => person.role === 'owner');
  const workshopName = data?.workshop.name?.trim() || owner?.name || '';
  // A member is told by the server; for the owner it is the plan that says it: they have people, and no Studio to hold them.
  const paused = caps.member ? caps.paused : !!data?.workshop.paused || (caps.team && !plan.team);
  const canInvite = owns && !!data?.can_invite;
  const inviteReason = owns && data && !data.can_invite ? t(!plan.team ? 'team_invite_needs_studio' : 'team_invite_no_seats') : null;
  const busy = actions.busy;

  // --- What the owner does to the team -----------------------------------------------------------

  const changeRole = async (person: TeamMember) => {
    if (!person.id) return;
    const to: MemberRole = person.role === 'master' ? 'receptionist' : 'master';
    const ok = await confirm({
      title: t('team_role_title'),
      message: t(to === 'master' ? 'team_role_to_master' : 'team_role_to_receptionist', { name: person.name }),
      confirmLabel: t('team_role_confirm'),
    });
    if (ok) await actions.setRole(person.id, to);
  };

  const removePerson = async (person: TeamMember) => {
    if (!person.id) return;
    const ok = await confirm({
      title: t('team_remove_title', { name: person.name }),
      message: t('team_remove_message'),
      confirmLabel: t('team_remove_confirm'),
      destructive: true,
    });
    if (ok) await actions.remove(person.id);
  };

  const revoke = async (invite: TeamInvite) => {
    const ok = await confirm({
      title: t('team_invite_revoke_title'),
      message: t('team_invite_revoke_message'),
      confirmLabel: t('team_invite_revoke'),
      destructive: true,
    });
    if (ok) await actions.revokeInvite(invite.id);
  };

  /** What can be done to one person: another role, or out of the team. */
  const personActions = (person: TeamMember): Action[] => [
    {
      label: t(person.role === 'master' ? 'team_make_receptionist' : 'team_make_master'),
      icon: Pencil,
      onPress: () => void changeRole(person),
    },
    { label: t('team_remove'), icon: Trash2, destructive: true, onPress: () => void removePerson(person) },
  ];

  // --- What a member does ----------------------------------------------------------------------------

  const leave = async () => {
    const ok = await confirm({
      title: t('team_leave_title'),
      message: t('team_leave_message'),
      confirmLabel: t('team_leave_confirm'),
      destructive: true,
    });
    if (!ok) return;
    setUnsent(false);
    setLeaving(true);
    try {
      // What is on the phone and not at the server belongs to this workshop: it goes first.
      if (!(await nothingUnsent())) {
        setUnsent(true);
        return;
      }
      if (await actions.leave()) {
        toast.success(t('team_left'));
        router.replace('/home');
      }
    } finally {
      setLeaving(false);
    }
  };

  // --- The page ------------------------------------------------------------------------------------

  const dock = owns ? (
    <Shortcut
      icon={PlusIcon}
      label={t('team_invite')}
      color={colors.clients}
      contentColor={colors.ink}
      className="w-full px-5 py-5"
      disabled={!canInvite}
      onPress={() => setInviting(true)}
    />
  ) : undefined;

  // A calm note, not an alarm: nothing is lost, and when Studio is back everything is as it was.
  const banner = paused ? (
    <View accessibilityRole="alert" className="gap-3 rounded-[18px] border border-line bg-white p-5">
      <View className="flex-row items-start gap-3">
        <View className="mt-0.5 size-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.clients }}>
          <Lock size={18} color={colors.ink} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text accessibilityRole="header" className="text-[16.5px] font-semibold">
            {t(owns ? 'team_paused_title' : 'team_paused_member_title')}
          </Text>
          <Text className="text-[14.3px] leading-5 text-muted">{t(owns ? 'team_paused_owner' : 'team_paused_member')}</Text>
        </View>
      </View>
      {owns ? (
        <Shortcut compact color={colors.surface} contentColor={colors.ink} label={t('team_paused_renew')} onPress={() => router.push('/studio')} />
      ) : null}
    </View>
  ) : null;

  const members = data?.members ?? [];
  const invites = data?.invites ?? [];
  // On a wide screen there is room for the buttons themselves; the phone keeps them in a menu.
  const trailingFor = (person: TeamMember): ReactNode => {
    if (!owns || person.id === null) return undefined;
    if (wide) {
      return (
        <View className="flex-row items-center gap-2">
          <PillButton
            label={t(person.role === 'master' ? 'team_make_receptionist' : 'team_make_master')}
            disabled={busy}
            onPress={() => void changeRole(person)}
          />
          <PillButton label={t('team_remove')} danger disabled={busy} onPress={() => void removePerson(person)} />
        </View>
      );
    }
    return <IconButton icon={MoreHorizontal} label={t('team_manage', { name: person.name })} onPress={() => setMenu(person)} disabled={busy} />;
  };

  return (
    <Screen flush dock={dock} footer={<View style={{ height: Math.max(insets.bottom, 12) + 24 }} />}>
      {/* (The sidebar of a wide screen leads here: there it is a place of its own, with no back button.) */}
      <DetailHeader floating topLevel title={t('team_title')} />
      <DetailScroll contentContainerClassName="gap-page p-page pb-28 md:pb-12" showsVerticalScrollIndicator={false}>
        {banner}

        {team.isLoading ? (
          <>
            <Skeleton className="h-28 rounded-[18px]" />
            <Skeleton className="h-60 rounded-[18px]" />
          </>
        ) : team.isError || !data ? (
          <ErrorState error={team.error} onRetry={() => void team.refetch()} />
        ) : (
          <>
            <View className="overflow-hidden rounded-[18px] border border-line bg-white">
              {owns ? (
                <View className="gap-2.5 p-5">
                  <Text className="text-[17px] font-bold">{t('team_seats', { used: data.seats.used, limit: data.seats.limit })}</Text>
                  <UsageBar used={data.seats.used} limit={data.seats.limit} />
                  <Text className="text-[13px] leading-[17px] text-muted">{t('team_seats_note', { limit: data.seats.limit })}</Text>
                  {inviteReason ? <Text className="text-[13.5px] leading-[18px] text-secondary">{inviteReason}</Text> : null}
                </View>
              ) : (
                <View className="gap-1 p-5">
                  {workshopName ? <Text className="text-[17px] font-bold">{t('team_workshop_of', { name: workshopName })}</Text> : null}
                  <Text className="text-[14.3px] font-medium text-secondary">{t('team_your_role', { role: t(`role_${caps.role}`) })}</Text>
                  <Text className="text-[13.5px] leading-[18px] text-muted">{t(`role_${caps.role}_hint`)}</Text>
                </View>
              )}
              {members.map((person) => (
                <PersonRow key={person.user_id} person={person} trailing={trailingFor(person)} />
              ))}
            </View>

            {actions.error ? <FormError message={describeTeamError(actions.error, t)} /> : null}

            {owns && invites.length > 0 ? (
              <Section title={t('team_invites')}>
                <View className="overflow-hidden rounded-[18px] border border-line bg-white">
                  {invites.map((invite, index) => (
                    <InviteRow key={invite.id} invite={invite} first={index === 0} disabled={busy} onRevoke={() => void revoke(invite)} />
                  ))}
                </View>
              </Section>
            ) : null}

            {!owns ? (
              <>
                <Text className="px-1 text-[13.5px] leading-[18px] text-muted">{t('team_member_note')}</Text>
                {unsent ? <TeamUnsentNotice /> : null}
                <Shortcut
                  compact
                  icon={LogOut}
                  color={colors.surface}
                  contentColor={colors.danger}
                  label={t('team_leave')}
                  loading={leaving}
                  onPress={() => void leave()}
                />
              </>
            ) : null}
          </>
        )}
      </DetailScroll>

      <ActionSheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.name} actions={menu ? personActions(menu) : []} />
      <TeamInviteSheet visible={inviting} onClose={() => setInviting(false)} workshop={workshopName} />
    </Screen>
  );
}
