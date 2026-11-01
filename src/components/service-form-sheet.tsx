import { useState } from 'react';
import { View } from 'react-native';

import AppButton from '@/components/ui/app-button';
import { FormError, Input, NumberInput } from '@/components/ui/input';
import Sheet from '@/components/ui/sheet';
import SwitchRow from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { currencySymbol, formatNumber, parseDecimal } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useCreateService, useUpdateService } from '@/lib/queries';
import type { Service } from '@/lib/types';

type ServiceFormSheetProps = {
  visible: boolean;
  onClose: () => void;
  service?: Service;
};

function ServiceForm({ service, onClose }: Omit<ServiceFormSheetProps, 'visible'>) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const toast = useToast();
  const create = useCreateService();
  const update = useUpdateService();
  const [name, setName] = useState(service?.name ?? '');
  const [price, setPrice] = useState(service?.price == null ? '' : formatNumber(service.price, 2));
  const [labor, setLabor] = useState(service?.kind === 'labor');
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    const amount = parseDecimal(price);
    const next = {
      name: name.trim() ? undefined : t('error_name_required'),
      price: price.trim() && (amount === null || amount < 0) ? t('error_number') : undefined,
    };
    setErrors(next);
    setFormError(undefined);
    if (next.name || next.price) return;

    setSaving(true);
    try {
      const input = { name, price: amount, kind: labor ? ('labor' as const) : ('extra' as const) };
      if (service) await update.mutateAsync({ id: service.id, ...input });
      else await create.mutateAsync(input);
      toast.success(service ? t('service_saved') : t('service_added'));
      onClose();
    } catch (error) {
      setFormError(describeError(error, t));
      setSaving(false);
    }
  };

  return (
    <>
      <View className="gap-3 pt-2">
        <Input
          label={t('field_service_name')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setErrors((current) => ({ ...current, name: undefined }));
          }}
          error={errors.name}
          autoFocus={!service}
          autoCapitalize="sentences"
          returnKeyType="next"
        />
        <NumberInput
          label={t('field_price')}
          value={price}
          onChangeText={(value) => {
            setPrice(value);
            setErrors((current) => ({ ...current, price: undefined }));
          }}
          error={errors.price}
          prefix={
            <Text className="text-base text-muted">{currencySymbol(user?.currency ?? 'USD', language)}</Text>
          }
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <SwitchRow
          label={t('service_is_labor')}
          description={t('service_is_labor_hint')}
          value={labor}
          onValueChange={setLabor}
        />
        {formError ? <FormError message={formError} /> : null}
      </View>
      <View className="pt-4">
        <AppButton large title={service ? t('save') : t('add_service')} onPress={save} loading={saving} />
      </View>
    </>
  );
}

// Add or edit something the stringer charges for.
export default function ServiceFormSheet({ visible, onClose, ...rest }: ServiceFormSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={rest.service ? t('edit_service') : t('add_service')}>
      <ServiceForm onClose={onClose} {...rest} />
    </Sheet>
  );
}
