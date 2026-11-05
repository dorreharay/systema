import { View, type ViewProps } from 'react-native';

type EnterSubmitsProps = ViewProps & { className?: string; onSubmit: () => void };

type KeyEvent = {
  key?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  target?: { tagName?: string } | null;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

/**
 * The view that holds the fields of a form: Enter in a field of one line calls `onSubmit`, and the field's own Enter (to move to the
 * next field, as on the phone) does not happen. It is not for a field of several lines (Enter is a new line there), for a button
 * (Enter presses it), nor while a word is being composed (an IME confirms it with Enter: Japanese, say).
 */
export default function EnterSubmits({ onSubmit, ...props }: EnterSubmitsProps) {
  const web = {
    // Capturing, so that it comes before the field's own handler.
    onKeyDownCapture: (event: KeyEvent) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      if (event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229 || event.nativeEvent?.keyCode === 229) return;
      if (event.target?.tagName !== 'INPUT') return;
      event.preventDefault?.();
      event.stopPropagation?.();
      onSubmit();
    },
  };

  // (`onKeyDownCapture` is the web's, and not in React Native's own types.)
  return <View {...props} {...(web as object)} />;
}
