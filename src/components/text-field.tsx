import { BlurView } from 'expo-blur';
import type { ComponentProps, ComponentRef, Ref } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { TextInputKeyPressEvent } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native';
import { styled } from 'react-native-css';

import { Eye, EyeOff } from '@/components/icons';
import { useI18n } from '@/lib/i18n';

const FieldBlur = styled(BlurView);

export type TextFieldRef = ComponentRef<typeof TextInput>;

type TextFieldProps = ComponentProps<typeof TextInput> & {
  ref?: Ref<TextFieldRef>;
  label: string;
  error?: string;
};

// The field is frosted glass: the photo behind it is blurred and lightened a little, and the
// border shows the focus and error states. A password field has an eye at the right that shows
// what was typed.
export default function TextField({
  ref,
  label,
  error,
  onFocus,
  onBlur,
  onChangeText,
  onKeyPress,
  value,
  secureTextEntry,
  ...props
}: TextFieldProps) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isPassword = !!secureTextEntry;
  const inputRef = useRef<TextFieldRef | null>(null);
  const refocus = useRef(false);
  // What the field held when it was hidden again, and the last key pressed (see handleChangeText).
  const securedWith = useRef<string | null>(null);
  const lastKey = useRef('');

  // The parent's ref (to move to the next field) and this component's own.
  const setRefs = (node: TextFieldRef | null) => {
    inputRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  // iOS clears what was typed when a field becomes secure while it is being edited, on the next
  // key. So a field that has the keyboard leaves it, changes, and takes it back.
  const toggleRevealed = () => {
    securedWith.current = revealed && typeof value === 'string' ? value : null;
    lastKey.current = '';
    if (inputRef.current?.isFocused()) {
      refocus.current = true;
      inputRef.current.blur();
    }
    setRevealed((current) => !current);
  };

  const handleKeyPress = (event: TextInputKeyPressEvent) => {
    lastKey.current = event.nativeEvent.key;
    onKeyPress?.(event);
  };

  // That is not enough: the first key typed into the field that was hidden again still wipes the old text. iOS reports a
  // typed key as an empty text and then the key alone, a delete as an empty text only. What the field held when it was hidden
  // is kept, and put back in front of the key (or, for a delete, taken one character short). Longer text is a paste or an
  // autofill, and replaces the old as it should.
  const handleChangeText = (text: string) => {
    const before = securedWith.current;
    if (before === null) {
      onChangeText?.(text);
      return;
    }
    if (lastKey.current === 'Backspace') {
      securedWith.current = null;
      onChangeText?.(text === '' ? before.slice(0, -1) : text);
      return;
    }
    if (text === '') {
      return;
    }
    securedWith.current = null;
    onChangeText?.(text.length === 1 ? before + text : text);
  };

  useEffect(() => {
    if (refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  }, [revealed]);

  return (
    <View className="gap-1.5">
      <Text className="text-base font-medium text-white">{label}</Text>
      <View
        className={`h-14 overflow-hidden rounded-lg border ${
          error ? 'border-red-400' : focused ? 'border-white' : 'border-white/30'
        }`}>
        <FieldBlur
          intensity={40}
          tint="systemUltraThinMaterialDark"
          className="absolute inset-0"
        />
        <View className="absolute inset-0 bg-white/10" />
        <TextInput
          ref={setRefs}
          accessibilityLabel={label}
          placeholderTextColor="rgba(255, 255, 255, 0.55)"
          selectionColor="#ffffff"
          keyboardAppearance="dark"
          textAlignVertical="center"
          autoCorrect={false}
          spellCheck={false}
          // Lifted by 1.1 pt, as much as the fields of the app are for the size of its text (see field-text).
          className={`absolute inset-0 pl-4 ios:pb-[2.25px] text-[1.2375rem] font-normal text-white outline-none ${
            isPassword ? 'pr-12' : 'pr-4'
          }`}
          secureTextEntry={isPassword && !revealed}
          value={value}
          onChangeText={handleChangeText}
          onKeyPress={handleKeyPress}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...props}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('password_hide') : t('password_show')}
            hitSlop={8}
            className="absolute bottom-0 right-0 top-0 w-12 items-center justify-center active:opacity-60"
            onPress={toggleRevealed}>
            {revealed ? (
              <EyeOff size={20} color="rgba(255, 255, 255, 0.8)" />
            ) : (
              <Eye size={20} color="rgba(255, 255, 255, 0.8)" />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="text-[15.4px] text-red-300">{error}</Text> : null}
    </View>
  );
}
