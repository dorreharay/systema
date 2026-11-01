import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { styled } from 'react-native-css';
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
import { useAuth } from '@/lib/auth';

const HeaderBlur = styled(BlurView);

const TITLE = 're:string';
// The title is typed out once per launch, signed in or not. If the header is mounted again it is already docked.
let introPlayed = false;
export const HEADER_HEIGHT = 64;
const HEADER_FONT_SIZE = 24;
const INTRO_TEXT_COLOR = '#ffffff';
const HEADER_TEXT_COLOR = '#000000';

const START_DELAY_MS = 320;
const CHAR_MS = 70;
const HOLD_MS = 480;
const DOCK_MS = 534;

// Types the title over a dark photo backdrop, then shrinks it into the page header: white over the
// photo of the sign-in screens, black over the pages of the app.
export default function AppHeader() {
  const { status } = useAuth();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [skipIntro] = useState(introPlayed);
  const [typed, setTyped] = useState(skipIntro ? TITLE.length : 0);
  const [docked, setDocked] = useState(skipIntro);
  const [introGone, setIntroGone] = useState(skipIntro);
  const progress = useSharedValue(skipIntro ? 1 : 0);

  const introFontSize = Math.min(72, width * 0.14);
  const targetScale = HEADER_FONT_SIZE / introFontSize;
  const targetY = insets.top + HEADER_HEIGHT / 2 - height / 2;
  const headerTextColor = status === 'signedIn' ? HEADER_TEXT_COLOR : INTRO_TEXT_COLOR;

  useEffect(() => {
    if (skipIntro) {
      return;
    }
    introPlayed = true;
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
  }, [skipIntro]);

  useEffect(() => {
    if (!docked || skipIntro) {
      return;
    }
    progress.set(withTiming(1, { duration: DOCK_MS, easing: Easing.inOut(Easing.cubic) }));
    const gone = setTimeout(() => setIntroGone(true), DOCK_MS);
    return () => clearTimeout(gone);
  }, [docked, skipIntro, progress]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.75], [1, 0], Extrapolation.CLAMP),
  }));

  const titleStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      // Turns dark, for someone who is signed in, while the backdrop is still fading: the page under the title is light.
      color: interpolateColor(p, [0.3, 0.65], [INTRO_TEXT_COLOR, headerTextColor]),
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
      <View pointerEvents="box-none" className="absolute inset-0 z-10 items-center justify-center">
        {/* While the intro shows it covers the screen, so a tap does not reach what is under it. */}
        {!introGone && (
          <Animated.View className="absolute inset-0" style={backdropStyle}>
            <IntroBackdrop />
          </Animated.View>
        )}
        <Animated.Text
          pointerEvents="none"
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
