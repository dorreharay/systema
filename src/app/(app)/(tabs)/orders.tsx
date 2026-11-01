import { useLocalSearchParams, useRouter } from 'expo-router';
import { ClipboardList, Plus, Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, TextInput, View } from 'react-native';

import OrderCard from '@/components/order-card';
import { FilterChips } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import IconButton from '@/components/ui/icon-button';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, NoResults } from '@/components/ui/states';
import { useI18n } from '@/lib/i18n';
import { useOrders } from '@/lib/queries';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/types';

type Filter = 'all' | 'active' | OrderStatus;

const isFilter = (value: unknown): value is Filter =>
  value === 'all' || value === 'active' || ORDER_STATUSES.includes(value as OrderStatus);

const SEARCH_DEBOUNCE_MS = 250;

export default function Orders() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const [filter, setFilter] = useState<Filter>(isFilter(params.status) ? params.status : 'all');
  const [seenStatus, setSeenStatus] = useState(params.status);
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  // The home screen sends people here already filtered ("Ready for Pickup"), also when this tab is
  // already open: a new value in the route replaces the filter.
  if (params.status !== seenStatus) {
    setSeenStatus(params.status);
    if (isFilter(params.status)) setFilter(params.status);
  }

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const orders = useOrders({ status: filter === 'all' ? undefined : filter, q: query });
  const items = orders.data?.pages.flatMap((page) => page.items) ?? [];

  const closeSearch = () => {
    setSearching(false);
    setText('');
    setQuery('');
  };

  const options: { value: Filter; label: string }[] = [
    { value: 'all', label: t('filter_all') },
    ...(filter === 'active' ? [{ value: 'active' as const, label: t('filter_active') }] : []),
    ...ORDER_STATUSES.map((status) => ({ value: status, label: t(`status_${status}`) })),
  ];

  return (
    <Screen>
      <ScreenHeader
        title={t('tab_orders')}
        right={
          <>
            <IconButton
              icon={searching ? X : Search}
              label={searching ? t('close_search') : t('search')}
              onPress={searching ? closeSearch : () => setSearching(true)}
            />
            <IconButton icon={Plus} label={t('new_order')} onPress={() => router.push('/orders/new')} filled />
          </>
        }
      />

      {searching ? (
        <View className="px-page pb-3">
          <View className="min-h-12 flex-row items-center gap-2 rounded-xl border border-line bg-white px-3.5">
            <Search size={18} color={colors.muted} />
            <TextInput
              autoFocus
              value={text}
              onChangeText={setText}
              placeholder={t('orders_search_placeholder')}
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.primary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t('search')}
              className="min-w-0 flex-1 py-3 font-normal text-base text-ink outline-none"
            />
          </View>
        </View>
      ) : null}

      <View className="pb-3">
        <FilterChips options={options} value={filter} onChange={setFilter} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(order) => order.id}
        contentContainerClassName="gap-3 px-page pb-8"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={orders.isRefetching && !orders.isFetchingNextPage && !orders.isLoading}
            onRefresh={() => void orders.refetch()}
            tintColor={colors.primary}
          />
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (orders.hasNextPage && !orders.isFetchingNextPage) orders.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onPress={() => router.push({ pathname: '/orders/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          orders.isLoading ? (
            <ListSkeleton />
          ) : orders.isError ? (
            <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
          ) : filter === 'all' && !query ? (
            <EmptyState
              icon={ClipboardList}
              title={t('orders_empty_title')}
              message={t('orders_empty_message')}
              actionLabel={t('create_first_order')}
              onAction={() => router.push('/orders/new')}
            />
          ) : (
            <NoResults query={query} />
          )
        }
        ListFooterComponent={
          orders.isFetchingNextPage ? <ActivityIndicator className="py-4" color={colors.primary} /> : undefined
        }
      />
    </Screen>
  );
}
