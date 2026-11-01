import { BlurView } from 'expo-blur';
import type { ComponentProps, ComponentRef, Ref } from 'react';
import { Eye, EyeOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { styled } from 'react-native-css';

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
  secureTextEntry,
  ...props
}: TextFieldProps) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isPassword = !!secureTextEntry;
  const inputRef = useRef<TextFieldRef | null>(null);
  const refocus = useRef(false);

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
    if (inputRef.current?.isFocused()) {
      refocus.current = true;
      inputRef.current.blur();
    }
    setRevealed((value) => !value);
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
          autoCorrect={false}
          spellCheck={false}
          className={`absolute inset-0 pl-4 ios:pb-1 text-[1.125rem] font-normal text-white outline-none ${
            isPassword ? 'pr-12' : 'pr-4'
          }`}
          secureTextEntry={isPassword && !revealed}
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
      {error ? <Text className="text-md text-red-300">{error}</Text> : null}
    </View>
  );
}
