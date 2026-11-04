import { Text, View } from 'react-native';

import AppleSignInButton from '@/components/apple-sign-in-button';
import GoogleSignInButton from '@/components/google-sign-in-button';
import { useAppleLibrary } from '@/lib/apple-sign-in';
import { googleSignInSupported } from '@/lib/google-sign-in';
import { useI18n } from '@/lib/i18n';

// The side of the two square buttons. Apple's guidelines have a button with only its logo square, and no smaller than the other
// ways in: the two are the same size.
const BUTTON_SIZE = 64;

type SocialSignInProps = {
  // The screen's own button is in the middle of a request.
  disabled?: boolean;
  // Puts a sentence among the screen's messages about the form; `undefined` takes the last one away.
  onError: (message: string | undefined) => void;
};

// "or", then Apple and Google side by side, as buttons with only their logo, below the button that signs in with a password.
// Shown on the sign-in and the sign-up screen alike: Apple and Google make the account when there is none. Apple goes first:
// its guidelines ask for its button to be as prominent as any other way in. Nothing is drawn where neither can sign in (the
// web build).
export default function SocialSignIn({ disabled, onError }: SocialSignInProps) {
  const { t } = useI18n();
  const apple = useAppleLibrary();

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
        {apple ? <AppleSignInButton library={apple} size={BUTTON_SIZE} disabled={disabled} onError={onError} /> : null}
        <GoogleSignInButton size={BUTTON_SIZE} disabled={disabled} onError={onError} />
      </View>
    </View>
  );
}
