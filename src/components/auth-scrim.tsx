import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// Longer than the screens' own fade, so the shade settles after the content has changed.
const SCRIM_DURATION = 600;

// The shade over the photo lives here instead of inside each screen. The screens fade in and out
// with the stack, which would make their shade vanish with them. The dark bottom stays on every
// screen; only the shade over the upper part fades in for the forms and out for the welcome
// screen.
export default function AuthScrim() {
  const onWelcome = usePathname() === '/';
  const form = useSharedValue(onWelcome ? 0 : 1);

  useEffect(() => {
    form.set(
      withTiming(onWelcome ? 0 : 1, {
        duration: SCRIM_DURATION,
        easing: Easing.inOut(Easing.quad),
      })
    );
  }, [onWelcome, form]);

  const formStyle = useAnimatedStyle(() => ({ opacity: form.get() }));

  return (
    <View className="absolute inset-0">
      <Animated.View
        className="absolute inset-0 bg-linear-to-b from-black/40 via-black/80 to-transparent"
        style={formStyle}
      />
      <View className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-b from-transparent via-black/80 to-black" />
    </View>
  );
}
