import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import GoogleIcon from '@/components/icons/google-icon';
import { useAuth } from '@/lib/auth';
import { describeAuthError } from '@/lib/errors';
import { googleSignInSupported, usePrepareGoogleSignIn } from '@/lib/google-sign-in';
import { useI18n } from '@/lib/i18n';

// Google's own colours for its dark button, which is the one made for a dark background like the photo of the sign-in
// screens: the fill and the outline, with its "G" in the middle. Its branding guidelines ask for them as they are.
const GOOGLE_FILL = '#131314';
const GOOGLE_OUTLINE = 'border-[#8E918F]';
const GOOGLE_SPINNER = '#E3E3E3';
// The "G" is a bit over a third of the side of the button: next to the logo Apple's button draws, which is smaller, a bigger
// one would look heavier.
const ICON_RATIO = 0.38;

type GoogleSignInButtonProps = {
  // The side of the square the button is, and the radius of its corners.
  size: number;
  radius: number;
  // The screen's own button is in the middle of a request.
  disabled?: boolean;
  // Puts a sentence among the screen's messages about the form; `undefined` takes the last one away.
  onError: (message: string | undefined) => void;
};

// The Google button, with only its "G" (Google's branding guidelines have that button too), among the ways in below the button
// that signs in with a password (see SocialSignIn). Shown on the sign-in and the sign-up screen alike: Google makes the account
// when there is none.
export default function GoogleSignInButton({ size, radius, disabled, onError }: GoogleSignInButtonProps) {
  const { t, language } = useI18n();
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  // On the web, Google's library has to be in the page before the press: see usePrepareGoogleSignIn.
  usePrepareGoogleSignIn();

  if (!googleSignInSupported) {
    return null;
  }

  const press = async () => {
    if (busy) {
      return;
    }
    onError(undefined);
    setBusy(true);
    try {
      // On success the root layout moves a signed-in user to the app: nothing to navigate to here.
      await signInWithGoogle(language);
    } catch (error) {
      onError(describeAuthError(error, t));
    }
    setBusy(false);
  };

  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('continue_with_google')}
      accessibilityState={{ busy, disabled: !!inactive }}
      disabled={inactive}
      onPress={press}
      // The corners curve the way the system's Apple button beside it has them.
      style={{ width: size, height: size, borderRadius: radius, borderCurve: 'continuous', backgroundColor: GOOGLE_FILL }}
      className={`items-center justify-center border ${GOOGLE_OUTLINE} hover:opacity-90 active:opacity-80 ${
        inactive ? 'opacity-60' : ''
      }`}>
      {busy ? <ActivityIndicator color={GOOGLE_SPINNER} /> : <GoogleIcon size={Math.round(size * ICON_RATIO)} />}
    </Pressable>
  );
}
