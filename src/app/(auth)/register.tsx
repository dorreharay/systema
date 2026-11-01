import { useRef, useState } from 'react';
import { View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import AuthSwitch from '@/components/auth-switch';
import Button from '@/components/button';
import FormMessage from '@/components/form-message';
import TextField, { type TextFieldRef } from '@/components/text-field';
import { useAuth } from '@/lib/auth';
import { describeAuthError, isApiError } from '@/lib/auth-errors';
import {
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validateNewPassword,
  validatePasswordConfirmation,
} from '@/lib/validation';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmation?: string;
  }>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextFieldRef>(null);
  const confirmationRef = useRef<TextFieldRef>(null);
  const { signUp } = useAuth();

  const changeEmail = (value: string) => {
    setEmail(value);
    setErrors((current) => ({ ...current, email: undefined }));
  };

  const changePassword = (value: string) => {
    setPassword(value);
    setErrors((current) => ({ ...current, password: undefined }));
  };

  const changeConfirmation = (value: string) => {
    setConfirmation(value);
    setErrors((current) => ({ ...current, confirmation: undefined }));
  };

  const submit = async () => {
    if (submitting) {
      return;
    }
    const next = {
      email: validateEmail(email),
      password: validateNewPassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation),
    };
    setErrors(next);
    setFormError(undefined);
    if (next.email || next.password || next.confirmation) {
      return;
    }

    setSubmitting(true);
    try {
      // The account is created and signed in at once; the root layout then moves to the app.
      await signUp(email.trim(), password);
    } catch (error) {
      if (isApiError(error, 'email_taken')) {
        setErrors((current) => ({ ...current, email: describeAuthError(error) }));
      } else {
        setFormError(describeAuthError(error));
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Реєстрація"
      subtitle="Створіть акаунт, щоб почати"
      backHref="/"
      centered
      footer={<AuthSwitch question="Вже є акаунт?" action="Увійти" href="/login" replace />}>
      <View className="gap-4">
        <TextField
          label="Email"
          value={email}
          onChangeText={changeEmail}
          error={errors.email}
          placeholder="name@example.com"
          autoCapitalize="none"
          autoComplete="username-new"
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
          placeholder={`Мінімум ${MIN_PASSWORD_LENGTH} символів`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmationRef.current?.focus()}
        />
        <TextField
          ref={confirmationRef}
          label="Підтвердіть пароль"
          value={confirmation}
          onChangeText={changeConfirmation}
          error={errors.confirmation}
          placeholder="Повторіть пароль"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        {formError ? <FormMessage message={formError} /> : null}
        <View className="pt-4">
          <Button title="Зареєструватися" onPress={submit} loading={submitting} />
        </View>
      </View>
    </AuthLayout>
  );
}
