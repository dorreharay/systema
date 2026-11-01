import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import AppButton from '@/components/ui/app-button';
import { useConfirm } from '@/components/ui/confirm';
import { FormError, Input, NumberInput, type InputRef } from '@/components/ui/input';
import Sheet from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { currencySymbol, formatNumber, parseDecimal } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useCreateString, useDeleteString, useUpdateString } from '@/lib/queries';
import { STRING_TYPES, type CatalogString, type StringType } from '@/lib/types';

type StringFormSheetProps = {
  visible: boolean;
  onClose: () => void;
  string?: CatalogString;
  initialModel?: string;
  onSaved?: (string: CatalogString) => void;
};

function StringForm({ string, initialModel, onClose, onSaved }: Omit<StringFormSheetProps, 'visible'>) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const create = useCreateString();
  const update = useUpdateString();
  const remove = useDeleteString();
  const [brand, setBrand] = useState(string?.brand ?? '');
  const [model, setModel] = useState(string?.model ?? initialModel ?? '');
  const [gauge, setGauge] = useState(string?.gauge ?? '');
  const [type, setType] = useState<StringType>(string?.type ?? 'polyester');
  const [price, setPrice] = useState(string?.default_price == null ? '' : formatNumber(string.default_price, 2));
  const [errors, setErrors] = useState<{ brand?: string; model?: string; price?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const modelRef = useRef<InputRef>(null);
  const gaugeRef = useRef<InputRef>(null);

  const save = async () => {
    if (saving) return;
    const amount = parseDecimal(price);
    const next = {
      brand: brand.trim() ? undefined : t('error_brand_required'),
      model: model.trim() ? undefined : t('error_model_required'),
      price: price.trim() && (amount === null || amount < 0) ? t('error_number') : undefined,
    };
    setErrors(next);
    setFormError(undefined);
    if (next.brand || next.model || next.price) return;

    setSaving(true);
    try {
      const input = { brand, model, gauge: gauge || null, type, default_price: amount };
      const saved = string
        ? await update.mutateAsync({ id: string.id, ...input })
        : await create.mutateAsync(input);
      toast.success(string ? t('string_saved') : t('string_added'));
      onClose();
      onSaved?.(saved);
    } catch (error) {
      setFormError(describeError(error, t));
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!string) return;
    const ok = await confirm({
      title: t('string_delete_title'),
      message: t('string_delete_message'),
      confirmLabel: t('delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(string.id);
      toast.success(t('string_deleted'));
      onClose();
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  return (
    <>
      <View className="gap-3 pt-2">
        <Input
          label={t('field_brand')}
          value={brand}
          onChangeText={(value) => {
            setBrand(value);
            setErrors((current) => ({ ...current, brand: undefined }));
          }}
          error={errors.brand}
          placeholder="Luxilon"
          autoFocus
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => modelRef.current?.focus()}
        />
        <Input
          ref={modelRef}
          label={t('field_model')}
          value={model}
          onChangeText={(value) => {
            setModel(value);
            setErrors((current) => ({ ...current, model: undefined }));
          }}
          error={errors.model}
          placeholder="ALU Power"
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => gaugeRef.current?.focus()}
        />
        <View className="gap-1.5">
          <Text className="text-[13px] font-medium text-muted">{t('field_string_type')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {STRING_TYPES.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: type === option }}
                onPress={() => setType(option)}
                className={`min-h-10 justify-center rounded-full border px-4 ${
                  type === option ? 'border-primary bg-primary' : 'border-line bg-white active:bg-surface'
                }`}>
                <Text className={`text-[15px] font-medium ${type === option ? 'text-white' : 'text-ink'}`}>
                  {t(`string_type_${option}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View className="flex-row gap-3">
          <Input
            ref={gaugeRef}
            className="flex-1"
            label={`${t('field_gauge')} · ${t('optional')}`}
            value={gauge}
            onChangeText={setGauge}
            placeholder="1.25 mm"
            returnKeyType="next"
          />
          <NumberInput
            className="flex-1"
            label={`${t('field_default_price')} · ${t('optional')}`}
            value={price}
            onChangeText={(value) => {
              setPrice(value);
              setErrors((current) => ({ ...current, price: undefined }));
            }}
            error={errors.price}
            prefix={
              <Text className="text-base text-muted">
                {currencySymbol(user?.currency ?? 'USD', language)}
              </Text>
            }
            returnKeyType="done"
            onSubmitEditing={save}
          />
        </View>
        {formError ? <FormError message={formError} /> : null}
      </View>
      <View className="gap-2 pt-4">
        <AppButton large title={string ? t('save') : t('add_string')} onPress={save} loading={saving} />
        {string ? (
          <AppButton title={t('delete')} variant="dangerOutline" onPress={confirmRemove} loading={remove.isPending} />
        ) : null}
      </View>
    </>
  );
}

// Add, edit or remove a string in the stringer's own catalog.
export default function StringFormSheet({ visible, onClose, ...rest }: StringFormSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={rest.string ? t('edit_string') : t('add_string')}>
      <StringForm onClose={onClose} {...rest} />
    </Sheet>
  );
}
