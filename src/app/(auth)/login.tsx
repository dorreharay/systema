import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import AuthLink from '@/components/auth-link';
import AuthSwitch from '@/components/auth-switch';
import Button from '@/components/button';
import TextField, { type TextFieldRef } from '@/components/text-field';
import { validateEmail, validateRequiredPassword } from '@/lib/validation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const passwordRef = useRef<TextFieldRef>(null);

  const changeEmail = (value: string) => {
    setEmail(value);
    setErrors((current) => ({ ...current, email: undefined }));
  };

  const changePassword = (value: string) => {
    setPassword(value);
    setErrors((current) => ({ ...current, password: undefined }));
  };

  const submit = () => {
    const next = { email: validateEmail(email), password: validateRequiredPassword(password) };
    setErrors(next);
    if (next.email || next.password) {
      return;
    }
    // The sign-in request goes here once the auth API exists.
  };

  return (
    <AuthLayout
      title="Давно не бачились!"
      subtitle="Введіть дані, щоб увійти до акаунта"
      backHref="/"
      centered
      footer={
        <AuthSwitch question="Немає акаунта?" action="Зареєструватися" href="/register" replace />
      }>
      <View className="gap-4">
        <TextField
          label="Email"
          value={email}
          onChangeText={changeEmail}
          error={errors.email}
          placeholder="name@example.com"
          autoCapitalize="none"
          autoComplete="username"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Пароль"
          value={password}
          onChangeText={changePassword}
          error={errors.password}
          placeholder="••••••••••"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        <View className="-mt-2 items-end">
          <AuthLink href="/forgot-password" prefetch asChild>
            <Pressable
              accessibilityRole="link"
              hitSlop={8}
              className="min-h-10 justify-center active:opacity-70">
              <Text className="font-medium text-white/80">Забули пароль?</Text>
            </Pressable>
          </AuthLink>
        </View>
        <View className="pt-4">
          <Button title="Увійти" onPress={submit} />
        </View>
      </View>
    </AuthLayout>
  );
}
