import { useLocalSearchParams, useRouter } from 'expo-router';
import { MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import RacketFormSheet from '@/components/racket-form-sheet';
import ActionSheet from '@/components/ui/action-sheet';
import AppButton from '@/components/ui/app-button';
import { StatusBadge } from '@/components/ui/badge';
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
  const [menu, setMenu] = useState(false);
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
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
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
    <Screen>
      <DetailHeader
        title={racketName(racket)}
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
          <View className="gap-0.5">
            <Text className="text-[13px] text-muted">{racket.brand}</Text>
            <Text className="text-[22px] font-semibold">{racket.model}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/clients/[id]', params: { id: racket.client_id } })}
            className="flex-row items-center justify-between active:opacity-60">
            <Text className="text-[15px] text-muted">{t('field_owner')}</Text>
            <Text className="text-[15px] font-medium text-primary">{racket.client_name}</Text>
          </Pressable>
          {racket.notes ? <Text className="text-[15px] text-muted">{racket.notes}</Text> : null}
        </Card>

        {racket.last_setup ? (
          <Card className="gap-3">
            <View className="gap-0.5">
              <Text className="text-[13px] font-medium text-primary">
                {t('order_last_setup', {
                  number: orderNumber(racket.last_setup.number),
                  date: formatDate(racket.last_setup.received_date, language, today),
                })}
              </Text>
              <Text className="text-[15px]">{describeSetup(racket.last_setup, user?.tension_unit ?? 'kg', t)}</Text>
            </View>
            <AppButton
              large
              title={t('repeat_last_setup')}
              icon={<Repeat size={20} color={colors.white} />}
              onPress={() => router.push({ pathname: '/orders/new', params: { racketId: racket.id } })}
            />
          </Card>
        ) : (
          <AppButton
            large
            title={t('new_order')}
            icon={<Plus size={20} color={colors.white} />}
            onPress={() => router.push({ pathname: '/orders/new', params: { racketId: racket.id } })}
          />
        )}

        <Section title={t('section_stringing_history')}>
          {racket.orders.length === 0 ? (
            <Card>
              <Text className="text-center text-[15px] text-muted">{t('racket_no_history')}</Text>
            </Card>
          ) : (
            <View className="gap-3">
              {racket.orders.map((order) => (
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
                  <Text className="text-[15px]">{describeSetup(order, user?.tension_unit ?? 'kg', t)}</Text>
                  {order.stringing_notes || order.notes ? (
                    <Text className="text-[14px] text-muted" numberOfLines={3}>
                      {[order.stringing_notes, order.notes].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </View>
          )}
        </Section>
      </ScrollView>

      {racket.last_setup ? (
        <View
          className="border-t border-line bg-white px-page pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <AppButton
            title={t('new_order')}
            variant="secondary"
            icon={<Plus size={20} color={colors.ink} />}
            onPress={() =>
              router.push({ pathname: '/orders/new', params: { clientId: racket.client_id } })
            }
          />
        </View>
      ) : null}

      <RacketFormSheet visible={editing} onClose={() => setEditing(false)} racket={racket} />
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
