import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CallButton from '@/components/call-button';
import ContactSheet from '@/components/contact-sheet';
import {
  Check,
  ChevronsRight,
  Copy,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  Repeat,
  Trash2,
  Undo2,
} from '@/components/icons';
import UserIcon from '@/components/icons/user-icon';
import { useDueText } from '@/components/order-card';
import ReadyMessageSheet from '@/components/ready-message-sheet';
import SyncBadge from '@/components/sync-badge';
import ActionSheet from '@/components/ui/action-sheet';
import { Badge, StatusBadge } from '@/components/ui/badge';
import Card from '@/components/ui/card';
import { colors, statusColors } from '@/components/ui/colors';
import { useConfirm } from '@/components/ui/confirm';
import IconButton from '@/components/ui/icon-button';
import { PhotoViewer, ServerPhoto } from '@/components/ui/photo';
import Section from '@/components/ui/section';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { BlockSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import StatusSteps from '@/components/ui/status-steps';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { copyText, emailTo } from '@/lib/contact';
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
import { useMark } from '@/lib/offline/react';
import { describeStrings, orderAsText, readyMessage } from '@/lib/order-text';
import { useDeleteOrder, useOrder, useUpdateOrder } from '@/lib/queries';
import type { OrderStatus } from '@/lib/types';

// What the main button does for each status: where the order goes next.
const NEXT: Partial<
  Record<OrderStatus, { status: OrderStatus; label: 'action_start' | 'action_ready' | 'action_complete' }>
> = {
  received: { status: 'in_progress', label: 'action_start' },
  in_progress: { status: 'ready', label: 'action_ready' },
  ready: { status: 'completed', label: 'action_complete' },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="min-h-8 flex-row items-start justify-between gap-4">
      <Text className="text-[16.5px] text-muted">{label}</Text>
      <View className="flex-1 items-end">
        {typeof children === 'string' ? (
          <Text className="text-right text-[16.5px] font-medium">{children}</Text>
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
  const mark = useMark(id);
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
            <BlockSkeleton className="h-16" />
            <BlockSkeleton className="h-32" />
            <BlockSkeleton className="h-40" />
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
      // Handing the racket over closes the order: it is paid for, too.
      await update.mutateAsync({ id: order.id, status, ...(status === 'completed' && !order.is_paid && { is_paid: true }) });
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
    <Screen
      flush
      dock={
        next ? (
          // Two arrows to the right: the order moves on to the next status.
          <Shortcut
            icon={ChevronsRight}
            label={t(next.label)}
            color={statusColors[next.status].fill}
            contentColor="#000000"
            className="px-5 py-5 w-full"
            onPress={() => move(next.status)}
            loading={update.isPending && update.variables?.status === next.status}
          />
        ) : undefined
      }
      footer={next ? <View style={{ height: Math.max(insets.bottom, 12) + 24 }} /> : undefined}>
      <DetailHeader
        floating
        title={t('order_title', { number: orderNumber(order.number) })}
        right={
          // A large button (a touch target twice as big, an icon 1.6 times as big), pulled out towards the edge of the screen
          // so that the dots stay about where they were.
          <View className="-mr-6">
            <IconButton large icon={MoreHorizontal} label={t('more_actions')} onPress={() => setMenu(true)} />
          </View>
        }
      />
      <DetailScroll
        contentContainerClassName="gap-4 p-page pb-28"
        showsVerticalScrollIndicator={false}>
        {/* Where the order stands and whom it is for: one block. */}
        <Card className="gap-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            <Badge
              label={order.is_paid ? t('payment_paid') : t('payment_unpaid')}
              tone={order.is_paid ? 'info' : 'warning'}
            />
            {overdue ? <Badge label={t('order_overdue')} tone="danger" /> : null}
            {mark ? <SyncBadge mark={mark} /> : null}
          </View>

          <StatusSteps status={order.status} />

          <View className="h-px bg-line" />

          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/clients/[id]', params: { id: order.client.id } })}
                className="flex-1 flex-row items-center gap-3 active:opacity-60">
                <View className="size-11 items-center justify-center rounded-full bg-primary-soft">
                  <UserIcon size={22} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-[18.7px] font-semibold" numberOfLines={1}>
                    {order.client.name}
                  </Text>
                  <Text className="text-[15.4px] text-muted" numberOfLines={1}>
                    {order.client.phone ?? order.client.email ?? t('no_contact_details')}
                  </Text>
                </View>
              </Pressable>
              {/* Once the racket is ready: the message for the customer, again (it is also offered when the order is marked ready). */}
              {order.status === 'ready' ? (
                <IconButton icon={MessageSquare} label={t('message_customer')} round large onPress={() => setReadyOpen(true)} />
              ) : null}
              {/* The ground of a large round button is the whole of its touch target: it stands at the edge of the card's content. */}
              {order.client.phone ? <CallButton phone={order.client.phone} round large /> : null}
            </View>
            {!order.client.phone && order.client.email ? (
              <Shortcut
                compact
                icon={Mail}
                label={t('field_email')}
                color={colors.surface}
                contentColor={colors.ink}
                onPress={() => void emailTo(order.client.email!)}
              />
            ) : null}
          </View>
        </Card>

        <Section title={t('section_racket_setup')}>
          <Card className="gap-1.5">
            <Row label={t('field_racket')}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/rackets/[id]', params: { id: order.racket.id } })}
                className="active:opacity-60">
                <Text className="text-right text-[16.5px] font-medium">{racketName(order.racket)}</Text>
              </Pressable>
            </Row>
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
                <Text className="text-[14.3px] text-muted">{t('order_stringing_notes')}</Text>
                <Text className="text-[16.5px]">{order.stringing_notes}</Text>
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
              <Text className={`text-right text-[16.5px] font-medium ${overdue ? 'text-danger' : ''}`}>
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
              {order.notes ? <Text className="text-[16.5px]">{order.notes}</Text> : null}
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
              <Text className="text-[26.4px] font-semibold text-primary">{money(order.total)}</Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-[16.5px] text-muted">{t('payment_status')}</Text>
              <Badge
                label={order.is_paid ? t('payment_paid') : t('payment_unpaid')}
                tone={order.is_paid ? 'info' : 'warning'}
              />
            </View>
            {order.is_paid ? (
              <Shortcut
                compact
                icon={Undo2}
                label={t('mark_unpaid')}
                color={colors.surface}
                contentColor={colors.ink}
                onPress={() => setPaid(false)}
                disabled={update.isPending}
              />
            ) : (
              <Shortcut
                compact
                icon={Check}
                label={t('mark_paid')}
                color={colors.surface}
                contentColor={colors.ink}
                onPress={() => setPaid(true)}
                loading={update.isPending && update.variables?.is_paid === true}
              />
            )}
          </Card>
        </Section>
      </DetailScroll>


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
        message={readyMessage(order, { t, language, currency })}
      />
      <PhotoViewer id={viewing} onClose={() => setViewing(null)} />
    </Screen>
  );
}
