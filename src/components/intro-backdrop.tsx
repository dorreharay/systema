import { Image } from 'expo-image';
import { useEffect } from 'react';
import { View } from 'react-native';
import { styled } from 'react-native-css';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const BackdropImage = styled(Image);

// Photo behind the intro title, slowly zooming so it feels like video.
export default function IntroBackdrop() {
  const zoom = useSharedValue(1);

  useEffect(() => {
    zoom.set(
      withRepeat(withTiming(1.12, { duration: 12000, easing: Easing.inOut(Easing.quad) }), -1, true)
    );
  }, [zoom]);

  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.get() }] }));

  return (
    <View className="absolute inset-0 overflow-hidden bg-[#070d0a]">
      <Animated.View className="absolute inset-0" style={zoomStyle}>
        <BackdropImage
          source={require('@/assets/images/1.jpg')}
          contentFit="cover"
          className="absolute inset-0"
        />
      </Animated.View>
      <View className="absolute inset-0 bg-black/45" />
    </View>
  );
}
