import { useEffect, useRef, type ComponentRef } from 'react';
import { Pressable, View } from 'react-native';

import { useRevealInSheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';

// How long what is typed has to hold still before the reference list is asked about it.
export const SUGGEST_DELAY_MS = 250;
// How many names are shown at most: a few, so that the form under them stays in sight.
export const SUGGESTIONS_SHOWN = 3;

export type Suggestion = {
  key: string;
  title: string;
  // What is said at the end of the row, in the muted text: the type of a string.
  detail?: string;
};

type SuggestionsProps = {
  items: Suggestion[];
  onPick: (key: string) => void;
  // The names are looked up at the server, and there is no connection: the field is typed in as it is.
  offline?: boolean;
};

/**
 * What the reference list has for what is being typed in a form: a few names to tap, which fill the form in. It
 * stands under the field and shows nothing when there is nothing to offer. In a sheet it is brought into sight
 * above the keyboard when it appears.
 */
export function Suggestions({ items, onPick, offline }: SuggestionsProps) {
  const { t } = useI18n();
  const reveal = useRevealInSheet();
  const block = useRef<ComponentRef<typeof View>>(null);
  const count = items.length;

  useEffect(() => {
    if (count > 0) reveal?.(block.current);
  }, [count, reveal]);

  if (offline) return <Text className="text-[14.3px] text-muted">{t('reference_offline')}</Text>;
  if (count === 0) return null;

  return (
    <View ref={block} collapsable={false} className="overflow-hidden rounded-lg border border-line bg-white">
      {items.map((item, index) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          onPress={() => onPick(item.key)}
          className={`min-h-11 flex-row items-center gap-3 px-3.5 py-2 hover:bg-surface active:bg-surface ${
            index > 0 ? 'border-t border-line' : ''
          }`}>
          <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-medium">
            {item.title}
          </Text>
          {item.detail ? (
            <Text numberOfLines={1} className="text-[14.3px] text-muted">
              {item.detail}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
