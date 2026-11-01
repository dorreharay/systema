import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import AuthLink from '@/components/auth-link';
import Button from '@/components/button';
import FormMessage from '@/components/form-message';
import { useAuth } from '@/lib/auth';
import { describeAuthError } from '@/lib/auth-errors';

function ResendRow({ email }: { email?: string }) {
  const { requestPasswordReset } = useAuth();
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  async function resend() {
    if (!email || sending) {
      return;
    }
    setSending(true);
    setError(undefined);
    try {
      await requestPasswordReset(email);
      setResent(true);
    } catch (failure) {
      setError(describeAuthError(failure));
    } finally {
      setSending(false);
    }
  }

  return (
    <View className="items-center">
      <View className="min-h-12 flex-row items-center justify-center">
        <Text className="font-normal text-white/80">
          {resent ? 'Лист надіслано повторно' : 'Не отримали лист?'}
        </Text>
        {resent || !email ? null : (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            disabled={sending}
            className="min-h-12 justify-center px-2.5 active:opacity-70"
            onPress={resend}>
            <Text className="font-medium text-white">
              {sending ? 'Надсилаємо…' : 'Надіслати ще раз'}
            </Text>
          </Pressable>
        )}
      </View>
      {error ? <FormMessage message={error} /> : null}
    </View>
  );
}

export default function CheckEmail() {
  const { email } = useLocalSearchParams<{ email?: string }>();

  return (
    <AuthLayout
      title="Перевірте пошту"
      subtitle={`Ми надіслали посилання для відновлення пароля на ${email || 'вашу пошту'}`}
      backHref="/login"
      centered
      footer={<ResendRow email={email} />}>
      <AuthLink href="/login" dismissTo asChild>
        <Button title="Повернутися до входу" />
      </AuthLink>
    </AuthLayout>
  );
}
