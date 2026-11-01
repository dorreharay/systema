import { useRef, useState } from 'react';
import { View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import AuthSwitch from '@/components/auth-switch';
import Button from '@/components/button';
import FormMessage from '@/components/form-message';
import TextField, { type TextFieldRef } from '@/components/text-field';
import { useAuth } from '@/lib/auth';
import { describeError, isApiError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import {
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validateNewPassword,
  validatePasswordConfirmation,
} from '@/lib/validation';

export default function Register() {
  const { t } = useI18n();
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
    const keys = {
      email: validateEmail(email),
      password: validateNewPassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation),
    };
    setErrors({
      email: keys.email && t(keys.email),
      password: keys.password && t(keys.password, { min: MIN_PASSWORD_LENGTH }),
      confirmation: keys.confirmation && t(keys.confirmation),
    });
    setFormError(undefined);
    if (keys.email || keys.password || keys.confirmation) {
      return;
    }

    setSubmitting(true);
    try {
      // The account is created and signed in at once; the root layout then moves to the app.
      await signUp(email.trim(), password);
    } catch (error) {
      if (isApiError(error, 'email_taken')) {
        setErrors((current) => ({ ...current, email: describeError(error, t) }));
      } else {
        setFormError(describeError(error, t));
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={t('register_title')}
      subtitle={t('register_subtitle')}
      backHref="/"
      centered
      footer={<AuthSwitch question={t('auth_have_account')} action={t('sign_in')} href="/login" replace />}>
      <View className="gap-4">
        <TextField
          label={t('field_email')}
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
          label={t('field_password')}
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
          <Button title={t('create_account')} onPress={submit} loading={submitting} />
        </View>
      </View>
    </AuthLayout>
  );
}
