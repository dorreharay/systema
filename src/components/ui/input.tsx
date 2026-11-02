import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@/components/ui/colors';
import { OPEN_MS, useRevealInSheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

export type InputRef = ComponentRef<typeof TextInput>;

type InputProps = TextInputProps & {
  ref?: Ref<InputRef>;
  label?: string;
  error?: string;
  hint?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  className?: string;
};

/** A label, a field 48 pt tall (taller for several lines), and the reason it was refused, if it was. */
export function Input({
  ref,
  label,
  error,
  hint,
  prefix,
  suffix,
  multiline,
  className = '',
  onFocus,
  onBlur,
  editable = true,
  autoFocus,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<InputRef | null>(null);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const reveal = useRevealInSheet();

  // The parent's ref (to move to the next field) and this component's own.
  const setRefs = (node: InputRef | null) => {
    inputRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  // The field that is to have the cursor from the start gets it once the sheet it is in has come up. Asked
  // for sooner, the keyboard comes while the sheet is still moving, and the scroll view, seeing the field
  // lower than it will be, scrolls it away.
  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => inputRef.current?.focus(), OPEN_MS + 60);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  return (
    <View ref={rootRef} collapsable={false} className={`gap-1.5 ${className}`}>
      {label ? <Text className="text-[14.3px] font-medium text-muted">{label}</Text> : null}
      <View
        className={`flex-row rounded-lg border bg-white px-3.5 ${
          multiline ? 'min-h-24 items-start' : 'min-h-12 items-center'
        } ${error ? 'border-danger' : focused ? 'border-primary' : 'border-line'} ${
          editable ? '' : 'bg-surface'
        }`}>
        {prefix ? <View className="mr-2 ios:pb-1">{prefix}</View> : null}
        <TextInput
          ref={setRefs}
          multiline={multiline}
          editable={editable}
          accessibilityLabel={label}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.primary}
          textAlignVertical={multiline ? 'top' : 'center'}
          className={`min-w-0 flex-1 font-normal text-base text-ink outline-none ${
            multiline ? 'min-h-24 py-3' : 'py-3 ios:pb-3.5 ios:pt-2.5'
          }`}
          onFocus={(event) => {
            setFocused(true);
            // The label, the field and what is said under it: all of it is brought into sight.
            reveal?.(rootRef.current);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...props}
        />
        {suffix ? <View className="ml-2 ios:pb-1">{suffix}</View> : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-xs text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-xs text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}

type NumberInputProps = Omit<InputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (value: string) => void;
};

/** Digits with a decimal point (or comma), on the numeric keyboard: tension and prices. */
export function NumberInput({ onChangeText, ...props }: NumberInputProps) {
  return (
    <Input
      keyboardType="decimal-pad"
      inputMode="decimal"
      onChangeText={(text) => onChangeText(text.replace(/[^0-9.,]/g, ''))}
      {...props}
    />
  );
}

/** A sentence about the whole form: the server refused it, or nothing could be reached. */
export function FormError({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" className="rounded-xl bg-red-50 px-3.5 py-3">
      <Text className="text-[15.4px] text-danger">{message}</Text>
    </View>
  );
}
