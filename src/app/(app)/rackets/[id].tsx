import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoreHorizontal, Pencil, Repeat, Trash2 } from '@/components/icons';
import { HISTORY_SHOWN } from '@/components/order-card';
import RacketFormSheet from '@/components/racket-form-sheet';
import { StockBadge, StockSheet } from '@/components/stock';
import ActionSheet from '@/components/ui/action-sheet';
import PlusIcon from '@/components/icons/plus-icon';
import { StatusBadge } from '@/components/ui/badge';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { useConfirm } from '@/components/ui/confirm';
import IconButton from '@/components/ui/icon-button';
import { TwoColumns } from '@/components/ui/page';
import Section from '@/components/ui/section';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { BlockSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { formatDate, orderNumber, racketName, todayIso } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { describeSetup } from '@/lib/order-text';
import { useDeleteRacket, useRacket } from '@/lib/queries';

export default function RacketDetails() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useRacket(id);
  const remove = useDeleteRacket();
  const [editing, setEditing] = useState(false);
  const [stocking, setStocking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [allOrders, setAllOrders] = useState(false);
  const racket = query.data;
  const today = todayIso(user?.timezone);

  if (!racket) {
    return (
      <Screen>
        <DetailHeader title={t('racket_details')} />
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <View className="gap-4 p-page">
            <BlockSkeleton className="h-28" />
            <BlockSkeleton className="h-40" />
          </View>
        )}
      </Screen>
    );
  }

  const askDelete = async () => {
    const ok = await confirm({
      title: t('racket_delete_title', { name: racketName(racket) }),
      message: t('racket_delete_message'),
      confirmLabel: t('delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(racket.id);
      toast.success(t('racket_deleted'));
      if (router.canGoBack()) router.back();
      else router.replace('/catalog');
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  return (
    <Screen
      flush
      width="medium"
      dock={
        racket.last_setup ? (
          <Shortcut
            icon={PlusIcon}
            label={t('new_order')}
            color={colors.newOrder}
            contentColor={colors.ink}
            className="px-5 py-5 w-full"
            onPress={() => router.push({ pathname: '/orders/new', params: { clientId: racket.client_id ?? undefined } })}
          />
        ) : undefined
      }
      footer={racket.last_setup ? <View style={{ height: Math.max(insets.bottom, 12) + 24 }} /> : undefined}>
      <DetailHeader
        floating
        title={racketName(racket)}
        right={<IconButton icon={MoreHorizontal} label={t('more_actions')} onPress={() => setMenu(true)} />}
      />
      <DetailScroll contentContainerClassName="gap-page p-page pb-28 md:pb-12" showsVerticalScrollIndicator={false}>
        {/* On a desktop the racket and its last setup are in one column, and the history of the stringings in the other. */}
        <TwoColumns
          first={
            <>
        <Card className="gap-3">
          <View className="gap-0.5">
            <Text className="text-[14.3px] text-muted">{racket.brand}</Text>
            <Text className="text-[24.2px] font-semibold">{racket.model}</Text>
          </View>
          {racket.client_id ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/clients/[id]', params: { id: racket.client_id! } })}
              className="flex-row items-center justify-between hover:opacity-80 active:opacity-60">
              <Text className="text-[16.5px] text-muted">{t('field_owner')}</Text>
              <Text className="text-[16.5px] font-medium text-primary">{racket.client_name}</Text>
            </Pressable>
          ) : (
            // A catalog racket has no owner; what it has is a stock, which is changed with a tap.
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-[16.5px] text-muted">{t('field_stock')}</Text>
              {racket.track_stock ? (
                <StockBadge kind="racket" item={racket} onPress={() => setStocking(true)} />
              ) : (
                <Text className="text-[16.5px] text-muted">{t('stock_untracked')}</Text>
              )}
            </View>
          )}
          {racket.notes ? <Text className="text-[16.5px] text-muted">{racket.notes}</Text> : null}
        </Card>

        {racket.last_setup ? (
          <Card className="gap-3">
            <View className="gap-0.5">
              <Text className="text-[14.3px] font-medium text-primary">
                {t('order_last_setup', {
                  number: orderNumber(racket.last_setup.number),
                  date: formatDate(racket.last_setup.received_date, language, today),
                })}
              </Text>
              <Text className="text-[16.5px]">{describeSetup(racket.last_setup, user?.tension_unit ?? 'kg', t)}</Text>
            </View>
            <Shortcut
              compact
              icon={Repeat}
              label={t('repeat_last_setup')}
              color={colors.surface}
              contentColor={colors.ink}
              onPress={() => router.push({ pathname: '/orders/new', params: { racketId: racket.id } })}
            />
          </Card>
        ) : (
          <Shortcut
            icon={PlusIcon}
            label={t('new_order')}
            color={colors.newOrder}
            contentColor={colors.ink}
            onPress={() => router.push({ pathname: '/orders/new', params: { racketId: racket.id } })}
          />
        )}

            </>
          }
          second={
            <>
        <Section
          title={t('section_stringing_history')}
          actionLabel={!allOrders && racket.orders.length > HISTORY_SHOWN ? t('see_all') : undefined}
          onAction={() => setAllOrders(true)}>
          {racket.orders.length === 0 ? (
            <Card>
              <Text className="text-center text-[16.5px] text-muted">{t('racket_no_history')}</Text>
            </Card>
          ) : (
            <View className="gap-3">
              {(allOrders ? racket.orders : racket.orders.slice(0, HISTORY_SHOWN)).map((order) => (
                <Card
                  key={order.id}
                  onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
                  className="gap-1.5">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-base font-semibold">
                      {orderNumber(order.number)} · {formatDate(order.received_date, language, today)}
                    </Text>
                    <StatusBadge status={order.status} />
                  </View>
                  <Text className="text-[16.5px]">{describeSetup(order, user?.tension_unit ?? 'kg', t)}</Text>
                  {order.stringing_notes || order.notes ? (
                    <Text className="text-[15.4px] text-muted" numberOfLines={3}>
                      {[order.stringing_notes, order.notes].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </View>
          )}
        </Section>
            </>
          }
        />
      </DetailScroll>


      <RacketFormSheet visible={editing} onClose={() => setEditing(false)} racket={racket} />
      <StockSheet visible={stocking} onClose={() => setStocking(false)} kind="racket" item={racket} />
      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: t('edit_racket'), icon: Pencil, onPress: () => setEditing(true) },
          { label: t('delete_racket'), icon: Trash2, destructive: true, onPress: () => void askDelete() },
        ]}
      />
    </Screen>
  );
}
