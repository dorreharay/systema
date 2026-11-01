import { Platform } from 'react-native';

import { NATIVE_NOTIFICATIONS, hasNativeModule } from '@/lib/native-modules';
import type { Order } from '@/lib/types';

/**
 * Reminders about orders that are due, scheduled on the phone itself: no server and no push service
 * are involved, so they work offline and without a paid Apple account. The notifications module is
 * loaded when needed; a build made without it simply has no reminders.
 */

const REMINDER_HOUR = 9;
// iOS keeps at most 64 scheduled notifications.
const MAX_REMINDERS = 60;
const CHANNEL = 'reminders';

async function load() {
  if (Platform.OS === 'web' || !hasNativeModule(NATIVE_NOTIFICATIONS)) return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

/** Asks the system for permission to show notifications. True when it is given. */
export async function requestReminderPermission() {
  const Notifications = await load();
  if (!Notifications) return false;
  try {
    if (Platform.OS === 'android') {
      // Android 13 asks only once a channel exists.
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Order reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

type Texts = { title: (order: Order) => string; body: (order: Order) => string };

/**
 * Makes the scheduled reminders match these orders: one on the morning an order is due (an hour
 * before, when it has a time). `null` removes them all, which is what turning reminders off does.
 */
export async function syncReminders(orders: Order[] | null, texts: Texts) {
  const Notifications = await load();
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!orders) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    const now = Date.now();
    const upcoming = orders
      .filter((order) => order.due_date && order.status !== 'completed' && order.status !== 'ready')
      .map((order) => {
        const [year, month, day] = order.due_date!.split('-').map(Number);
        const [hour, minute] = order.due_time
          ? order.due_time.split(':').map(Number)
          : [REMINDER_HOUR + 1, 0];
        // An hour before the due time, or at nine in the morning when there is none.
        return { order, at: new Date(year, month - 1, day, hour - 1, minute) };
      })
      .filter(({ at }) => at.getTime() > now)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, MAX_REMINDERS);

    for (const { order, at } of upcoming) {
      await Notifications.scheduleNotificationAsync({
        content: { title: texts.title(order), body: texts.body(order), data: { orderId: order.id } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
          ...(Platform.OS === 'android' && { channelId: CHANNEL }),
        },
      });
    }
  } catch {
    // Reminders are a convenience; a failure to schedule them must not disturb the app.
  }
}
