import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Check, Undo2 } from '@/components/icons';
import { PersonBadge } from '@/components/person-badge';
import { BUTTON_RADIUS } from '@/components/ui/button-radius';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { FormError } from '@/components/ui/input';
import Section from '@/components/ui/section';
import Sheet, { afterSheetsClosed } from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-error';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { formatTimestamp } from '@/lib/format';
import { useI18n, type TKey } from '@/lib/i18n';
import { useAssignOrder, useRefreshCatalog } from '@/lib/queries';
import type { Order, Person } from '@/lib/types';
import { useWorkers } from '@/lib/use-people';
import { useSelf, useWorkshop } from '@/lib/use-workshop';

// Who strings an order, in a workshop with a team: the line at the foot of an order's card, the cell of the table, the section "People" of
// the order's page, and the sheet the owner gives an order from. Without a team none of it is drawn.

/**
 * Taking an order, giving it, returning it to the queue. Each of them says how it went in a toast; `assign` is the bare request, for a
 * sheet, where a toast would be hidden behind it and the refusal is shown in the sheet.
 */
export function useOrderAssign() {
  const { t } = useI18n();
  const toast = useToast();
  const self = useSelf();
  const assign = useAssignOrder();
  const refresh = useRefreshCatalog();

  // Someone else was first: what the phone shows is out of date, so it is read again (the card then names who has the order, and a master
  // no longer sees an order that is not theirs).
  const failed = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'order_taken') refresh();
    return describeError(error, t);
  };

  const run = async (order: Order, person: Person | null, done: string) => {
    try {
      await assign.mutateAsync({ id: order.id, assignee: person });
      toast.success(done);
    } catch (error) {
      toast.error(failed(error));
    }
  };

  return {
    failed,
    assign: assign.mutateAsync,
    busyOn: (order: Order) => assign.isPending && assign.variables?.id === order.id,
    take: (order: Order) => (self ? run(order, self, t('order_take_done')) : Promise.resolve()),
    release: (order: Order) => run(order, null, t('order_release_done')),
  };
}

// --- The line on a card, and the cell of the table ---------------------------------------------

// A small grey button: the secondary kind, black on grey.
function MiniButton({ label, onPress, loading, small, accessibilityLabel }: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: !!loading, disabled: !!loading }}
      disabled={loading}
      hitSlop={6}
      onPress={onPress}
      style={{ backgroundColor: colors.surface }}
      className={`flex-row items-center justify-center ${BUTTON_RADIUS.lg} hover:opacity-90 active:opacity-70 ${
        small ? 'h-7 min-w-14 px-3' : 'h-9 min-w-16 px-4'
      } ${loading ? 'opacity-60' : ''}`}>
      {loading ? (
        <ActivityIndicator size="small" color={colors.ink} />
      ) : (
        <Text className={`${small ? 'text-[13px]' : 'text-[14.3px]'} font-semibold`} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type PerformerLineProps = {
  order: Order;
  /** The owner's "Give": opens the sheet of people for this order. Without it the owner's button is not drawn. */
  onGive?: (order: Order) => void;
  /** `cell`: the smaller one, for a row of the table. */
  size?: 'card' | 'cell';
};

/**
 * Who has the order: their mark and name, or "No performer" with "Take" (a master) or "Give" (the owner). Nothing in a workshop of one.
 * An order that is finished has no buttons: it is not work to be taken any more.
 */
export function PerformerLine({ order, onGive, size = 'card' }: PerformerLineProps) {
  const { t } = useI18n();
  const { team, canTake, canAssign } = useWorkshop();
  const self = useSelf();
  const { take, busyOn } = useOrderAssign();
  if (!team) return null;

  const performer = order.assignee ?? null;
  const open = order.status !== 'completed';
  const cell = size === 'cell';
  const name = performer ? (performer.id === self?.id ? t('queue_you') : performer.name) : t('queue_none');
  const number = order.number ?? '-';

  return (
    <View className={`flex-row items-center gap-2 ${cell ? 'min-h-7' : 'mt-1 min-h-9'}`}>
      <PersonBadge person={performer} size={cell ? 20 : 26} />
      <Text
        className={`min-w-0 shrink ${cell ? 'text-[13px]' : 'text-[14.3px]'} ${performer ? 'font-medium' : 'text-muted'}`}
        numberOfLines={1}>
        {name}
      </Text>
      <View className="flex-1" />
      {!performer && open && canTake ? (
        <MiniButton
          small={cell}
          label={t('order_take')}
          accessibilityLabel={t('order_take_label', { number })}
          loading={busyOn(order)}
          onPress={() => void take(order)}
        />
      ) : null}
      {!performer && open && canAssign && onGive ? (
        <MiniButton
          small={cell}
          label={t('order_give')}
          accessibilityLabel={t('order_give_label', { number })}
          onPress={() => onGive(order)}
        />
      ) : null}
    </View>
  );
}

// --- The sheet of people -----------------------------------------------------------------------

const ROLE_LABEL: Record<string, TKey> = { owner: 'role_owner', master: 'role_master', receptionist: 'role_receptionist' };

/** A row of a sheet of people: the mark (or an icon), the name, what they are in the workshop, and a tick on the one that is chosen. */
function PersonChoice({ leading, label, hint, selected, disabled, onPress }: {
  leading: ReactNode;
  label: string;
  hint?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-14 flex-row items-center gap-3 ${BUTTON_RADIUS.lg} px-2 hover:bg-surface active:bg-surface`}>
      {leading}
      <View className="min-w-0 flex-1">
        <Text className="text-[16.8px] font-medium" numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text className="text-[13.5px] text-muted" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

type AssignSheetProps = { order: Order | null; visible: boolean; onClose: () => void };

/**
 * The owner gives an order: the owner and the masters of the workshop to choose from (read from the server's team; without a connection,
 * the people this phone knows), and "Return to queue". A refusal is said in the sheet, where a toast would be behind it.
 */
export function AssignSheet({ order, visible, onClose }: AssignSheetProps) {
  const { t } = useI18n();
  const toast = useToast();
  const self = useSelf();
  const { assign, failed } = useOrderAssign();
  const { workers, known } = useWorkers(visible);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const choose = async (person: Person | null) => {
    if (!order || busy) return;
    if ((order.assignee?.id ?? null) === (person?.id ?? null)) {
      onClose();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await assign({ id: order.id, assignee: person });
      const done = person ? t('order_give_done', { name: person.name }) : t('order_release_done');
      onClose();
      afterSheetsClosed(() => toast.success(done));
    } catch (failure) {
      setError(failed(failure));
    } finally {
      setBusy(false);
    }
  };

  const row = (key: string, leading: ReactNode, label: string, hint: string | undefined, selected: boolean, onPress: () => void) => (
    <PersonChoice key={key} leading={leading} label={label} hint={hint} selected={selected} disabled={busy} onPress={onPress} />
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={t('order_give_title')}>
      <View className="gap-1 pt-1">
        {workers.map((worker) =>
          row(
            worker.id,
            <PersonBadge person={worker} size={36} />,
            worker.id === self?.id ? `${worker.name} (${t('queue_you')})` : worker.name,
            worker.role ? t(ROLE_LABEL[worker.role]) : undefined,
            order?.assignee?.id === worker.id,
            () => void choose(worker)
          )
        )}
        {order?.assignee
          ? row(
              'queue',
              <View className="size-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.surface }}>
                <Undo2 size={18} color={colors.ink} />
              </View>,
              t('order_release'),
              undefined,
              false,
              () => void choose(null)
            )
          : null}
      </View>
      {!known ? <Text className="px-2 pt-3 text-[13.5px] leading-[18px] text-muted">{t('order_give_known')}</Text> : null}
      {error ? (
        <View className="pt-3">
          <FormError message={error} />
        </View>
      ) : null}
    </Sheet>
  );
}

type PerformerSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Who is chosen; null is nobody, the order waiting in the queue. */
  value: Person | null;
  onChange: (person: Person | null) => void;
};

/**
 * Who strings an order that is being made (the new order's form, for the owner of a team): nobody (the order goes to the queue), the owner
 * or one of the masters, from the same list as "Give" (`useWorkers`). Choosing only sets the value: nothing is sent from here.
 */
export function PerformerSheet({ visible, onClose, value, onChange }: PerformerSheetProps) {
  const { t } = useI18n();
  const self = useSelf();
  const { workers, known } = useWorkers(visible);

  const choose = (person: Person | null) => {
    onChange(person);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('order_performer_label')}>
      <View className="gap-1 pt-1">
        <PersonChoice
          leading={<PersonBadge person={null} size={36} />}
          label={t('order_performer_queue')}
          hint={t('order_performer_queue_hint')}
          selected={value === null}
          onPress={() => choose(null)}
        />
        {workers.map((worker) => (
          <PersonChoice
            key={worker.id}
            leading={<PersonBadge person={worker} size={36} />}
            label={worker.id === self?.id ? `${worker.name} (${t('queue_you')})` : worker.name}
            hint={worker.role ? t(ROLE_LABEL[worker.role]) : undefined}
            selected={value?.id === worker.id}
            onPress={() => choose({ id: worker.id, name: worker.name })}
          />
        ))}
      </View>
      {!known ? <Text className="px-2 pt-3 text-[13.5px] leading-[18px] text-muted">{t('order_give_known')}</Text> : null}
    </Sheet>
  );
}

/** Opens the sheet of people for an order from anywhere in a list: `give(order)` opens it, `sheet` is drawn once on the page. */
export function useGiveSheet() {
  const [order, setOrder] = useState<Order | null>(null);
  const [open, setOpen] = useState(false);
  const give = useCallback((target: Order) => {
    setOrder(target);
    setOpen(true);
  }, []);
  const { team, canAssign } = useWorkshop();
  // (What the sheet was opened for stays when it is closed, so that it does not change while it slides away.)
  const sheet = team && canAssign ? <AssignSheet order={order} visible={open} onClose={() => setOpen(false)} /> : null;
  return { give, sheet, canGive: team && canAssign };
}

// --- The section of the order's page -----------------------------------------------------------

function PersonRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="min-h-8 flex-row items-center justify-between gap-4">
      <Text className="text-[16.5px] text-muted">{label}</Text>
      <View className="min-w-0 flex-1 flex-row items-center justify-end gap-2">{children}</View>
    </View>
  );
}

/**
 * "People" on the page of an order: who took it in, who strings it and since when, and what the person at the phone may do about it: a
 * master takes a free order or returns their own to the queue, the owner gives it to someone, the receptionist only reads.
 */
export function PeopleSection({ order }: { order: Order }) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { team, canTake, canAssign } = useWorkshop();
  const self = useSelf();
  const { take, release, busyOn } = useOrderAssign();
  const [giving, setGiving] = useState(false);
  if (!team) return null;

  const performer = order.assignee ?? null;
  const mine = !!performer && performer.id === self?.id;
  const open = order.status !== 'completed';
  const busy = busyOn(order);
  const nameOf = (person: Person) => (person.id === self?.id ? t('queue_you') : person.name);

  const takeIt = open && !performer && canTake;
  const returnIt = open && ((canTake && mine) || (canAssign && !!performer));
  const giveIt = open && canAssign;

  return (
    <Section title={t('order_people_title')}>
      <Card className="gap-2">
        {order.accepted_by ? (
          <PersonRow label={t('order_people_taken_in')}>
            <PersonBadge person={order.accepted_by} size={26} />
            <Text className="min-w-0 shrink text-[16.5px] font-medium" numberOfLines={1}>
              {nameOf(order.accepted_by)}
            </Text>
          </PersonRow>
        ) : null}
        <PersonRow label={t('order_people_performer')}>
          <PersonBadge person={performer} size={26} />
          <Text className={`min-w-0 shrink text-[16.5px] ${performer ? 'font-medium' : 'text-muted'}`} numberOfLines={1}>
            {performer ? nameOf(performer) : t('queue_none')}
          </Text>
        </PersonRow>
        {performer && order.assigned_at ? (
          <PersonRow label={t('order_people_since')}>
            <Text className="text-right text-[16.5px] font-medium">{formatTimestamp(order.assigned_at, language, user?.timezone)}</Text>
          </PersonRow>
        ) : null}
        {!performer && open && canTake ? (
          <Text className="text-[14.3px] leading-5 text-muted">{t('order_people_queue_note')}</Text>
        ) : null}

        {takeIt || giveIt || returnIt ? (
          <View className="gap-2 pt-2">
            {takeIt ? (
              <Shortcut
                compact
                label={t('order_take')}
                accessibilityLabel={t('order_take_label', { number: order.number ?? '-' })}
                color={colors.primary}
                contentColor={colors.white}
                onPress={() => void take(order)}
                loading={busy}
              />
            ) : null}
            {giveIt ? (
              <Shortcut
                compact
                label={t('order_give_to')}
                accessibilityLabel={t('order_give_label', { number: order.number ?? '-' })}
                color={performer ? colors.surface : colors.primary}
                contentColor={performer ? colors.ink : colors.white}
                onPress={() => setGiving(true)}
              />
            ) : null}
            {returnIt ? (
              <Shortcut
                compact
                icon={Undo2}
                label={t('order_release')}
                color={colors.surface}
                contentColor={colors.ink}
                onPress={() => void release(order)}
                loading={busy}
              />
            ) : null}
          </View>
        ) : null}
      </Card>
      {canAssign ? <AssignSheet order={order} visible={giving} onClose={() => setGiving(false)} /> : null}
    </Section>
  );
}
