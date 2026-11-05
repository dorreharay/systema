import { useState } from 'react';
import { View } from 'react-native';

import type { AppleLibrary } from '@/lib/apple-sign-in';
import { useAuth } from '@/lib/auth';
import { describeAuthError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

type AppleSignInButtonProps = {
  // The library, which is there only once Apple has said this device can sign in.
  library: AppleLibrary;
  // The side of the square the button is, and the radius of its corners.
  size: number;
  radius: number;
  // The screen's own button is in the middle of a request.
  disabled?: boolean;
  // Puts a sentence among the screen's messages about the form; `undefined` takes the last one away.
  onError: (message: string | undefined) => void;
};

// Apple's own button, as its guidelines ask: the system draws it. Square, it has room for the logo and not for the label, so
// the system draws the logo alone (white on the dark photo of the sign-in screens), with the corners of the buttons around it.
export default function AppleSignInButton({ library, size, radius, disabled, onError }: AppleSignInButtonProps) {
  const { signInWithApple } = useAuth();
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(false);

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
    <View pointerEvents={inactive ? 'none' : 'auto'} style={{ opacity: inactive ? 0.6 : 1 }}>
      <library.AppleAuthenticationButton
        buttonType={library.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={library.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={radius}
        style={{ width: size, height: size }}
        onPress={press}
      />
    </View>
  );
}
