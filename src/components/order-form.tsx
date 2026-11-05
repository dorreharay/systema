import { useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
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
import { Calendar, Check, ChevronDown, ChevronUp, Clock, Plus, RotateCcw } from '@/components/icons';
import UserIcon from '@/components/icons/user-icon';
import RacketFormSheet from '@/components/racket-form-sheet';
import { StockLine } from '@/components/stock';
import StringFormSheet from '@/components/string-form-sheet';
import { BLOCK, BLOCK_ROOM } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { colors } from '@/components/ui/colors';
import { useConfirm } from '@/components/ui/confirm';
import { DateSheet, TimeSheet } from '@/components/ui/date-sheets';
import { FormError, Input, NumberInput } from '@/components/ui/input';
import { ServerPhoto } from '@/components/ui/photo';
import PickerField from '@/components/ui/picker-field';
import { DetailHeader, DetailScroll, Screen, useDetailContentTop } from '@/components/ui/screen';
import SearchPicker, { PickerHeading } from '@/components/ui/search-picker';
import { afterSheetsClosed } from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import SwitchRow from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError, fieldError, isApiError } from '@/lib/errors';
import {
  clientFromSearch,
  currencySymbol,
  formatDate,
  formatMoney,
  formatNumber,
  orderNumber,
  racketName,
  todayIso,
} from '@/lib/format';
import { useI18n, type Translate } from '@/lib/i18n';
import { offlineStore } from '@/lib/offline/app';
import { selectRackets } from '@/lib/offline/select';
import {
  applySetup,
  buildInput,
  changeUnit,
  pricing,
  setupUsesAdvanced,
  stringLabel,
  toStringChoice,
  usesAdvanced,
  validateDraft,
  withRacket,
  type Draft,
  type DraftErrors,
  type DraftService,
  type RacketSource,
} from '@/lib/order-draft';
import { describeSetup } from '@/lib/order-text';
import {
  useClients,
  useCreateOrder,
  useDeletePhoto,
  useRackets,
  useReferenceRacketPages,
  useRefreshCatalog,
  useServices,
  useStrings,
  useUpdateOrder,
} from '@/lib/queries';
import { nameKey, withoutOwnedRackets } from '@/lib/reference';
import type { CatalogString, Client, OrderDetail, Racket, ReferenceRacket } from '@/lib/types';

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

/** What can be chosen first, and what has run out after it, each in the order the list had. */
const inStockFirst = <T extends { available: boolean }>(items: T[]) =>
  [...items].sort((a, b) => Number(b.available) - Number(a.available));

/** A client's rackets with the ones from earlier orders first, the latest of them at the top. The rest keep their order. */
const usedFirst = (items: Racket[]) =>
  [...items].sort(
    (a, b) =>
      (b.last_setup?.received_date ?? '').localeCompare(a.last_setup?.received_date ?? '') ||
      (b.last_setup?.number ?? 0) - (a.last_setup?.number ?? 0)
  );

/**
 * A row of the racket picker: a racket that is in a list of the stringer's, one found by name in the reference list, or
 * the heading of a group of them.
 */
type RacketRow =
  | { kind: 'own'; racket: Racket }
  | { kind: 'reference'; item: ReferenceRacket }
  | { kind: 'heading'; group: 'own' | 'reference' };

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
    <View onLayout={onLayout} className={`${BLOCK} ${BLOCK_ROOM} gap-3`}>
      <Text accessibilityRole="header" className="text-[18.7px] font-semibold">
        {title}
      </Text>
      {children}
    </View>
  );
}

const message = (error: DraftErrors[keyof DraftErrors], t: Translate) =>
  error ? t(error.key, error.params) : undefined;

type OrderFormProps = {
  // What the form starts as: empty, prefilled for a repeat, or the order being edited.
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
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const deletePhoto = useDeletePhoto();
  const refreshCatalog = useRefreshCatalog();
  const editing = !!order;

  const currency = user?.currency ?? 'USD';
  const today = todayIso(user?.timezone);

  const [draft, setDraft] = useState(initial);
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
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);

  const [clientQuery, setClientQuery] = useState('');
  const [racketQuery, setRacketQuery] = useState('');
  const [stringQuery, setStringQuery] = useState('');
  const clients = useClients(clientQuery);
  const fromStock = draft.racketSource === 'stock';
  const rackets = useRackets({
    q: racketQuery,
    // A client's rackets are those of the client chosen (none are listed before one is); the catalog's go with anyone.
    clientId: fromStock ? undefined : draft.client?.id,
    kind: fromStock ? 'catalog' : 'client',
    enabled: fromStock || !!draft.client,
  });
  // A client's racket can also be picked from the reference list, whatever the catalog has or the stock holds, with a client
  // chosen or without. A racket that is picked from there is not saved to anyone's rackets: the order saves it, when it is
  // made (see `Draft.referenceRacket`). All of the client's rackets are read as well, to leave out of the list the ones
  // that they have already.
  const ownerId = fromStock ? undefined : draft.client?.id;
  const ofClient = useRackets({ clientId: ownerId, kind: 'client', enabled: !!ownerId && picking === 'racket' });
  const reference = useReferenceRacketPages(racketQuery, !fromStock && picking === 'racket');
  const stringsFound = useStrings(stringQuery);
  const catalog = useStrings();
  const services = useServices();

  const labor = services.data?.find((service) => service.active && service.kind === 'labor');
  const extras = services.data?.filter((service) => service.active && service.kind === 'extra') ?? [];
  const prices = pricing(draft, labor, catalog.data ?? []);

  const contentTop = useDetailContentTop();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Where each section starts, to scroll to the first one with a mistake.
  const [sectionY, setSectionY] = useState<Partial<Record<SectionKey, number>>>({});
  const trackSection = (key: SectionKey) => (event: LayoutChangeEvent) => {
    const y = event.nativeEvent.layout.y;
    setSectionY((current) => (current[key] === y ? current : { ...current, [key]: y }));
  };

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

  // --- Customer and racket -------------------------------------------------------------------

  /** The racket picked, and its owner if it is a client's. Its last setup is copied in when the form has none. */
  const chooseRacket = (racket: Racket) => {
    setDraft((current) => withRacket(current, racket));
    if (racket.last_setup && setupUsesAdvanced(racket.last_setup)) setAdvancedOpen(true);
    setErrors((current) => ({ ...current, racket: undefined, client: undefined, mainString: undefined, mainTension: undefined }));
  };

  const chooseClient = (client: Pick<Client, 'id' | 'name'>) => {
    if (draft.client?.id !== client.id) {
      // A client's racket goes with its owner and is left behind with them; a catalog racket stays, and so does a racket
      // that was only picked from the reference list: it is nobody's yet.
      update(
        { client: { id: client.id, name: client.name }, racket: fromStock ? draft.racket : null },
        fromStock ? ['client'] : ['client', 'racket']
      );
      if (fromStock) return;
      // The client's rackets, as the phone has them: nothing is asked of the server, so this works without a connection too.
      const items = selectRackets(offlineStore.getSnapshot().tables, { clientId: client.id, kind: 'client' });
      const picked = draft.referenceRacket;
      if (picked) {
        // The client may have that racket already: then it is theirs, with how it was strung, and no second is made.
        const key = nameKey(picked.brand, picked.model);
        const have = items.find((racket) => nameKey(racket.brand, racket.model) === key);
        if (have) chooseRacket(have);
      } else if (items.length === 1) {
        // A customer with one racket needs no choosing.
        chooseRacket(items[0]);
      }
    }
  };

  /**
   * A racket picked by name in the reference list. It is not saved to the client's rackets here: the order saves it when
   * it is made, so that an order that is never made leaves nothing behind. Until then it is only what the form shows.
   */
  const chooseReferenceRacket = (item: ReferenceRacket) => {
    setDraft((current) => ({ ...current, racket: null, referenceRacket: item }));
    setErrors((current) => ({ ...current, racket: undefined }));
  };

  /** Switching between a client's racket and the catalog's drops the racket chosen, which is of the other kind. */
  const changeRacketSource = (racketSource: RacketSource) => {
    if (racketSource !== draft.racketSource) {
      update({ racketSource, racket: null, referenceRacket: null }, ['racket']);
    }
  };

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

  // Photos are no longer added here; the ones an order already has can still be taken off it.
  const existingPhotos = (order?.photos ?? []).filter((photo) => !removedPhotos.includes(photo.id));

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

  /** Shows what is wrong with the order: under its fields, with the first of them in sight. False when nothing is. */
  const showErrors = (found: DraftErrors) => {
    setErrors(found);
    const firstError = (Object.keys(found) as (keyof DraftErrors)[])[0];
    if (!firstError) return false;
    toast.error(t('form_check_fields'));
    scroll.current?.scrollTo({
      // The section goes just under the header, not behind it.
      y: Math.max(0, (sectionY[SECTION_OF_ERROR[firstError]] ?? 0) - contentTop),
      animated: true,
    });
    return true;
  };

  const submit = async () => {
    if (submitting) return;
    setFormError(undefined);
    if (showErrors(validateDraft(draft, prices))) return;

    setSubmitting(true);
    try {
      const input = buildInput(draft, prices);
      const saved = order
        ? await updateOrder.mutateAsync({ id: order.id, ...input })
        : await createOrder.mutateAsync(input);

      // Photos taken off go after the order exists.
      for (const id of removedPhotos) await deletePhoto.mutateAsync(id).catch(() => undefined);

      // An order the server has not numbered yet (there is no connection) is saved all the same; it gets its number when it is sent.
      toast.success(
        saved.number === null
          ? t(editing ? 'order_saved_unnumbered' : 'order_created_unnumbered')
          : t(editing ? 'order_saved' : 'order_created', { number: orderNumber(saved.number) })
      );
      if (editing) router.back();
      else router.replace({ pathname: '/orders/[id]', params: { id: saved.id } });
    } catch (error) {
      // What was typed stays. What has run out, or is gone, is named under its field; the rest is said in general.
      if (isApiError(error, 'out_of_stock')) {
        // The lists said there was enough: they show what is left now, in the pickers too.
        refreshCatalog();
        const outOfStock = { key: 'order_error_out_of_stock' as const };
        showErrors({
          ...(fieldError(error, 'racket_id') && { racket: outOfStock }),
          ...(fieldError(error, 'main_string_id') && { mainString: outOfStock }),
          ...(fieldError(error, 'cross_string_id') && { crossString: outOfStock }),
        });
      } else if (fieldError(error, 'main_string_id') || fieldError(error, 'cross_string_id')) {
        // A setup copied from an earlier order can name a string that has left the catalog since.
        refreshCatalog();
        const gone = { key: 'order_error_string_gone' as const };
        showErrors({
          ...(fieldError(error, 'main_string_id') && { mainString: gone }),
          ...(fieldError(error, 'cross_string_id') && { crossString: gone }),
        });
      } else {
        setFormError(describeError(error, t));
        toast.error(t('order_save_failed'));
      }
      setSubmitting(false);
    }
  };

  const racket = draft.racket;
  const lastSetup = racket?.last_setup ?? null;
  // What the racket picker lists. For a client's racket it is two groups under headings: the chosen client's rackets that
  // fit the search, the ones from earlier orders at the top (there are none to list before a client is chosen), and then
  // the reference list that fits it. The reference list is all of them by name: nothing in it depends on the catalog or
  // the stock; with a client chosen it leaves out what the client has already, and without one it leaves out nothing.
  // From stock it is the catalog's rackets that fit.
  const heading = (group: 'own' | 'reference'): RacketRow => ({ kind: 'heading', group });
  const ownRows = (items: Racket[]) => items.map((own): RacketRow => ({ kind: 'own', racket: own }));
  const referenceRacketsFound = withoutOwnedRackets(
    reference.data?.pages.flatMap((page) => page.items) ?? [],
    ownerId ? (ofClient.data ?? rackets.data ?? []) : []
  );
  const racketRows: RacketRow[] = fromStock
    ? ownRows(inStockFirst(rackets.data ?? []))
    : [
        ...(ownerId && rackets.data?.length ? [heading('own'), ...ownRows(usedFirst(rackets.data))] : []),
        ...(referenceRacketsFound.length > 0
          ? [
              heading('reference'),
              ...referenceRacketsFound.map((item): RacketRow => ({ kind: 'reference', item })),
            ]
          : []),
      ];
  const symbol = currencySymbol(currency, language);
  const unitOptions = [
    { value: 'kg' as const, label: 'kg' },
    { value: 'lbs' as const, label: 'lbs' },
  ];

  return (
    <Screen
      flush
      // Always in reach under the page, like the buttons that add something: it goes while the keyboard is open.
      dock={
        <Shortcut
          icon={editing ? Check : undefined}
          label={editing ? t('save_changes') : t('create_order')}
          color={colors.newOrder}
          contentColor={colors.ink}
          className="px-5 py-5 w-full"
          onPress={submit}
          loading={submitting}
        />
      }
      footer={<View style={{ height: Math.max(insets.bottom, 12) + 24 }} />}>
      <DetailHeader
        floating
        title={editing ? t('order_edit_title', { number: orderNumber(order.number) }) : t('new_order_title')}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <DetailScroll
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="gap-4 p-page pb-28">
          {/* Customer and racket */}
          <FormSection title={t('section_customer_racket')} onLayout={trackSection('customer')}>
            <PickerField
              label={t('field_client')}
              value={draft.client?.name}
              placeholder={t('order_select_client')}
              error={message(errors.client, t)}
              icon={<UserIcon size={18} color={colors.muted} />}
              onPress={() => setPicking('client')}
            />
            <Segmented
              options={[
                { value: 'client' as const, label: t('order_racket_source_client') },
                { value: 'stock' as const, label: t('order_racket_source_stock') },
              ]}
              value={draft.racketSource}
              onChange={changeRacketSource}
            />
            <PickerField
              label={t('field_racket')}
              value={racket ? racketName(racket) : draft.referenceRacket ? racketName(draft.referenceRacket) : undefined}
              placeholder={t('order_select_racket')}
              error={message(errors.racket, t)}
              onPress={() => setPicking('racket')}
            />
            {racket && lastSetup ? (
              <View className="gap-2 rounded-xl bg-primary-soft p-3">
                <Text className="text-[14.3px] font-medium text-primary">
                  {t('order_last_setup', {
                    number: orderNumber(lastSetup.number),
                    date: formatDate(lastSetup.received_date, language, today),
                  })}
                </Text>
                <Text className="text-[16.5px]">
                  {describeSetup(lastSetup, draft.unit, t)}
                </Text>
                <Shortcut
                  compact
                  icon={RotateCcw}
                  label={t('use_previous_setup')}
                  color={colors.white}
                  contentColor={colors.ink}
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
                    toast.success(t('previous_setup_applied'));
                  }}
                  className="bg-white"
                />
              </View>
            ) : (racket?.client_id || draft.referenceRacket) && !editing ? (
              <Text className="text-[14.3px] text-muted">{t('order_no_history')}</Text>
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
              className="min-h-12 flex-row items-center justify-between rounded-lg bg-surface px-3.5 active:opacity-70">
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
                  <Text className="text-[14.3px] font-medium text-muted">{t('field_knots')}</Text>
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
                <Text className="text-[14.3px] font-medium text-muted">{t('field_additional_services')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {extras.map((service) => {
                    const selected = draft.services.some((line) => line.serviceId === service.id);
                    return (
                      <Pressable
                        key={service.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => toggleExtra(service.id, service.name, service.price)}
                        className={`min-h-10 flex-row items-center gap-1.5 rounded-lg border px-4 ${
                          selected ? 'border-primary bg-primary active:bg-primary' : 'border-line bg-white active:bg-surface'
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
              <Text className="text-[26.4px] font-semibold text-primary">
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

          {/* Notes */}
          <FormSection title={t('order_notes')}>
            <Input
              label={`${t('order_notes')} · ${t('optional')}`}
              value={draft.notes}
              onChangeText={(notes) => update({ notes })}
              placeholder={t('order_notes_placeholder')}
              multiline
            />
            {existingPhotos.length > 0 ? (
              <View className="gap-2">
                <Text className="text-[14.3px] font-medium text-muted">{t('field_photos')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {existingPhotos.map((photo) => (
                    <ServerPhoto
                      key={photo.id}
                      id={photo.id}
                      className="w-[31%]"
                      onRemove={() => removeServerPhoto(photo.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </FormSection>

          {formError ? <FormError message={formError} /> : null}
        </DetailScroll>

      </KeyboardAvoidingView>

      <SearchPicker
        visible={picking === 'client'}
        onClose={() => setPicking(null)}
        title={t('field_client')}
        placeholder={t('clients_search_placeholder')}
        autoCapitalize="words"
        items={clients.data ?? []}
        keyOf={(client) => client.id}
        selectedKey={draft.client?.id}
        loading={clients.isLoading}
        error={clients.isError ? clients.error : undefined}
        onRetry={() => clients.refetch()}
        onQueryChange={setClientQuery}
        emptyHint={t('clients_empty_hint')}
        createLabel={(query) => {
          const typed = clientFromSearch(query);
          if (typed.phone) return t('create_client_phone', { phone: typed.phone });
          return typed.name ? t('create_client_named', { name: typed.name }) : t('add_client');
        }}
        onCreate={(name) => {
          setPicking(null);
          afterSheetsClosed(() => setCreating({ kind: 'client', name }));
        }}
        renderItem={(client) => (
          <>
            <Text className="text-base font-medium">{client.name}</Text>
            <Text className="text-[14.3px] text-muted">
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
        items={racketRows}
        keyOf={(row) =>
          row.kind === 'heading' ? `heading:${row.group}` : row.kind === 'own' ? row.racket.id : `reference:${row.item.id}`
        }
        selectedKey={racket?.id ?? (draft.referenceRacket ? `reference:${draft.referenceRacket.id}` : undefined)}
        loading={rackets.isLoading || (!fromStock && reference.isLoading)}
        // The reference list comes a page at a time, as the list is scrolled.
        loadingMore={reference.isFetchingNextPage}
        onEndReached={() => {
          if (!fromStock && reference.hasNextPage && !reference.isFetchingNextPage) void reference.fetchNextPage();
        }}
        isHeading={(row) => row.kind === 'heading'}
        error={rackets.isError ? rackets.error : undefined}
        onRetry={() => rackets.refetch()}
        onQueryChange={setRacketQuery}
        emptyHint={
          fromStock ? t('stock_rackets_empty_hint') : draft.client ? t('client_no_rackets_search') : t('rackets_empty_hint')
        }
        createLabel={() => (fromStock ? t('add_racket_to_catalog') : t('add_racket'))}
        // A client's racket needs its owner; one for the catalog does not, and is how something missing is added here.
        onCreate={
          fromStock || draft.client
            ? (name) => {
                setPicking(null);
                afterSheetsClosed(() => setCreating({ kind: 'racket', name: fromStock ? name : '' }));
              }
            : undefined
        }
        // A racket of the catalog that has run out is shown, but is not to be chosen: its stock is set in the catalog.
        isDisabled={(row) => fromStock && row.kind === 'own' && !row.racket.available}
        renderItem={(row) => {
          if (row.kind === 'heading') {
            return (
              <PickerHeading
                title={t(row.group === 'reference' ? 'racket_group_reference' : 'racket_group_client')}
              />
            );
          }
          if (row.kind === 'reference') {
            return <Text className="text-base font-medium">{racketName(row.item)}</Text>;
          }
          return (
            <>
              <Text className="text-base font-medium">{racketName(row.racket)}</Text>
              {fromStock ? (
                <StockLine kind="racket" item={row.racket} />
              ) : (
                <Text className="text-[14.3px] text-muted" numberOfLines={1}>
                  {row.racket.client_name}
                  {row.racket.last_setup ? ` · ${describeSetup(row.racket.last_setup, draft.unit, t)}` : ''}
                </Text>
              )}
            </>
          );
        }}
        onSelect={(row) => {
          if (row.kind === 'heading') return;
          setPicking(null);
          if (row.kind === 'reference') chooseReferenceRacket(row.item);
          else chooseRacket(row.racket);
        }}
      />

      <SearchPicker
        visible={picking === 'main' || picking === 'cross'}
        onClose={() => setPicking(null)}
        title={picking === 'cross' ? t('field_cross_strings') : t('field_strings')}
        placeholder={t('strings_search_placeholder')}
        items={inStockFirst(stringsFound.data ?? [])}
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
          afterSheetsClosed(() => setCreating({ kind: 'string', name, target }));
        }}
        // A string that has run out is shown, but is not to be chosen: its stock is set in the catalog.
        isDisabled={(string) => !string.available}
        renderItem={(string) => (
          <>
            <Text className="text-base font-medium">{stringLabel(string)}</Text>
            <Text className="text-[14.3px] text-muted">
              {[
                t(`string_type_${string.type}`),
                string.default_price === null ? null : formatMoney(string.default_price, currency, language),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <StockLine kind="string" item={string} />
          </>
        )}
        onSelect={(string) => {
          const target = picking === 'cross' ? 'cross' : 'main';
          setPicking(null);
          chooseString(target, string);
        }}
      />

      <ClientFormSheet
        visible={creating?.kind === 'client'}
        onClose={() => setCreating(null)}
        search={creating?.kind === 'client' ? creating.name : undefined}
        onSaved={(client) => {
          void chooseClient(client);
          // A customer who was just made has no racket yet: the list of rackets opens next, for it to be found by name
          // (a catalog racket needs no owner), unless a racket was picked from the reference list already.
          if (!fromStock && !draft.referenceRacket) afterSheetsClosed(() => setPicking('racket'));
        }}
      />
      <RacketFormSheet
        visible={creating?.kind === 'racket'}
        onClose={() => setCreating(null)}
        owner={fromStock ? undefined : (draft.client ?? undefined)}
        catalog={fromStock}
        initialModel={creating?.kind === 'racket' ? creating.name : undefined}
        // One that was just made with none in stock is in the catalog, but is not chosen.
        onSaved={(made) => {
          if (made.available) chooseRacket(made);
        }}
      />
      <StringFormSheet
        visible={creating?.kind === 'string'}
        onClose={() => setCreating(null)}
        initialModel={creating?.kind === 'string' ? creating.name : undefined}
        onSaved={(made) => {
          if (made.available) chooseString(creating?.target ?? 'main', made);
        }}
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
    </Screen>
  );
}
