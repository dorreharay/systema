import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
  RefreshControl,
  TextInput,
  View,
} from 'react-native';

import { ClipboardList, Plus, Search, X } from '@/components/icons';
import OrderCard from '@/components/order-card';
import { colors } from '@/components/ui/colors';
import { FIELD_INPUT_TEXT } from '@/components/ui/field-text';
import IconButton from '@/components/ui/icon-button';
import { Screen, ScreenHeader, TAB_HEADER_DROP, useDetailContentTop } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, NoResults } from '@/components/ui/states';
import { useI18n } from '@/lib/i18n';
import { useOrders } from '@/lib/queries';
import { usePullRefresh } from '@/lib/use-pull-refresh';

const SEARCH_DEBOUNCE_MS = 250;
// The search field comes and goes at the head of the list: the cards slide to make room for it, not jump.
const SEARCH_SLIDE_MS = 200;
const slideList = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(SEARCH_SLIDE_MS, 'easeInEaseOut', 'opacity'));

export default function Orders() {
  const { t } = useI18n();
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const orders = useOrders({ q: query });
  const items = orders.data?.pages.flatMap((page) => page.items) ?? [];
  const contentTop = useDetailContentTop(TAB_HEADER_DROP);

  const pull = usePullRefresh(orders.refetch);

  const openSearch = () => {
    slideList();
    setSearching(true);
  };

  const closeSearch = () => {
    slideList();
    setSearching(false);
    setText('');
    setQuery('');
  };

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

  const listHeader = (
    <View className="pb-3">
      {searching ? (
        <View>
          <View className="min-h-12 flex-row items-center gap-2 rounded-lg border border-line bg-white mt-6 px-3.5">
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
              className={`min-w-0 flex-1 font-normal text-ink outline-none ${FIELD_INPUT_TEXT}`}
            />
          </View>
        </View>
      ) : null}
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
        drop={TAB_HEADER_DROP}
        title={t('tab_orders')}
        right={
          <IconButton
            icon={searching ? X : Search}
            label={searching ? t('close_search') : t('search')}
            onPress={searching ? closeSearch : openSearch}
          />
        }
      />

      <FlatList bounces={false} overScrollMode="never"
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
        renderItem={({ item }) => <OrderCard order={item} />}
        ListEmptyComponent={
          orders.isLoading ? (
            <ListSkeleton />
          ) : orders.isError ? (
            <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
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
    </Screen>
  );
}
