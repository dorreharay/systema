import { Image } from 'expo-image';
import { View } from 'react-native';
import { styled } from 'react-native-css';

const BackgroundImage = styled(Image);

// Full-screen photo behind the login and register screens, with a soft shade at the top so
// the logo stays readable.
export default function AuthBackground() {
  return (
    <View className="absolute inset-0 overflow-hidden bg-[#0b1210]">
      <BackgroundImage
        source={require('@/assets/images/1.jpg')}
        contentFit="cover"
        className="absolute inset-0"
      />
      <View className="absolute inset-x-0 top-0 h-48 bg-linear-to-b from-black/60 to-transparent" />
    </View>
  );
}
