import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View, type FlatListInstance } from 'react-native';

import { Plus, Search, X } from '@/components/icons';
import { colors } from '@/components/ui/colors';
import { FIELD_INPUT_TEXT } from '@/components/ui/field-text';
import Sheet, { useSheetFoot } from '@/components/ui/sheet';
import { ErrorState, NoResults } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';

const DEBOUNCE_MS = 250;

type SearchPickerProps<T> = {
  visible: boolean;
  onClose: () => void;
  title: string;
  placeholder: string;
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  // Called, after a short pause in typing, with what to search for. Empty when the sheet opens or closes.
  onQueryChange: (query: string) => void;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  selectedKey?: string | null;
  // The first row: make a new one without leaving the form this was opened from.
  createLabel?: (query: string) => string;
  onCreate?: (query: string) => void;
  // Shown instead of "no results" when there is nothing at all to pick from.
  emptyHint?: string;
  // How the keyboard capitalises what is typed: names start with a capital.
  autoCapitalize?: 'none' | 'sentences' | 'words';
  // A row that is shown but cannot be picked: dimmed, and a tap does nothing.
  isDisabled?: (item: T) => boolean;
  // A row that is a heading over the rows after it: it is drawn by `renderItem` as it is (see `PickerHeading`), and there
  // is nothing in it to pick.
  isHeading?: (item: T) => boolean;
  // For a list that comes in pages: asked for when the end of it is near, and whether the next page is on its way.
  onEndReached?: () => void;
  loadingMore?: boolean;
};

/** A heading over a group of rows of a picker: a grey band with the name of the group, to set it apart from the rest. */
export function PickerHeading({ title }: { title: string }) {
  return (
    <View className="border-t border-line bg-surface px-page pb-2 pt-3">
      <Text accessibilityRole="header" className="text-[14.3px] font-semibold text-muted">
        {title}
      </Text>
    </View>
  );
}

function PickerBody<T>({
  placeholder,
  items,
  keyOf,
  renderItem,
  onSelect,
  onQueryChange,
  loading,
  error,
  onRetry,
  selectedKey,
  createLabel,
  onCreate,
  emptyHint,
  autoCapitalize = 'none',
  isDisabled,
  isHeading,
  onEndReached,
  loadingMore,
}: Omit<SearchPickerProps<T>, 'visible' | 'onClose' | 'title'>) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const list = useRef<FlatListInstance>(null);
  const foot = useSheetFoot();

  useEffect(() => {
    const timer = setTimeout(() => onQueryChange(query), query ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [query, onQueryChange]);

  // A search starts from the top of what it finds, wherever the list had been scrolled to: a long list, scrolled down,
  // would show the middle of the new one.
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query]);

  // The next time the sheet opens it starts from the whole list.
  useEffect(() => () => onQueryChange(''), [onQueryChange]);

  const trimmed = query.trim();

  return (
    <View className="flex-1">
      <View className="px-page pb-3 pt-1">
        <View className="min-h-12 flex-row items-center gap-2 rounded-lg border border-line bg-surface px-3.5">
          <Search size={18} color={colors.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.primary}
            autoCapitalize={autoCapitalize}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={placeholder}
            textAlignVertical="center"
            className={`min-w-0 flex-1 font-normal text-ink outline-none ${FIELD_INPUT_TEXT}`}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('clear')}
              hitSlop={10}
              onPress={() => setQuery('')}>
              <X size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {onCreate ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onCreate(trimmed)}
          className="min-h-14 flex-row items-center gap-3 border-t border-line px-page py-3 active:bg-surface">
          <View className="size-9 items-center justify-center rounded-full bg-primary-soft">
            <Plus size={18} color={colors.primary} />
          </View>
          <Text className="flex-1 text-[14px] font-medium text-primary" numberOfLines={2}>
            {createLabel ? createLabel(trimmed) : t('create_new')}
          </Text>
        </Pressable>
      ) : null}

      {error && items.length === 0 ? (
        <ErrorState error={error} onRetry={onRetry ?? (() => onQueryChange(query))} />
      ) : (
        <FlatList bounces={false} overScrollMode="never"
          ref={list}
          data={items}
          // The room under the last row, above the foot of the sheet, is the list's own.
          contentContainerStyle={{ paddingBottom: foot }}
          keyExtractor={keyOf}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // A catalog is long, and what is in sight above the keyboard is a few rows: the first of them are drawn at
          // once and the rest as the list is scrolled. All of them at once kept the app busy for as long as it took to
          // draw them, with the sheet not yet shown.
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          ListFooterComponent={loadingMore ? <ActivityIndicator className="py-4" color={colors.primary} /> : undefined}
          // The keyboard covers the foot of the sheet: the list leaves room for it, so the last items can
          // be scrolled up above it.
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator className="py-10" color={colors.primary} />
            ) : trimmed || !emptyHint ? (
              <NoResults query={trimmed} />
            ) : (
              <Text className="px-page py-10 text-center text-[16.5px] text-muted">{emptyHint}</Text>
            )
          }
          renderItem={({ item }) => {
            if (isHeading?.(item)) return renderItem(item);
            const disabled = isDisabled?.(item) ?? false;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => onSelect(item)}
                className={`min-h-14 justify-center border-t border-line px-page py-3 active:bg-surface ${
                  selectedKey === keyOf(item) ? 'bg-primary-soft' : ''
                } ${disabled ? 'opacity-50' : ''}`}>
                {renderItem(item)}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

/**
 * A list to find one thing in, searched as you type, or to make a new one. It is a sheet of its own, with
 * the cursor in the search field from the start: the keyboard comes up over its foot and the sheet does not
 * move. A tap outside it closes it, like any other sheet.
 */
export default function SearchPicker<T>({ visible, onClose, title, ...body }: SearchPickerProps<T>) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} tall scroll={false}>
      <PickerBody {...body} />
    </Sheet>
  );
}
