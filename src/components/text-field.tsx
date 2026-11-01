import { BlurView } from 'expo-blur';
import type { ComponentProps, ComponentRef, Ref } from 'react';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { styled } from 'react-native-css';

const FieldBlur = styled(BlurView);

export type TextFieldRef = ComponentRef<typeof TextInput>;

type TextFieldProps = ComponentProps<typeof TextInput> & {
  ref?: Ref<TextFieldRef>;
  label: string;
  error?: string;
};

// The field is frosted glass: the photo behind it is blurred and lightened a little, and the
// border shows the focus and error states.
export default function TextField({ label, error, onFocus, onBlur, ...props }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

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
          accessibilityLabel={label}
          placeholderTextColor="rgba(255, 255, 255, 0.55)"
          selectionColor="#ffffff"
          keyboardAppearance="dark"
          autoCorrect={false}
          spellCheck={false}
          className="absolute inset-0 px-4 ios:pb-1 text-[1.125rem] font-normal text-white outline-none"
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
      </View>
      {error ? <Text className="text-md text-red-300">{error}</Text> : null}
    </View>
  );
}
