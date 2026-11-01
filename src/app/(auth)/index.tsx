import { Mail } from 'lucide-react-native';
import { View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import AuthLink from '@/components/auth-link';
import AuthSwitch from '@/components/auth-switch';
import Button from '@/components/button';
import GoogleButton from '@/components/google-button';

export default function Welcome() {
  return (
    <AuthLayout
      title="Увійдіть або зареєструйте ваш новий акаунт"
      subtitle="Доступ до обліку та продвинутої аналітики"
      footer={<AuthSwitch question="Немає акаунта?" action="Зареєструватися" href="/register" />}>
      <View className="gap-3">
        <GoogleButton />
        <AuthLink href="/login" prefetch asChild>
          <Button variant="outline" title="Увійти за допомогою email" icon={<Mail size={20} color="#ffffff" />} />
        </AuthLink>
      </View>
    </AuthLayout>
  );
}
