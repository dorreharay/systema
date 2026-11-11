import { useEffect, useState, useSyncExternalStore } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// On Android how tall the keyboard is right now, as the last `keyboardDidShow` said (0 while it is hidden, and for what is told
// of a keyboard that takes no room, a floating one). It is kept for the whole app, so that what asks later (a sheet that opens
// while the keyboard is up) finds out all the same: a keyboard that is already up is not announced again.
let androidHeight = 0;
const androidListeners = new Set<() => void>();

if (Platform.OS === 'android') {
  const changeTo = (next: number) => {
    if (next === androidHeight) return;
    androidHeight = next;
    androidListeners.forEach((listener) => listener());
  };
  Keyboard.addListener('keyboardDidShow', (event) => changeTo(Math.max(0, event.endCoordinates.height)));
  Keyboard.addListener('keyboardDidHide', () => changeTo(0));
}

const subscribeToAndroid = (listener: () => void) => {
  androidListeners.add(listener);
  return () => {
    androidListeners.delete(listener);
  };
};
const getAndroidHeight = () => androidHeight;
const getNothing = () => 0;

/**
 * How tall the on-screen keyboard is right now, 0 when it is hidden. A sheet needs it to stay above the
 * keyboard, where the keyboard covers the screen instead of shrinking it. Off, it stays 0 and listens to nothing.
 */
export function useKeyboardHeight(enabled = true) {
  const [height, setHeight] = useState(0);
  // (Android has its own, kept for the whole app: see above. Where it is off, the snapshot never changes.)
  const android = useSyncExternalStore(subscribeToAndroid, enabled ? getAndroidHeight : getNothing);

  useEffect(() => {
    if (!enabled || Platform.OS === 'android') return;
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) =>
      setHeight(event.endCoordinates.height)
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);

  return Platform.OS === 'android' ? android : height;
}

/**
 * How much of the foot of the window the keyboard covers, 0 when it is hidden: what a page or a panel that reaches the foot of
 * the window has to leave free there. On iOS it is the height of the keyboard. On Android the window is edge to edge and does not
 * shrink for the keyboard (since Android 15 it is not up to the app), and the height that is told leaves out the navigation
 * bar, which the keyboard covers as well: it is put back. Meant for Android: asked on iOS (`enabled`) it gives the height, as it was.
 */
export function useKeyboardOverlap(enabled = true) {
  const height = useKeyboardHeight(enabled);
  const { bottom } = useSafeAreaInsets();
  return height > 0 && Platform.OS === 'android' ? height + bottom : height;
}

/**
 * Whether the keyboard has taken room from the page, so that what is at the foot of it (the dock, the navigation) has to
 * step aside. On Android the keyboard covers the page, as it does on iOS, and they would be under it; but there they are taken
 * away, and the page is as tall as it can be (it is lifted over the keyboard, see `useKeyboardOverlap`). On iOS taking them
 * away and bringing them back would lay the page out again with each keyboard, also the keyboard of a sheet over the page,
 * and a long list under it would draw more rows each time.
 */
export function useKeyboardTakesRoom() {
  return useKeyboardHeight(Platform.OS !== 'ios') > 0;
}

// How tall the keyboard has been the last time it was up, 0 until one has. It is learnt once for the whole app, from the
// first keyboard that is on the screen, so that a sheet that is opened for the first time already knows it. And it is the
// keyboard that has come up (`keyboardDidShow`) that counts, not the one that is announced: the warm-up of the keyboard
// (see KeyboardWarmUp) has one announced that never comes, and a sheet sized for it would be too short.
let lastHeight = 0;
const heightListeners = new Set<() => void>();

Keyboard.addListener('keyboardDidShow', (event) => {
  const next = event.endCoordinates.height;
  if (next <= 0 || next === lastHeight) return;
  // On Android the keyboards are not of one height: the one for a password has a row of digits, the one for a phone number
  // has none. What is sized for the keyboard is sized for the tallest seen, so that it does not change size as the cursor
  // goes from one field to the next.
  if (Platform.OS === 'android' && next < lastHeight) return;
  lastHeight = next;
  heightListeners.forEach((listener) => listener());
});

const subscribeToHeight = (listener: () => void) => {
  heightListeners.add(listener);
  return () => {
    heightListeners.delete(listener);
  };
};
const getLastHeight = () => lastHeight;

/**
 * How tall the keyboard was the last time it was up: it stays when the keyboard goes down again. For what
 * is sized to leave room for the keyboard and must not change size as it comes and goes. Until a keyboard
 * has been seen it is `fallback`. (On Android it is how much of the foot of the window the keyboard covers, as in
 * `useKeyboardOverlap`.)
 */
export function useLastKeyboardHeight(fallback: number) {
  const last = useSyncExternalStore(subscribeToHeight, getLastHeight);
  const { bottom } = useSafeAreaInsets();
  if (!last) return fallback;
  return Platform.OS === 'android' ? last + bottom : last;
}
