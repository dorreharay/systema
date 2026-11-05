import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/lib/auth';
import { orderNumber, racketName } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useActiveOrders } from '@/lib/queries';
import { syncReminders } from '@/lib/reminders';

// Keeps the phone's reminders in step with the orders: it renders nothing. Mounted while signed in. The orders are the ones the
// phone has (see lib/offline), so the reminders are right without a connection too.
export default function DueReminders() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const enabled = !!user?.notifications_enabled && Platform.OS !== 'web';
  const due = useActiveOrders().data;

  // What a reminder is made of. The schedule is made again only when one of these changes, not with every change of the orders.
  const signature = due
    ?.map(
      (order) =>
        `${order.id}|${order.number}|${order.status}|${order.due_date}|${order.due_time}|${order.client.name}|${racketName(order.racket)}`
    )
    .join('\n');

  useEffect(() => {
    // Until the orders are known the schedule is left as it is.
    if (enabled && due === undefined) return;
    void syncReminders(enabled ? (due ?? []) : null, {
      // An order that has no number yet (it is not sent) is not given one in a reminder.
      title: (order) =>
        order.number === null ? t('reminder_title_unnumbered') : t('reminder_title', { number: orderNumber(order.number) }),
      body: (order) =>
        t('reminder_body', { client: order.client.name, racket: racketName(order.racket) }),
    });
    // `language` is a dependency so the text of reminders already scheduled changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature, language]);

  return null;
}
