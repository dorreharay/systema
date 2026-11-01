import type { Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Keyboard, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { HEADER_HEIGHT } from '@/components/app-header';
import { AuthLeaveContext } from '@/components/auth-leave';
import AuthLink from '@/components/auth-link';

// How far the content sits above the bottom edge, on top of the safe area.
const CONTENT_LIFT = 56;
// Space kept between the primary button and the top of the keyboard.
const KEYBOARD_GAP = 16;
// Distance over which the title fades out before it reaches the logo.
const TITLE_FADE = 48;
// Used when the keyboard event carries no duration, and when the form itself changes size.
const KEYBOARD_DURATION = 250;
const RELAYOUT_DURATION = 150;
const LIFT_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);
// The stack does not animate between the auth screens. A screen's content fades out first, then
// the navigation runs and the next screen's content fades in and rises into place, so two
// screens' content never shows at once.
const LEAVE_DURATION = 160;
const ENTER_DELAY = 90;
const ENTER_DURATION = 360;
const ENTER_RISE = 14;
const LEAVE_EASING = Easing.inOut(Easing.quad);
const ENTER_EASING = LIFT_EASING;

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  // Adds a "Назад" button under the form.
  backHref?: Href;
  // Centers the content on the screen instead of pinning it to the bottom.
  centered?: boolean;
};

// The photo and its shade are drawn by the auth group's layout. The content sits either at the
// bottom of the screen or, when centered, in the middle of it.
export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  backHref,
  centered = false,
}: AuthLayoutProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const headerSpace = insets.top + HEADER_HEIGHT;

  // The content starts hidden and comes in once the screen is focused. Screens that are only
  // preloaded stay hidden.
  const shown = useSharedValue(0);
  const rise = useSharedValue(ENTER_RISE);
  const leaving = useRef(false);

  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
      rise.set(ENTER_RISE);
      shown.set(withDelay(ENTER_DELAY, withTiming(1, { duration: ENTER_DURATION, easing: ENTER_EASING })));
      rise.set(withDelay(ENTER_DELAY, withTiming(0, { duration: ENTER_DURATION, easing: ENTER_EASING })));
      return () => shown.set(withTiming(0, { duration: LEAVE_DURATION, easing: LEAVE_EASING }));
    }, [rise, shown])
  );

  // Fades the content out, then navigates. A second press while leaving is ignored.
  const leave = useCallback(
    (navigate: () => void) => {
      if (leaving.current) {
        return;
      }
      leaving.current = true;
      shown.set(
        withTiming(0, { duration: LEAVE_DURATION, easing: LEAVE_EASING }, () => {
          scheduleOnRN(navigate);
        })
      );
    },
    [shown]
  );

  const screenStyle = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: rise.get() }],
  }));

  // On iOS the centered form is lifted so the primary button sits just above the keyboard.
  // The lift is animated once per keyboard change, over the keyboard's own duration, so moving
  // between fields does not make the form jump. It stops below the status bar, and the title
  // fades out before it reaches the logo.
  const liftsForKeyboard = centered && Platform.OS === 'ios';
  const lift = useSharedValue(0);
  const [blockTop, setBlockTop] = useState(0);
  const blockLayout = useRef({ y: 0 });
  const formLayout = useRef({ y: 0, height: 0 });
  const keyboardTop = useRef(height);

  const updateLift = useCallback(
    (duration: number) => {
      if (!liftsForKeyboard) {
        return;
      }
      const buttonBottom = blockLayout.current.y + formLayout.current.y + formLayout.current.height;
      const needed = Math.max(0, buttonBottom + KEYBOARD_GAP - keyboardTop.current);
      const limit = Math.max(0, blockLayout.current.y - insets.top);
      lift.set(withTiming(Math.min(needed, limit), { duration, easing: LIFT_EASING }));
    },
    [insets.top, lift, liftsForKeyboard]
  );

  useEffect(() => {
    if (!liftsForKeyboard) {
      return;
    }
    const subscription = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      updateLift(event.duration > 0 ? event.duration : KEYBOARD_DURATION);
    });
    return () => subscription.remove();
  }, [liftsForKeyboard, updateLift]);

  const handleBlockLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    blockLayout.current.y = layout.y;
    setBlockTop(layout.y);
    updateLift(RELAYOUT_DURATION);
  };

  const handleFormLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    formLayout.current = { y: layout.y, height: layout.height };
    updateLift(RELAYOUT_DURATION);
  };

  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -lift.get() }] }));

  const titleStyle = useAnimatedStyle(() => {
    const fadeStart = Math.max(0, blockTop - headerSpace - TITLE_FADE);
    return {
      opacity: interpolate(lift.get(), [fadeStart, fadeStart + TITLE_FADE], [1, 0], Extrapolation.CLAMP),
    };
  });

  const content = (
    <Animated.View
      className="w-full max-w-sm gap-6 self-center"
      style={liftStyle}
      onLayout={handleBlockLayout}>
      <Animated.View className="items-center justify-center gap-2" style={titleStyle}>
        <Text className="text-center text-2xl font-semibold text-white">{title}</Text>
        <Text className="text-center text-base text-white/80">{subtitle}</Text>
      </Animated.View>
      <View onLayout={handleFormLayout}>{children}</View>
      <View className="gap-2">
        {footer}
        {backHref ? (
          <AuthLink className='mt-12' href={backHref} dismissTo asChild>
            <Pressable
              accessibilityRole="link"
              hitSlop={8}
              className="h-12 w-1/2 mx-auto items-center justify-center gap-1.5 rounded-lg active:opacity-70">
              <Text className="font-medium text-white">Назад</Text>
            </Pressable>
          </AuthLink>
        ) : null}
      </View>
    </Animated.View>
  );

  return (
    <AuthLeaveContext value={leave}>
      <Animated.View className="flex-1" style={screenStyle}>
        {centered ? (
          <ScrollView
            className="flex-1"
            contentContainerClassName="grow"
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled">
            <View
              className="justify-center px-6"
              style={{ minHeight: height, paddingTop: headerSpace, paddingBottom: headerSpace }}>
              {content}
            </View>
          </ScrollView>
        ) : (
          <View className="flex-1 justify-end">
            <View
              className="px-6"
              style={{ paddingBottom: Math.max(insets.bottom, 24) + CONTENT_LIFT }}>
              {content}
            </View>
          </View>
        )}
      </Animated.View>
    </AuthLeaveContext>
  );
}
