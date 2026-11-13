import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@/components/ui/colors';
import { FIELD_INPUT_TEXT, FIELD_TEXT_LIFT } from '@/components/ui/field-text';
import { useRevealInSheet, useSheetOpened } from '@/components/ui/sheet';
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
  value,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);
  // A field with nothing in it yet is grey, and turns white once there is something; one that cannot be edited is grey too.
  const filled = editable && `${value ?? ''}`.length > 0;
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

  // The field that is to have the cursor from the start gets it once the sheet it is in has come up. Asked for sooner, the
  // keyboard comes while the sheet is still moving, and the scroll view, seeing the field lower than it will be, scrolls
  // it away. It is the end of the slide that is waited for, not a time: the first keyboard of the app takes the system a
  // good part of a second, and a time that was enough for the slide would then fall in the middle of it.
  const opened = useSheetOpened();
  useEffect(() => {
    if (!autoFocus || !opened) return;
    inputRef.current?.focus();
  }, [autoFocus, opened]);

  return (
    <View ref={rootRef} collapsable={false} className={`gap-1.5 ${className}`}>
      {label ? <Text className="text-[14.3px] font-medium text-muted">{label}</Text> : null}
      <View
        className={`flex-row rounded-lg border px-3.5 ${filled ? 'bg-white' : 'bg-surface'} ${
          multiline ? 'min-h-24 items-start' : 'min-h-12 items-center'
        } ${error ? 'border-danger' : focused ? 'border-primary' : 'border-line'}`}>
        {prefix ? <View className={`mr-2 ${FIELD_TEXT_LIFT}`}>{prefix}</View> : null}
        <TextInput
          ref={setRefs}
          multiline={multiline}
          editable={editable}
          value={value}
          accessibilityLabel={label}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.primary}
          textAlignVertical={multiline ? 'top' : 'center'}
          className={`min-w-0 flex-1 font-normal text-ink outline-none ${
            multiline ? 'min-h-24 py-3 text-base' : FIELD_INPUT_TEXT
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
        {suffix ? <View className={`ml-2 ${FIELD_TEXT_LIFT}`}>{suffix}</View> : null}
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
