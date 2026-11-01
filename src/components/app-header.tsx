import { useEffect, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import IntroBackdrop from '@/components/intro-backdrop';

const TITLE = 're:string';
export const HEADER_HEIGHT = 64;
const HEADER_FONT_SIZE = 24;
const INTRO_TEXT_COLOR = '#ffffff';
const HEADER_TEXT_COLOR = '#ffffff';

const START_DELAY_MS = 400;
const CHAR_MS = 87;
const HOLD_MS = 600;
const DOCK_MS = 667;

// Types the title over a dark photo backdrop, then shrinks it into the page header.
export default function AppHeader() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [typed, setTyped] = useState(0);
  const [docked, setDocked] = useState(false);
  const [introGone, setIntroGone] = useState(false);
  const progress = useSharedValue(0);

  const introFontSize = Math.min(72, width * 0.14);
  const targetScale = HEADER_FONT_SIZE / introFontSize;
  const targetY = insets.top + HEADER_HEIGHT / 2 - height / 2;

  useEffect(() => {
    let typing: ReturnType<typeof setInterval> | undefined;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const start = setTimeout(() => {
      let count = 0;
      typing = setInterval(() => {
        count += 1;
        setTyped(count);
        if (count === TITLE.length) {
          clearInterval(typing);
          hold = setTimeout(() => setDocked(true), HOLD_MS);
        }
      }, CHAR_MS);
    }, START_DELAY_MS);
    return () => {
      clearTimeout(start);
      clearInterval(typing);
      clearTimeout(hold);
    };
  }, []);

  useEffect(() => {
    if (!docked) {
      return;
    }
    progress.set(withTiming(1, { duration: DOCK_MS, easing: Easing.inOut(Easing.cubic) }));
    const gone = setTimeout(() => setIntroGone(true), DOCK_MS);
    return () => clearTimeout(gone);
  }, [docked, progress]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.75], [1, 0], Extrapolation.CLAMP),
  }));

  const titleStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      color: interpolateColor(p, [0.4, 0.8], [INTRO_TEXT_COLOR, HEADER_TEXT_COLOR]),
      transform: [
        { translateY: interpolate(p, [0, 1], [0, targetY]) },
        { scale: interpolate(p, [0, 1], [1, targetScale]) },
      ],
    };
  });

  // The untyped rest stays in the layout, transparent, so the title does not shift
  // while it is typed.
  return (
    <>
      <View className="pointer-events-none absolute inset-0 z-10 items-center justify-center">
        {!introGone && (
          <Animated.View className="absolute inset-0" style={backdropStyle}>
            <IntroBackdrop />
          </Animated.View>
        )}
        <Animated.Text
          accessibilityRole="header"
          accessibilityLabel={TITLE}
          numberOfLines={1}
          className="text-center tracking-[-1px]"
          style={[
            { fontFamily: 'FixelStylistic-Bold', fontSize: introFontSize, includeFontPadding: false },
            titleStyle,
          ]}>
          {TITLE.slice(0, typed)}
          <Text className="text-transparent">{TITLE.slice(typed)}</Text>
        </Animated.Text>
      </View>
    </>
  );
}
