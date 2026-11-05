import {
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { X } from '@/components/icons';
import { ConfirmProvider } from '@/components/ui/confirm';
import IconButton from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useLastKeyboardHeight } from '@/lib/use-keyboard';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  // A form. It is nine tenths of the page tall, or, when it is smaller than that, as tall as it takes
  // for its last button to stand just above the keyboard. Otherwise a sheet is as tall as its content.
  form?: boolean;
  // Fills most of the page: for a list that is searched.
  tall?: boolean;
  // Wraps the content in a scroll view. Off for a content that is a list itself.
  scroll?: boolean;
  // The dark panel of the welcome and sign-in screens, as dark as they are, instead of the white one of the app.
  dark?: boolean;
};

export const OPEN_MS = 190;
export const CLOSE_MS = 130;
// A sheet comes up fast and settles slowly: it has covered most of its way in the first third of the time, so it is there
// when it is tapped for, and the end of the move, which is the part that is felt as waiting, is gentle. It goes away the
// way things go that are not wanted any more: at once.
const OPEN_EASING = Easing.bezier(0.2, 0.85, 0.25, 1);
const CLOSE_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

// The head of a sheet (the grip and the title) is pulled down to take the sheet away: far enough, or fast enough, and it
// goes; a little, and let go, and it comes back. Only the head is pulled, so what scrolls under it is left alone.
const PULL_START = 6;
// How far it has to be pulled: a quarter of its height, but not less than this.
const DISMISS_MIN = 72;
const DISMISS_SHARE = 0.25;
// Or how fast it has to be let go (points a second).
const DISMISS_VELOCITY = 650;
// What follows the finger does not start over from rest: a sheet that is let go goes on at the speed it had, and only
// then picks up. How long that takes is set by how far it has to go and how fast it was going, between these (a flick
// is out of sight in about a tenth of a second, a slow release in about a third).
const EXIT_MIN_MS = 120;
const EXIT_MAX_MS = 340;
// A little more than its own height, to be out of sight.
const EXIT_MARGIN = 24;
// A sheet that is let go too early comes back gently, not with a snap.
const RETURN_SPRING = { damping: 25, stiffness: 200, mass: 1, overshootClamping: true } as const;

// iOS shows one modal at a time. A second one that is asked for while the first is still there is not shown, or is taken
// away together with the first, and the page looks as if nothing had happened. The first is taken off the screen by the
// JS thread once its slide is over, so with a heavy page behind it that is late, and a fixed wait is not enough: the form
// of a new string never came up. What follows a sheet (another sheet, a question, another page) is asked for with
// `afterSheetsClosed`, and runs when none is on the screen.
let onScreen = 0;
let waiting: (() => void)[] = [];
let settling: ReturnType<typeof setTimeout> | undefined;
let settlePending = false;
// For the system to be done with a modal that has gone, before the next one is shown.
const SETTLE_MS = 80;
// If a sheet stays for good, what waits for it does not wait for ever.
const WAIT_LIMIT_MS = 2000;

function settle() {
  clearTimeout(settling);
  settlePending = true;
  settling = setTimeout(() => {
    settlePending = false;
    if (onScreen > 0) return;
    const run = waiting;
    waiting = [];
    for (const open of run) open();
  }, SETTLE_MS);
}

/** Runs `open` once no sheet is on the screen any more: at once, when none is and the last has been gone for a while. */
export function afterSheetsClosed(open: () => void) {
  if (onScreen === 0 && !settlePending) {
    open();
    return;
  }
  const limit = setTimeout(run, WAIT_LIMIT_MS);
  function run() {
    clearTimeout(limit);
    waiting = waiting.filter((other) => other !== run);
    open();
  }
  waiting.push(run);
}

// What a form takes of the page, at most.
const FORM_SHARE = 0.9;
// What a sheet with a list takes of the page.
const TALL_SHARE = 0.85;
// The space between the foot of a form and the keyboard.
const KEYBOARD_GAP = 12;
// A phone's keyboard as a share of the page, for the first sheet to open, before a keyboard has been seen.
const KEYBOARD_SHARE = 0.385;
// The room under the content, inside the scroll view.
const CONTENT_FOOT = 28;
// The room under what a sheet shows, down to the foot of the panel and clear of the home indicator. It is padding of the
// scroll view (or of the list), not a band under it, so that what is scrolled goes on to the edge of the panel.
const sheetFoot = (bottomInset: number) => Math.max(bottomInset, 16) * 2;

/** The room a list in a sheet leaves under its last row (the scroll view of a sheet has it already). */
export function useSheetFoot() {
  return sheetFoot(useSafeAreaInsets().bottom);
}
// The room left between a field that has the cursor and the keyboard, or the top of the scroll view.
const REVEAL_MARGIN = 16;

// What a sheet shows stays as it was while it slides away: the page behind it may change in the meantime (what was chosen,
// what was asked for next), and a long list is slow to draw again for nobody to see.
const Settled = memo(
  function Settled({ children }: { children: ReactNode; frozen: boolean }) {
    return children;
  },
  (_previous, next) => next.frozen
);

type Reveal = (node: ComponentRef<typeof View> | null) => void;

const RevealContext = createContext<Reveal | null>(null);

/**
 * For a field in a sheet: `reveal(its view)` when it gets the cursor scrolls the sheet so that the whole
 * field is in sight above the keyboard. Nothing, outside a sheet.
 */
export function useRevealInSheet() {
  return use(RevealContext);
}

/**
 * A panel that rises from the bottom over the screen. Simple choices and quick creation happen here,
 * so the page behind it, and whatever was typed in it, stays as it is.
 *
 * The keyboard does not move it and does not resize it: it comes up over the foot of the panel, and the
 * scroll view inside makes room for it and brings the field being typed in into view. A form is sized for
 * the keyboard once, from how tall keyboards are, so that it is the same with the keyboard up or down.
 */
export default function Sheet({
  visible,
  onClose,
  title,
  children,
  form = false,
  tall = false,
  scroll = true,
  dark = false,
}: SheetProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboard = useLastKeyboardHeight(height * KEYBOARD_SHARE);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [mounted, setMounted] = useState(visible);
  // The title stays as it was when the sheet is asked to close, as what it shows does.
  const [shownTitle, setShownTitle] = useState(title);
  if (visible && shownTitle !== title) {
    setShownTitle(title);
  }
  const progress = useSharedValue(0);
  // How far the head of the sheet has been pulled down, and how tall the panel is.
  const drag = useSharedValue(0);
  const panelHeight = useSharedValue(0);
  const visibleNow = useRef(visible);
  useEffect(() => {
    visibleNow.current = visible;
  });
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollOffset = useRef(0);

  // Once the keyboard is up (at once, when it is), the field is measured against the top of the keyboard
  // and the scroll view, and the scroll view is moved by what is missing.
  const reveal = useCallback<Reveal>((node) => {
    if (Platform.OS !== 'ios' || !node) return;

    const run = () => {
      const scroll = scrollRef.current;
      const keyboardTop = Keyboard.metrics()?.screenY;
      if (!scroll || keyboardTop === undefined) return;
      scroll.measureInWindow((_x, scrollTop) => {
        node.measureInWindow((_fieldX, fieldTop, _width, fieldHeight) => {
          const below = fieldTop + fieldHeight + REVEAL_MARGIN - keyboardTop;
          const above = scrollTop + REVEAL_MARGIN - fieldTop;
          if (below > 0) {
            scroll.scrollTo({ y: scrollOffset.current + below, animated: true });
          } else if (above > 0) {
            scroll.scrollTo({ y: Math.max(0, scrollOffset.current - above), animated: true });
          }
        });
      });
    };

    if (Keyboard.isVisible()) {
      setTimeout(run, 50);
      return;
    }
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      shown.remove();
      run();
    });
    // No keyboard came (a hardware one): there is nothing to wait for.
    setTimeout(() => shown.remove(), 1000);
  }, []);

  // It is shown from the first frame it is asked for, and stays until it has slid away.
  if (visible && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (visible) {
      drag.set(0);
      progress.set(withTiming(1, { duration: OPEN_MS, easing: OPEN_EASING }));
    } else {
      // A sheet that was pulled away has already left the screen: there is no slide left to make.
      const gone = drag.get() > 0 && drag.get() >= panelHeight.get();
      progress.set(
        withTiming(0, { duration: gone ? 0 : CLOSE_MS, easing: CLOSE_EASING }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        })
      );
    }
  }, [visible, progress, drag, panelHeight]);

  // It is on the screen from the moment it is mounted until its modal is gone.
  useEffect(() => {
    if (!mounted) return;
    onScreen += 1;
    return () => {
      onScreen -= 1;
      if (onScreen === 0) settle();
    };
  }, [mounted]);

  // A sheet that is pulled away has asked to be closed; if it is not (a question comes first, say), it goes back.
  const pulledAway = () => {
    onClose();
    setTimeout(() => {
      if (visibleNow.current) drag.set(withSpring(0, RETURN_SPRING));
    }, CLOSE_MS + 200);
  };
  const hideKeyboard = () => Keyboard.dismiss();

  const pull = usePanGesture({
    // Down only, and mostly down: a tap on the close button, or a touch that goes sideways, is not a pull.
    activeOffsetY: PULL_START,
    failOffsetX: [-24, 24],
    onActivate: () => {
      'worklet';
      scheduleOnRN(hideKeyboard);
    },
    onUpdate: (event) => {
      'worklet';
      // The sheet follows the finger from where the pull began, not from where it was taken for one.
      drag.set(Math.max(0, event.translationY - PULL_START));
    },
    onDeactivate: (event) => {
      'worklet';
      const pulled = drag.get();
      const panel = panelHeight.get() || height * 0.5;
      const away =
        !event.canceled && (pulled > Math.max(DISMISS_MIN, panel * DISMISS_SHARE) || event.velocityY > DISMISS_VELOCITY);
      if (!away) {
        drag.set(withSpring(0, { ...RETURN_SPRING, velocity: event.velocityY }));
        return;
      }
      // It goes the way a thing falls away from a hand: at the speed it was let go at for the first moment (not from rest,
      // and not at the top speed of an animation, which is a jerk), then faster. The path is `slope * t + (1 - slope) * t * t`:
      // its slope at the start is the speed of the finger, and it ends where the sheet is out of sight.
      const distance = panel - pulled + EXIT_MARGIN;
      const speed = Math.max(event.velocityY, 0);
      const duration = Math.min(EXIT_MAX_MS, Math.max(EXIT_MIN_MS, (distance / (speed * 0.8 + 600)) * 1000));
      const slope = Math.min(1, (speed * duration) / 1000 / distance);
      drag.set(
        withTiming(
          pulled + distance,
          {
            duration,
            easing: (t) => {
              'worklet';
              return slope * t + (1 - slope) * t * t;
            },
          },
          (finished) => {
            if (finished) scheduleOnRN(pulledAway);
          }
        )
      );
    },
  });

  // The page behind lightens as the sheet is pulled away.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.get() * (1 - Math.min(1, drag.get() / (Math.max(panelHeight.get(), 1) * 0.8))),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.get(), [0, 1], [height * 0.4, 0]) + drag.get() }],
    opacity: interpolate(progress.get(), [0, 0.4, 1], [0, 1, 1]),
  }));

  if (!mounted) {
    return null;
  }

  // On iOS the sizes are in points. On Android the window itself shrinks for the keyboard, so a form is only
  // held to nine tenths of it, and its button is above the keyboard by itself.
  const ios = Platform.OS === 'ios';
  // Until the content has been measured the height is not known: the sheet is not shown.
  const measuring = form && ios && (headerHeight === 0 || contentHeight === 0);
  const limit = ios ? Math.min(height * 0.92, height - insets.top - 12) : ('92%' as const);
  // A form on iOS is as tall as the foot of its content and the keyboard below it. Until the content has been
  // measured, it is the most it can be: a smaller panel would make the scroll view scroll to make room for
  // the keyboard.
  // The room under the content, which the scroll view has as padding: a little, and the foot of the panel.
  const bottomRoom = CONTENT_FOOT + sheetFoot(insets.bottom);
  const formHeight = measuring
    ? height * FORM_SHARE
    : Math.min(height * FORM_SHARE, headerHeight + contentHeight - bottomRoom + KEYBOARD_GAP + keyboard);
  // A tall sheet leaves enough of the page above it to tap on, to close it: more than the strip of the status bar.
  const size = tall
    ? { height: ios ? Math.min(height * TALL_SHARE, height - insets.top - 12) : (`${TALL_SHARE * 100}%` as const) }
    : !form
      ? { maxHeight: limit }
      : ios
        ? { height: formHeight }
        : { maxHeight: `${FORM_SHARE * 100}%` as const };
  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      // No bounce at the ends, nor when the content is shorter than the sheet (on iOS the default is to bounce
      // even then).
      bounces={false}
      overScrollMode="never"
      // The keyboard covers the foot of the sheet: the scroll view leaves room for it. The field being typed
      // in is scrolled above it by `reveal`.
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(event) => {
        scrollOffset.current = event.nativeEvent.contentOffset.y;
      }}
      onContentSizeChange={(_, contentSizeHeight) => setContentHeight(Math.round(contentSizeHeight))}
      contentContainerClassName="px-page"
      contentContainerStyle={{ paddingBottom: bottomRoom }}>
      <RevealContext value={reveal}>
        <Settled frozen={!visible}>{children}</Settled>
      </RevealContext>
    </ScrollView>
  ) : (
    <Settled frozen={!visible}>{children}</Settled>
  );

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      {/* What a modal shows has a gesture root of its own: the one of the app is behind it. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* A question asked from inside the sheet ("Delete this?") is shown inside it: iOS will not show a second
            modal from the app over this one, but it does show one from the modal itself. */}
        <ConfirmProvider>
          <View className="flex-1 justify-end">
            {/* Anywhere outside the panel closes it. */}
            <Animated.View className={`absolute inset-0 ${dark ? 'bg-black/60' : 'bg-black/40'}`} style={backdropStyle}>
              <Pressable accessibilityLabel={t('close')} className="flex-1" onPress={onClose} />
            </Animated.View>
            <Animated.View
              style={[panelStyle, measuring && { opacity: 0 }]}
              onLayout={(event) => panelHeight.set(event.nativeEvent.layout.height)}>
              <View
                className={`overflow-hidden rounded-t-3xl ${dark ? 'border-t border-white/10 bg-[#15191c]' : 'bg-white'}`}
                style={size}>
                <GestureDetector gesture={pull}>
                  <View onLayout={(event) => setHeaderHeight(Math.round(event.nativeEvent.layout.height))}>
                    <View className="items-center pt-2.5">
                      <View className={`h-1 w-10 rounded-full ${dark ? 'bg-white/25' : 'bg-neutral-300'}`} />
                    </View>
                    {shownTitle ? (
                      <View className="flex-row items-center justify-between pb-1 pl-page pr-4 pt-4">
                        <Text
                          accessibilityRole="header"
                          className={`flex-1 text-[24px] font-semibold ${dark ? 'text-white' : ''}`}>
                          {shownTitle}
                        </Text>
                        <IconButton icon={X} label={t('close')} onPress={onClose} round dark={dark} />
                      </View>
                    ) : null}
                  </View>
                </GestureDetector>
                <View className={tall ? 'flex-1' : 'shrink'}>{content}</View>
              </View>
            </Animated.View>
          </View>
        </ConfirmProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}
