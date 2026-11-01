import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import AuthLink from '@/components/auth-link';
import Button from '@/components/button';

function ResendRow() {
  const [resent, setResent] = useState(false);

  return (
    <View className="min-h-12 flex-row items-center justify-center">
      <Text className="font-normal text-white/80">
        {resent ? 'Лист надіслано повторно' : 'Не отримали лист?'}
      </Text>
      {resent ? null : (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          className="min-h-12 justify-center px-2.5 active:opacity-70"
          onPress={() => {
            // The resend request goes here once the auth API exists.
            setResent(true);
          }}>
          <Text className="font-medium text-white">Надіслати ще раз</Text>
        </Pressable>
      )}
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
      footer={<ResendRow />}>
      <AuthLink href="/login" dismissTo asChild>
        <Button title="Повернутися до входу" />
      </AuthLink>
    </AuthLayout>
  );
}
