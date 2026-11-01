import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Copy,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  Repeat,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ContactSheet from '@/components/contact-sheet';
import { useDueText } from '@/components/order-card';
import ReadyMessageSheet from '@/components/ready-message-sheet';
import ActionSheet from '@/components/ui/action-sheet';
import AppButton from '@/components/ui/app-button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { useConfirm } from '@/components/ui/confirm';
import IconButton from '@/components/ui/icon-button';
import { PhotoViewer, ServerPhoto } from '@/components/ui/photo';
import Section from '@/components/ui/section';
import { DetailHeader, Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { callPhone, copyText, emailTo, textPhone } from '@/lib/contact';
import { describeError } from '@/lib/errors';
import {
  formatMoney,
  formatTension,
  formatTimestamp,
  isOverdue,
  orderNumber,
  racketName,
} from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { describeStrings, orderAsText, readyMessage } from '@/lib/order-text';
import { useDeleteOrder, useOrder, useUpdateOrder } from '@/lib/queries';
import type { OrderStatus } from '@/lib/types';

// What the main button does for each status: where the order goes next.
const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: 'action_start' | 'action_ready' | 'action_complete' }>> = {
  received: { status: 'in_progress', label: 'action_start' },
  in_progress: { status: 'ready', label: 'action_ready' },
  ready: { status: 'completed', label: 'action_complete' },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="min-h-8 flex-row items-start justify-between gap-4">
      <Text className="text-[15px] text-muted">{label}</Text>
      <View className="flex-1 items-end">
        {typeof children === 'string' ? (
          <Text className="text-right text-[15px] font-medium">{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export default function OrderDetails() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useOrder(id);
  const update = useUpdateOrder();
  const remove = useDeleteOrder();
  const { today, dueText } = useDueText();

  const [menu, setMenu] = useState(false);
  const [contact, setContact] = useState(false);
  const [readyOpen, setReadyOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const order = query.data;
  const currency = user?.currency ?? 'USD';
  const unit = user?.tension_unit ?? 'kg';
  const timeZone = user?.timezone ?? 'UTC';

  if (!order) {
    return (
      <Screen>
        <DetailHeader title={t('order_details')} />
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <View className="gap-4 p-page">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </View>
        )}
      </Screen>
    );
  }

  const next = NEXT[order.status];
  const overdue = isOverdue(order, today);
  const money = (amount: number | null) => formatMoney(amount, currency, language);
  const hasContact = !!(order.client.phone || order.client.email);

  const move = async (status: OrderStatus) => {
    try {
      await update.mutateAsync({ id: order.id, status });
      // The racket is done: offer the customer a message that is already written.
      if (status === 'ready') setReadyOpen(true);
      else toast.success(t('order_status_changed', { status: t(`status_${status}`) }));
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  const setPaid = async (isPaid: boolean) => {
    try {
      await update.mutateAsync({ id: order.id, is_paid: isPaid });
      toast.success(isPaid ? t('payment_marked_paid') : t('payment_marked_unpaid'));
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  const copyDetails = async () => {
    const ok = await copyText(orderAsText(order, { t, language, unit, currency, timeZone }));
    if (ok) toast.success(t('copied'));
    else toast.error(t('copy_failed'));
  };

  const askDelete = async () => {
    const ok = await confirm({
      title: t('order_delete_title', { number: orderNumber(order.number) }),
      message: t('order_delete_message'),
      confirmLabel: t('delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(order.id);
      toast.success(t('order_deleted'));
      if (router.canGoBack()) router.back();
      else router.replace('/orders');
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  const strungWith = describeStrings(order, t);
  const lines = [
    { name: t('field_labor_price'), price: order.labor_price },
    ...(order.customer_strings ? [] : [{ name: t('field_string_price'), price: order.string_price }]),
    ...order.services.map((line) => ({ name: line.name, price: line.price })),
  ].filter((line) => line.price !== null);

  return (
    <Screen>
      <DetailHeader
        title={t('order_title', { number: orderNumber(order.number) })}
        right={
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/orders/[id]/edit', params: { id: order.id } })}
              className="min-h-11 justify-center px-3 active:opacity-60">
              <Text className="text-base font-semibold text-primary">{t('edit')}</Text>
            </Pressable>
            <IconButton icon={MoreHorizontal} label={t('more_actions')} onPress={() => setMenu(true)} />
          </>
        }
      />

      <ScrollView
        contentContainerClassName="gap-4 p-page pb-8"
        showsVerticalScrollIndicator={false}>
        <View className="flex-row flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <Badge
            label={order.is_paid ? t('payment_paid') : t('payment_unpaid')}
            tone={order.is_paid ? 'success' : 'warning'}
          />
          {overdue ? <Badge label={t('order_overdue')} tone="danger" /> : null}
        </View>

        <Card className="gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/clients/[id]', params: { id: order.client.id } })}
            className="flex-row items-center gap-3 active:opacity-60">
            <View className="size-11 items-center justify-center rounded-full bg-primary-soft">
              <UserRound size={22} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-[17px] font-semibold" numberOfLines={1}>
                {order.client.name}
              </Text>
              <Text className="text-[14px] text-muted" numberOfLines={1}>
                {order.client.phone ?? order.client.email ?? t('no_contact_details')}
              </Text>
            </View>
          </Pressable>
          {hasContact ? (
            <View className="flex-row gap-2">
              {order.client.phone ? (
                <AppButton
                  className="flex-1"
                  title={t('call')}
                  variant="secondary"
                  icon={<Phone size={18} color={colors.ink} />}
                  onPress={() => void callPhone(order.client.phone!)}
                />
              ) : null}
              {order.client.phone ? (
                <AppButton
                  className="flex-1"
                  title={t('message')}
                  variant="secondary"
                  icon={<MessageSquare size={18} color={colors.ink} />}
                  onPress={() => void textPhone(order.client.phone!)}
                />
              ) : null}
              {!order.client.phone && order.client.email ? (
                <AppButton
                  className="flex-1"
                  title={t('field_email')}
                  variant="secondary"
                  icon={<Mail size={18} color={colors.ink} />}
                  onPress={() => void emailTo(order.client.email!)}
                />
              ) : null}
            </View>
          ) : null}
        </Card>

        <Section title={t('section_racket_setup')}>
          <Card className="gap-1.5">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/rackets/[id]', params: { id: order.racket.id } })}
              className="active:opacity-60">
              <Text className="pb-1 text-[17px] font-semibold">{racketName(order.racket)}</Text>
            </Pressable>
            <Row label={order.hybrid ? t('field_main_strings') : t('field_strings')}>
              {order.hybrid ? (order.main_string_name ?? '—') : strungWith}
            </Row>
            {order.hybrid ? <Row label={t('field_cross_strings')}>{order.cross_string_name ?? '—'}</Row> : null}
            <Row label={order.hybrid || order.cross_tension !== null ? t('field_main_tension') : t('field_tension')}>
              {formatTension(order.main_tension, unit)}
            </Row>
            {order.cross_tension !== null && order.cross_tension !== order.main_tension ? (
              <Row label={t('field_cross_tension')}>{formatTension(order.cross_tension, unit)}</Row>
            ) : null}
            {order.knots ? <Row label={t('field_knots')}>{String(order.knots)}</Row> : null}
            {order.stringing_notes ? (
              <View className="gap-0.5 pt-1.5">
                <Text className="text-[13px] text-muted">{t('order_stringing_notes')}</Text>
                <Text className="text-[15px]">{order.stringing_notes}</Text>
              </View>
            ) : null}
          </Card>
        </Section>

        <Section title={t('section_dates')}>
          <Card className="gap-1.5">
            <Row label={t('order_received_date')}>
              {formatTimestamp(`${order.received_date}T12:00:00`, language, 'UTC')}
            </Row>
            <Row label={t('order_due_date')}>
              <Text className={`text-right text-[15px] font-medium ${overdue ? 'text-danger' : ''}`}>
                {order.due_date
                  ? `${dueText(order.due_date)}${order.due_time ? `, ${order.due_time}` : ''}`
                  : t('order_no_due_date')}
              </Text>
            </Row>
            {order.ready_at ? (
              <Row label={t('status_ready')}>{formatTimestamp(order.ready_at, language, timeZone)}</Row>
            ) : null}
            {order.completed_at ? (
              <Row label={t('status_completed')}>{formatTimestamp(order.completed_at, language, timeZone)}</Row>
            ) : null}
          </Card>
        </Section>

        {order.notes || order.photos.length > 0 ? (
          <Section title={t('section_notes_photos')}>
            <Card className="gap-3">
              {order.notes ? <Text className="text-[15px]">{order.notes}</Text> : null}
              {order.photos.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                  {order.photos.map((photo) => (
                    <ServerPhoto
                      key={photo.id}
                      id={photo.id}
                      className="w-[31%]"
                      onPress={() => setViewing(photo.id)}
                    />
                  ))}
                </View>
              ) : null}
            </Card>
          </Section>
        ) : null}

        <Section title={t('section_payment')}>
          <Card className="gap-3">
            {lines.map((line) => (
              <Row key={line.name} label={line.name}>
                {money(line.price)}
              </Row>
            ))}
            <View className="flex-row items-center justify-between border-t border-line pt-3">
              <Text className="text-base font-medium text-muted">{t('order_total')}</Text>
              <Text className="text-[24px] font-semibold text-primary">{money(order.total)}</Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-[15px] text-muted">{t('payment_status')}</Text>
              <Badge
                label={order.is_paid ? t('payment_paid') : t('payment_unpaid')}
                tone={order.is_paid ? 'success' : 'warning'}
              />
            </View>
            {order.is_paid ? (
              <AppButton
                title={t('mark_unpaid')}
                variant="ghost"
                onPress={() => setPaid(false)}
                disabled={update.isPending}
              />
            ) : (
              <AppButton
                title={t('mark_paid')}
                variant="soft"
                onPress={() => setPaid(true)}
                loading={update.isPending && update.variables?.is_paid === true}
              />
            )}
          </Card>
        </Section>
      </ScrollView>

      {next ? (
        <View
          className="border-t border-line bg-white px-page pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <AppButton
            large
            title={t(next.label)}
            onPress={() => move(next.status)}
            loading={update.isPending && update.variables?.status === next.status}
          />
        </View>
      ) : null}

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        actions={[
          {
            label: t('edit_order'),
            icon: Pencil,
            onPress: () => router.push({ pathname: '/orders/[id]/edit', params: { id: order.id } }),
          },
          {
            label: t('repeat_order'),
            icon: Repeat,
            onPress: () => router.push({ pathname: '/orders/new', params: { from: order.id } }),
          },
          {
            label: t('contact_customer'),
            icon: Phone,
            onPress: () => (hasContact ? setContact(true) : toast.error(t('no_contact_details'))),
          },
          { label: t('copy_order_details'), icon: Copy, onPress: () => void copyDetails() },
          { label: t('delete_order'), icon: Trash2, destructive: true, onPress: () => void askDelete() },
        ]}
      />
      <ContactSheet
        visible={contact}
        onClose={() => setContact(false)}
        name={order.client.name}
        phone={order.client.phone}
        email={order.client.email}
      />
      <ReadyMessageSheet
        visible={readyOpen}
        onClose={() => setReadyOpen(false)}
        phone={order.client.phone}
        message={readyMessage(order, {
          t,
          language,
          currency,
          workshop: user?.workshop_name ?? null,
        })}
      />
      <PhotoViewer id={viewing} onClose={() => setViewing(null)} />
    </Screen>
  );
}
