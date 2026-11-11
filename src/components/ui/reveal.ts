import { createContext, useCallback, useRef, type ComponentRef, type RefObject } from 'react';
import {
  Keyboard,
  Platform,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** What a field calls when it gets the cursor: `reveal(its view)` brings the whole field into sight above the keyboard. */
export type Reveal = (node: ComponentRef<typeof View> | null) => void;

/**
 * Who brings the fields into sight. A sheet does it in its own scroll view (see `Sheet`), and on Android so does a page that has
 * fields in its scroll view (see `usePageReveal`). Where nothing provides it, a field stays where it is.
 */
export const RevealContext = createContext<Reveal | null>(null);

// The room left between a field that has the cursor and the keyboard, or the top of the scroll view.
export const REVEAL_MARGIN = 16;
// On Android what is above the keyboard is made shorter once the keyboard is announced, and that takes a frame or two to lay
// out: a field is brought into sight after it, or the scroll view would not yet be short enough to scroll.
export const ANDROID_REVEAL_MS = 120;
// A page also loses its dock when the keyboard comes, and is laid out once more after that: the field is looked at again, in case it
// moved. (When it is in sight already, nothing happens.)
const SECOND_LOOK_MS = 300;

/**
 * For a page that has fields in its scroll view (the new order). On Android the window is edge to edge and does not shrink for the
 * keyboard, so the page is lifted over it with padding (`KeyboardAvoidingView`), and the system then scrolls to the field only far
 * enough for it to touch the keyboard, and not at all for a field of several lines at the foot of the page (its top is in sight, so
 * it counts as seen). This brings the whole field into sight, `REVEAL_MARGIN` above the keyboard, once the page has been laid out
 * above it.
 *
 * Give the scroll view the `scrollProps` and its `ref` (`scrollRef`), and wrap it in `RevealContext` with `reveal`. `topInset` is the
 * room at the top of the scroll view that something floats over (the header). Everywhere but Android it hands out nothing: iOS scrolls
 * to the field by itself, and the web has no keyboard over the page.
 */
export function usePageReveal(scrollRef: RefObject<ScrollViewInstance | null>, topInset = 0) {
  const { height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const offset = useRef(0);
  const android = Platform.OS === 'android';

  const reveal = useCallback<Reveal>(
    (node) => {
      if (!node) return;

      const run = () => {
        const scroll = scrollRef.current;
        const metrics = Keyboard.metrics();
        if (!scroll || !metrics) return;
        // Android says how tall the keyboard is, leaving out the navigation bar that it covers too.
        const keyboardTop = height - (metrics.height + bottom);
        scroll.measureInWindow((_x, scrollTop, _scrollWidth, scrollHeight) => {
          // What is in sight ends where the keyboard does, or where the scroll view does once it has been made shorter for it,
          // whichever is first.
          const sightBottom = Math.min(keyboardTop, scrollTop + scrollHeight);
          node.measureInWindow((_fieldX, fieldTop, _fieldWidth, fieldHeight) => {
            const below = fieldTop + fieldHeight + REVEAL_MARGIN - sightBottom;
            const above = scrollTop + topInset + REVEAL_MARGIN - fieldTop;
            if (below > 0) {
              scroll.scrollTo({ y: offset.current + below, animated: true });
            } else if (above > 0) {
              scroll.scrollTo({ y: Math.max(0, offset.current - above), animated: true });
            }
          });
        });
      };

      const look = () => {
        setTimeout(run, ANDROID_REVEAL_MS);
        setTimeout(run, ANDROID_REVEAL_MS + SECOND_LOOK_MS);
      };

      if (Keyboard.isVisible()) {
        look();
        return;
      }
      const shown = Keyboard.addListener('keyboardDidShow', () => {
        shown.remove();
        look();
      });
      // No keyboard came (a hardware one): there is nothing to wait for.
      setTimeout(() => shown.remove(), 1000);
    },
    [bottom, height, scrollRef, topInset]
  );

  // Where the scroll view is scrolled to, as the last event said: `scrollTo` goes to a place, not by a distance.
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);

  const scrollProps: Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle'> = android
    ? { onScroll, scrollEventThrottle: 16 }
    : {};

  return { reveal: android ? reveal : null, scrollProps };
}
