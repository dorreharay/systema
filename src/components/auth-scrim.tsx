import { View } from 'react-native';

// The dark bottom of the photo, behind every sign-in screen. The shade over the upper part belongs to each form's own
// screen (see AuthLayout): it must go with the screen when the stack's back swipe moves it away.
export default function AuthScrim() {
  return (
    <View className="absolute inset-0">
      <View className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-b from-transparent via-black/80 to-black" />
    </View>
  );
}
