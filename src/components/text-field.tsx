import type { ComponentProps, ComponentRef, Ref } from 'react';
import { Text, TextInput, View } from 'react-native';

export type TextFieldRef = ComponentRef<typeof TextInput>;

type TextFieldProps = ComponentProps<typeof TextInput> & {
  ref?: Ref<TextFieldRef>;
  label: string;
  error?: string;
};

export default function TextField({ label, error, ...props }: TextFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-base font-medium text-white">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="rgba(255, 255, 255, 0.65)"
        keyboardAppearance="dark"
        autoCorrect={false}
        spellCheck={false}
        className={`h-14 rounded-lg border bg-white/20 px-4 ios:pb-1 text-[1.125rem] font-normal text-white outline-none ${
          error ? 'border-red-400' : 'border-white/25 focus:border-white/80'
        }`}
        {...props}
      />
      {error ? <Text className="text-md text-red-300">{error}</Text> : null}
    </View>
  );
}
