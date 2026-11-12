import { useEffect, useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';

import { Check, Copy } from '@/components/icons';
import { tidy } from '@/components/plan-usage';
import { colors } from '@/components/ui/colors';
import { FormError } from '@/components/ui/input';
import Sheet from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { copyText } from '@/lib/contact';
import { formatTimestamp } from '@/lib/format';
import { useI18n, type TKey } from '@/lib/i18n';
import { useTeamActions, type MemberRole, type NewInvite } from '@/lib/team-api';
import { describeTeamError } from '@/lib/team-support';

const ROLES: MemberRole[] = ['master', 'receptionist'];

// How long the button that copied the code says so.
const COPIED_MS = 2000;

/** One role to choose from: its name and what it lets the person do. The chosen one is framed. */
function RoleChoice({ role, selected, onPress }: { role: MemberRole; selected: boolean; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-[19px] border-2 ${selected ? 'border-primary' : 'border-transparent'} hover:opacity-90 active:opacity-70`}>
      <View className="flex-row items-start gap-3 rounded-[17px] border border-line bg-white px-4 py-3.5">
        <View
          className={`mt-0.5 size-5 items-center justify-center rounded-full border-2 ${selected ? 'border-primary' : 'border-neutral-400'}`}>
          {selected ? <View className="size-2.5 rounded-full bg-primary" /> : null}
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-semibold">{t(`role_${role}`)}</Text>
          <Text className="text-[13.5px] leading-[18px] text-muted">{t(`role_${role}_hint`)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

type Shared = 'shared' | 'copied' | 'failed';

/**
 * Offers the message to the apps of the phone (the share sheet). The browser's own share is used where it has one; where it has none the
 * message is put on the clipboard instead, and the caller says so.
 */
async function shareMessage(message: string): Promise<Shared> {
  if (Platform.OS === 'web') {
    const web = globalThis as { navigator?: { share?: (data: { text: string }) => Promise<void> } };
    if (web.navigator?.share) {
      try {
        await web.navigator.share({ text: message });
        return 'shared';
      } catch (error) {
        // The person closed the browser's share dialog: nothing more to do.
        if ((error as { name?: string } | null)?.name === 'AbortError') return 'shared';
      }
    }
    return (await copyText(message)) ? 'copied' : 'failed';
  }
  try {
    await Share.share({ message });
    return 'shared';
  } catch {
    return 'failed';
  }
}

/** The invitation as it is shown: the code, big, once, with ways to pass it on. */
function Invitation({ invite, workshop }: { invite: NewInvite; workshop: string }) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<TKey | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const until = formatTimestamp(invite.expires_at, language, user?.timezone);
  const message = tidy(
    t('invite_share_message', { workshop, role: t(`role_${invite.role}`), code: invite.code, link: invite.link, date: until })
  );

  const copy = async () => {
    setProblem(null);
    if (await copyText(invite.code)) setCopied(true);
    else setProblem('copy_failed');
  };

  const share = async () => {
    setProblem(null);
    const result = await shareMessage(message);
    if (result === 'copied') setCopied(true);
    else if (result === 'failed') setProblem('invite_share_failed');
  };

  return (
    <View className="gap-4 pb-2">
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-[19px] font-bold">
          {t('invite_ready')}
        </Text>
        <Text className="text-[15px] leading-[21px] text-secondary">{t('invite_ready_text')}</Text>
      </View>

      <View className="items-center gap-1 rounded-2xl bg-surface px-4 py-5">
        <Text className="text-[13.5px] font-medium text-muted">{t(`role_${invite.role}`)}</Text>
        {/* (The code can be held down and copied by hand, too.) */}
        <Text
          selectable
          accessibilityLabel={invite.code.split('').join(' ')}
          numberOfLines={1}
          adjustsFontSizeToFit
          className="text-[32px] font-bold tracking-[3px]">
          {invite.code}
        </Text>
      </View>

      <Text className="text-[13.5px] leading-[18px] text-muted">{tidy(t('invite_valid', { date: until }))}</Text>

      {problem ? <FormError message={t(problem)} /> : null}

      <View className="gap-2">
        <Shortcut compact color={colors.primary} contentColor={colors.white} label={t('invite_share')} onPress={() => void share()} />
        <Shortcut
          compact
          icon={copied ? Check : Copy}
          color={colors.surface}
          contentColor={colors.ink}
          label={copied ? t('copied') : t('invite_copy')}
          onPress={() => void copy()}
        />
      </View>
    </View>
  );
}

/** The choice of the role, and the button that makes the invitation. */
function RoleStep({ onCreated }: { onCreated: (invite: NewInvite) => void }) {
  const { t } = useI18n();
  const actions = useTeamActions();
  const [role, setRole] = useState<MemberRole>('master');

  const create = async () => {
    const created = await actions.invite(role);
    if (created) onCreated(created);
  };

  return (
    <View className="gap-3 pb-2">
      <Text accessibilityRole="header" className="text-[15px] font-semibold text-secondary">
        {t('invite_pick_role')}
      </Text>
      <View accessibilityRole="radiogroup" className="gap-2.5">
        {ROLES.map((item) => (
          <RoleChoice
            key={item}
            role={item}
            selected={role === item}
            onPress={() => {
              setRole(item);
              actions.clearError();
            }}
          />
        ))}
      </View>
      {/* (A toast would be behind this sheet: what the server refused is said here.) */}
      {actions.error ? <FormError message={describeTeamError(actions.error, t)} /> : null}
      <View className="pt-1">
        <Shortcut
          compact
          color={colors.primary}
          contentColor={colors.white}
          label={t('invite_create')}
          loading={actions.busy}
          onPress={() => void create()}
        />
      </View>
    </View>
  );
}

function InviteBody({ workshop }: { workshop: string }) {
  const [invite, setInvite] = useState<NewInvite | null>(null);
  return invite ? <Invitation invite={invite} workshop={workshop} /> : <RoleStep onCreated={setInvite} />;
}

type TeamInviteSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** How the workshop is called in the message that is passed on: its name, or its owner's. */
  workshop: string;
};

/**
 * The owner invites someone: they choose the role, the invitation is made, and its code is shown once, to read out or to share (the server
 * keeps only a hash of it, so it cannot be shown again). Everything that goes wrong is said in the sheet: a toast would be behind it.
 */
export default function TeamInviteSheet({ visible, onClose, workshop }: TeamInviteSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('invite_title')}>
      <InviteBody workshop={workshop} />
    </Sheet>
  );
}
