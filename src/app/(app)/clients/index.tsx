import { useRouter } from 'expo-router';
import { memo, useEffect, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';

import { StackNavBar } from '@/components/app-tab-bar';
import ClientFormSheet from '@/components/client-form-sheet';
import { Search } from '@/components/icons';
import PlusIcon from '@/components/icons/plus-icon';
import UserIcon from '@/components/icons/user-icon';
import RacketFormSheet from '@/components/racket-form-sheet';
import ReferenceRacketPicker from '@/components/reference-racket-picker';
import Avatar from '@/components/ui/avatar';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { SEARCH_INPUT_TEXT } from '@/components/ui/field-text';
import { GridItem, PAGE_CONTENT } from '@/components/ui/page';
import { PAPER_FIELD } from '@/components/ui/paper';
import { DetailHeader, Screen, useDetailContentTop } from '@/components/ui/screen';
import { afterSheetsClosed } from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, NoResults } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { formatDate, todayIso } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { GRID_GAP, useGridColumns } from '@/lib/layout';
import { useClients } from '@/lib/queries';
import type { Client } from '@/lib/types';
import { usePullRefresh } from '@/lib/use-pull-refresh';

const SEARCH_DEBOUNCE_MS = 250;

// A row changes only with its client, so a letter typed in the search does not draw the whole list again.
const ClientRow = memo(function ClientRow({ client, today, fill }: { client: Client; today: string; fill?: boolean }) {
  const { t, language } = useI18n();
  const router = useRouter();

  return (
    <Card
      onPress={() => router.push({ pathname: '/clients/[id]', params: { id: client.id } })}
      className={`flex-row items-center gap-3 ${fill ? 'flex-1' : ''}`}
      accessibilityLabel={client.name}>
      <Avatar name={client.name} />
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold" numberOfLines={1}>
          {client.name}
        </Text>
        {client.phone ? (
          <Text className="text-[15.4px] text-muted" numberOfLines={1}>
            {client.phone}
          </Text>
        ) : null}
        <Text className="text-[14.3px] text-muted" numberOfLines={1}>
          {[
            t('rackets_count', { count: client.rackets_count }),
            client.last_order_date
              ? t('client_last_order', { date: formatDate(client.last_order_date, language, today) })
              : t('client_no_orders'),
          ].join(' · ')}
        </Text>
      </View>
    </Card>
  );
});

export default function Clients() {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  // A client who was just made is offered a racket from the reference list at once (or one typed in); then their page opens.
  const [added, setAdded] = useState<Client | null>(null);
  const [step, setStep] = useState<'picking' | 'typing' | null>(null);
  const [typedRacket, setTypedRacket] = useState('');
  const clients = useClients(query);
  const pull = usePullRefresh(clients.refetch);
  const today = todayIso(user?.timezone);
  const contentTop = useDetailContentTop();
  const columns = useGridColumns(340);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // The racket was added, or it was not wanted: the page of the client is next.
  const finish = () => {
    setStep(null);
    if (added) afterSheetsClosed(() => router.push({ pathname: '/clients/[id]', params: { id: added.id } }));
  };

  return (
    <Screen
      flush
      width="wide"
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
      <DetailHeader floating topLevel title={t('tab_clients')} />
      <FlatList bounces={false} overScrollMode="never"
        key={`columns-${columns}`}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: GRID_GAP } : undefined}
        // The search goes with the list when it is scrolled; the title stays at the top, and the list goes up behind it.
        contentContainerStyle={{ paddingTop: contentTop }}
        ListHeaderComponent={
          <View className={`min-h-12 flex-row items-center gap-2 rounded-lg border border-line bg-white px-3.5 md:min-h-11 ${PAPER_FIELD}`}>
            <Search size={18} color={colors.muted} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('clients_search_placeholder')}
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.primary}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t('search')}
              textAlignVertical="center"
              className={`min-w-0 flex-1 font-normal text-ink outline-none ${SEARCH_INPUT_TEXT}`}
            />
          </View>
        }
        data={clients.data ?? []}
        keyExtractor={(client) => client.id}
        contentContainerClassName={`gap-3 pb-28 md:pb-12 ${PAGE_CONTENT}`}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            {...pull}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item, index }) => (
          <GridItem columns={columns} index={index} count={clients.data?.length ?? 0}>
            <ClientRow client={item} today={today} fill={columns > 1} />
          </GridItem>
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
              icon={UserIcon}
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
        search={text}
        onSaved={(client) => {
          setAdded(client);
          afterSheetsClosed(() => setStep('picking'));
        }}
      />
      <ReferenceRacketPicker
        visible={step === 'picking'}
        onClose={finish}
        owner={added ?? { id: '' }}
        onCreate={(name) => {
          setStep(null);
          setTypedRacket(name);
          afterSheetsClosed(() => setStep('typing'));
        }}
      />
      <RacketFormSheet
        visible={step === 'typing'}
        onClose={finish}
        owner={added ? { id: added.id, name: added.name } : undefined}
        initialModel={typedRacket}
      />
    </Screen>
  );
}
