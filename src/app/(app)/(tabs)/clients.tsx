import { useRouter } from 'expo-router';
import { Plus, Search, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';

import ClientFormSheet from '@/components/client-form-sheet';
import Avatar from '@/components/ui/avatar';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import PillButton from '@/components/ui/pill-button';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, NoResults } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { formatDate, todayIso } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useClients } from '@/lib/queries';

const SEARCH_DEBOUNCE_MS = 250;

export default function Clients() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const clients = useClients(query);
  const today = todayIso(user?.timezone);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <Screen>
      <ScreenHeader
        title={t('tab_clients')}
        right={<PillButton icon={Plus} label={t('add_client')} onPress={() => setAdding(true)} />}
      />
      <View className="px-page pb-3">
        <View className="min-h-12 flex-row items-center gap-2 rounded-xl border border-line bg-white px-3.5">
          <Search size={18} color={colors.muted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('clients_search_placeholder')}
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

      <FlatList
        data={clients.data ?? []}
        keyExtractor={(client) => client.id}
        contentContainerClassName="gap-3 px-page pb-8"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={clients.isRefetching && !clients.isLoading}
            onRefresh={() => void clients.refetch()}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <Card
            onPress={() => router.push({ pathname: '/clients/[id]', params: { id: item.id } })}
            className="flex-row items-center gap-3"
            accessibilityLabel={item.name}>
            <Avatar name={item.name} />
            <View className="flex-1 gap-0.5">
              <Text className="text-base font-semibold" numberOfLines={1}>
                {item.name}
              </Text>
              {item.phone ? (
                <Text className="text-[14px] text-muted" numberOfLines={1}>
                  {item.phone}
                </Text>
              ) : null}
              <Text className="text-[13px] text-muted" numberOfLines={1}>
                {[
                  t('rackets_count', { count: item.rackets_count }),
                  item.last_order_date
                    ? t('client_last_order', { date: formatDate(item.last_order_date, language, today) })
                    : t('client_no_orders'),
                ].join(' · ')}
              </Text>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          clients.isLoading ? (
            <ListSkeleton variant="row" />
          ) : clients.isError ? (
            <ErrorState error={clients.error} onRetry={() => clients.refetch()} />
          ) : query ? (
            <NoResults query={query} />
          ) : (
            <EmptyState
              icon={Users}
              title={t('clients_empty_title')}
              message={t('clients_empty_message')}
              actionLabel={t('add_client')}
              onAction={() => setAdding(true)}
            />
          )
        }
      />

      <ClientFormSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onSaved={(client) => router.push({ pathname: '/clients/[id]', params: { id: client.id } })}
      />
    </Screen>
  );
}
