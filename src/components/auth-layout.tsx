import type { Href } from 'expo-router';
import { useFocusEffect, useNavigation } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { HEADER_HEIGHT, LOGO_MIDDLE } from '@/components/app-header';
import type { AuthViewRef } from '@/components/auth-leave';
import { AuthLeaveContext, AuthSubmitContext, addCover, coverAll } from '@/components/auth-leave';
import AuthLink from '@/components/auth-link';
import { ArrowLeft } from '@/components/icons';
import { useI18n } from '@/lib/i18n';

// Height of the strip the back button sits in at the top left. The strip is centred on the letters of the logo and the
// button on the strip, so the two are on one line whatever size the button is.
const BACK_STRIP_HEIGHT = 44;
// How far the content sits above the bottom edge, on top of the safe area.
const CONTENT_LIFT = 56;
// Space kept between the button that sends the form and the top of the keyboard.
const KEYBOARD_GAP = 16;
// Distance over which the title fades out before it reaches the logo.
const TITLE_FADE = 48;
// Used when the keyboard event carries no duration, and when the form itself changes size.
const KEYBOARD_DURATION = 250;
const RELAYOUT_DURATION = 150;
const LIFT_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);
// A tap does not animate the stack between the auth screens. The screen's content fades out first, then
// the navigation runs and the next screen's content fades in and rises into place, so two
// screens' content never shows at once. The stack's own back swipe is not touched: it moves the whole
// screen, and the one below is there to be seen (see the listeners below).
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
  // Adds a back button at the top left that returns to this route.
  backHref?: Href;
  // Centers the content on the screen instead of pinning it to the bottom.
  centered?: boolean;
  // The dark shade over the upper part of the photo, for the forms. It is part of the screen, so that it goes with the
  // screen when the stack's back swipe moves it away. The welcome screen has none.
  shade?: boolean;
};

// The listeners need only this much of the stack's navigation object.
type StackNavigation = {
  addListener(type: 'transitionStart', listener: (event: { data: { closing: boolean } }) => void): () => void;
  addListener(type: 'gestureCancel', listener: () => void): () => void;
  isFocused(): boolean;
};

// The photo and the dark bottom of it are drawn by the layout of the group (see AuthShell). The content sits either at the
// bottom of the screen or, when centered, in the middle of it.
export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  backHref,
  centered = false,
  shade = true,
}: AuthLayoutProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const headerSpace = insets.top + HEADER_HEIGHT;
  const navigation = useNavigation() as unknown as StackNavigation;

  // The content starts hidden and comes in once the screen is focused. Screens that are only
  // preloaded stay hidden.
  const shown = useSharedValue(0);
  const rise = useSharedValue(ENTER_RISE);
  const leaving = useRef(false);
  const wasFocused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
      wasFocused.current = true;
      // The content fades in, unless the stack's back swipe has already put it in place.
      if (shown.get() < 1) {
        rise.set(ENTER_RISE);
        shown.set(withDelay(ENTER_DELAY, withTiming(1, { duration: ENTER_DURATION, easing: ENTER_EASING })));
        rise.set(withDelay(ENTER_DELAY, withTiming(0, { duration: ENTER_DURATION, easing: ENTER_EASING })));
      }
      return () => shown.set(withTiming(0, { duration: LEAVE_DURATION, easing: LEAVE_EASING }));
    }, [rise, shown])
  );

  // The back swipe belongs to the stack and moves the whole screen. The screen it uncovers is not in focus yet (the focus
  // moves when the swipe is done; a move made by a tap has the focus first) and its content is hidden: it is shown at once,
  // so what is under the screen being moved away is not an empty photo. If the swipe is let go too soon, the screen
  // that was dragged says so (`gestureCancel`) and the one it had uncovered is hidden again.
  useEffect(() => {
    const cover = () => {
      if (wasFocused.current && !navigation.isFocused()) {
        shown.set(0);
        rise.set(ENTER_RISE);
      }
    };
    const removeCover = addCover(cover);
    const uncovered = navigation.addListener('transitionStart', (event) => {
      if (!event.data.closing && wasFocused.current && !navigation.isFocused()) {
        shown.set(1);
        rise.set(0);
      }
    });
    const cancelled = navigation.addListener('gestureCancel', coverAll);
    return () => {
      removeCover();
      uncovered();
      cancelled();
    };
  }, [navigation, rise, shown]);

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
  const shadeStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));

  // On iOS the centered form is moved so the button that sends it sits just above the keyboard (up, and a little down on a tall
  // phone), and the other ways in below that button are behind the keyboard, none of them above it. The move is animated once
  // per keyboard change, over the keyboard's own duration, so moving between fields does not make the form jump. It stops
  // below the status bar, and the title fades out before it reaches the logo.
  const liftsForKeyboard = centered && Platform.OS === 'ios';
  const lift = useSharedValue(0);
  const [blockTop, setBlockTop] = useState(0);
  const blockLayout = useRef({ y: 0 });
  const formLayout = useRef({ y: 0, height: 0 });
  const formRef = useRef<AuthViewRef>(null);
  // Where the button that sends the form ends, from the top of the form (the button says where it is, see AuthSubmit). Until
  // it has, the whole form counts.
  const submitEnd = useRef<number | null>(null);
  const keyboardTop = useRef(height);

  const updateLift = useCallback(
    (duration: number) => {
      if (!liftsForKeyboard) {
        return;
      }
      const keptBottom = blockLayout.current.y + formLayout.current.y + (submitEnd.current ?? formLayout.current.height);
      // With the keyboard down the form is where it is centered.
      const keyboardUp = keyboardTop.current < height - 1;
      const needed = keyboardUp ? keptBottom + KEYBOARD_GAP - keyboardTop.current : 0;
      const limit = Math.max(0, blockLayout.current.y - insets.top);
      lift.set(withTiming(Math.min(needed, limit), { duration, easing: LIFT_EASING }));
    },
    [height, insets.top, lift, liftsForKeyboard]
  );

  const submitRegistry = useMemo(
    () => ({
      measure: (button: AuthViewRef) => {
        const form = formRef.current;
        if (!form) {
          return;
        }
        button.measureLayout(
          form,
          (_x, y, _width, buttonHeight) => {
            submitEnd.current = y + buttonHeight;
            updateLift(RELAYOUT_DURATION);
          },
          () => undefined
        );
      },
      forget: () => {
        submitEnd.current = null;
      },
    }),
    [updateLift]
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
      <View ref={formRef} onLayout={handleFormLayout}>
        <AuthSubmitContext value={submitRegistry}>{children}</AuthSubmitContext>
      </View>
      {footer}
    </Animated.View>
  );

  return (
    <AuthLeaveContext value={leave}>
      {shade ? (
        <Animated.View
          pointerEvents="none"
          className="absolute inset-0 bg-linear-to-b from-black/40 via-black/80 to-transparent"
          style={shadeStyle}
        />
      ) : null}
      <Animated.View className="flex-1" style={screenStyle}>
        {centered ? (
          <ScrollView bounces={false} overScrollMode="never"
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
        {backHref ? (
          <View
            className="absolute left-4 justify-center"
            style={{ top: insets.top + LOGO_MIDDLE - BACK_STRIP_HEIGHT / 2, height: BACK_STRIP_HEIGHT }}>
            <AuthLink href={backHref} dismissTo asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('back')}
                hitSlop={8}
                className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:bg-white/20">
                <ArrowLeft size={22} color="#ffffff" />
              </Pressable>
            </AuthLink>
          </View>
        ) : null}
      </Animated.View>
    </AuthLeaveContext>
  );
}
