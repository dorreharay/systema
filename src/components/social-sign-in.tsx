import { Text, View } from 'react-native';

import AppleSignInButton from '@/components/apple-sign-in-button';
import GoogleSignInButton from '@/components/google-sign-in-button';
import { WIDE_RADIUS_SCALE } from '@/components/ui/button-radius';
import { useAppleLibrary } from '@/lib/apple-sign-in';
import { googleSignInSupported } from '@/lib/google-sign-in';
import { useI18n } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';

// The side of the two square buttons, and the radius of their corners. Apple's guidelines have a button with only its logo
// square, and no smaller than the other ways in: the two are the same size. They are as high as the slim buttons above them
// and have the same corners (15 on 54); the system's Apple button turns into a circle once the radius is a third of its side.
const BUTTON_SIZE = 54;
const BUTTON_RADIUS = 15;

type SocialSignInProps = {
  // The screen's own button is in the middle of a request.
  disabled?: boolean;
  // Puts a sentence among the screen's messages about the form; `undefined` takes the last one away.
  onError: (message: string | undefined) => void;
};

// "or", then Apple and Google side by side, as buttons with only their logo, below the button that signs in with a password.
// Shown on the sign-in and the sign-up screen alike: Apple and Google make the account when there is none. Apple goes first:
// its guidelines ask for its button to be as prominent as any other way in. The web build has them too (see google-sign-in.web.ts
// and the .web files of Apple's), once it knows the Web client ID of Google and the Services ID of Apple; nothing is drawn where
// neither can sign in.
export default function SocialSignIn({ disabled, onError }: SocialSignInProps) {
  const { t } = useI18n();
  const apple = useAppleLibrary();
  // On a wide screen the corners are 15% less round, like those of the buttons above (see button-radius.ts).
  const radius = useIsWide() ? BUTTON_RADIUS * WIDE_RADIUS_SCALE : BUTTON_RADIUS;

  if (!apple && !googleSignInSupported) {
    return null;
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-white/25" />
        <Text className="text-sm text-white/70">{t('or_divider')}</Text>
        <View className="h-px flex-1 bg-white/25" />
      </View>
      <View className="flex-row justify-center gap-4">
        {apple ? (
          <AppleSignInButton
            library={apple}
            size={BUTTON_SIZE}
            radius={radius}
            disabled={disabled}
            onError={onError}
          />
        ) : null}
        <GoogleSignInButton size={BUTTON_SIZE} radius={radius} disabled={disabled} onError={onError} />
      </View>
    </View>
  );
}
