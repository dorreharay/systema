import { useLocalSearchParams, useRouter } from 'expo-router';
import { ClipboardList, Plus, Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, TextInput, View } from 'react-native';

import OrderCard from '@/components/order-card';
import { FilterChips } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import IconButton from '@/components/ui/icon-button';
import { Screen, ScreenHeader, useDetailContentTop } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, NoResults } from '@/components/ui/states';
import { useI18n } from '@/lib/i18n';
import { useOrders } from '@/lib/queries';
import { usePullRefresh } from '@/lib/use-pull-refresh';
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
  const contentTop = useDetailContentTop();

  const pull = usePullRefresh(orders.refetch);

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

  // The list goes up under the floating header. On iOS the room is an inset, so that the pull to refresh opens
  // under the header, not behind it.
  const underHeader =
    Platform.OS === 'ios'
      ? {
          contentInset: { top: contentTop },
          contentOffset: { x: 0, y: -contentTop },
          scrollIndicatorInsets: { top: contentTop },
        }
      : { contentContainerStyle: { paddingTop: contentTop } };

  const listHeader = (
    <View>
      {searching ? (
        <View className="pb-3">
          <View className="min-h-12 flex-row items-center gap-2 rounded-lg border border-line bg-white px-3.5">
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
              textAlignVertical="center"
              className="min-w-0 flex-1 py-3 ios:pb-3.5 ios:pt-2.5 font-normal text-base text-ink outline-none"
            />
          </View>
        </View>
      ) : null}
      <View className="-mx-page pb-3">
        <FilterChips options={options} value={filter} onChange={setFilter} />
      </View>
    </View>
  );

  return (
    <Screen
      flush
      dock={
        <View className="flex-row w-full gap-1">
          <Shortcut
            icon={Plus}
            label={t('new_order')}
            color={colors.newOrder}
            contentColor="#000000"
            className="px-5 py-5 w-full"
            onPress={() => router.push('/orders/new')}
          />
        </View>
      }
    >
      <ScreenHeader
        floating
        title={t('tab_orders')}
        right={
          <IconButton
            icon={searching ? X : Search}
            label={searching ? t('close_search') : t('search')}
            onPress={searching ? closeSearch : () => setSearching(true)}
          />
        }
      />

      <FlatList
        {...underHeader}
        ListHeaderComponent={listHeader}
        data={items}
        keyExtractor={(order) => order.id}
        contentContainerClassName="gap-3 px-page pb-28"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            {...pull}
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
