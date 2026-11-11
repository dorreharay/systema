import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Check, ChevronRight, Lock } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { colors } from '@/components/ui/colors';
import EnterSubmits from '@/components/ui/enter-submits';
import { FormError } from '@/components/ui/input';
import { ScalePicker } from '@/components/ui/scale-picker';
import Sheet, { afterSheetsClosed } from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import SwitchRow from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { describeError } from '@/lib/errors';
import { formatNumber, parseDecimal } from '@/lib/format';
import { useI18n, type TKey, type Translate } from '@/lib/i18n';
import { useUpdateRacket, useUpdateString } from '@/lib/queries';
import { useEntitlements } from '@/lib/use-subscription';

// The stock of the catalog is in the same few places: a switch and a count in the form of an item, a badge in a list,
// and a small sheet to change the count without opening the item.
//
// Where the plan of the account does not count the stock (Free) none of that is shown: the counting is paused, the items and their counts are
// kept, and in the forms there is a line that says what Pro gives and leads to it (`StockLocked`).

export type StockKind = 'racket' | 'string';

/** Whether the plan of the account counts the stock. (It does, as it always did, where the server has no plans.) */
export const useStockOn = () => useEntitlements().stock;

/** In the form of an item, where the plan does not count the stock: what the counting would give, and the way to Pro. */
export function StockLocked({ onClose }: { onClose?: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('stock_locked_title')}
      onPress={() => {
        // The form is a sheet, which lies over the page that opens: it goes first.
        onClose?.();
        afterSheetsClosed(() => router.push('/subscription'));
      }}
      className="flex-row items-center gap-3 rounded-[15px] bg-surface px-4 py-3.5 active:opacity-70">
      <Lock size={20} color={colors.primary} />
      <View className="flex-1 gap-0.5">
        <Text className="text-[15.5px] font-semibold">{t('stock_locked_title')}</Text>
        <Text className="text-[13.5px] leading-[18px] text-muted">{t('stock_locked_hint')}</Text>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

/** What the stock in a form means, or why it cannot be: rackets are counted one by one, strings in whole and half sets. */
export function readStock(kind: StockKind, text: string): { value: number } | { error: TKey } {
  const value = parseDecimal(text);
  if (value === null || value < 0) return { error: 'error_number' };
  if (kind === 'racket' && !Number.isInteger(value)) return { error: 'error_stock_racket' };
  if (kind === 'string' && !Number.isInteger(value * 2)) return { error: 'error_stock_string' };
  return { value };
}

const unitKey = (kind: StockKind): TKey => (kind === 'racket' ? 'stock_unit_racket' : 'stock_unit_string');

// One tick of the scale: a racket, or half a set.
const stockStep = (kind: StockKind) => (kind === 'racket' ? 1 : 0.5);

type StockFieldsProps = {
  kind: StockKind;
  track: boolean;
  onTrack: (track: boolean) => void;
  stock: string;
  onStock: (stock: string) => void;
  error?: string;
};

/** The part of an item's form about its stock: whether it is counted, and how many there are. */
export function StockFields({ kind, track, onTrack, stock, onStock, error }: StockFieldsProps) {
  const { t } = useI18n();

  return (
    <View>
      <SwitchRow label={t('stock_track')} description={t('stock_track_hint')} value={track} onValueChange={onTrack} />
      {track ? (
        <ScalePicker
          label={t('field_stock')}
          value={stock}
          onChange={onStock}
          step={stockStep(kind)}
          unit={t(unitKey(kind))}
          error={error}
          hint={kind === 'string' ? t('stock_edit_hint_string') : undefined}
        />
      ) : null}
    </View>
  );
}

type Counted = { track_stock: boolean; stock: number };

// In stock first; then what is not counted, which is always there; what has run out last.
const stockRank = (item: Counted) => (!item.track_stock ? 1 : item.stock > 0 ? 0 : 2);

/** A list of items with what is in stock at the top and what has run out at the bottom, each in the order the list had. */
export const sortByStock = <T extends Counted>(items: T[]) => [...items].sort((a, b) => stockRank(a) - stockRank(b));

/** "In stock: 3 pcs", or that none are left. */
function stockLabel(t: Translate, kind: StockKind, stock: number) {
  return stock > 0
    ? t(kind === 'racket' ? 'stock_available_racket' : 'stock_available_string', { count: formatNumber(stock, 1) })
    : t('stock_out');
}

type StockBadgeProps = {
  kind: StockKind;
  item: Counted;
  // Set, the badge is a button.
  onPress?: () => void;
};

/** How many are left, green; or that none are, red. Nothing for an item that is not counted. */
export function StockBadge({ kind, item, onPress }: StockBadgeProps) {
  const { t } = useI18n();
  const on = useStockOn();
  if (!item.track_stock || !on) return null;

  const label = stockLabel(t, kind, item.stock);
  const badge = <Badge label={label} tone={item.stock > 0 ? 'success' : 'danger'} />;
  if (!onPress) return badge;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      className="self-start hover:opacity-80 active:opacity-60">
      {badge}
    </Pressable>
  );
}

/** The same as a line of text under the name of an item in a list: muted, and red when none are left. */
export function StockLine({ kind, item }: { kind: StockKind; item: Counted }) {
  const { t } = useI18n();
  const on = useStockOn();
  if (!item.track_stock || !on) return null;

  return (
    <Text className={`text-[14.3px] ${item.stock > 0 ? 'text-muted' : 'text-danger'}`}>
      {stockLabel(t, kind, item.stock)}
    </Text>
  );
}

type StockSheetProps = {
  visible: boolean;
  onClose: () => void;
  kind: StockKind;
  // The item whose count is set; its name is the title.
  item: { id: string; brand: string; model: string; stock: number } | null;
};

function StockForm({ kind, item, onClose }: Omit<StockSheetProps, 'visible' | 'item'> & {
  item: NonNullable<StockSheetProps['item']>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const updateRacket = useUpdateRacket();
  const updateString = useUpdateString();
  // What has run out starts from one: that is what is being restocked.
  const [stock, setStock] = useState(formatNumber(item.stock > 0 ? item.stock : 1, 1));
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    const read = readStock(kind, stock);
    if ('error' in read) {
      setError(t(read.error));
      return;
    }
    setSaving(true);
    try {
      if (kind === 'racket') await updateRacket.mutateAsync({ id: item.id, stock: read.value });
      else await updateString.mutateAsync({ id: item.id, stock: read.value });
      toast.success(t('stock_saved'));
      onClose();
    } catch (failure) {
      setFormError(describeError(failure, t));
      setSaving(false);
    }
  };

  return (
    <>
      {/* On a wide screen the count is a field (see ScalePicker): it has the cursor at once, and Enter saves. */}
      <EnterSubmits
        className="gap-3 pt-2"
        onSubmit={() => {
          if (!saving) void save();
        }}>
        <ScalePicker
          label={t('field_stock')}
          value={stock}
          onChange={(value) => {
            setStock(value);
            setError(undefined);
          }}
          step={stockStep(kind)}
          unit={t(unitKey(kind))}
          error={error}
          hint={kind === 'string' ? t('stock_edit_hint_string') : undefined}
          autoFocus
        />
        {formError ? <FormError message={formError} /> : null}
      </EnterSubmits>
      <View className="pt-4">
        <Shortcut
          compact
          icon={Check}
          label={t('save')}
          color={colors.primary}
          contentColor={colors.white}
          onPress={save}
          loading={saving}
        />
      </View>
    </>
  );
}

/** A sheet to set how many of an item there are, for the list and for choosing something that has run out. */
export function StockSheet({ visible, onClose, item, ...rest }: StockSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={item ? `${item.brand} ${item.model}` : t('stock_edit_title')}>
      {item ? <StockForm key={item.id} item={item} onClose={onClose} {...rest} /> : null}
    </Sheet>
  );
}
