import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ClientFormSheet from '@/components/client-form-sheet';
import { Check, Clock, Pencil, RotateCcw, Trash2, TriangleAlert, WifiOff } from '@/components/icons';
import RacketFormSheet from '@/components/racket-form-sheet';
import ServiceFormSheet from '@/components/service-form-sheet';
import StringFormSheet from '@/components/string-form-sheet';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { useConfirm } from '@/components/ui/confirm';
import Section from '@/components/ui/section';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { formatMoment } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { engine, offlineStore } from '@/lib/offline/app';
import { describeFailure, describeOp } from '@/lib/offline/describe';
import { discardSet } from '@/lib/offline/outbox';
import { useSnapshot, useSyncSummary } from '@/lib/offline/react';
import { MAX_ORDERS } from '@/lib/offline/sync';
import type { Op } from '@/lib/offline/types';

type Editing = { kind: 'client' | 'racket' | 'string' | 'service'; id: string };

/** What can be put right in a change the server refused: the thing it is about, in its own form. */
function editTarget(op: Op): Editing | 'order' | null {
  switch (op.type) {
    case 'client.create':
    case 'client.update':
      return { kind: 'client', id: op.subject };
    case 'racket.create':
    case 'racket.update':
      return { kind: 'racket', id: op.subject };
    case 'string.create':
    case 'string.update':
      return { kind: 'string', id: op.subject };
    case 'service.create':
    case 'service.update':
      return { kind: 'service', id: op.subject };
    case 'order.create':
    case 'order.update':
      return 'order';
    default:
      return null;
  }
}

/** The changes the phone has made that the server has not got: the ones it refused, which need the stringer, and the ones that wait. */
export default function SyncScreen() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const insets = useSafeAreaInsets();
  const sync = useSyncSummary();
  const { outbox, blocked, tables, meta } = useSnapshot();
  const [editing, setEditing] = useState<Editing | null>(null);

  // Whoever opens this screen wants to know: the server is asked at once, not at the next turn of the timer.
  useEffect(() => {
    void engine.syncNow();
  }, []);

  const failed = outbox.filter((op) => op.failure);
  const waiting = outbox.filter((op) => !op.failure);
  const nameOf = (id: string) => {
    const op = outbox.find((candidate) => candidate.id === id);
    return op ? describeOp(op, tables, t) : '—';
  };

  const retry = async (op: Op) => {
    await offlineStore.retry(op.id);
    void engine.syncNow();
  };

  const discard = async (op: Op) => {
    const more = discardSet(outbox, op.id).size - 1;
    const ok = await confirm({
      title: t('sync_discard_title'),
      message: more > 0 ? t('sync_discard_message_more', { count: more }) : t('sync_discard_message'),
      confirmLabel: t('sync_discard'),
      destructive: true,
    });
    if (!ok) return;
    await offlineStore.discard(op.id);
    toast.success(t('sync_discarded'));
  };

  const edit = (op: Op) => {
    const target = editTarget(op);
    if (target === 'order') router.push({ pathname: '/orders/[id]/edit', params: { id: op.subject } });
    else if (target) setEditing(target);
  };

  const canEdit = (op: Op) => {
    const target = editTarget(op);
    if (target === 'order') return !!tables.orders[op.subject];
    if (!target) return false;
    const table = { client: tables.clients, racket: tables.rackets, string: tables.strings, service: tables.services }[target.kind];
    return !!table[target.id];
  };

  // The state in one line: what the phone is doing, or what is wrong.
  const state = sync.syncing
    ? { icon: RotateCcw, tone: colors.primary, title: t('sync_status_syncing') }
    : sync.failed > 0
      ? { icon: TriangleAlert, tone: colors.danger, title: t('sync_status_failed', { count: sync.failed }) }
      : !sync.online
        ? { icon: WifiOff, tone: '#b45309', title: t('sync_status_offline') }
        : sync.unsynced > 0
          ? { icon: Clock, tone: colors.muted, title: t('sync_status_waiting', { count: sync.unsynced }) }
          : { icon: Check, tone: colors.primary, title: t('sync_status_synced') };
  const StateIcon = state.icon;

  const hint = !sync.online
    ? t('sync_hint_offline')
    : sync.failed > 0
      ? t('sync_hint_failed')
      : sync.unsynced > 0
        ? t('sync_hint_waiting')
        : t('sync_hint_synced');

  const editedClient = editing?.kind === 'client' ? tables.clients[editing.id] : undefined;
  const editedRacket = editing?.kind === 'racket' ? tables.rackets[editing.id] : undefined;
  const editedString = editing?.kind === 'string' ? tables.strings[editing.id] : undefined;
  const editedService = editing?.kind === 'service' ? tables.services[editing.id] : undefined;
  const close = () => setEditing(null);

  return (
    <Screen flush footer={<View style={{ height: Math.max(insets.bottom, 12) + 24 }} />}>
      <DetailHeader floating title={t('sync_title')} />
      <DetailScroll contentContainerClassName="gap-page p-page pb-28 md:pb-12" showsVerticalScrollIndicator={false}>
        <Card className="gap-4">
          <View className="flex-row items-center gap-3">
            <View className="size-11 items-center justify-center rounded-full bg-surface">
              <StateIcon size={22} color={state.tone} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-[18.7px] font-semibold">{state.title}</Text>
              <Text className="text-[15.4px] text-muted">{hint}</Text>
            </View>
          </View>
          <Text className="text-[14.3px] text-muted">
            {sync.lastSyncAt
              ? t('sync_last', { when: formatMoment(sync.lastSyncAt, language, user?.timezone) })
              : t('sync_never')}
          </Text>
          {meta?.truncated ? <Text className="text-[14.3px] text-muted">{t('sync_history_limit', { count: MAX_ORDERS })}</Text> : null}
          <Shortcut
            compact
            icon={RotateCcw}
            label={t('sync_now')}
            color={colors.surface}
            contentColor={colors.ink}
            loading={sync.syncing}
            onPress={() => void engine.syncNow({ pull: true })}
          />
        </Card>

        {failed.length > 0 ? (
          <Section title={t('sync_section_failed')}>
            <View className="gap-3">
              {failed.map((op) => (
                <Card key={op.id} className="gap-3">
                  <View className="gap-1">
                    <Text className="text-base font-semibold">{describeOp(op, tables, t)}</Text>
                    <Text className="text-[15.4px] text-danger">
                      {op.failure ? describeFailure(op.failure, op, tables, t) : ''}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Shortcut
                      dense
                      className="grow px-4"
                      icon={RotateCcw}
                      label={t('retry')}
                      color={colors.surface}
                      contentColor={colors.ink}
                      onPress={() => void retry(op)}
                    />
                    {canEdit(op) ? (
                      <Shortcut
                        dense
                        className="grow px-4"
                        icon={Pencil}
                        label={t('edit')}
                        color={colors.surface}
                        contentColor={colors.ink}
                        onPress={() => edit(op)}
                      />
                    ) : null}
                    <Shortcut
                      dense
                      className="grow px-4"
                      icon={Trash2}
                      label={t('sync_discard')}
                      color={colors.dangerSoft}
                      contentColor={colors.dangerInk}
                      onPress={() => void discard(op)}
                    />
                  </View>
                </Card>
              ))}
            </View>
          </Section>
        ) : null}

        {waiting.length > 0 ? (
          <Section title={t('sync_section_waiting')}>
            <View className="gap-3">
              {waiting.map((op) => {
                const blocker = blocked.get(op.id);
                return (
                  <Card key={op.id} className="gap-1">
                    <Text className="text-base font-semibold">{describeOp(op, tables, t)}</Text>
                    <Text className="text-[15.4px] text-muted">
                      {blocker
                        ? t('sync_waits_for', { name: nameOf(blocker) })
                        : sync.online
                          ? t('sync_waits_sending')
                          : t('sync_waits_connection')}
                    </Text>
                  </Card>
                );
              })}
            </View>
          </Section>
        ) : null}
      </DetailScroll>

      {/* A change the server refused is put right in the form of what it is about; saving it makes it a new try. */}
      <ClientFormSheet visible={!!editedClient} onClose={close} client={editedClient} />
      <RacketFormSheet visible={!!editedRacket} onClose={close} racket={editedRacket} />
      <StringFormSheet visible={!!editedString} onClose={close} string={editedString} />
      <ServiceFormSheet visible={!!editedService} onClose={close} service={editedService} />
    </Screen>
  );
}
