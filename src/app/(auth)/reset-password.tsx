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
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import {
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
  validatePasswordConfirmation,
} from '@/lib/validation';

function ResetPasswordForm() {
  const { t } = useI18n();
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
    const keys = {
      password: validateNewPassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation),
    };
    setErrors({
      password: keys.password && t(keys.password, { min: MIN_PASSWORD_LENGTH }),
      confirmation: keys.confirmation && t(keys.confirmation),
    });
    setFormError(undefined);
    if (keys.password || keys.confirmation) {
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token ?? '', password);
      replace({ pathname: '/login', params: { reset: '1' } });
    } catch (failure) {
      setFormError(describeError(failure, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="gap-4">
      <TextField
        label={t('field_new_password')}
        value={password}
        onChangeText={changePassword}
        error={errors.password}
        placeholder={t('password_placeholder_min', { min: MIN_PASSWORD_LENGTH })}
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
        label={t('field_confirm_password')}
        value={confirmation}
        onChangeText={changeConfirmation}
        error={errors.confirmation}
        placeholder={t('confirm_password_placeholder')}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {formError ? <FormMessage message={formError} /> : null}
      <View className="pt-4">
        <Button title={t('change_password')} onPress={submit} loading={submitting} />
      </View>
    </View>
  );
}

// Opened from the link in the password reset email: /reset-password?token=...
export default function ResetPassword() {
  const { t } = useI18n();
  return (
    <AuthLayout
      title={t('reset_title')}
      subtitle={t('reset_subtitle')}
      centered
      footer={<AuthSwitch question={t('reset_failed')} action={t('reset_request_new')} href="/forgot-password" replace />}>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
