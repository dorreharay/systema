import { usePathname } from 'expo-router';
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
import { useAuth } from '@/lib/auth';
import { SIDEBAR_LOGO_SLOT, SIDEBAR_WIDTH, useLayoutMode } from '@/lib/layout';

const TITLE = 're:string';
// The title is typed out once per launch, signed in or not. If the header is mounted again it is already docked.
let introPlayed = false;
export const HEADER_HEIGHT = 104;
const HOME_PATH = '/home';
// The page of the password reset link stands on the photo of the sign-in screens, whether or not someone is signed in.
const RESET_PATH = '/reset-password';
const HEADER_FONT_SIZE = 24;
// How far above the middle of the header the logo sits once it has docked: beside the back button on the sign-in
// screens, and higher on the home page of someone who is signed in, where the page starts right under it.
const LOGO_RAISE = 14;
const LOGO_RAISE_HOME = 30;
// The letters of the title sit a little below the middle of the line the text is set in.
const LETTERS_DROP = 2;
/** Where the middle of the letters is once the logo has docked on the sign-in screens, from the top of the header: what the back button is centred on. */
export const LOGO_MIDDLE = HEADER_HEIGHT / 2 - LOGO_RAISE + LETTERS_DROP;
/** Where the logo of the home page ends, from the top of the header: its middle, and half the height of its letters. */
export const LOGO_FOOT = HEADER_HEIGHT / 2 - LOGO_RAISE_HOME + HEADER_FONT_SIZE * 0.6;
const INTRO_TEXT_COLOR = '#ffffff';
const HEADER_TEXT_COLOR = '#000000';

const START_DELAY_MS = 320;
const CHAR_MS = 70;
const HOLD_MS = 480;
const DOCK_MS = 534;

// Types the title over a dark photo backdrop, then shrinks it into the page header: white over the
// photo of the sign-in screens, black on the home page of the app. The header has no colour of its own.
export default function AppHeader() {
  const { status, user } = useAuth();
  const mode = useLayoutMode();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [skipIntro] = useState(introPlayed);
  const [typed, setTyped] = useState(skipIntro ? TITLE.length : 0);
  const [docked, setDocked] = useState(skipIntro);
  const [introGone, setIntroGone] = useState(skipIntro);
  const progress = useSharedValue(skipIntro ? 1 : 0);
  const visible = useSharedValue(1);
  // The sign-in screens, and the page of the reset link even for someone who is signed in, stand on the photo: the logo is
  // white and beside the back button.
  const onPhoto = status !== 'signedIn' || pathname === RESET_PATH;
  // On a wide screen the app has a sidebar with the wordmark at the top of it (see Sidebar): the logo of the intro docks onto that, and
  // is not the header of the home page. (Until the setup is done there is no sidebar: it docks as it does on the phone.)
  const sidebar = mode === 'phone' || onPhoto || !user?.setup_completed ? null : mode;
  // Someone signed in sees the logo in the header on the home page only. It can go once the intro is over.
  const hidden = !onPhoto && introGone && (!!sidebar || pathname !== HOME_PATH);

  const introFontSize = Math.min(72, width * 0.14);
  const targetScale = HEADER_FONT_SIZE / introFontSize;
  const raise = onPhoto ? LOGO_RAISE : LOGO_RAISE_HOME;
  // The middle of the docked logo, from the middle of the screen, which is where the title starts.
  const targetX = sidebar ? SIDEBAR_WIDTH[sidebar] / 2 - width / 2 : 0;
  const targetY = sidebar
    ? SIDEBAR_LOGO_SLOT.top + SIDEBAR_LOGO_SLOT.height / 2 - height / 2
    : insets.top + HEADER_HEIGHT / 2 - raise - height / 2;
  // The sidebar is dark, as the photo is: the logo stays white.
  const headerTextColor = onPhoto || sidebar ? INTRO_TEXT_COLOR : HEADER_TEXT_COLOR;

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

  useEffect(() => {
    // It goes at once; it comes back with a short fade.
    visible.set(hidden ? 0 : withTiming(1, { duration: 150 }));
  }, [hidden, visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.75], [1, 0], Extrapolation.CLAMP),
  }));

  const titleStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: visible.get(),
      // Turns dark, for someone who is signed in and not on the photo, while the backdrop is still fading: the page under the
      // title is light.
      color: interpolateColor(p, [0.3, 0.65], [INTRO_TEXT_COLOR, headerTextColor]),
      transform: [
        { translateX: interpolate(p, [0, 1], [0, targetX]) },
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
