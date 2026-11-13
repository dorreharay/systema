import { useCallback, useRef, useState } from 'react';

import { ChevronsRight } from '@/components/icons';
import ReadyMessageSheet from '@/components/ready-message-sheet';
import { statusColors } from '@/components/ui/colors';
import MiniButton from '@/components/ui/mini-button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { useI18n, type TKey } from '@/lib/i18n';
import { readyMessage } from '@/lib/order-text';
import { useUpdateOrder } from '@/lib/queries';
import type { Order, OrderStatus } from '@/lib/types';
import { useSelf, useWorkshop } from '@/lib/use-workshop';

// Moving an order on to its next status from a list: the small button at the foot of a card, and what it does. It is what the main button
// of the order's page does (and the table of orders on a desktop): handing the racket over closes the order, so it is paid for, too; a
// racket that is done offers the customer the message that is written for it. There is no button to go back: that is on the page of the
// order. The button shows nothing while the change is taken (it is put in the queue of the phone and shows at once), so there is no
// spinner to flash on it.

// Where an order goes on from each status, and the words of the main button of its page that sends it there (the small button is named by
// the status; a screen reader says the whole phrase).
const NEXT: Partial<Record<OrderStatus, NextStatus>> = {
  received: { status: 'in_progress', label: 'action_start' },
  in_progress: { status: 'ready', label: 'action_ready' },
  ready: { status: 'completed', label: 'action_complete' },
};

export type NextStatus = { status: OrderStatus; label: TKey };

/**
 * Where the person may move an order on from here, or nothing: for a handed-over order, for someone who may not change it (the one who
 * may write, but a master only the orders that are theirs; nobody while the workshop is paused), and where the list does not offer it
 * (`enabled` is false).
 */
export function useNextStatus(order: Order, enabled: boolean): NextStatus | null {
  const { canWrite, role } = useWorkshop();
  const self = useSelf();
  if (!enabled || !canWrite || (role === 'master' && (!self || order.assignee?.id !== self.id))) return null;
  return NEXT[order.status] ?? null;
}

/**
 * Changes the status of an order from anywhere in a list: `change(order, status)` does it, and `sheet` (the message to the customer that
 * follows a racket that is done) is drawn once on the page. A second press waits until the first has been taken, as on the page of the
 * order.
 */
export function useStatusChange() {
  const { t, language } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const update = useUpdateOrder();
  const [readyFor, setReadyFor] = useState<Order | null>(null);
  const working = useRef(false);
  const mutate = update.mutateAsync;
  const currency = user?.currency ?? 'USD';

  const change = useCallback(
    async (order: Order, status: OrderStatus) => {
      if (working.current || order.status === status) return;
      working.current = true;
      try {
        // Handing the racket over closes the order: it is paid for, too (the server clears the dates of the statuses an order leaves).
        await mutate({ id: order.id, status, ...(status === 'completed' && !order.is_paid && { is_paid: true }) });
        // The racket is done: offer the customer a message that is already written.
        if (status === 'ready' && order.status === 'in_progress') setReadyFor(order);
        else toast.success(t('order_status_changed', { status: t(`status_${status}`) }));
      } catch (error) {
        toast.error(describeError(error, t));
      } finally {
        working.current = false;
      }
    },
    [mutate, toast, t]
  );

  const sheet = (
    <ReadyMessageSheet
      visible={!!readyFor}
      onClose={() => setReadyFor(null)}
      message={readyFor ? readyMessage(readyFor, { t, language, currency }) : ''}
      phone={readyFor?.client.phone ?? null}
    />
  );

  return { change, sheet };
}

/**
 * The small button at the foot of a card: the name of the next status with the two arrows of the main button of the order's page, in the
 * colour that button has there.
 */
export function StatusButton({
  order,
  next,
  onStatus,
}: {
  order: Order;
  next: NextStatus;
  onStatus: (order: Order, status: OrderStatus) => void;
}) {
  const { t } = useI18n();

  return (
    <MiniButton
      label={t(`status_${next.status}`)}
      icon={ChevronsRight}
      color={statusColors[next.status].fill}
      accessibilityLabel={`${t(next.label)}. ${t('order_number', { number: order.number ?? '-' })}`}
      onPress={() => onStatus(order, next.status)}
    />
  );
}
