import { router } from 'expo-router';
import { createContext, memo, use, useMemo, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { StackNavBar } from '@/components/app-tab-bar';
import { Library, Tags } from '@/components/icons';
import PlusIcon from '@/components/icons/plus-icon';
import RacketFormSheet from '@/components/racket-form-sheet';
import { StockBadge, StockLastUsed, StockSheet, sortByStock } from '@/components/stock';
import StringFormSheet from '@/components/string-form-sheet';
import { Badge } from '@/components/ui/badge';
import Card from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import { GridItem, listGap, PAGE_CONTENT } from '@/components/ui/page';
import { DetailHeader, Screen, useDetailContentTop } from '@/components/ui/screen';
import SearchField from '@/components/ui/search-field';
import Shortcut from '@/components/ui/shortcut';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, NoResults } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { formatMoney, racketName } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { GRID_GAP, useGridColumns, useIsWide } from '@/lib/layout';
import { stringLabel } from '@/lib/order-draft';
import { useRackets, useStrings } from '@/lib/queries';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useSearch } from '@/lib/use-search';
import { useWorkshop } from '@/lib/use-workshop';
import type { CatalogString, Racket } from '@/lib/types';

type Tab = 'rackets' | 'strings';
// An item whose stock is being set, from its badge.
type Stocking = { kind: 'racket'; item: Racket } | { kind: 'string'; item: CatalogString };

// What the page asks of its sheets: they are opened from the dock, from the empty states and from the rows.
type Sheets = {
  addRacket: () => void;
  addString: () => void;
  editString: (string: CatalogString) => void;
  stock: (target: Stocking) => void;
};

const SheetsContext = createContext<Sheets | null>(null);

function useSheets() {
  const sheets = use(SheetsContext);
  if (!sheets) throw new Error('useSheets is used outside of the catalog');
  return sheets;
}

// The sheets keep their state here, beside the page and not in it: a catalog of a hundred items is a long list, and
// drawing it again each time a sheet opened or closed was a pause long enough to look like the app had hung.
function CatalogSheets({ children }: { children: ReactNode }) {
  const [addingRacket, setAddingRacket] = useState(false);
  // What a sheet was opened for stays when it is closed, so that it does not turn into another one while it slides away.
  const [stringOpen, setStringOpen] = useState(false);
  const [editedString, setEditedString] = useState<CatalogString>();
  const [stockOpen, setStockOpen] = useState(false);
  const [stocking, setStocking] = useState<Stocking>();

  const sheets = useMemo<Sheets>(
    () => ({
      addRacket: () => setAddingRacket(true),
      addString: () => {
        setEditedString(undefined);
        setStringOpen(true);
      },
      editString: (string) => {
        setEditedString(string);
        setStringOpen(true);
      },
      stock: (target) => {
        setStocking(target);
        setStockOpen(true);
      },
    }),
    []
  );

  return (
    <SheetsContext value={sheets}>
      {children}
      {/* A racket made here belongs to no client: it is one the stringer keeps in stock. */}
      <RacketFormSheet visible={addingRacket} onClose={() => setAddingRacket(false)} catalog />
      <StockSheet
        visible={stockOpen}
        onClose={() => setStockOpen(false)}
        kind={stocking?.kind ?? 'string'}
        item={stocking?.item ?? null}
      />
      <StringFormSheet visible={stringOpen} onClose={() => setStringOpen(false)} string={editedString} />
    </SheetsContext>
  );
}

// A row changes only with its item, so a letter typed in the search does not draw the whole list again.
const RacketCard = memo(function RacketCard({ racket, fill }: { racket: Racket; fill?: boolean }) {
  const { t } = useI18n();
  const sheets = useSheets();

  return (
    <Card
      nested
      onPress={() => router.push({ pathname: '/rackets/[id]', params: { id: racket.id } })}
      accessibilityLabel={racketName(racket)}
      className={`gap-1.5 ${fill ? 'flex-1' : ''}`}>
      <Text className="text-base font-semibold" numberOfLines={1}>
        {racketName(racket)}
      </Text>
      {racket.notes ? (
        <Text className="text-[15.4px] text-muted" numberOfLines={1}>
          {racket.notes}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-2">
        <StockBadge kind="racket" item={racket} onPress={() => sheets.stock({ kind: 'racket', item: racket })} />
        <Text className="text-[14.3px] text-muted">{t('orders_count', { count: racket.orders_count })}</Text>
      </View>
      {/* (In a workshop with a team: who took it from the stock last.) */}
      <StockLastUsed item={racket} />
    </Card>
  );
});

const StringCard = memo(function StringCard({ string, fill }: { string: CatalogString; fill?: boolean }) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const sheets = useSheets();
  // The catalog is the owner's: for anyone else a string is read, not opened for editing.
  const { canEditCatalog } = useWorkshop();

  return (
    <Card
      nested
      onPress={canEditCatalog ? () => sheets.editString(string) : undefined}
      accessibilityLabel={stringLabel(string)}
      className={`gap-1.5 ${fill ? 'flex-1' : ''}`}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-base font-semibold" numberOfLines={1}>
          {stringLabel(string)}
        </Text>
        <Text className="text-base font-semibold">
          {formatMoney(string.default_price, user?.currency ?? 'USD', language)}
        </Text>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge label={t(`string_type_${string.type}`)} />
        <StockBadge kind="string" item={string} onPress={() => sheets.stock({ kind: 'string', item: string })} />
      </View>
      <StockLastUsed item={string} />
    </Card>
  );
});

export default function Catalog() {
  return (
    <CatalogSheets>
      <CatalogPage />
    </CatalogSheets>
  );
}

function CatalogPage() {
  const { t } = useI18n();
  const sheets = useSheets();
  // Adding to the catalog is the owner's; everyone else reads the catalog and its counts.
  const { canEditCatalog } = useWorkshop();
  const [tab, setTab] = useState<Tab>('rackets');
  // Each tab is searched on its own: the words are cleared when the tab is changed.
  const search = useSearch();
  const { query } = search;
  // The catalog's rackets are the ones kept in stock; a client's are on the page of the client.
  const rackets = useRackets({ q: tab === 'rackets' ? query : '', kind: 'catalog' });
  const strings = useStrings(tab === 'strings' ? query : '');
  const racketsPull = usePullRefresh(rackets.refetch);
  const stringsPull = usePullRefresh(strings.refetch);
  // What is in stock is at the top of a list, and what has run out is at the bottom.
  const racketList = useMemo(() => sortByStock(rackets.data ?? []), [rackets.data]);
  const stringList = useMemo(() => sortByStock(strings.data ?? []), [strings.data]);

  const changeTab = (next: Tab) => {
    setTab(next);
    search.clear();
  };

  const racketsTab = tab === 'rackets';
  const contentTop = useDetailContentTop();
  const wide = useIsWide();
  const columns = useGridColumns(340);

  // The tabs and the search go with the list when it is scrolled; the title stays at the top, and the list goes
  // up behind it.
  const tabs = (
    <Segmented
      options={[
        { value: 'rackets' as const, label: t('catalog_rackets') },
        { value: 'strings' as const, label: t('catalog_strings') },
      ]}
      value={tab}
      onChange={changeTab}
    />
  );
  // On a wide page the two tabs and the search are in one row, the tabs as wide as they need to be.
  const listHeader = (
    <View className={wide ? 'flex-row items-center gap-3' : 'gap-2'}>
      {wide ? <View className="w-[300px]">{tabs}</View> : tabs}
      <SearchField
        value={search.text}
        onChangeText={search.setText}
        placeholder={racketsTab ? t('rackets_search_placeholder') : t('strings_search_placeholder')}
        className={wide ? 'flex-1' : ''}
      />
    </View>
  );

  return (
    <Screen
      flush
      width="wide"
      dock={
        canEditCatalog ? (
          <Shortcut
            icon={PlusIcon}
            label={racketsTab ? t('add_racket') : t('add_string')}
            color={colors.catalog}
            contentColor="#000000"
            className="px-5 py-5 w-full"
            onPress={racketsTab ? sheets.addRacket : sheets.addString}
          />
        ) : undefined
      }
      footer={<StackNavBar />}>
      <DetailHeader floating topLevel title={t('tab_catalog')} />
      {racketsTab ? (
        <FlatList bounces={false} overScrollMode="never"
          key={`rackets-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: GRID_GAP } : undefined}
          contentContainerStyle={{ paddingTop: contentTop }}
          ListHeaderComponent={listHeader}
          data={racketList}
          keyExtractor={(racket) => racket.id}
          // The rows are drawn a screenful or two at a time, not all of the catalog at once.
          windowSize={7}
          contentContainerClassName={`${listGap(columns)} pb-28 md:pb-12 ${PAGE_CONTENT}`}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              {...racketsPull}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item, index }) => (
            <GridItem columns={columns} index={index} count={racketList.length}>
              <RacketCard racket={item} fill={columns > 1} />
            </GridItem>
          )}
          ListEmptyComponent={
            rackets.isLoading ? (
              <ListSkeleton variant="row" />
            ) : rackets.isError ? (
              <ErrorState error={rackets.error} onRetry={() => rackets.refetch()} />
            ) : query ? (
              <NoResults query={query} />
            ) : (
              <EmptyState
                icon={Library}
                title={t('rackets_empty_title')}
                message={canEditCatalog ? t('rackets_empty_message') : t('stock_empty_member')}
                actionLabel={canEditCatalog ? t('add_racket') : undefined}
                onAction={canEditCatalog ? sheets.addRacket : undefined}
              />
            )
          }
        />
      ) : (
        <FlatList bounces={false} overScrollMode="never"
          key={`strings-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: GRID_GAP } : undefined}
          contentContainerStyle={{ paddingTop: contentTop }}
          ListHeaderComponent={listHeader}
          data={stringList}
          keyExtractor={(string) => string.id}
          windowSize={7}
          contentContainerClassName={`${listGap(columns)} pb-28 md:pb-12 ${PAGE_CONTENT}`}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              {...stringsPull}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item, index }) => (
            <GridItem columns={columns} index={index} count={stringList.length}>
              <StringCard string={item} fill={columns > 1} />
            </GridItem>
          )}
          ListEmptyComponent={
            strings.isLoading ? (
              <ListSkeleton variant="row" />
            ) : strings.isError ? (
              <ErrorState error={strings.error} onRetry={() => strings.refetch()} />
            ) : query ? (
              <NoResults query={query} />
            ) : (
              <EmptyState
                icon={Tags}
                title={t('strings_empty_title')}
                message={canEditCatalog ? t('strings_empty_message') : t('stock_empty_member')}
                actionLabel={canEditCatalog ? t('add_string') : undefined}
                onAction={canEditCatalog ? sheets.addString : undefined}
              />
            )
          }
        />
      )}
    </Screen>
  );
}
