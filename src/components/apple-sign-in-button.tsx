import { useState } from 'react';
import { View } from 'react-native';

import type { AppleLibrary } from '@/lib/apple-sign-in';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

type AppleSignInButtonProps = {
  // The library, which is there only once Apple has said this device can sign in.
  library: AppleLibrary;
  // The screen's own button is in the middle of a request.
  disabled?: boolean;
  // Puts a sentence among the screen's messages about the form; `undefined` takes the last one away.
  onError: (message: string | undefined) => void;
};

// Apple's own button, as its guidelines ask: the system draws the logo and the label ("Continue with Apple", in the language
// of the phone). White on the dark photo of the sign-in screens, as tall as the buttons around it and with their corners.
export default function AppleSignInButton({ library, disabled, onError }: AppleSignInButtonProps) {
  const { t } = useI18n();
  const { signInWithApple } = useAuth();
  const [busy, setBusy] = useState(false);

  const press = async () => {
    if (busy) {
      return;
    }
    onError(undefined);
    setBusy(true);
    try {
      // On success the root layout moves a signed-in user to the app: nothing to navigate to here.
      await signInWithApple();
    } catch (error) {
      onError(describeError(error, t));
    }
    setBusy(false);
  };

  const inactive = busy || disabled;
  return (
    <View pointerEvents={inactive ? 'none' : 'auto'} style={{ opacity: inactive ? 0.6 : 1 }}>
      <library.AppleAuthenticationButton
        buttonType={library.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={library.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={18}
        style={{ width: '100%', height: 72 }}
        onPress={press}
      />
    </View>
  );
}
