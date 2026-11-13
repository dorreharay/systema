import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Platform, RefreshControl, View } from 'react-native';

import { ClipboardList, Plus } from '@/components/icons';
import OrderCard from '@/components/order-card';
import { useStatusChange } from '@/components/order-status';
import OrdersTablePage from '@/components/orders-table';
import { useGiveSheet } from '@/components/performer';
import QueueChips, { useQueueFilter } from '@/components/queue-chips';
import { colors } from '@/components/ui/colors';
import { GridItem, listGap, PAGE_CONTENT } from '@/components/ui/page';
import { Screen, ScreenHeader, TAB_HEADER_DROP, useDetailContentTop } from '@/components/ui/screen';
import SearchField from '@/components/ui/search-field';
import Shortcut from '@/components/ui/shortcut';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, NoResults } from '@/components/ui/states';
import { useI18n } from '@/lib/i18n';
import { GRID_GAP, useGridColumns, useIsDesktop, useIsWide } from '@/lib/layout';
import { useOrders } from '@/lib/queries';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useSearch } from '@/lib/use-search';
import { useWorkshop } from '@/lib/use-workshop';
import WorkshopPausedBanner from '@/components/workshop-paused-banner';

// The orders as cards: on the phone in a list, on a tablet in a grid.
function OrdersList() {
  const { t } = useI18n();
  const router = useRouter();
  const search = useSearch();
  const { query } = search;

  const { canWrite } = useWorkshop();
  // In a workshop with a team: all the orders, the person's own, or the queue. (In a workshop of one the list is not filtered at all.)
  const filter = useQueueFilter();
  const orders = useOrders({
    q: query,
    queue: filter.queue === 'all' ? undefined : filter.queue === 'mine' ? 'mine' : 'none',
    me: filter.me,
  });
  const { give, sheet: giveSheet } = useGiveSheet();
  // The small button at the foot of a card that moves an order on; the message to the customer that follows "Ready" is one sheet for the
  // whole list.
  const status = useStatusChange();
  const items = orders.data?.pages.flatMap((page) => page.items) ?? [];
  const contentTop = useDetailContentTop(TAB_HEADER_DROP);

  const pull = usePullRefresh(orders.refetch);
  // A wide page has a header of its own in the flow of the page, and the orders in a grid.
  const wide = useIsWide();
  const columns = useGridColumns(380);

  // The list goes up under the floating header. On iOS the room is an inset, so that the pull to refresh opens
  // under the header, not behind it.
  const underHeader =
    Platform.OS === 'ios'
      ? {
          contentInset: { top: contentTop - 20 },
          contentOffset: { x: 0, y: -contentTop },
          scrollIndicatorInsets: { top: contentTop },
        }
      : { contentContainerStyle: { paddingTop: contentTop } };

  // The field is the first thing of the list, and goes up with it. Under the floating header of the phone it has room above it: on iOS
  // the list starts 20 pt higher than the foot of the header (see `underHeader`), and that much more is added to it.
  const listHeader = (
    <View className={`${wide ? '' : Platform.OS === 'ios' ? 'pt-7' : 'pt-2'} ${filter.team ? 'gap-2' : ''}`}>
      <WorkshopPausedBanner className="mb-2" />
      <SearchField value={search.text} onChangeText={search.setText} placeholder={t('orders_search_placeholder')} />
      {filter.team ? <QueueChips value={filter.queue} onChange={filter.setQueue} waiting={filter.waiting} /> : null}
    </View>
  );

  return (
    <Screen
      flush
      width="wide"
      // The sidebar has the button of the new order: there is none here on a wide page.
      wideDock={false}
      // (A member of a paused workshop reads and does not write: no new order.)
      dock={
        canWrite ? (
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
        ) : undefined
      }
    >
      <ScreenHeader floating drop={TAB_HEADER_DROP} title={t('tab_orders')} />

      <FlatList bounces={false} overScrollMode="never"
        // The number of columns cannot change under a list: another count is another list.
        key={`columns-${columns}`}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: GRID_GAP } : undefined}
        {...underHeader}
        ListHeaderComponent={listHeader}
        data={items}
        keyExtractor={(order) => order.id}
        contentContainerClassName={`${listGap(columns)} pb-28 md:pb-12 ${PAGE_CONTENT}`}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // The keyboard goes away when the list is dragged: what was found is then in sight.
        keyboardDismissMode="on-drag"
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
        renderItem={({ item, index }) => (
          <GridItem columns={columns} index={index} count={items.length}>
            <OrderCard order={item} fill={columns > 1} onGive={give} onStatus={status.change} />
          </GridItem>
        )}
        ListEmptyComponent={
          orders.isLoading ? (
            <ListSkeleton />
          ) : orders.isError ? (
            <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
          ) : !query && filter.queue !== 'all' ? (
            <EmptyState
              icon={ClipboardList}
              title={t(filter.queue === 'mine' ? 'queue_empty_mine_title' : 'queue_empty_none_title')}
              message={t(filter.queue === 'mine' ? 'queue_empty_mine_message' : 'queue_empty_none_message')}
            />
          ) : !query ? (
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
      {giveSheet}
      {status.sheet}
    </Screen>
  );
}

export default function Orders() {
  // A desktop has the orders as a table (docs/desktop-layout.md); a tablet and the phone, as cards.
  const desktop = useIsDesktop();
  return desktop ? <OrdersTablePage /> : <OrdersList />;
}
