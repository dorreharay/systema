import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import Button from '@/components/button';
import { useAuth } from '@/lib/auth';

// The first screen after signing in. A placeholder until the app has something to show.
export default function Home() {
  const { user, signOut } = useAuth();

  return (
    <View className="flex-1 justify-center bg-primary px-6">
      <Animated.View entering={FadeIn.duration(400)} className="w-full max-w-sm gap-8 self-center">
        <View className="gap-2">
          <Text className="text-2xl font-semibold text-white">
            {user?.full_name ? `Вітаємо, ${user.full_name}!` : 'Вітаємо!'}
          </Text>
          <Text className="text-base text-white/80">Ви увійшли як {user?.email}</Text>
        </View>
        <Button variant="outline" title="Вийти" onPress={signOut} />
      </Animated.View>
    </View>
  );
}
