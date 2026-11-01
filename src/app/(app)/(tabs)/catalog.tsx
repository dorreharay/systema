import { useRouter } from 'expo-router';
import { Library, Plus, Search, Tags } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';

import RacketFormSheet from '@/components/racket-form-sheet';
import StringFormSheet from '@/components/string-form-sheet';
import { Badge } from '@/components/ui/badge';
import Card from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import PillButton from '@/components/ui/pill-button';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, NoResults } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { formatMoney, racketName } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { stringLabel } from '@/lib/order-draft';
import { useRackets, useStrings } from '@/lib/queries';
import type { CatalogString } from '@/lib/types';

type Tab = 'rackets' | 'strings';
const SEARCH_DEBOUNCE_MS = 250;

export default function Catalog() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('rackets');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [addingRacket, setAddingRacket] = useState(false);
  const [editingString, setEditingString] = useState<CatalogString | 'new' | null>(null);
  const rackets = useRackets({ q: tab === 'rackets' ? query : '' });
  const strings = useStrings(tab === 'strings' ? query : '');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const changeTab = (next: Tab) => {
    setTab(next);
    setText('');
    setQuery('');
  };

  const racketsTab = tab === 'rackets';

  return (
    <Screen>
      <ScreenHeader
        title={t('tab_catalog')}
        right={
          <PillButton
            icon={Plus}
            label={racketsTab ? t('add_racket') : t('add_string')}
            onPress={() => (racketsTab ? setAddingRacket(true) : setEditingString('new'))}
          />
        }
      />
      <View className="gap-3 px-page pb-3">
        <Segmented
          options={[
            { value: 'rackets' as const, label: t('catalog_rackets') },
            { value: 'strings' as const, label: t('catalog_strings') },
          ]}
          value={tab}
          onChange={changeTab}
        />
        <View className="min-h-12 flex-row items-center gap-2 rounded-xl border border-line bg-white px-3.5">
          <Search size={18} color={colors.muted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={racketsTab ? t('rackets_search_placeholder') : t('strings_search_placeholder')}
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

      {racketsTab ? (
        <FlatList
          key="rackets"
          data={rackets.data ?? []}
          keyExtractor={(racket) => racket.id}
          contentContainerClassName="gap-3 px-page pb-8"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={rackets.isRefetching && !rackets.isLoading}
              onRefresh={() => void rackets.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Card
              onPress={() => router.push({ pathname: '/rackets/[id]', params: { id: item.id } })}
              className="gap-0.5">
              <Text className="text-base font-semibold" numberOfLines={1}>
                {racketName(item)}
              </Text>
              <Text className="text-[14px] text-muted" numberOfLines={1}>
                {item.client_name}
              </Text>
              <Text className="text-[13px] text-muted">{t('orders_count', { count: item.orders_count })}</Text>
            </Card>
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
                message={t('rackets_empty_message')}
                actionLabel={t('add_racket')}
                onAction={() => setAddingRacket(true)}
              />
            )
          }
        />
      ) : (
        <FlatList
          key="strings"
          data={strings.data ?? []}
          keyExtractor={(string) => string.id}
          contentContainerClassName="gap-3 px-page pb-8"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={strings.isRefetching && !strings.isLoading}
              onRefresh={() => void strings.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Card onPress={() => setEditingString(item)} className="gap-1.5">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-base font-semibold" numberOfLines={1}>
                  {stringLabel(item)}
                </Text>
                <Text className="text-base font-semibold">
                  {formatMoney(item.default_price, user?.currency ?? 'USD', language)}
                </Text>
              </View>
              <Badge label={t(`string_type_${item.type}`)} />
            </Card>
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
                message={t('strings_empty_message')}
                actionLabel={t('add_string')}
                onAction={() => setEditingString('new')}
              />
            )
          }
        />
      )}

      {/* A racket made here still needs its owner, chosen in the sheet. */}
      <RacketFormSheet
        visible={addingRacket}
        onClose={() => setAddingRacket(false)}
        onSaved={(racket) => router.push({ pathname: '/rackets/[id]', params: { id: racket.id } })}
      />
      <StringFormSheet
        visible={editingString !== null}
        onClose={() => setEditingString(null)}
        string={editingString && editingString !== 'new' ? editingString : undefined}
      />
    </Screen>
  );
}
