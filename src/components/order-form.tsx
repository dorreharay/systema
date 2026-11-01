import { useRouter } from 'expo-router';
import {
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  Clock,
  ImagePlus,
  Plus,
  RotateCcw,
  UserRound,
} from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ClientFormSheet from '@/components/client-form-sheet';
import RacketFormSheet from '@/components/racket-form-sheet';
import StringFormSheet from '@/components/string-form-sheet';
import ActionSheet from '@/components/ui/action-sheet';
import AppButton from '@/components/ui/app-button';
import { Segmented } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import { useConfirm } from '@/components/ui/confirm';
import { DateSheet, TimeSheet } from '@/components/ui/date-sheets';
import { FormError, Input, NumberInput } from '@/components/ui/input';
import { LocalPhotoThumb, ServerPhoto } from '@/components/ui/photo';
import PickerField from '@/components/ui/picker-field';
import SearchPicker from '@/components/ui/search-picker';
import { DetailHeader, Screen } from '@/components/ui/screen';
import { CLOSE_WAIT_MS } from '@/components/ui/sheet';
import SwitchRow from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import {
  currencySymbol,
  formatDate,
  formatMoney,
  formatNumber,
  orderNumber,
  racketName,
  todayIso,
} from '@/lib/format';
import { useI18n, type Translate } from '@/lib/i18n';
import {
  applySetup,
  buildInput,
  changeUnit,
  draftSnapshot,
  pricing,
  stringLabel,
  toStringChoice,
  setupUsesAdvanced,
  usesAdvanced,
  validateDraft,
  withRacket,
  type Draft,
  type DraftErrors,
  type DraftService,
  type RacketChoice,
} from '@/lib/order-draft';
import { describeSetup } from '@/lib/order-text';
import { pickFromLibrary, takePhoto } from '@/lib/photos';
import {
  useClients,
  useCreateOrder,
  useDeletePhoto,
  useRackets,
  useRequest,
  useServices,
  useStrings,
  useUpdateOrder,
  useUploadPhotos,
} from '@/lib/queries';
import type { CatalogString, Client, OrderDetail, Racket } from '@/lib/types';
import { useUnsavedChangesGuard } from '@/lib/use-unsaved-guard';

const MAX_PHOTOS = 10;

type SectionKey = 'customer' | 'strings' | 'pricing';

const SECTION_OF_ERROR: Record<keyof DraftErrors, SectionKey> = {
  client: 'customer',
  racket: 'customer',
  mainString: 'strings',
  crossString: 'strings',
  mainTension: 'strings',
  crossTension: 'strings',
  laborPrice: 'pricing',
  stringPrice: 'pricing',
  services: 'pricing',
};

function FormSection({
  title,
  children,
  onLayout,
}: {
  title: string;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View onLayout={onLayout} className="gap-3 rounded-2xl border border-line bg-white p-4">
      <Text accessibilityRole="header" className="text-[17px] font-semibold">
        {title}
      </Text>
      {children}
    </View>
  );
}

const message = (error: DraftErrors[keyof DraftErrors], t: Translate) =>
  error ? t(error.key, error.params) : undefined;

type OrderFormProps = {
  // The draft the form starts from: empty, prefilled for a repeat, or the order being edited.
  initial: Draft;
  // Set when editing: the order that is saved over, and whose photos are shown.
  order?: OrderDetail;
};

/**
 * The order form, which is for creating and for editing. The common order (an existing customer and
 * racket, the setup of last time) is a few taps; everything else is below or folded away.
 */
export default function OrderForm({ initial, order }: OrderFormProps) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const request = useRequest();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const deletePhoto = useDeletePhoto();
  const uploadPhotos = useUploadPhotos();
  const editing = !!order;

  const currency = user?.currency ?? 'USD';
  const today = todayIso(user?.timezone);

  const [draft, setDraft] = useState(initial);
  const [initialSnapshot] = useState(() => draftSnapshot(initial));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(() => usesAdvanced(initial));
  const [picking, setPicking] = useState<'client' | 'racket' | 'main' | 'cross' | null>(null);
  const [creating, setCreating] = useState<
    { kind: 'client' | 'racket' | 'string'; name: string; target?: 'main' | 'cross' } | null
  >(null);
  const [dateTarget, setDateTarget] = useState<'received' | 'due' | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);

  const [clientQuery, setClientQuery] = useState('');
  const [racketQuery, setRacketQuery] = useState('');
  const [stringQuery, setStringQuery] = useState('');
  const clients = useClients(clientQuery);
  const rackets = useRackets({ q: racketQuery, clientId: draft.client?.id });
  const stringsFound = useStrings(stringQuery);
  const catalog = useStrings();
  const services = useServices();

  const labor = services.data?.find((service) => service.active && service.kind === 'labor');
  const extras = services.data?.filter((service) => service.active && service.kind === 'extra') ?? [];
  const prices = pricing(draft, labor, catalog.data ?? []);

  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Where each section starts, to scroll to the first one with a mistake.
  const [sectionY, setSectionY] = useState<Partial<Record<SectionKey, number>>>({});
  const trackSection = (key: SectionKey) => (event: LayoutChangeEvent) => {
    const y = event.nativeEvent.layout.y;
    setSectionY((current) => (current[key] === y ? current : { ...current, [key]: y }));
  };

  const dirty = draftSnapshot(draft) !== initialSnapshot || removedPhotos.length > 0;
  const { allowed, allowLeave } = useUnsavedChangesGuard(dirty);
  // Set once the order is saved; the page is left in the effect below, after the guard has been lifted.
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!savedId || !allowed) return;
    if (editing) router.back();
    else router.replace({ pathname: '/orders/[id]', params: { id: savedId } });
  }, [savedId, allowed, editing, router]);

  const update = (patch: Partial<Draft>, clear?: (keyof DraftErrors)[]) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (clear?.length) {
      setErrors((current) => {
        const next = { ...current };
        for (const key of clear) delete next[key];
        return next;
      });
    }
  };

  // After one sheet closes, the next one may open. See CLOSE_WAIT_MS.
  const openNext = (open: () => void) => setTimeout(open, CLOSE_WAIT_MS);

  // --- Customer and racket -------------------------------------------------------------------

  /** The racket picked, and its owner if no customer was chosen yet. Its last setup is copied in when the form has none. */
  const chooseRacket = (racket: RacketChoice) => {
    setDraft((current) => withRacket(current, racket));
    if (racket.last_setup && setupUsesAdvanced(racket.last_setup)) setAdvancedOpen(true);
    setErrors((current) => ({ ...current, racket: undefined, client: undefined, mainString: undefined, mainTension: undefined }));
  };

  const chooseClient = async (client: Pick<Client, 'id' | 'name'>) => {
    if (draft.client?.id !== client.id) {
      update({ client: { id: client.id, name: client.name }, racket: null }, ['client', 'racket']);
      // A customer with one racket needs no choosing.
      try {
        const { items } = await request<{ items: Racket[] }>(`/api/rackets?client_id=${client.id}`);
        if (items.length === 1) chooseRacket(items[0]);
      } catch {
        // the racket can be picked by hand
      }
    }
  };

  const racketChoiceOf = (racket: Racket): RacketChoice => racket;

  // --- Strings -------------------------------------------------------------------------------

  const chooseString = (target: 'main' | 'cross', string: CatalogString) => {
    update(
      target === 'main'
        ? { mainString: toStringChoice(string) }
        : { crossString: toStringChoice(string) },
      target === 'main' ? ['mainString'] : ['crossString']
    );
  };

  const toggleHybrid = (hybrid: boolean) => update({ hybrid, crossString: hybrid ? draft.crossString : null }, ['crossString']);

  const toggleExtra = (serviceId: string, name: string, price: number | null) => {
    const exists = draft.services.some((line) => line.serviceId === serviceId);
    const services: DraftService[] = exists
      ? draft.services.filter((line) => line.serviceId !== serviceId)
      : [
          ...draft.services,
          { key: serviceId, serviceId, name, price: price === null ? '' : formatNumber(price, 2) },
        ];
    update({ services });
  };

  // --- Photos --------------------------------------------------------------------------------

  const existingPhotos = (order?.photos ?? []).filter((photo) => !removedPhotos.includes(photo.id));
  const photoRoom = MAX_PHOTOS - existingPhotos.length - draft.photos.length;

  const addPhotos = async (source: 'camera' | 'library') => {
    if (photoRoom <= 0) {
      toast.error(t('error_photo_limit'));
      return;
    }
    const result = source === 'camera' ? await takePhoto() : await pickFromLibrary(photoRoom);
    if ('error' in result) {
      toast.error(result.error === 'denied' ? t('photo_denied') : t('photo_unavailable'));
      return;
    }
    if (result.photos.length > 0) {
      update({ photos: [...draft.photos, ...result.photos].slice(0, draft.photos.length + photoRoom) });
    }
  };

  const removeServerPhoto = async (id: string) => {
    const ok = await confirm({
      title: t('photo_remove_title'),
      message: t('photo_remove_message'),
      confirmLabel: t('delete'),
      destructive: true,
    });
    if (ok) setRemovedPhotos((current) => [...current, id]);
  };

  // --- Saving --------------------------------------------------------------------------------

  const submit = async () => {
    if (submitting) return;
    const found = validateDraft(draft, prices);
    setErrors(found);
    setFormError(undefined);

    const firstError = (Object.keys(found) as (keyof DraftErrors)[])[0];
    if (firstError) {
      toast.error(t('form_check_fields'));
      scroll.current?.scrollTo({
        y: Math.max(0, (sectionY[SECTION_OF_ERROR[firstError]] ?? 0) - 12),
        animated: true,
      });
      return;
    }

    setSubmitting(true);
    try {
      const input = buildInput(draft, prices);
      const saved = order
        ? await updateOrder.mutateAsync({ id: order.id, ...input })
        : await createOrder.mutateAsync(input);

      // Photos go after the order exists. The order is already saved if one cannot be sent.
      for (const id of removedPhotos) await deletePhoto.mutateAsync(id).catch(() => undefined);
      const failed = draft.photos.length > 0 ? await uploadPhotos(saved.id, draft.photos) : 0;

      if (failed > 0) {
        toast.error(t('photos_failed', { count: failed }));
      } else {
        toast.success(
          editing
            ? t('order_saved', { number: orderNumber(saved.number) })
            : t('order_created', { number: orderNumber(saved.number) })
        );
      }
      allowLeave();
      setSavedId(saved.id);
    } catch (error) {
      // What was typed stays: nothing here resets the draft.
      setFormError(describeError(error, t));
      toast.error(t('order_save_failed'));
      setSubmitting(false);
    }
  };

  const racket = draft.racket;
  const lastSetup = racket?.last_setup ?? null;
  const symbol = currencySymbol(currency, language);
  const unitOptions = [
    { value: 'kg' as const, label: 'kg' },
    { value: 'lbs' as const, label: 'lbs' },
  ];

  return (
    <Screen>
      <DetailHeader
        title={editing ? t('order_edit_title', { number: orderNumber(order.number) }) : t('new_order_title')}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="gap-4 p-page pb-8">
          {/* Customer and racket */}
          <FormSection title={t('section_customer_racket')} onLayout={trackSection('customer')}>
            <PickerField
              label={t('field_client')}
              value={draft.client?.name}
              placeholder={t('order_select_client')}
              error={message(errors.client, t)}
              icon={<UserRound size={18} color={colors.muted} />}
              onPress={() => setPicking('client')}
            />
            <PickerField
              label={t('field_racket')}
              value={racket ? racketName(racket) : undefined}
              placeholder={t('order_select_racket')}
              error={message(errors.racket, t)}
              onPress={() => setPicking('racket')}
            />
            {racket && lastSetup ? (
              <View className="gap-2 rounded-xl bg-primary-soft p-3">
                <Text className="text-[13px] font-medium text-primary">
                  {t('order_last_setup', {
                    number: orderNumber(lastSetup.number),
                    date: formatDate(lastSetup.received_date, language, today),
                  })}
                </Text>
                <Text className="text-[15px]">
                  {describeSetup(lastSetup, draft.unit, t)}
                </Text>
                <AppButton
                  title={t('use_previous_setup')}
                  variant="soft"
                  icon={<RotateCcw size={18} color={colors.primary} />}
                  onPress={() => {
                    const next = applySetup(draft, lastSetup);
                    setDraft(next);
                    if (usesAdvanced(next)) setAdvancedOpen(true);
                    setErrors((current) => ({
                      ...current,
                      mainString: undefined,
                      crossString: undefined,
                      mainTension: undefined,
                      crossTension: undefined,
                    }));
                  }}
                  className="bg-white"
                />
              </View>
            ) : racket && !editing ? (
              <Text className="text-[13px] text-muted">{t('order_no_history')}</Text>
            ) : null}
          </FormSection>

          {/* Strings and tension */}
          <FormSection title={t('section_string_setup')} onLayout={trackSection('strings')}>
            <SwitchRow
              label={t('order_customer_strings_toggle')}
              value={draft.customerStrings}
              onValueChange={(customerStrings) => update({ customerStrings }, ['mainString', 'crossString'])}
            />
            {draft.customerStrings ? (
              <Input
                label={`${t('field_strings')} · ${t('optional')}`}
                value={draft.customerStringName}
                onChangeText={(customerStringName) => update({ customerStringName })}
                placeholder={t('order_customer_strings_placeholder')}
                autoCapitalize="sentences"
              />
            ) : (
              <>
                <PickerField
                  label={draft.hybrid ? t('field_main_strings') : t('field_strings')}
                  value={draft.mainString?.name}
                  placeholder={t('order_select_string')}
                  error={message(errors.mainString, t)}
                  onPress={() => setPicking('main')}
                />
                {draft.hybrid ? (
                  <PickerField
                    label={t('field_cross_strings')}
                    value={draft.crossString?.name}
                    placeholder={t('order_select_string')}
                    error={message(errors.crossString, t)}
                    onPress={() => setPicking('cross')}
                  />
                ) : null}
              </>
            )}

            <View className="gap-1.5">
              <View className="flex-row items-end gap-3">
                <NumberInput
                  className="flex-1"
                  label={
                    draft.differentCross || draft.hybrid ? t('field_main_tension') : t('field_tension')
                  }
                  value={draft.mainTension}
                  onChangeText={(mainTension) => update({ mainTension }, ['mainTension'])}
                  error={message(errors.mainTension, t)}
                  placeholder={draft.unit === 'kg' ? '24' : '53'}
                  suffix={<Text className="text-base text-muted">{draft.unit}</Text>}
                />
                <View className="w-28 pb-px">
                  <Segmented
                    options={unitOptions}
                    value={draft.unit}
                    onChange={(unit) => setDraft((current) => changeUnit(current, unit))}
                  />
                </View>
              </View>
            </View>

            {/* Advanced setup: folded away, so the common order never needs it. */}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: advancedOpen }}
              onPress={() => setAdvancedOpen((open) => !open)}
              className="min-h-12 flex-row items-center justify-between rounded-xl bg-surface px-3.5 active:opacity-70">
              <Text className="text-base font-medium">{t('advanced_setup')}</Text>
              {advancedOpen ? (
                <ChevronUp size={20} color={colors.muted} />
              ) : (
                <ChevronDown size={20} color={colors.muted} />
              )}
            </Pressable>
            {advancedOpen ? (
              <View className="gap-3">
                <SwitchRow
                  label={t('hybrid_setup')}
                  description={t('hybrid_setup_hint')}
                  value={draft.hybrid}
                  onValueChange={toggleHybrid}
                />
                <SwitchRow
                  label={t('different_cross_tension')}
                  value={draft.differentCross}
                  onValueChange={(differentCross) =>
                    update(
                      { differentCross, crossTension: differentCross ? draft.crossTension : '' },
                      ['crossTension']
                    )
                  }
                />
                {draft.differentCross ? (
                  <NumberInput
                    label={t('field_cross_tension')}
                    value={draft.crossTension}
                    onChangeText={(crossTension) => update({ crossTension }, ['crossTension'])}
                    error={message(errors.crossTension, t)}
                    suffix={<Text className="text-base text-muted">{draft.unit}</Text>}
                  />
                ) : null}
                <View className="gap-1.5">
                  <Text className="text-[13px] font-medium text-muted">{t('field_knots')}</Text>
                  <Segmented
                    options={[
                      { value: '2', label: t('knots_two') },
                      { value: '4', label: t('knots_four') },
                    ]}
                    value={String(draft.knots) as '2' | '4'}
                    onChange={(value) => update({ knots: value === '4' ? 4 : 2 })}
                  />
                </View>
                <Input
                  label={`${t('order_stringing_notes')} · ${t('optional')}`}
                  value={draft.stringingNotes}
                  onChangeText={(stringingNotes) => update({ stringingNotes })}
                  placeholder={t('order_stringing_notes_placeholder')}
                  multiline
                />
              </View>
            ) : null}
          </FormSection>

          {/* Prices */}
          <FormSection title={t('section_services_pricing')} onLayout={trackSection('pricing')}>
            <NumberInput
              label={t('field_labor_price')}
              value={prices.laborText}
              onChangeText={(laborPrice) => update({ laborPrice }, ['laborPrice'])}
              error={message(errors.laborPrice, t)}
              prefix={<Text className="text-base text-muted">{symbol}</Text>}
              placeholder="0"
            />
            {draft.customerStrings ? null : (
              <NumberInput
                label={t('field_string_price')}
                value={prices.stringText}
                onChangeText={(stringPrice) => update({ stringPrice }, ['stringPrice'])}
                error={message(errors.stringPrice, t)}
                prefix={<Text className="text-base text-muted">{symbol}</Text>}
                placeholder="0"
              />
            )}

            {extras.length > 0 ? (
              <View className="gap-2">
                <Text className="text-[13px] font-medium text-muted">{t('field_additional_services')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {extras.map((service) => {
                    const selected = draft.services.some((line) => line.serviceId === service.id);
                    return (
                      <Pressable
                        key={service.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => toggleExtra(service.id, service.name, service.price)}
                        className={`min-h-10 flex-row items-center gap-1.5 rounded-full border px-4 ${
                          selected ? 'border-primary bg-primary' : 'border-line bg-white active:bg-surface'
                        }`}>
                        {selected ? null : <Plus size={16} color={colors.ink} />}
                        <Text className={`text-[15px] font-medium ${selected ? 'text-white' : 'text-ink'}`}>
                          {service.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {draft.services.map((line) => (
              <NumberInput
                key={line.key}
                label={line.name}
                value={line.price}
                onChangeText={(price) =>
                  update(
                    {
                      services: draft.services.map((other) =>
                        other.key === line.key ? { ...other, price } : other
                      ),
                    },
                    ['services']
                  )
                }
                error={message(errors.services, t)}
                prefix={<Text className="text-base text-muted">{symbol}</Text>}
              />
            ))}

            <View className="flex-row items-center justify-between border-t border-line pt-3">
              <Text className="text-base font-medium text-muted">{t('order_total')}</Text>
              <Text className="text-[24px] font-semibold text-primary">
                {formatMoney(prices.total, currency, language)}
              </Text>
            </View>
          </FormSection>

          {/* Dates */}
          <FormSection title={t('section_dates')}>
            <PickerField
              label={t('order_received_date')}
              value={formatDate(draft.receivedDate, language, today)}
              placeholder=""
              icon={<Calendar size={18} color={colors.muted} />}
              onPress={() => setDateTarget('received')}
            />
            <PickerField
              label={`${t('order_due_date')} · ${t('optional')}`}
              value={draft.dueDate ? formatDate(draft.dueDate, language, today) : undefined}
              placeholder={t('order_no_due_date')}
              icon={<Calendar size={18} color={colors.muted} />}
              onPress={() => setDateTarget('due')}
            />
            {draft.dueDate ? (
              <PickerField
                label={`${t('order_due_time')} · ${t('optional')}`}
                value={draft.dueTime ?? undefined}
                placeholder={t('order_no_due_time')}
                icon={<Clock size={18} color={colors.muted} />}
                onPress={() => setTimeOpen(true)}
              />
            ) : null}
          </FormSection>

          {/* Notes and photos */}
          <FormSection title={t('section_notes_photos')}>
            <Input
              label={`${t('order_notes')} · ${t('optional')}`}
              value={draft.notes}
              onChangeText={(notes) => update({ notes })}
              placeholder={t('order_notes_placeholder')}
              multiline
            />
            <View className="gap-2">
              <Text className="text-[13px] font-medium text-muted">{t('field_photos')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {existingPhotos.map((photo) => (
                  <ServerPhoto
                    key={photo.id}
                    id={photo.id}
                    className="w-[31%]"
                    onRemove={() => removeServerPhoto(photo.id)}
                  />
                ))}
                {draft.photos.map((photo) => (
                  <LocalPhotoThumb
                    key={photo.uri}
                    uri={photo.uri}
                    className="w-[31%]"
                    onRemove={() =>
                      update({ photos: draft.photos.filter((other) => other.uri !== photo.uri) })
                    }
                  />
                ))}
                {photoRoom > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('photo_add')}
                    onPress={() => setPhotoMenu(true)}
                    className="aspect-square w-[31%] items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-300 active:bg-surface">
                    <ImagePlus size={24} color={colors.muted} />
                    <Text className="text-xs text-muted">{t('photo_add')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </FormSection>

          {formError ? <FormError message={formError} /> : null}
        </ScrollView>

        {/* Always in reach, above the keyboard. */}
        <View
          className="border-t border-line bg-white px-page pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <AppButton
            large
            title={editing ? t('save_changes') : t('create_order')}
            onPress={submit}
            loading={submitting}
          />
        </View>
      </KeyboardAvoidingView>

      <SearchPicker
        visible={picking === 'client'}
        onClose={() => setPicking(null)}
        title={t('field_client')}
        placeholder={t('clients_search_placeholder')}
        items={clients.data ?? []}
        keyOf={(client) => client.id}
        selectedKey={draft.client?.id}
        loading={clients.isLoading}
        error={clients.isError ? clients.error : undefined}
        onRetry={() => clients.refetch()}
        onQueryChange={setClientQuery}
        emptyHint={t('clients_empty_hint')}
        createLabel={(query) => (query ? t('create_client_named', { name: query }) : t('add_client'))}
        onCreate={(name) => {
          setPicking(null);
          openNext(() => setCreating({ kind: 'client', name }));
        }}
        renderItem={(client) => (
          <>
            <Text className="text-base font-medium">{client.name}</Text>
            <Text className="text-[13px] text-muted">
              {[client.phone, t('rackets_count', { count: client.rackets_count })]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </>
        )}
        onSelect={(client) => {
          setPicking(null);
          void chooseClient(client);
        }}
      />

      <SearchPicker
        visible={picking === 'racket'}
        onClose={() => setPicking(null)}
        title={t('field_racket')}
        placeholder={t('rackets_search_placeholder')}
        items={rackets.data ?? []}
        keyOf={(item) => item.id}
        selectedKey={racket?.id}
        loading={rackets.isLoading}
        error={rackets.isError ? rackets.error : undefined}
        onRetry={() => rackets.refetch()}
        onQueryChange={setRacketQuery}
        emptyHint={draft.client ? t('client_no_rackets') : t('rackets_empty_hint')}
        createLabel={() => t('add_racket')}
        onCreate={
          draft.client
            ? () => {
                setPicking(null);
                openNext(() => setCreating({ kind: 'racket', name: '' }));
              }
            : undefined
        }
        renderItem={(item) => (
          <>
            <Text className="text-base font-medium">{racketName(item)}</Text>
            <Text className="text-[13px] text-muted" numberOfLines={1}>
              {item.client_name}
              {item.last_setup ? ` · ${describeSetup(item.last_setup, draft.unit, t)}` : ''}
            </Text>
          </>
        )}
        onSelect={(item) => {
          setPicking(null);
          chooseRacket(racketChoiceOf(item));
        }}
      />

      <SearchPicker
        visible={picking === 'main' || picking === 'cross'}
        onClose={() => setPicking(null)}
        title={picking === 'cross' ? t('field_cross_strings') : t('field_strings')}
        placeholder={t('strings_search_placeholder')}
        items={stringsFound.data ?? []}
        keyOf={(string) => string.id}
        selectedKey={(picking === 'cross' ? draft.crossString : draft.mainString)?.id}
        loading={stringsFound.isLoading}
        error={stringsFound.isError ? stringsFound.error : undefined}
        onRetry={() => stringsFound.refetch()}
        onQueryChange={setStringQuery}
        emptyHint={t('strings_empty_hint')}
        createLabel={(query) => (query ? t('create_string_named', { name: query }) : t('add_string'))}
        onCreate={(name) => {
          const target = picking === 'cross' ? 'cross' : 'main';
          setPicking(null);
          openNext(() => setCreating({ kind: 'string', name, target }));
        }}
        renderItem={(string) => (
          <>
            <Text className="text-base font-medium">{stringLabel(string)}</Text>
            <Text className="text-[13px] text-muted">
              {[
                t(`string_type_${string.type}`),
                string.default_price === null ? null : formatMoney(string.default_price, currency, language),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </>
        )}
        onSelect={(string) => {
          chooseString(picking === 'cross' ? 'cross' : 'main', string);
          setPicking(null);
        }}
      />

      <ClientFormSheet
        visible={creating?.kind === 'client'}
        onClose={() => setCreating(null)}
        initialName={creating?.kind === 'client' ? creating.name : undefined}
        onSaved={(client) => {
          void chooseClient(client);
          // A customer who was just made has no racket yet: ask for it next.
          openNext(() => setCreating({ kind: 'racket', name: '' }));
        }}
      />
      <RacketFormSheet
        visible={creating?.kind === 'racket'}
        onClose={() => setCreating(null)}
        owner={draft.client ?? undefined}
        onSaved={(saved) => chooseRacket(racketChoiceOf(saved))}
      />
      <StringFormSheet
        visible={creating?.kind === 'string'}
        onClose={() => setCreating(null)}
        initialModel={creating?.kind === 'string' ? creating.name : undefined}
        onSaved={(string) => chooseString(creating?.target ?? 'main', string)}
      />

      <DateSheet
        visible={dateTarget !== null}
        onClose={() => setDateTarget(null)}
        title={dateTarget === 'received' ? t('order_received_date') : t('order_due_date')}
        value={dateTarget === 'received' ? draft.receivedDate : draft.dueDate}
        today={today}
        clearable={dateTarget === 'due'}
        onChange={(value) => {
          if (dateTarget === 'received' && value) update({ receivedDate: value });
          if (dateTarget === 'due') update({ dueDate: value, dueTime: value ? draft.dueTime : null });
        }}
      />
      <TimeSheet
        visible={timeOpen}
        onClose={() => setTimeOpen(false)}
        value={draft.dueTime}
        onChange={(dueTime) => update({ dueTime })}
      />

      <ActionSheet
        visible={photoMenu}
        onClose={() => setPhotoMenu(false)}
        title={t('field_photos')}
        actions={[
          { label: t('photo_take'), icon: Camera, onPress: () => void addPhotos('camera') },
          { label: t('photo_choose'), icon: ImagePlus, onPress: () => void addPhotos('library') },
        ]}
      />
    </Screen>
  );
}
