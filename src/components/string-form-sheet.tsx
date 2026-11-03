import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Check, Trash2 } from '@/components/icons';
import PlusIcon from '@/components/icons/plus-icon';
import { SUGGESTIONS_SHOWN, SUGGEST_DELAY_MS, Suggestions } from '@/components/reference-suggestions';
import { StockFields, readStock } from '@/components/stock';
import { colors } from '@/components/ui/colors';
import { useConfirm } from '@/components/ui/confirm';
import { FormError, Input, NumberInput, type InputRef } from '@/components/ui/input';
import Sheet from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { currencySymbol, formatNumber, parseDecimal } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import {
  useCreateString,
  useDeleteString,
  useReferenceStrings,
  useStrings,
  useUpdateString,
} from '@/lib/queries';
import { withoutOwnedStrings } from '@/lib/reference';
import { STRING_TYPES, type CatalogString, type StringType } from '@/lib/types';
import { useDebounced } from '@/lib/use-debounced';

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
  // A new string is counted, with one set in stock: what was just bought, or is about to be used.
  const [track, setTrack] = useState(string?.track_stock ?? true);
  const [stock, setStock] = useState(string ? formatNumber(string.stock, 1) : '1');
  const [errors, setErrors] = useState<{ brand?: string; model?: string; price?: string; stock?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const modelRef = useRef<InputRef>(null);
  const gaugeRef = useRef<InputRef>(null);

  // A new string is looked up in the reference list as it is typed, once there is something of its model. What
  // was just picked is not offered again until the text is changed, and what the catalog already has is left out:
  // a string that it has in some sizes is still offered, with the sizes it lacks, which are shown under the gauge.
  const [picked, setPicked] = useState(false);
  const [gaugeOptions, setGaugeOptions] = useState<string[]>([]);
  const inCatalog = useStrings('', { enabled: !string });
  const typed = [brand, model]
    .map((text) => text.trim())
    .filter(Boolean)
    .join(' ');
  const searching = !string && !picked && model.trim() !== '' && typed.length >= 2 && inCatalog.data !== undefined;
  const found = useReferenceStrings(useDebounced(typed, SUGGEST_DELAY_MS), searching);
  const suggestions = searching
    ? withoutOwnedStrings(found.data ?? [], inCatalog.data ?? [])
        // A name that is typed in full is not offered again, unless it has sizes to choose from.
        .filter((item) => item.gauges.length > 0 || item.brand !== brand.trim() || item.model !== model.trim())
        .slice(0, SUGGESTIONS_SHOWN)
    : [];

  const pick = (id: string) => {
    const item = suggestions.find((candidate) => candidate.id === id);
    if (!item) return;
    setBrand(item.brand);
    setModel(item.model);
    setType(item.type);
    setGaugeOptions(item.gauges);
    // A string that comes in one size has nothing to choose.
    if (item.gauges.length === 1 && !gauge.trim()) setGauge(`${item.gauges[0]} mm`);
    setPicked(true);
    setErrors((current) => ({ ...current, brand: undefined, model: undefined }));
  };

  const save = async () => {
    if (saving) return;
    const amount = parseDecimal(price);
    const counted = track ? readStock('string', stock) : null;
    const next = {
      brand: brand.trim() ? undefined : t('error_brand_required'),
      model: model.trim() ? undefined : t('error_model_required'),
      price: price.trim() && (amount === null || amount < 0) ? t('error_number') : undefined,
      stock: counted && 'error' in counted ? t(counted.error) : undefined,
    };
    setErrors(next);
    setFormError(undefined);
    if (next.brand || next.model || next.price || next.stock) return;

    setSaving(true);
    try {
      const input = {
        brand,
        model,
        gauge: gauge || null,
        type,
        default_price: amount,
        track_stock: track,
        ...(counted && 'value' in counted ? { stock: counted.value } : {}),
      };
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
            setPicked(false);
            setGaugeOptions([]);
            setErrors((current) => ({ ...current, brand: undefined }));
          }}
          error={errors.brand}
          placeholder="Luxilon"
          autoFocus={!string}
          autoCapitalize="words"
          // A brand or a model is not a word of any dictionary: it is not to be corrected into one, or underlined.
          autoCorrect={false}
          spellCheck={false}
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
            setPicked(false);
            setGaugeOptions([]);
            setErrors((current) => ({ ...current, model: undefined }));
          }}
          error={errors.model}
          placeholder="ALU Power"
          autoCapitalize="words"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => gaugeRef.current?.focus()}
        />
        <Suggestions
          items={suggestions.map((item) => ({
            key: item.id,
            title: `${item.brand} ${item.model}`,
            detail: t(`string_type_${item.type}`),
          }))}
          onPick={pick}
        />
        <View className="gap-1.5">
          <Text className="text-[14.3px] font-medium text-muted">{t('field_string_type')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {STRING_TYPES.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: type === option }}
                onPress={() => setType(option)}
                className={`min-h-10 justify-center rounded-lg border px-4 ${
                  type === option ? 'border-primary bg-primary active:bg-primary' : 'border-line bg-white active:bg-surface'
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
        {gaugeOptions.length > 0 ? (
          <View className="gap-1.5">
            <Text className="text-[14.3px] font-medium text-muted">{t('reference_gauges')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {gaugeOptions.map((option) => {
                const value = `${option} mm`;
                const selected = gauge.trim() === value;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setGauge(value)}
                    className={`min-h-10 justify-center rounded-lg border px-4 ${
                      selected ? 'border-primary bg-primary active:bg-primary' : 'border-line bg-white active:bg-surface'
                    }`}>
                    <Text className={`text-[15px] font-medium ${selected ? 'text-white' : 'text-ink'}`}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <StockFields
          kind="string"
          track={track}
          onTrack={setTrack}
          stock={stock}
          onStock={(value) => {
            setStock(value);
            setErrors((current) => ({ ...current, stock: undefined }));
          }}
          error={errors.stock}
        />
        {formError ? <FormError message={formError} /> : null}
      </View>
      <View className="gap-2 pt-4">
        <Shortcut
          compact
          icon={string ? Check : PlusIcon}
          label={string ? t('save') : t('add_string')}
          color={colors.primary} contentColor={colors.white}
          onPress={save}
          loading={saving}
        />
        {string ? (
          <Shortcut
            compact
            icon={Trash2}
            label={t('delete')}
            color={colors.dangerSoft}
            contentColor={colors.dangerInk}
            onPress={confirmRemove}
            loading={remove.isPending}
          />
        ) : null}
      </View>
    </>
  );
}

// Add, edit or remove a string in the stringer's own catalog.
export default function StringFormSheet({ visible, onClose, ...rest }: StringFormSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} form title={rest.string ? t('edit_string') : t('add_string')}>
      <StringForm onClose={onClose} {...rest} />
    </Sheet>
  );
}
