import { Plus, Search, X } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';

import { colors } from '@/components/ui/colors';
import Sheet from '@/components/ui/sheet';
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
};

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
}: Omit<SearchPickerProps<T>, 'visible' | 'onClose' | 'title'>) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => onQueryChange(query), query ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [query, onQueryChange]);

  // The next time the sheet opens it starts from the whole list.
  useEffect(() => () => onQueryChange(''), [onQueryChange]);

  const trimmed = query.trim();

  return (
    <View className="flex-1">
      <View className="px-page pb-3">
        <View className="min-h-12 flex-row items-center gap-2 rounded-xl border border-line bg-surface px-3.5">
          <Search size={18} color={colors.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.primary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={placeholder}
            className="min-w-0 flex-1 py-3 font-normal text-base text-ink outline-none"
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
          <Text className="flex-1 text-base font-medium text-primary" numberOfLines={2}>
            {createLabel ? createLabel(trimmed) : t('create_new')}
          </Text>
        </Pressable>
      ) : null}

      {error && items.length === 0 ? (
        <ErrorState error={error} onRetry={onRetry ?? (() => onQueryChange(query))} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyOf}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator className="py-10" color={colors.primary} />
            ) : trimmed || !emptyHint ? (
              <NoResults query={trimmed} />
            ) : (
              <Text className="px-page py-10 text-center text-[15px] text-muted">{emptyHint}</Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelect(item)}
              className={`min-h-14 justify-center border-t border-line px-page py-3 active:bg-surface ${
                selectedKey === keyOf(item) ? 'bg-primary-soft' : ''
              }`}>
              {renderItem(item)}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

/** A sheet to find one thing in a list that is searched as you type, or to make a new one. */
export default function SearchPicker<T>({ visible, onClose, title, ...body }: SearchPickerProps<T>) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} tall scroll={false}>
      <PickerBody {...body} />
    </Sheet>
  );
}
