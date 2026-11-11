import { useRef, type ComponentRef, type Ref } from 'react';
import { Pressable, TextInput, View, type TextInputKeyPressEvent } from 'react-native';

import { SearchOutline, X } from '@/components/icons';
import { colors } from '@/components/ui/colors';
import { SEARCH_INPUT_TEXT } from '@/components/ui/field-text';
import { SURFACE_EDGE } from '@/components/ui/paper';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';

export type SearchFieldRef = ComponentRef<typeof TextInput>;

type SearchFieldProps = {
  ref?: Ref<SearchFieldRef>;
  value: string;
  onChangeText: (text: string) => void;
  // What the field says while it is empty: what the list can be searched by. A screen reader calls the field that too.
  placeholder: string;
  // A key that takes the cursor to the field from anywhere on the page (the web's): drawn in the field while it is empty.
  hint?: string;
  // The field is as wide as the room it stands in; this is for what a page needs of it (a width, a margin).
  className?: string;
};

// A white field with ends as round as they can be (a pill), 55 pt tall. Like a card (see BLOCK_SHAPE in card.tsx), it runs out past the
// margin of the page and stops a gutter short of both edges of the screen (`-mx-bleed`, global.css), and what is in it starts where the
// text of a card does. On a wide page (`md:`), where a field is not a thing to touch, it stands inside the column, 48 pt tall.
const FRAME =
  '-mx-bleed min-h-[55px] flex-row items-center gap-3 rounded-full bg-white px-6 md:mx-0 md:min-h-12 md:px-5';
// Set apart from the page the way a card is: by the hairline border (SURFACE_EDGE), and not by a shadow.
//
// NOTHING on this field changes when it gets the cursor, and that is on purpose: the user does not want an outline on focus, and a
// class that came and went with the focus (a ring with `md:` classes in it, kept in a `focused` state) made the keyboard show on iOS
// and be taken away again a moment later (measured on the simulator, 2026-11-10: `keyboardDidShow` and 1 ms later
// `keyboardWillHide`, in 2 of 3 first taps). Do not put the focus in state here, and do not style it.
const EDGE = SURFACE_EDGE;

/**
 * The search field above a list: a white field with a thin magnifier and a grey placeholder, the same on every page. It filters
 * as it is typed (see `useSearch`), has a button to empty it once there is something in it, and takes Esc for that on a keyboard
 * (then, with nothing in it, to leave the field). The Search key of the phone's keyboard closes the keyboard, and the list stays
 * as it was filtered.
 */
export default function SearchField({ ref, value, onChangeText, placeholder, hint, className = '' }: SearchFieldProps) {
  const { t } = useI18n();
  const inputRef = useRef<SearchFieldRef | null>(null);

  // The parent's ref (the page that takes the cursor here on a key) and this component's own.
  const setRefs = (node: SearchFieldRef | null) => {
    inputRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  // The cursor stays in the field, so that a new search can be typed at once (and the keyboard of a phone stays up).
  const clear = () => {
    onChangeText('');
    inputRef.current?.focus();
  };

  const onKeyPress = (event: TextInputKeyPressEvent) => {
    if (event.nativeEvent.key !== 'Escape') return;
    if (value) onChangeText('');
    else inputRef.current?.blur();
  };

  return (
    <View className={`${FRAME} ${EDGE} ${className}`}>
      {/* A tap on the magnifier takes the cursor to the field, as it does on a phone's own search bars. */}
      <Pressable
        accessible={false}
        focusable={false}
        onPress={() => inputRef.current?.focus()}>
        <SearchOutline size={20} strokeWidth={1.75} color={colors.muted} />
      </Pressable>
      <TextInput
        ref={setRefs}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.primary}
        accessibilityLabel={placeholder}
        role="searchbox"
        // What is typed is the name of a client or a racket, not a sentence: no capitals, no corrections, nothing offered from before.
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        // The key of the keyboard says "Search" (on the web, `enterkeyhint`), and closes the keyboard.
        returnKeyType="search"
        textAlignVertical="center"
        onKeyPress={onKeyPress}
        // As tall as the field, so that all of it is the input (a tap anywhere in the pill puts the cursor in it).
        className={`min-w-0 flex-1 self-stretch font-normal text-ink outline-none ${SEARCH_INPUT_TEXT}`}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('clear')}
          hitSlop={10}
          onPress={clear}
          style={{ backgroundColor: colors.placeholder }}
          className="size-5 items-center justify-center rounded-full hover:opacity-80 active:opacity-60">
          <X size={10} color={colors.white} />
        </Pressable>
      ) : hint ? (
        <View className="h-6 min-w-6 items-center justify-center rounded-md bg-surface px-1.5">
          <Text className="text-[12px] font-medium text-muted">{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}
