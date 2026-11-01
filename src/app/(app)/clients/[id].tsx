import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mail, MessageSquare, MoreHorizontal, Pencil, Phone, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ClientFormSheet from '@/components/client-form-sheet';
import OrderCard from '@/components/order-card';
import RacketFormSheet from '@/components/racket-form-sheet';
import ActionSheet from '@/components/ui/action-sheet';
import AppButton from '@/components/ui/app-button';
import Avatar from '@/components/ui/avatar';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { useConfirm } from '@/components/ui/confirm';
import IconButton from '@/components/ui/icon-button';
import Section from '@/components/ui/section';
import { DetailHeader, Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { callPhone, emailTo, textPhone } from '@/lib/contact';
import { describeError } from '@/lib/errors';
import { racketName } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useClient, useDeleteClient } from '@/lib/queries';

export default function ClientDetails() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useClient(id);
  const remove = useDeleteClient();
  const [editing, setEditing] = useState(false);
  const [addingRacket, setAddingRacket] = useState(false);
  const [menu, setMenu] = useState(false);
  const client = query.data;

  if (!client) {
    return (
      <Screen>
        <DetailHeader title={t('client_details')} />
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <View className="gap-4 p-page">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
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
    <Screen>
      <DetailHeader
        title={client.name}
        right={
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditing(true)}
              className="min-h-11 justify-center px-3 active:opacity-60">
              <Text className="text-base font-semibold text-primary">{t('edit')}</Text>
            </Pressable>
            <IconButton icon={MoreHorizontal} label={t('more_actions')} onPress={() => setMenu(true)} />
          </>
        }
      />
      <ScrollView contentContainerClassName="gap-page p-page pb-8" showsVerticalScrollIndicator={false}>
        <Card className="gap-3">
          <View className="flex-row items-center gap-3">
            <Avatar name={client.name} size={52} />
            <View className="flex-1 gap-0.5">
              <Text className="text-[19px] font-semibold" numberOfLines={2}>
                {client.name}
              </Text>
              {client.phone ? <Text className="text-[15px] text-muted">{client.phone}</Text> : null}
              {client.email ? <Text className="text-[15px] text-muted">{client.email}</Text> : null}
            </View>
          </View>
          {client.phone || client.email ? (
            <View className="flex-row gap-2">
              {client.phone ? (
                <AppButton
                  className="flex-1"
                  title={t('call')}
                  variant="secondary"
                  icon={<Phone size={18} color={colors.ink} />}
                  onPress={() => void callPhone(client.phone!)}
                />
              ) : null}
              {client.phone ? (
                <AppButton
                  className="flex-1"
                  title={t('message')}
                  variant="secondary"
                  icon={<MessageSquare size={18} color={colors.ink} />}
                  onPress={() => void textPhone(client.phone!)}
                />
              ) : null}
              {client.email ? (
                <AppButton
                  className="flex-1"
                  title={t('field_email')}
                  variant="secondary"
                  icon={<Mail size={18} color={colors.ink} />}
                  onPress={() => void emailTo(client.email!)}
                />
              ) : null}
            </View>
          ) : null}
          {client.notes ? <Text className="text-[15px] text-muted">{client.notes}</Text> : null}
        </Card>

        <Section title={t('section_rackets')} actionLabel={t('add')} onAction={() => setAddingRacket(true)}>
          {client.rackets.length === 0 ? (
            <Card className="items-center gap-3 py-6">
              <Text className="text-center text-[15px] text-muted">{t('client_no_rackets')}</Text>
              <AppButton
                title={t('add_racket')}
                variant="soft"
                icon={<Plus size={18} color={colors.primary} />}
                onPress={() => setAddingRacket(true)}
              />
            </Card>
          ) : (
            <View className="gap-3">
              {client.rackets.map((racket) => (
                <Card
                  key={racket.id}
                  onPress={() => router.push({ pathname: '/rackets/[id]', params: { id: racket.id } })}
                  className="gap-0.5">
                  <Text className="text-base font-semibold">{racketName(racket)}</Text>
                  <Text className="text-[13px] text-muted">
                    {t('orders_count', { count: racket.orders_count })}
                  </Text>
                </Card>
              ))}
            </View>
          )}
        </Section>

        <Section title={t('section_order_history')}>
          {client.orders.length === 0 ? (
            <Card>
              <Text className="text-center text-[15px] text-muted">{t('client_no_orders_yet')}</Text>
            </Card>
          ) : (
            <View className="gap-3">
              {client.orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
                />
              ))}
            </View>
          )}
        </Section>
      </ScrollView>

      <View
        className="border-t border-line bg-white px-page pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <AppButton
          large
          title={t('new_order')}
          icon={<Plus size={20} color={colors.white} />}
          onPress={() => router.push({ pathname: '/orders/new', params: { clientId: client.id } })}
        />
      </View>

      <ClientFormSheet visible={editing} onClose={() => setEditing(false)} client={client} />
      <RacketFormSheet
        visible={addingRacket}
        onClose={() => setAddingRacket(false)}
        owner={{ id: client.id, name: client.name }}
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
