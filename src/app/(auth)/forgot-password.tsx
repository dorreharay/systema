import { useState } from 'react';
import { View } from 'react-native';

import { useAuthRouter } from '@/components/auth-leave';
import AuthLayout from '@/components/auth-layout';
import AuthSwitch from '@/components/auth-switch';
import Button from '@/components/button';
import FormMessage from '@/components/form-message';
import TextField from '@/components/text-field';
import { useAuth } from '@/lib/auth';
import { describeAuthError } from '@/lib/auth-errors';
import { validateEmail } from '@/lib/validation';

function ForgotPasswordForm() {
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
    const next = validateEmail(email);
    setError(next);
    setFormError(undefined);
    if (next) {
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      replace({ pathname: '/check-email', params: { email: email.trim() } });
    } catch (failure) {
      setFormError(describeAuthError(failure));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="gap-4">
      <TextField
        label="Email"
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
        <Button title="Надіслати посилання" onPress={submit} loading={submitting} />
      </View>
    </View>
  );
}

export default function ForgotPassword() {
  return (
    <AuthLayout
      title="Забули пароль?"
      subtitle="Надішлемо вам посилання для зміни пароля"
      backHref="/login"
      centered
      footer={<AuthSwitch question="Згадали пароль?" action="Увійти" href="/login" dismissTo />}>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
