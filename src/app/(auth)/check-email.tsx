import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import AuthLink from '@/components/auth-link';
import Button from '@/components/button';
import FormMessage from '@/components/form-message';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

function ResendRow({ email }: { email?: string }) {
  const { t } = useI18n();
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
      setError(describeError(failure, t));
    } finally {
      setSending(false);
    }
  }

  return (
    <View className="items-center">
      <View className="min-h-12 flex-row items-center justify-center">
        <Text className="font-normal text-white/80">
          {resent ? t('resend_done') : t('resend_question')}
        </Text>
        {resent || !email ? null : (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            disabled={sending}
            className="min-h-12 justify-center px-2.5 active:opacity-70"
            onPress={resend}>
            <Text className="font-medium text-white">
              {sending ? t('resend_sending') : t('resend_action')}
            </Text>
          </Pressable>
        )}
      </View>
      {error ? <FormMessage message={error} /> : null}
    </View>
  );
}

export default function CheckEmail() {
  const { t } = useI18n();
  const { email } = useLocalSearchParams<{ email?: string }>();

  return (
    <AuthLayout
      title={t('check_email_title')}
      subtitle={t('check_email_subtitle', { email: email || t('check_email_your') })}
      backHref="/login"
      centered
      footer={<ResendRow email={email} />}>
      <AuthLink href="/login" dismissTo asChild>
        <Button title={t('back_to_sign_in')} />
      </AuthLink>
    </AuthLayout>
  );
}
