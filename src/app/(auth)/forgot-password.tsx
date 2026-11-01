import { useState } from 'react';
import { View } from 'react-native';

import { useAuthRouter } from '@/components/auth-leave';
import AuthLayout from '@/components/auth-layout';
import AuthSwitch from '@/components/auth-switch';
import Button from '@/components/button';
import TextField from '@/components/text-field';
import { validateEmail } from '@/lib/validation';

function ForgotPasswordForm() {
  const { replace } = useAuthRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();

  const changeEmail = (value: string) => {
    setEmail(value);
    setError(undefined);
  };

  const submit = () => {
    const next = validateEmail(email);
    setError(next);
    if (next) {
      return;
    }
    // The reset request goes here once the auth API exists.
    replace({ pathname: '/check-email', params: { email: email.trim() } });
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
      <View className="pt-4">
        <Button title="Надіслати посилання" onPress={submit} />
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
