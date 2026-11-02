import { useRouter } from 'expo-router';
import { Search, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';

import { StackNavBar } from '@/components/app-tab-bar';
import ClientFormSheet from '@/components/client-form-sheet';
import PlusIcon from '@/components/icons/plus-icon';
import Avatar from '@/components/ui/avatar';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { DetailHeader, Screen, useDetailContentTop } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
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
  const contentTop = useDetailContentTop();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <Screen
      flush
      dock={
        <Shortcut
          icon={PlusIcon}
          label={t('add_client')}
          color={colors.clients}
          contentColor="#000000"
          className="px-5 py-5 w-full"
          onPress={() => setAdding(true)}
        />
      }
      footer={<StackNavBar />}>
      <DetailHeader floating title={t('tab_clients')} />
      <FlatList
        // The search goes with the list when it is scrolled; the title stays at the top, and the list goes up behind it.
        contentContainerStyle={{ paddingTop: contentTop }}
        ListHeaderComponent={
          <View className="min-h-12 flex-row items-center gap-2 rounded-lg border border-line bg-white px-3.5">
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
              textAlignVertical="center"
              className="min-w-0 flex-1 py-3 ios:pb-3.5 ios:pt-2.5 font-normal text-base text-ink outline-none"
            />
          </View>
        }
        data={clients.data ?? []}
        keyExtractor={(client) => client.id}
        contentContainerClassName="gap-3 px-page pb-page"
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
