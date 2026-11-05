import { useEffect, useState, useSyncExternalStore } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * How tall the on-screen keyboard is right now, 0 when it is hidden. A sheet needs it to stay above the
 * keyboard on iOS, where the keyboard covers the screen instead of shrinking it. Off, it stays 0 and listens to nothing.
 */
export function useKeyboardHeight(enabled = true) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!enabled) return;
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

  return height;
}

/**
 * Whether the keyboard has taken room from the page, so that what is at the foot of it (the dock, the navigation) has to
 * step aside. On Android the window shrinks for the keyboard and they would ride on top of it. On iOS the keyboard covers
 * the screen and nothing moves: taking them away and bringing them back would lay the page out again with each keyboard,
 * also the keyboard of a sheet over the page, and a long list under it would draw more rows each time.
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
 * has been seen it is `fallback`.
 */
export function useLastKeyboardHeight(fallback: number) {
  return useSyncExternalStore(subscribeToHeight, getLastHeight) || fallback;
}
