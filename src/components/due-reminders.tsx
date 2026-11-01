import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/lib/auth';
import { orderNumber, racketName } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useRequest } from '@/lib/queries';
import { syncReminders } from '@/lib/reminders';
import type { Order } from '@/lib/types';

// Keeps the phone's reminders in step with the orders: it renders nothing. Mounted while signed in.
export default function DueReminders() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const request = useRequest();
  const enabled = !!user?.notifications_enabled && Platform.OS !== 'web';

  const due = useQuery({
    queryKey: ['orders', 'reminders'],
    queryFn: () => request<{ items: Order[] }>('/api/orders?status=active&limit=100'),
    enabled,
    select: (data) => data.items,
  });

  useEffect(() => {
    // `language` is a dependency so the text of reminders already scheduled changes with it.
    void syncReminders(enabled ? (due.data ?? []) : null, {
      title: (order) => t('reminder_title', { number: orderNumber(order.number) }),
      body: (order) =>
        t('reminder_body', { client: order.client.name, racket: racketName(order.racket) }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, due.data, language]);

  return null;
}
