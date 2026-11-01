import { useRef, useState } from 'react';
import { View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
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
      title="Увійдіть або зареєструйте ваш новий акаунт"
      subtitle="Увійдіть, щоб продовжити"
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
        <View className="pt-4">
          <Button title="Увійти" onPress={submit} />
        </View>
      </View>
    </AuthLayout>
  );
}
