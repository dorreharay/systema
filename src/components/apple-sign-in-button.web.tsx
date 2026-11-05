import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import AppleIcon from '@/components/icons/apple-icon';
import { useAuth } from '@/lib/auth';
import { describeAuthError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

// Apple's guidelines have the logo-only button black on white or white on black; white is the one made for a dark background like
// the photo of the sign-in screens, which is what the system's button is on the phone too.
const APPLE_FILL = '#FFFFFF';
const APPLE_INK = '#000000';
// The logo is a bit under half the side of the button.
const ICON_RATIO = 0.42;

type AppleSignInButtonProps = {
  // Stands for Apple's library, which is there once the Services ID of the web sign-in is known (see apple-sign-in.web.ts). The
  // button does not need it: it opens Apple's window by asking for the credential.
  library: unknown;
  // The side of the square the button is, and the radius of its corners.
  size: number;
  radius: number;
  // The screen's own button is in the middle of a request.
  disabled?: boolean;
  // Puts a sentence among the screen's messages about the form; `undefined` takes the last one away.
  onError: (message: string | undefined) => void;
};

// The button of the web build that signs in with Apple. Apple's own button for a page cannot be as small as this one (its
// library draws nothing under 130 pixels wide), so this is drawn as the guidelines have the logo-only button: the logo alone,
// black on white, with the corners of the buttons around it. A real <button>, so that the keyboard and a screen reader work.
export default function AppleSignInButton({ size, radius, disabled, onError }: AppleSignInButtonProps) {
  const { signInWithApple } = useAuth();
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);

  // The first thing this does with the press is to ask Apple's library for its window: a browser opens a window only in what the
  // person just did, and a window that is opened after waiting for something is blocked.
  const press = async () => {
    if (busy) {
      return;
    }
    onError(undefined);
    setBusy(true);
    try {
      // On success the root layout moves a signed-in user to the app: nothing to navigate to here.
      await signInWithApple(language);
    } catch (error) {
      onError(describeAuthError(error, t));
    }
    setBusy(false);
  };

  const inactive = busy || disabled;
  return (
    <button
      type="button"
      aria-label={t('continue_with_apple')}
      aria-busy={busy}
      disabled={inactive}
      onClick={() => void press()}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      // The ring is for the keyboard, not for the mouse.
      onFocus={(event) => setFocused(event.currentTarget.matches(':focus-visible'))}
      onBlur={() => setFocused(false)}
      style={{
        // The browser's own look of a button, taken away.
        appearance: 'none',
        padding: 0,
        margin: 0,
        border: 'none',
        font: 'inherit',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: APPLE_FILL,
        boxShadow: focused ? 'inset 0 0 0 3px #7C7C80' : 'none',
        outline: 'none',
        cursor: inactive ? 'default' : 'pointer',
        opacity: inactive ? 0.6 : pressed ? 0.8 : 1,
        transition: 'opacity 0.12s',
      }}>
      {busy ? <ActivityIndicator color={APPLE_INK} /> : <AppleIcon size={Math.round(size * ICON_RATIO)} color={APPLE_INK} />}
    </button>
  );
}
