import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CallButton from '@/components/call-button';
import ClientFormSheet from '@/components/client-form-sheet';
import { Mail, MoreHorizontal, Pencil, Trash2 } from '@/components/icons';
import PlusIcon from '@/components/icons/plus-icon';
import OrderCard, { HISTORY_SHOWN } from '@/components/order-card';
import { useGiveSheet } from '@/components/performer';
import RacketFormSheet from '@/components/racket-form-sheet';
import ReferenceRacketPicker from '@/components/reference-racket-picker';
import ActionSheet from '@/components/ui/action-sheet';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { useConfirm } from '@/components/ui/confirm';
import IconButton from '@/components/ui/icon-button';
import { TwoColumns } from '@/components/ui/page';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import Section from '@/components/ui/section';
import { afterSheetsClosed } from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import { BlockSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { emailTo } from '@/lib/contact';
import { describeError } from '@/lib/errors';
import { racketName } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useClient, useDeleteClient } from '@/lib/queries';
import { useWorkshop } from '@/lib/use-workshop';

export default function ClientDetails() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useClient(id);
  const remove = useDeleteClient();
  // A member of a paused workshop reads and does not write: no new order, no changes to the client.
  const { canWrite } = useWorkshop();
  // The owner of a team gives an order from the history to someone (the sheet is drawn once, below); a master's "Take" is on the card itself.
  const { give, sheet: giveSheet } = useGiveSheet();
  const [editing, setEditing] = useState(false);
  // A racket is added from the reference list; one that is not in it is typed in, in a form that comes after.
  const [pickingRacket, setPickingRacket] = useState(false);
  const [typedRacket, setTypedRacket] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [allOrders, setAllOrders] = useState(false);
  const client = query.data;

  if (!client) {
    return (
      <Screen>
        <DetailHeader title={t('client_details')} />
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <View className="gap-4 p-page">
            <BlockSkeleton className="h-28" />
            <BlockSkeleton className="h-32" />
          </View>
        )}
      </Screen>
    );
  }

  const askDelete = async () => {
    const ok = await confirm({
      title: t('client_delete_title', { name: client.name }),
      message: t('client_delete_message'),
      confirmLabel: t('delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(client.id);
      toast.success(t('client_deleted'));
      if (router.canGoBack()) router.back();
      else router.replace('/clients');
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  return (
    <Screen
      flush
      width="medium"
      dock={
        canWrite ? (
          <Shortcut
            icon={PlusIcon}
            label={t('new_order')}
            color={colors.newOrder}
            contentColor={colors.ink}
            className="px-5 py-5 w-full"
            onPress={() => router.push({ pathname: '/orders/new', params: { clientId: client.id } })}
          />
        ) : undefined
      }
      footer={canWrite ? <View style={{ height: Math.max(insets.bottom, 12) + 24 }} /> : undefined}>
      <DetailHeader
        floating
        title={client.name}
        right={
          <>
            {client.phone ? <CallButton phone={client.phone} /> : null}
            {canWrite ? <IconButton icon={MoreHorizontal} label={t('more_actions')} onPress={() => setMenu(true)} /> : null}
          </>
        }
      />
      <DetailScroll contentContainerClassName="gap-page p-page mt-4 pb-28 md:pb-12" showsVerticalScrollIndicator={false}>
        {/* On a desktop the rackets are in one column, and the history of the orders in the other. */}
        <TwoColumns
          first={
            <>
        {/* The name is the title of the header; what is left of the profile is how to reach the client. The call is
            a button in the header. */}
        {client.email || client.notes ? (
          <Card className="gap-3">
            {client.email ? (
              <Shortcut
                compact
                icon={Mail}
                label={t('field_email')}
                color={colors.surface}
                contentColor={colors.ink}
                onPress={() => void emailTo(client.email!)}
              />
            ) : null}
            {client.notes ? <Text className="text-[16.5px] text-muted">{client.notes}</Text> : null}
          </Card>
        ) : null}

        <Section title={t('section_rackets')} actionLabel={canWrite ? t('add') : undefined} onAction={() => setPickingRacket(true)}>
          {client.rackets.length === 0 ? (
            <Card className="items-center gap-3 py-6">
              <Text className="text-center text-[16.5px] text-muted">{t('client_no_rackets')}</Text>
              {canWrite ? (
                <Shortcut
                  compact
                  className="self-stretch"
                  icon={PlusIcon}
                  label={t('add_racket')}
                  color={colors.catalog}
                  contentColor={colors.ink}
                  onPress={() => setPickingRacket(true)}
                />
              ) : null}
            </Card>
          ) : (
            <View className="gap-3">
              {client.rackets.map((racket) => (
                <Card
                  key={racket.id}
                  onPress={() => router.push({ pathname: '/rackets/[id]', params: { id: racket.id } })}
                  className="gap-0.5">
                  <Text className="text-base font-semibold">{racketName(racket)}</Text>
                  <Text className="text-[14.3px] text-muted">
                    {t('orders_count', { count: racket.orders_count })}
                  </Text>
                </Card>
              ))}
            </View>
          )}
        </Section>
            </>
          }
          second={
            <>
        <Section
          title={t('section_order_history')}
          actionLabel={!allOrders && client.orders.length > HISTORY_SHOWN ? t('see_all') : undefined}
          onAction={() => setAllOrders(true)}>
          {client.orders.length === 0 ? (
            <Card>
              <Text className="text-center text-[16.5px] text-muted">{t('client_no_orders_yet')}</Text>
            </Card>
          ) : (
            <View className="gap-3">
              {(allOrders ? client.orders : client.orders.slice(0, HISTORY_SHOWN)).map((order) => (
                <OrderCard key={order.id} order={order} onGive={give} />
              ))}
            </View>
          )}
        </Section>
            </>
          }
        />
      </DetailScroll>


      {giveSheet}
      <ClientFormSheet visible={editing} onClose={() => setEditing(false)} client={client} />
      <ReferenceRacketPicker
        visible={pickingRacket}
        onClose={() => setPickingRacket(false)}
        owner={client}
        // After one sheet closes, the next may open.
        onCreate={(name) => {
          setPickingRacket(false);
          afterSheetsClosed(() => setTypedRacket(name));
        }}
      />
      <RacketFormSheet
        visible={typedRacket !== null}
        onClose={() => setTypedRacket(null)}
        owner={{ id: client.id, name: client.name }}
        initialModel={typedRacket ?? undefined}
      />
      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: t('edit_client'), icon: Pencil, onPress: () => setEditing(true) },
          { label: t('delete_client'), icon: Trash2, destructive: true, onPress: () => void askDelete() },
        ]}
      />
    </Screen>
  );
}
