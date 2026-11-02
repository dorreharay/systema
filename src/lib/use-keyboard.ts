import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * How tall the on-screen keyboard is right now, 0 when it is hidden. A sheet needs it to stay above the
 * keyboard on iOS, where the keyboard covers the screen instead of shrinking it.
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) =>
      setHeight(event.endCoordinates.height)
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

/**
 * How tall the keyboard was the last time it was up: it stays when the keyboard goes down again. For what
 * is sized to leave room for the keyboard and must not change size as it comes and goes. Until a keyboard
 * has been seen it is `fallback`.
 */
export function useLastKeyboardHeight(fallback: number) {
  const current = useKeyboardHeight();
  const [last, setLast] = useState(0);

  if (current > 0 && current !== last) {
    setLast(current);
  }

  return last || fallback;
}
