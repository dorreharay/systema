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
import Section from '@/components/ui/section';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import Shortcut from '@/components/ui/shortcut';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useServices, useUpdateService } from '@/lib/queries';
import type { Service } from '@/lib/types';

export default function ServicesAndPricing() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const services = useServices();
  const update = useUpdateService();
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
      onPress={() => setEditing(service)}
      accessibilityLabel={service.name}
      className="flex-row items-center gap-3">
      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold" numberOfLines={1}>
          {service.name}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-[16.5px] text-muted">
            {service.price === null
              ? t('service_no_price')
              : formatMoney(service.price, user?.currency ?? 'USD', language)}
          </Text>
          {service.kind === 'labor' ? <Badge label={t('service_labor')} tone="success" /> : null}
        </View>
      </View>
      <AppSwitch
        accessibilityLabel={t('service_active_toggle', { name: service.name })}
        value={service.active}
        onValueChange={(active) => void setActive(service, active)}
      />
    </Card>
  );

  const active = services.data?.filter((service) => service.active) ?? [];
  const archived = services.data?.filter((service) => !service.active) ?? [];

  return (
    <Screen
      flush
      dock={
        <Shortcut
          icon={PlusIcon}
          label={t('add_service')}
          color={colors.catalog}
          contentColor={colors.ink}
          className="w-full px-5 py-5"
          onPress={() => setEditing('new')}
        />
      }
      footer={<View style={{ height: Math.max(insets.bottom, 12) + 24 }} />}>
      <DetailHeader floating title={t('settings_services')} />
      <DetailScroll contentContainerClassName="gap-page p-page pb-28 md:pb-12" showsVerticalScrollIndicator={false}>
        <Text className="text-[16.5px] text-muted">{t('services_hint')}</Text>
        {services.isLoading ? (
          <ListSkeleton variant="row" />
        ) : services.isError ? (
          <ErrorState error={services.error} onRetry={() => services.refetch()} />
        ) : services.data && services.data.length === 0 ? (
          <EmptyState
            icon={Tags}
            title={t('services_empty_title')}
            message={t('services_empty_message')}
            actionLabel={t('add_service')}
            onAction={() => setEditing('new')}
          />
        ) : (
          <>
            <Section title={t('services_active')}>
              <View className="gap-3">{active.map(row)}</View>
            </Section>
            {archived.length > 0 ? (
              <Section title={t('services_archived')}>
                <View className="gap-3">{archived.map(row)}</View>
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
