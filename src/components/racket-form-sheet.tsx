import { useRef, useState } from 'react';
import { View } from 'react-native';

import AppButton from '@/components/ui/app-button';
import { FormError, Input, type InputRef } from '@/components/ui/input';
import PickerField from '@/components/ui/picker-field';
import SearchPicker from '@/components/ui/search-picker';
import Sheet from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { useClients, useCreateRacket, useUpdateRacket } from '@/lib/queries';
import type { Racket } from '@/lib/types';

type Owner = { id: string; name: string };

type RacketFormSheetProps = {
  visible: boolean;
  onClose: () => void;
  racket?: Pick<Racket, 'id' | 'brand' | 'model' | 'notes' | 'client_id' | 'client_name'>;
  // The owner is already known (the form was opened from their page or from an order).
  owner?: Owner;
  onSaved?: (racket: Racket) => void;
};

function RacketForm({ racket, owner: knownOwner, onClose, onSaved }: Omit<RacketFormSheetProps, 'visible'>) {
  const { t } = useI18n();
  const toast = useToast();
  const create = useCreateRacket();
  const update = useUpdateRacket();
  const [owner, setOwner] = useState<Owner | undefined>(
    knownOwner ?? (racket ? { id: racket.client_id, name: racket.client_name } : undefined)
  );
  const [brand, setBrand] = useState(racket?.brand ?? '');
  const [model, setModel] = useState(racket?.model ?? '');
  const [notes, setNotes] = useState(racket?.notes ?? '');
  const [errors, setErrors] = useState<{ owner?: string; brand?: string; model?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const clients = useClients(query);
  const modelRef = useRef<InputRef>(null);
  const notesRef = useRef<InputRef>(null);

  const save = async () => {
    if (saving) return;
    const next = {
      owner: owner ? undefined : t('error_owner_required'),
      brand: brand.trim() ? undefined : t('error_brand_required'),
      model: model.trim() ? undefined : t('error_model_required'),
    };
    setErrors(next);
    setFormError(undefined);
    if (next.owner || next.brand || next.model || !owner) return;

    setSaving(true);
    try {
      const input = { client_id: owner.id, brand, model, notes: notes || null };
      const saved = racket
        ? await update.mutateAsync({ id: racket.id, ...input })
        : await create.mutateAsync(input);
      toast.success(racket ? t('racket_saved') : t('racket_added'));
      onClose();
      onSaved?.(saved);
    } catch (error) {
      setFormError(describeError(error, t));
      setSaving(false);
    }
  };

  return (
    <>
      <View className="gap-3 pt-2">
        <PickerField
          label={t('field_owner')}
          value={owner?.name}
          placeholder={t('racket_owner_placeholder')}
          error={errors.owner}
          // A racket made from a client's page or an order belongs to them; elsewhere it is chosen.
          disabled={!!knownOwner && !racket}
          onPress={() => setChoosing(true)}
        />
        <Input
          label={t('field_brand')}
          value={brand}
          onChangeText={(value) => {
            setBrand(value);
            setErrors((current) => ({ ...current, brand: undefined }));
          }}
          error={errors.brand}
          placeholder="Wilson"
          autoFocus={!!owner}
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
          placeholder="Pro Staff 97"
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => notesRef.current?.focus()}
        />
        <Input
          ref={notesRef}
          label={`${t('field_notes')} · ${t('optional')}`}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        {formError ? <FormError message={formError} /> : null}
      </View>
      <View className="pt-4">
        <AppButton large title={racket ? t('save') : t('add_racket')} onPress={save} loading={saving} />
      </View>

      <SearchPicker
        visible={choosing}
        onClose={() => setChoosing(false)}
        title={t('field_owner')}
        placeholder={t('clients_search_placeholder')}
        items={clients.data ?? []}
        keyOf={(client) => client.id}
        selectedKey={owner?.id}
        loading={clients.isLoading}
        error={clients.isError ? clients.error : undefined}
        onRetry={() => clients.refetch()}
        onQueryChange={setQuery}
        emptyHint={t('clients_empty_hint')}
        renderItem={(client) => (
          <>
            <Text className="text-base font-medium">{client.name}</Text>
            {client.phone ? <Text className="text-[13px] text-muted">{client.phone}</Text> : null}
          </>
        )}
        onSelect={(client) => {
          setOwner({ id: client.id, name: client.name });
          setErrors((current) => ({ ...current, owner: undefined }));
          setChoosing(false);
        }}
      />
    </>
  );
}

// Add or edit a racket: its owner, brand and model.
export default function RacketFormSheet({ visible, onClose, ...rest }: RacketFormSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={rest.racket ? t('edit_racket') : t('add_racket')}>
      <RacketForm onClose={onClose} {...rest} />
    </Sheet>
  );
}
