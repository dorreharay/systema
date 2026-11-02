import { X } from 'lucide-react-native';
import {
  createContext,
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
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

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
  // A form. It is three quarters of the page tall, or, when it is smaller than that, as tall as it takes
  // for its last button to stand just above the keyboard. Otherwise a sheet is as tall as its content.
  form?: boolean;
  // Fills most of the page: for a list that is searched.
  tall?: boolean;
  // Wraps the content in a scroll view. Off for a content that is a list itself.
  scroll?: boolean;
};

export const OPEN_MS = 200;
export const CLOSE_MS = 150;
// How long to wait after closing a sheet before showing something else on top.
export const CLOSE_WAIT_MS = 220;
const EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

// What a form takes of the page, at most.
const FORM_SHARE = 0.75;
// What a sheet with a list takes of the page.
const TALL_SHARE = 0.85;
// The space between the foot of a form and the keyboard.
const KEYBOARD_GAP = 12;
// A phone's keyboard as a share of the page, for the first sheet to open, before a keyboard has been seen.
const KEYBOARD_SHARE = 0.385;
// The room under the content, inside the scroll view.
const CONTENT_FOOT = 28;
// The room left between a field that has the cursor and the keyboard, or the top of the scroll view.
const REVEAL_MARGIN = 16;

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
}: SheetProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboard = useLastKeyboardHeight(height * KEYBOARD_SHARE);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
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
      progress.set(withTiming(1, { duration: OPEN_MS, easing: EASING }));
    } else {
      progress.set(
        withTiming(0, { duration: CLOSE_MS, easing: EASING }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        })
      );
    }
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.get(), [0, 1], [height * 0.4, 0]) }],
    opacity: interpolate(progress.get(), [0, 0.4, 1], [0, 1, 1]),
  }));

  if (!mounted) {
    return null;
  }

  // On iOS the sizes are in points. On Android the window itself shrinks for the keyboard, so a form is only
  // held to three quarters of it, and its button is above the keyboard by itself.
  const ios = Platform.OS === 'ios';
  // Until the content has been measured the height is not known: the sheet is not shown.
  const measuring = form && ios && (headerHeight === 0 || contentHeight === 0);
  const limit = ios ? Math.min(height * 0.92, height - insets.top - 12) : ('92%' as const);
  // A form on iOS is as tall as the foot of its content and the keyboard below it. Until the content has been
  // measured, it is the most it can be: a smaller panel would make the scroll view scroll to make room for
  // the keyboard.
  const formHeight = measuring
    ? height * FORM_SHARE
    : Math.min(height * FORM_SHARE, headerHeight + contentHeight - CONTENT_FOOT + KEYBOARD_GAP + keyboard);
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
      contentContainerStyle={{ paddingBottom: CONTENT_FOOT }}>
      <RevealContext value={reveal}>{children}</RevealContext>
    </ScrollView>
  ) : (
    children
  );

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      {/* A question asked from inside the sheet ("Delete this?") is shown inside it: iOS will not show a second
          modal from the app over this one, but it does show one from the modal itself. */}
      <ConfirmProvider>
        <View className="flex-1 justify-end">
          {/* Anywhere outside the panel closes it. */}
          <Animated.View className="absolute inset-0 bg-black/40" style={backdropStyle}>
            <Pressable accessibilityLabel={t('close')} className="flex-1" onPress={onClose} />
          </Animated.View>
          <Animated.View style={[panelStyle, measuring && { opacity: 0 }]}>
            <View className="overflow-hidden rounded-t-3xl bg-white" style={size}>
              <View onLayout={(event) => setHeaderHeight(Math.round(event.nativeEvent.layout.height))}>
                <View className="items-center pt-2.5">
                  <View className="h-1 w-10 rounded-full bg-neutral-300" />
                </View>
                {title ? (
                  <View className="flex-row items-center justify-between pb-1 pl-page pr-4 pt-4">
                    <Text accessibilityRole="header" className="flex-1 text-[24px] font-semibold">
                      {title}
                    </Text>
                    <IconButton icon={X} label={t('close')} onPress={onClose} round />
                  </View>
                ) : null}
              </View>
              <View className={tall ? 'flex-1' : 'shrink'}>{content}</View>
              <View style={{ height: Math.max(insets.bottom, 16) * 2 }} />
            </View>
          </Animated.View>
        </View>
      </ConfirmProvider>
    </Modal>
  );
}
