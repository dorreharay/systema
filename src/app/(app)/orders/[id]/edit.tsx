import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import OrderForm from '@/components/order-form';
import { DetailHeader, Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { draftFromOrder } from '@/lib/order-draft';
import { useOrder } from '@/lib/queries';

export default function EditOrder() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useOrder(id);

  if (!order.data) {
    return (
      <Screen>
        <DetailHeader title={t('edit_order')} />
        {order.isError ? (
          <ErrorState error={order.error} onRetry={() => order.refetch()} />
        ) : (
          <View className="gap-4 p-page">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-56 w-full rounded-2xl" />
          </View>
        )}
      </Screen>
    );
  }

  return (
    <OrderForm
      key={order.data.id}
      initial={draftFromOrder(order.data, user?.tension_unit ?? 'kg')}
      order={order.data}
    />
  );
}
