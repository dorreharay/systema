import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import OrderForm from '@/components/order-form';
import { DetailHeader, Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useAuth } from '@/lib/auth';
import { todayIso } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { applySetup, emptyDraft, lastSetupOf, withRacket, type Draft } from '@/lib/order-draft';
import { useOrder, useRacket, useRackets } from '@/lib/queries';

/**
 * A new order. It can start from nothing, from a customer (their only racket is chosen), from a racket
 * (its last setup is copied in: "Repeat Last Setup"), or from an earlier order ("Repeat Order"). The
 * earlier order is only read; the new one is a separate order.
 */
export default function NewOrder() {
  const { t } = useI18n();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ clientId?: string; racketId?: string; from?: string }>();
  const racket = useRacket(params.racketId);
  const source = useOrder(params.from);
  const clientRackets = useRackets({ clientId: params.clientId });

  const needed = [
    params.racketId ? racket : undefined,
    params.from ? source : undefined,
    params.clientId ? clientRackets : undefined,
  ].filter((item) => !!item);
  const failed = needed.find((item) => item.isError);
  const loading = needed.some((item) => item.isPending);

  if (failed || loading) {
    return (
      <Screen>
        <DetailHeader title={t('new_order_title')} />
        {failed ? (
          <ErrorState error={failed.error} onRetry={() => needed.forEach((item) => item.refetch())} />
        ) : (
          <View className="gap-4 p-page">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-56 w-full rounded-2xl" />
          </View>
        )}
      </Screen>
    );
  }

  let initial: Draft = emptyDraft(todayIso(user?.timezone), user?.tension_unit ?? 'kg');

  if (source.data) {
    const order = source.data;
    initial = {
      ...applySetup(initial, order),
      client: { id: order.client.id, name: order.client.name },
      racket: {
        id: order.racket.id,
        brand: order.racket.brand,
        model: order.racket.model,
        client_id: order.client.id,
        client_name: order.client.name,
        last_setup: lastSetupOf(order),
      },
    };
  } else if (racket.data) {
    initial = withRacket(initial, racket.data);
  } else if (params.clientId) {
    const owned = clientRackets.data ?? [];
    if (owned.length === 1) {
      initial = withRacket(initial, owned[0]);
    } else if (owned.length > 1) {
      initial = { ...initial, client: { id: owned[0].client_id, name: owned[0].client_name } };
    }
  }

  return <OrderForm initial={initial} />;
}
