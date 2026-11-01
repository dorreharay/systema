import { useState } from 'react';
import { View } from 'react-native';

import { useAuthRouter } from '@/components/auth-leave';
import AuthLayout from '@/components/auth-layout';
import AuthSwitch from '@/components/auth-switch';
import Button from '@/components/button';
import FormMessage from '@/components/form-message';
import TextField from '@/components/text-field';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { validateEmail } from '@/lib/validation';

function ForgotPasswordForm() {
  const { t } = useI18n();
  const { replace } = useAuthRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const { requestPasswordReset } = useAuth();

  const changeEmail = (value: string) => {
    setEmail(value);
    setError(undefined);
  };

  const submit = async () => {
    if (submitting) {
      return;
    }
    const key = validateEmail(email);
    setError(key && t(key));
    setFormError(undefined);
    if (key) {
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      replace({ pathname: '/check-email', params: { email: email.trim() } });
    } catch (failure) {
      setFormError(describeError(failure, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="gap-4">
      <TextField
        label={t('field_email')}
        value={email}
        onChangeText={changeEmail}
        error={error}
        placeholder="name@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      {formError ? <FormMessage message={formError} /> : null}
      <View className="pt-4">
        <Button title={t('send_reset_link')} onPress={submit} loading={submitting} />
      </View>
    </View>
  );
}

export default function ForgotPassword() {
  const { t } = useI18n();
  return (
    <AuthLayout
      title={t('forgot_title')}
      subtitle={t('forgot_subtitle')}
      backHref="/login"
      centered
      footer={<AuthSwitch question={t('auth_remembered')} action={t('sign_in')} href="/login" dismissTo />}>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
