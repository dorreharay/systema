import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import { useAuthRouter } from '@/components/auth-leave';
import AuthSwitch from '@/components/auth-switch';
import Button from '@/components/button';
import FormMessage from '@/components/form-message';
import TextField, { type TextFieldRef } from '@/components/text-field';
import { useAuth } from '@/lib/auth';
import { describeAuthError } from '@/lib/auth-errors';
import {
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
  validatePasswordConfirmation,
} from '@/lib/validation';

function ResetPasswordForm() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { replace } = useAuthRouter();
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const confirmationRef = useRef<TextFieldRef>(null);

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
      password: validateNewPassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation),
    };
    setErrors(next);
    setFormError(undefined);
    if (next.password || next.confirmation) {
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token ?? '', password);
      replace({ pathname: '/login', params: { reset: '1' } });
    } catch (failure) {
      setFormError(describeAuthError(failure));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="gap-4">
      <TextField
        label="Новий пароль"
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
        <Button title="Змінити пароль" onPress={submit} loading={submitting} />
      </View>
    </View>
  );
}

// Opened from the link in the password reset email: /reset-password?token=...
export default function ResetPassword() {
  return (
    <AuthLayout
      title="Новий пароль"
      subtitle="Придумайте пароль, яким будете входити"
      centered
      footer={<AuthSwitch question="Не вдалося?" action="Запросити нове посилання" href="/forgot-password" replace />}>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
