import { Plus, Tags } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';

import ServiceFormSheet from '@/components/service-form-sheet';
import { Badge } from '@/components/ui/badge';
import Card from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import PillButton from '@/components/ui/pill-button';
import Section from '@/components/ui/section';
import { DetailHeader, Screen } from '@/components/ui/screen';
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
    <Card key={service.id} onPress={() => setEditing(service)} className="flex-row items-center gap-3">
      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold" numberOfLines={1}>
          {service.name}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-[15px] text-muted">
            {service.price === null
              ? t('service_no_price')
              : formatMoney(service.price, user?.currency ?? 'USD', language)}
          </Text>
          {service.kind === 'labor' ? <Badge label={t('service_labor')} tone="success" /> : null}
        </View>
      </View>
      <Switch
        accessibilityLabel={t('service_active_toggle', { name: service.name })}
        value={service.active}
        onValueChange={(active) => void setActive(service, active)}
        trackColor={{ false: '#d0d5dd', true: colors.primary }}
        thumbColor="#ffffff"
      />
    </Card>
  );

  const active = services.data?.filter((service) => service.active) ?? [];
  const archived = services.data?.filter((service) => !service.active) ?? [];

  return (
    <Screen>
      <DetailHeader
        title={t('settings_services')}
        right={<PillButton icon={Plus} label={t('add')} onPress={() => setEditing('new')} />}
      />
      <ScrollView contentContainerClassName="gap-page p-page pb-10" showsVerticalScrollIndicator={false}>
        <Text className="text-[15px] text-muted">{t('services_hint')}</Text>
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
      </ScrollView>
      <ServiceFormSheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        service={editing && editing !== 'new' ? editing : undefined}
      />
    </Screen>
  );
}
