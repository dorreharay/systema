import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tags } from '@/components/icons';
import PlusIcon from '@/components/icons/plus-icon';
import ServiceFormSheet from '@/components/service-form-sheet';
import AppSwitch from '@/components/ui/app-switch';
import { Badge } from '@/components/ui/badge';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { CARD_GAP } from '@/components/ui/page';
import Section from '@/components/ui/section';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import SearchField from '@/components/ui/search-field';
import Shortcut from '@/components/ui/shortcut';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, NoResults } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useServices, useUpdateService } from '@/lib/queries';
import type { Service } from '@/lib/types';
import { useSearch } from '@/lib/use-search';
import { useWorkshop } from '@/lib/use-workshop';

export default function ServicesAndPricing() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const search = useSearch();
  const { query } = search;
  const services = useServices(query);
  const update = useUpdateService();
  // The price list is the owner's: for anyone else it is read (a receptionist and a master see the prices they quote).
  const { canEditCatalog } = useWorkshop();
  const [editing, setEditing] = useState<Service | 'new' | null>(null);

  const setActive = async (service: Service, active: boolean) => {
    try {
      await update.mutateAsync({ id: service.id, active });
      toast.success(active ? t('service_restored') : t('service_archived'));
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  const row = (service: Service) => (
    <Card
      key={service.id}
      nested
      onPress={canEditCatalog ? () => setEditing(service) : undefined}
      accessibilityLabel={service.name}
      className="flex-row items-center gap-3">
      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold" numberOfLines={1}>
          {service.name}
        </Text>
        {/* (The badge of the main service says in words that every order gets it: on a narrow screen, or beside a long price, it goes under the price.) */}
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Text className="text-[16.5px] text-muted">
            {service.price === null
              ? t('service_no_price')
              : formatMoney(service.price, user?.currency ?? 'USD', language)}
          </Text>
          {service.kind === 'labor' ? <Badge label={t('service_labor')} tone="success" /> : null}
        </View>
      </View>
      {/* (On a wide web screen this is the iOS switch drawn by app-switch.web.tsx.) */}
      <AppSwitch
        accessibilityLabel={t('service_active_toggle', { name: service.name })}
        value={service.active}
        disabled={!canEditCatalog}
        onValueChange={(active) => void setActive(service, active)}
      />
    </Card>
  );

  const active = services.data?.filter((service) => service.active) ?? [];
  const archived = services.data?.filter((service) => !service.active) ?? [];
  // There is something to search in, or something is being searched for (the field stays when the words match nothing).
  const searchShown = !!services.data && (services.data.length > 0 || search.text !== '');

  return (
    <Screen
      flush
      dock={
        canEditCatalog ? (
          <Shortcut
            icon={PlusIcon}
            label={t('add_service')}
            color={colors.catalog}
            contentColor={colors.ink}
            className="w-full px-5 py-5"
            onPress={() => setEditing('new')}
          />
        ) : undefined
      }
      footer={canEditCatalog ? <View style={{ height: Math.max(insets.bottom, 12) + 24 }} /> : undefined}>
      <DetailHeader floating title={t('settings_services')} />
      <DetailScroll
        contentContainerClassName="gap-page p-page pb-28 md:pb-12"
        showsVerticalScrollIndicator={false}
        // A tap on the clear button of the field, or on a service, does not stop at the keyboard.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <Text className="text-[16.5px] text-muted">{t('services_hint')}</Text>
        {searchShown ? (
          // The group under the field comes at half the usual gap of the page (16 px).
          <SearchField
            className="-mb-2"
            value={search.text}
            onChangeText={search.setText}
            placeholder={t('services_search_placeholder')}
          />
        ) : null}
        {services.isLoading ? (
          <ListSkeleton variant="row" />
        ) : services.isError ? (
          <ErrorState error={services.error} onRetry={() => services.refetch()} />
        ) : services.data && services.data.length === 0 ? (
          query ? (
            <NoResults query={query} />
          ) : (
            <EmptyState
              icon={Tags}
              title={t('services_empty_title')}
              message={t('services_empty_message')}
              actionLabel={t('add_service')}
              onAction={() => setEditing('new')}
            />
          )
        ) : (
          <>
            {/* While something is searched for, a group with nothing found in it is not shown. */}
            {active.length > 0 || !query ? (
              <Section title={t('services_active')}>
                <View className={CARD_GAP}>{active.map(row)}</View>
              </Section>
            ) : null}
            {archived.length > 0 ? (
              <Section title={t('services_archived')}>
                <View className={CARD_GAP}>{archived.map(row)}</View>
              </Section>
            ) : null}
          </>
        )}
      </DetailScroll>
      <ServiceFormSheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        service={editing && editing !== 'new' ? editing : undefined}
      />
    </Screen>
  );
}
