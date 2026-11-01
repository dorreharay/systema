import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import AuthLink from '@/components/auth-link';
import AuthSwitch from '@/components/auth-switch';
import Button from '@/components/button';
import FormMessage from '@/components/form-message';
import TextField, { type TextFieldRef } from '@/components/text-field';
import { useAuth } from '@/lib/auth';
import { describeAuthError } from '@/lib/auth-errors';
import { validateEmail, validateRequiredPassword } from '@/lib/validation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextFieldRef>(null);
  const { signIn } = useAuth();
  // The password reset screen sends people here with ?reset=1 once the new password is saved.
  const { reset } = useLocalSearchParams<{ reset?: string }>();

  const changeEmail = (value: string) => {
    setEmail(value);
    setErrors((current) => ({ ...current, email: undefined }));
  };

  const changePassword = (value: string) => {
    setPassword(value);
    setErrors((current) => ({ ...current, password: undefined }));
  };

  const submit = async () => {
    if (submitting) {
      return;
    }
    const next = { email: validateEmail(email), password: validateRequiredPassword(password) };
    setErrors(next);
    setFormError(undefined);
    if (next.email || next.password) {
      return;
    }

    setSubmitting(true);
    try {
      // On success the root layout moves a signed-in user to the app: nothing to navigate to here.
      await signIn(email.trim(), password);
    } catch (error) {
      setFormError(describeAuthError(error));
      setSubmitting(false);
    }
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
        {reset === '1' ? (
          <FormMessage tone="success" message="Пароль змінено. Увійдіть з новим паролем." />
        ) : null}
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
        {formError ? <FormMessage message={formError} /> : null}
        <View className="pt-4">
          <Button title="Увійти" onPress={submit} loading={submitting} />
        </View>
      </View>
    </AuthLayout>
  );
}
