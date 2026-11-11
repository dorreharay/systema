import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';

import { Check, ClipboardList, Wallet, X, type IconComponent } from '@/components/icons';
import ReadyMessageSheet from '@/components/ready-message-sheet';
import { BUTTON_RADIUS } from '@/components/ui/button-radius';
import { PressableBlock } from '@/components/ui/card';
import Checkbox from '@/components/ui/checkbox';
import { colors, statusColors } from '@/components/ui/colors';
import { PAGE_COLUMN, PAGE_X } from '@/components/ui/page';
import { PAPER_RAISED, SURFACE_EDGE } from '@/components/ui/paper';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import SearchField, { type SearchFieldRef } from '@/components/ui/search-field';
import { ListSkeleton } from '@/components/ui/skeleton';
import { StatusChip, StatusMenu, type Anchor } from '@/components/ui/status-menu';
import { EmptyState, ErrorState, NoResults } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { addDays, formatDate, formatMoney, formatMoneyWhole, formatTimestamp, isOverdue, racketName } from '@/lib/format';
import { useI18n, type Language, type TKey, type Translate } from '@/lib/i18n';
import { usePageInnerWidth } from '@/lib/layout';
import { useMark } from '@/lib/offline/react';
import { describeSetup, readyMessage } from '@/lib/order-text';
import { useAllOrders, useUpdateOrder } from '@/lib/queries';
import type { Order, OrderStatus, TensionUnit } from '@/lib/types';
import { useSearch } from '@/lib/use-search';

// The orders of a desktop as a table (docs/desktop-layout.md): a row to an order, the columns of what a stringer looks for, filters with
// their counts above it, a box to tick on each row and a bar for what is done to the ticked ones, the status of a row changed from a
// menu under it, and the keys (J and K up and down, Space to tick, Enter to open, S for the status, / for the search).

// The widths of what is inside the column of the page (its p-12 padding is not in it) from which every column has room, and from which
// the strings still have a column of their own (below that they go under the name). Each is 48 px less than when the sides of a page
// were 24 px (1100 and 900), so the table changes at the same widths of the window.
const FULL_MIN = 1050;
const MID_MIN = 850;

type Variant = 'full' | 'mid' | 'compact';
type ColumnId = 'select' | 'number' | 'client' | 'racket' | 'strings' | 'due' | 'status' | 'total' | 'paid';
type Filter = 'all' | 'overdue' | 'today' | 'unpaid';

const ROW_HEIGHT: Record<Variant, number> = { full: 52, mid: 52, compact: 64 };

const COLUMNS: Record<Variant, ColumnId[]> = {
  full: ['select', 'number', 'client', 'racket', 'strings', 'due', 'status', 'total', 'paid'],
  mid: ['select', 'number', 'client', 'racket', 'due', 'status', 'total', 'paid'],
  compact: ['select', 'number', 'client', 'due', 'status', 'total', 'paid'],
};

// The header and every row use the same sizes, so that the columns stand under their names.
const CELL: Record<ColumnId, ViewStyle> = {
  select: { width: 28 },
  number: { width: 44 },
  // The three of text share what is left in 23 : 20 : 27, the names a little wider than the rackets.
  client: { flex: 1.15, minWidth: 0 },
  racket: { flex: 1, minWidth: 0 },
  strings: { flex: 1.35, minWidth: 0 },
  // The chips and the figures: the widths are of the longest thing each holds ("Сьогодні, 17:00", "В процесі", "12 400 грн", "Не сплачено"),
  // and a figure has room after it, so that it does not run into the payment.
  due: { width: 128 },
  status: { width: 120 },
  total: { width: 88, alignItems: 'flex-end', paddingRight: 12 },
  paid: { width: 104 },
};

// In the narrowest table the columns are a little narrower, and the payment is only its dot (a screen reader has the words), so that
// the name has room.
const CELL_COMPACT: Partial<Record<ColumnId, ViewStyle>> = {
  due: { width: 124 },
  status: { width: 112 },
  total: { width: 80, alignItems: 'flex-end', paddingRight: 8 },
  paid: { width: 18 },
};
const cellStyle = (variant: Variant, id: ColumnId) => (variant === 'compact' ? (CELL_COMPACT[id] ?? CELL[id]) : CELL[id]);

const FILTERS: { key: Filter; label: TKey }[] = [
  { key: 'all', label: 'orders_filter_all' },
  { key: 'overdue', label: 'orders_filter_overdue' },
  { key: 'today', label: 'date_today' },
  { key: 'unpaid', label: 'orders_filter_unpaid' },
];

const matches = (order: Order, filter: Filter, today: string) =>
  filter === 'all'
    ? true
    : filter === 'overdue'
      ? isOverdue(order, today)
      : filter === 'today'
        ? order.due_date === today && order.status !== 'completed'
        : !order.is_paid;

// What a row needs to be drawn, worked out once for all of them (so that a row is drawn again only when it has itself changed).
type Ctx = {
  t: Translate;
  language: Language;
  currency: string;
  unit: TensionUnit;
  today: string;
  timeZone: string;
  dateText: (iso: string) => string;
};

// --- A row -----------------------------------------------------------------------------------

function DueCell({ order, ctx }: { order: Order; ctx: Ctx }) {
  if (order.completed_at) {
    return (
      <Text className="text-[13.5px] text-muted" numberOfLines={1}>
        {formatTimestamp(order.completed_at, ctx.language, ctx.timeZone)}
      </Text>
    );
  }
  if (!order.due_date) {
    return (
      <Text className="text-[13.5px] text-muted" numberOfLines={1}>
        {ctx.t('order_no_due_date')}
      </Text>
    );
  }
  const late = isOverdue(order, ctx.today);
  const today = order.due_date === ctx.today;
  return (
    <View
      className={`h-[26px] max-w-full justify-center rounded-full px-3 ${
        late ? 'bg-[#FBE4E1]' : today ? 'bg-primary-soft' : 'bg-surface'
      }`}>
      <Text
        className={`text-[12.5px] font-medium ${late ? 'text-danger' : today ? 'text-primary' : 'text-secondary'}`}
        numberOfLines={1}>
        {`${ctx.dateText(order.due_date)}${order.due_time ? `, ${order.due_time}` : ''}`}
      </Text>
    </View>
  );
}

type RowProps = {
  order: Order;
  ctx: Ctx;
  variant: Variant;
  selected: boolean;
  cursor: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onStatus: (order: Order, anchor: Anchor) => void;
};

const OrderRow = memo(function OrderRow({ order, ctx, variant, selected, cursor, onToggle, onOpen, onStatus }: RowProps) {
  const { t } = ctx;
  // Something that the server has not got in full yet: a dot by the name.
  const mark = useMark(order.id);

  const cell = (id: ColumnId): ReactNode => {
    switch (id) {
      case 'select':
        return (
          <Checkbox
            checked={selected}
            onChange={() => onToggle(order.id)}
            label={t('orders_select_row', { number: order.number ?? '-' })}
          />
        );
      case 'number':
        return (
          <Text className="text-[13.5px] text-muted" numberOfLines={1}>
            {order.number ?? '-'}
          </Text>
        );
      case 'client':
        return (
          <View className="min-w-0 gap-0.5">
            <View className="flex-row items-center gap-1.5">
              {mark ? (
                <View
                  className="size-2 rounded-full"
                  style={{ backgroundColor: mark === 'failed' ? colors.danger : '#E4B448' }}
                />
              ) : null}
              <Text className="min-w-0 shrink text-[14.5px] font-semibold" numberOfLines={1}>
                {order.client.name}
              </Text>
            </View>
            {variant === 'compact' ? (
              <Text className="text-[13px] text-muted" numberOfLines={1}>
                {`${racketName(order.racket)}, ${describeSetup(order, ctx.unit, t)}`}
              </Text>
            ) : null}
          </View>
        );
      case 'racket':
        return (
          <Text className="text-[13.5px] text-muted" numberOfLines={1}>
            {racketName(order.racket)}
          </Text>
        );
      case 'strings':
        return (
          <Text className="text-[13.5px] text-muted" numberOfLines={1}>
            {describeSetup(order, ctx.unit, t)}
          </Text>
        );
      case 'due':
        return <DueCell order={order} ctx={ctx} />;
      case 'status':
        return (
          <StatusChip status={order.status} orderId={order.id} onOpen={(anchor) => onStatus(order, anchor)} />
        );
      case 'total':
        return (
          <Text className="text-[14px] font-semibold" numberOfLines={1}>
            {/* Whole sums without the cents: the column is no wider than the sums need. */}
            {order.total !== null && Number.isInteger(order.total)
              ? formatMoneyWhole(order.total, ctx.currency, ctx.language)
              : formatMoney(order.total, ctx.currency, ctx.language)}
          </Text>
        );
      case 'paid':
        return (
          <View
            accessible
            accessibilityLabel={t(order.is_paid ? 'payment_paid' : 'payment_unpaid')}
            className="flex-row items-center gap-1.5">
            <View className={`size-2 rounded-full ${order.is_paid ? 'bg-emerald-600' : 'bg-amber-500'}`} />
            {variant === 'compact' ? null : (
              <Text
                className={`min-w-0 shrink text-[13px] font-medium ${order.is_paid ? 'text-emerald-700' : 'text-amber-700'}`}
                numberOfLines={1}>
                {t(order.is_paid ? 'payment_paid' : 'payment_unpaid')}
              </Text>
            )}
          </View>
        );
    }
  };

  // The row that is ticked has a green edge, the one the keys are on a ring inside it.
  const edge = [selected ? 'inset 3px 0 0 #86BD4A' : '', cursor ? 'inset 0 0 0 2px #173C32' : '']
    .filter(Boolean)
    .join(', ');

  return (
    <PressableBlock
      onPress={() => onOpen(order.id)}
      accessibilityLabel={t('order_card_label', { number: order.number ?? '-', client: order.client.name })}
      className={`flex-row items-center gap-3 border-t border-line/50 px-4 ${selected ? 'bg-[#EEF6E8]' : ''}`}
      style={{ height: ROW_HEIGHT[variant], ...(edge ? { boxShadow: edge } : null) }}>
      {COLUMNS[variant].map((id) => (
        <View key={id} style={cellStyle(variant, id)}>
          {cell(id)}
        </View>
      ))}
    </PressableBlock>
  );
});

// --- The parts around it ---------------------------------------------------------------------

function TableHeader({
  variant,
  t,
  allTicked,
  someTicked,
  onToggleAll,
}: {
  variant: Variant;
  t: Translate;
  allTicked: boolean;
  someTicked: boolean;
  onToggleAll: () => void;
}) {
  const names: Record<Exclude<ColumnId, 'select'>, string> = {
    number: t('orders_col_number'),
    client: t('field_client'),
    racket: t('field_racket'),
    strings: `${t('field_strings')} / ${t('field_tension')}`,
    due: t('orders_col_due'),
    status: t('orders_col_status'),
    total: t('order_total'),
    paid: t('orders_col_payment'),
  };

  return (
    <View className="h-11 flex-row items-center gap-3 border-b border-line/50 bg-white px-4">
      {COLUMNS[variant].map((id) => (
        <View key={id} style={cellStyle(variant, id)}>
          {id === 'select' ? (
            <Checkbox
              checked={allTicked}
              mixed={someTicked && !allTicked}
              onChange={onToggleAll}
              label={t('orders_select_all')}
            />
          ) : id === 'paid' && variant === 'compact' ? null : (
            <Text className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted" numberOfLines={1}>
              {names[id]}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function BulkButton({
  icon: Icon,
  label,
  color,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`h-10 flex-row items-center gap-2 px-4 hover:opacity-90 active:opacity-80 ${BUTTON_RADIUS.px15}`}
      style={{ backgroundColor: color }}>
      <Icon size={17} color="#000000" />
      <Text className="text-[14px] font-semibold" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** What is done to the ticked orders, in a bar at the foot of the page: each button is a status or the payment, in the colour it has elsewhere. */
function BulkBar({
  count,
  t,
  onStatus,
  onPaid,
  onClear,
}: {
  count: number;
  t: Translate;
  onStatus: (status: OrderStatus) => void;
  onPaid: () => void;
  onClear: () => void;
}) {
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 bottom-8 items-center">
      <View
        accessibilityRole="toolbar"
        className="h-[58px] flex-row items-center gap-2 rounded-[18px] bg-[#1F1F1F] pl-5 pr-2.5"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 30px 60px -16px rgba(0,0,0,0.6)' }}>
        <Text className="mr-2 text-[14.5px] font-semibold text-white">{t('orders_selected', { count })}</Text>
        <BulkButton icon={Check} label={t('status_ready')} color={statusColors.ready.fill} onPress={() => onStatus('ready')} />
        <BulkButton
          icon={Check}
          label={t('status_completed')}
          color={statusColors.completed.fill}
          onPress={() => onStatus('completed')}
        />
        <BulkButton icon={Wallet} label={t('payment_paid')} color={colors.clients} onPress={onPaid} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('orders_clear_selection')}
          onPress={onClear}
          className="ml-1 size-9 items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/15">
          <X size={17} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

// --- The key presses (the web's: `onKeyDown` is not in React Native's own types) ------------------

type KeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: unknown;
  currentTarget: unknown;
  preventDefault: () => void;
};

const inField = (target: unknown) => {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  return (
    !!element && (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName ?? '') || !!element.isContentEditable)
  );
};

const onControl = (target: unknown) =>
  !!(target as { closest?: (selector: string) => unknown } | null)?.closest?.(
    'button, input, a, select, textarea, [role="checkbox"], [role="button"], [role="menuitem"]'
  );

// --- The page --------------------------------------------------------------------------------

const NO_IDS: ReadonlySet<string> = new Set();

/** State that starts again from `empty` when the list changes (its `key`), without an effect to put it back. */
function useForList<T>(key: string, empty: T) {
  const [state, setState] = useState({ key, value: empty });
  const value = state.key === key ? state.value : empty;
  const set = useCallback(
    (next: T | ((current: T) => T)) =>
      setState((current) => {
        const before = current.key === key ? current.value : empty;
        return { key, value: typeof next === 'function' ? (next as (current: T) => T)(before) : next };
      }),
    [key, empty]
  );
  return [value, set] as const;
}

export default function OrdersTablePage() {
  const { t, language } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const update = useUpdateOrder();

  const search = useSearch();
  const { query } = search;

  const all = useAllOrders(query);
  const [filter, setFilter] = useState<Filter>('all');
  // What was ticked, and where the cursor is, belong to the list that is shown: another filter or other words are a list with none.
  const listKey = `${filter}|${query}`;
  const [selected, setSelected] = useForList<ReadonlySet<string>>(listKey, NO_IDS);
  const [cursorId, setCursorId] = useForList<string | null>(listKey, null);
  const [menu, setMenu] = useState<{ order: Order; anchor: Anchor } | null>(null);
  const [readyFor, setReadyFor] = useState<Order | null>(null);

  const currency = user?.currency ?? 'USD';
  const unit = user?.tension_unit ?? 'kg';
  const timeZone = user?.timezone ?? 'UTC';
  const today = useMemo(() => {
    // The stringer's day, not the device's (as `useDueText` has it).
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return parts;
  }, [timeZone]);

  const ctx = useMemo<Ctx>(
    () => ({
      t,
      language,
      currency,
      unit,
      today,
      timeZone,
      dateText: (iso) =>
        iso === today ? t('date_today') : iso === addDays(today, 1) ? t('date_tomorrow') : formatDate(iso, language, today),
    }),
    [t, language, currency, unit, today, timeZone]
  );

  const orders = useMemo(
    () => (all.data ?? []).filter((order) => matches(order, filter, today)),
    [all.data, filter, today]
  );
  const counts = useMemo(() => {
    const items = all.data ?? [];
    return Object.fromEntries(
      FILTERS.map(({ key }) => [key, items.filter((order) => matches(order, key, today)).length])
    ) as Record<Filter, number>;
  }, [all.data, today]);

  const inner = usePageInnerWidth('wide');
  const variant: Variant = inner >= FULL_MIN ? 'full' : inner >= MID_MIN ? 'mid' : 'compact';
  const rowHeight = ROW_HEIGHT[variant];

  // --- What is done to orders ---

  const move = async (order: Order, status: OrderStatus) => {
    if (order.status === status) return;
    try {
      // Handing the racket over closes the order: it is paid for, too (as on the page of the order).
      await update.mutateAsync({
        id: order.id,
        status,
        ...(status === 'completed' && !order.is_paid && { is_paid: true }),
      });
      // The racket is done: offer the customer a message that is already written.
      if (status === 'ready' && order.status === 'in_progress') setReadyFor(order);
      else toast.success(t('order_status_changed', { status: t(`status_${status}`) }));
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  const bulk = async (change: { status: OrderStatus } | { paid: true }) => {
    const targets = orders.filter((order) => selected.has(order.id));
    try {
      for (const order of targets) {
        if ('status' in change) {
          await update.mutateAsync({
            id: order.id,
            status: change.status,
            ...(change.status === 'completed' && !order.is_paid && { is_paid: true }),
          });
        } else if (!order.is_paid) {
          await update.mutateAsync({ id: order.id, is_paid: true });
        }
      }
      toast.success('status' in change ? t('order_status_changed', { status: t(`status_${change.status}`) }) : t('payment_marked_paid'));
      setSelected(new Set());
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  // --- The rows ---

  const open = useCallback((id: string) => router.push({ pathname: '/orders/[id]', params: { id } }), [router]);

  const toggle = useCallback((id: string) => {
    setCursorId(id);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setCursorId, setSelected]);

  const toggleAll = () => {
    setSelected(selected.size === orders.length ? new Set() : new Set(orders.map((order) => order.id)));
  };

  const onStatus = useCallback((order: Order, anchor: Anchor) => setMenu({ order, anchor }), []);

  // --- The keys ---

  const listRef = useRef<FlatList<Order>>(null);
  const tableRef = useRef<ComponentRef<typeof View>>(null);
  const searchRef = useRef<SearchFieldRef>(null);
  const scrollY = useRef(0);
  const viewport = useRef(0);

  // The row the cursor goes to is brought into view when it is not.
  const reveal = (index: number) => {
    const top = index * rowHeight;
    if (top < scrollY.current) listRef.current?.scrollToOffset({ offset: top, animated: false });
    else if (top + rowHeight > scrollY.current + viewport.current) {
      listRef.current?.scrollToOffset({ offset: top + rowHeight - viewport.current, animated: false });
    }
  };

  const onKeyDown = (event: KeyEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || inField(event.target)) return;
    // A control with the focus (a box, the chip of a status) has Space and Enter for itself.
    if (onControl(event.target) && (event.key === ' ' || event.key === 'Enter')) return;
    const index = cursorId ? orders.findIndex((order) => order.id === cursorId) : -1;
    const go = (to: number) => {
      const next = Math.max(0, Math.min(orders.length - 1, to));
      if (!orders[next]) return;
      setCursorId(orders[next].id);
      reveal(next);
      // The focus leaves the row that had it, so that Enter is the cursor's and not that row's.
      tableRef.current?.focus();
    };
    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        go(index + 1);
        break;
      case 'k':
      case 'ArrowUp':
        go(index < 0 ? 0 : index - 1);
        break;
      case ' ':
        if (index < 0) return;
        toggle(orders[index].id);
        break;
      case 'Enter':
        if (index < 0 || event.target !== event.currentTarget) return;
        open(orders[index].id);
        break;
      case 's': {
        if (index < 0) return;
        const chip = document.querySelector(`[data-status-chip="${orders[index].id}"]`);
        if (!chip) return;
        const box = chip.getBoundingClientRect();
        setMenu({ order: orders[index], anchor: { x: box.left, y: box.top, width: box.width, height: box.height } });
        break;
      }
      case 'Escape':
        if (selected.size === 0) return;
        setSelected(new Set());
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // "/" goes to the search from anywhere on the page.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const press = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || inField(event.target)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', press);
    return () => document.removeEventListener('keydown', press);
  }, []);

  const web = Platform.OS === 'web' ? { onKeyDown } : null;

  const empty = all.isLoading ? (
    <ListSkeleton />
  ) : all.isError ? (
    <ErrorState error={all.error} onRetry={() => all.refetch()} />
  ) : (all.data ?? []).length === 0 && !query ? (
    <EmptyState icon={ClipboardList} title={t('orders_empty_title')} message={t('orders_empty_message')} />
  ) : (
    <NoResults query={query} />
  );

  return (
    <Screen flush width="wide" wideDock={false}>
      <ScreenHeader
        title={t('tab_orders')}
        right={
          <SearchField
            ref={searchRef}
            value={search.text}
            onChangeText={search.setText}
            placeholder={t('orders_search_placeholder')}
            hint="/"
            className="w-[360px]"
          />
        }
      />

      <View className={`min-h-0 flex-1 gap-4 pb-12 ${PAGE_X} ${PAGE_COLUMN}`}>
        <View className="flex-row flex-wrap items-center gap-2">
          {FILTERS.map(({ key, label }) => {
            const on = filter === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(key)}
                className={`h-9 flex-row items-center gap-2 px-3.5 ${BUTTON_RADIUS.px15} ${
                  on ? 'bg-primary' : `bg-white hover:bg-neutral-50 ${PAPER_RAISED}`
                }`}>
                <Text className={`text-[14px] font-medium ${on ? 'text-white' : 'text-secondary'}`}>{t(label)}</Text>
                <Text
                  className={`text-[12.5px] font-semibold ${
                    on ? 'text-white/70' : key === 'overdue' && counts.overdue > 0 ? 'text-danger' : 'text-muted'
                  }`}>
                  {counts[key]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          ref={tableRef}
          focusable
          role="table"
          accessibilityLabel={t('tab_orders')}
          {...({ dataSet: { noRing: 'true' } } as object)}
          {...(web as object)}
          className={`min-h-0 flex-1 overflow-hidden rounded-[18px] bg-white ${SURFACE_EDGE}`}>
          <TableHeader
            variant={variant}
            t={t}
            allTicked={orders.length > 0 && selected.size === orders.length}
            someTicked={selected.size > 0}
            onToggleAll={toggleAll}
          />
          <FlatList
            ref={listRef}
            data={orders}
            keyExtractor={(order) => order.id}
            extraData={[selected, cursorId, variant, ctx]}
            getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
            initialNumToRender={24}
            windowSize={9}
            showsVerticalScrollIndicator={false}
            onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
              scrollY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            onLayout={(event: LayoutChangeEvent) => {
              viewport.current = event.nativeEvent.layout.height;
            }}
            renderItem={({ item }) => (
              <OrderRow
                order={item}
                ctx={ctx}
                variant={variant}
                selected={selected.has(item.id)}
                cursor={item.id === cursorId}
                onToggle={toggle}
                onOpen={open}
                onStatus={onStatus}
              />
            )}
            ListEmptyComponent={empty}
          />
        </View>
      </View>

      {selected.size > 0 ? (
        <BulkBar
          count={selected.size}
          t={t}
          onStatus={(status) => void bulk({ status })}
          onPaid={() => void bulk({ paid: true })}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      <StatusMenu
        anchor={menu?.anchor ?? null}
        current={menu?.order.status ?? 'received'}
        onClose={() => setMenu(null)}
        onSelect={(status) => {
          const order = menu?.order;
          setMenu(null);
          if (order) void move(order, status);
        }}
      />

      <ReadyMessageSheet
        visible={!!readyFor}
        onClose={() => setReadyFor(null)}
        message={readyFor ? readyMessage(readyFor, { t, language, currency }) : ''}
        phone={readyFor?.client.phone ?? null}
      />
    </Screen>
  );
}
