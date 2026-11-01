import type { Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import AuthLink from '@/components/auth-link';

type AuthSwitchProps = {
  question: string;
  action: string;
  href: Href;
  replace?: boolean;
  // Goes back to the screen if it is already in the stack, instead of opening it again.
  dismissTo?: boolean;
};

// "Немає акаунта? Зареєструватися" row. The link has a tap area much larger than its text.
export default function AuthSwitch({ question, action, href, replace, dismissTo }: AuthSwitchProps) {
  return (
    <View className="flex-row items-center justify-center">
      <Text className="font-normal text-white/80">{question}</Text>
      <AuthLink href={href} replace={replace} dismissTo={dismissTo} prefetch asChild>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          className="min-h-12 justify-center px-2.5 active:opacity-70">
          <Text className="font-medium text-white">{action}</Text>
        </Pressable>
      </AuthLink>
    </View>
  );
}
