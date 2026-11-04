import { Text, View } from 'react-native';

import AppleSignInButton from '@/components/apple-sign-in-button';
import GoogleSignInButton from '@/components/google-sign-in-button';
import { useAppleLibrary } from '@/lib/apple-sign-in';
import { googleSignInSupported } from '@/lib/google-sign-in';
import { useI18n } from '@/lib/i18n';

type SocialSignInProps = {
  // The screen's own button is in the middle of a request.
  disabled?: boolean;
  // Puts a sentence among the screen's messages about the form; `undefined` takes the last one away.
  onError: (message: string | undefined) => void;
};

// "or", then Apple and Google, below the button that signs in with a password. Shown on the sign-in and the sign-up screen
// alike: Apple and Google make the account when there is none. Apple goes first: its guidelines ask for its button to be as
// prominent as any other way in. Nothing is drawn where neither can sign in (the web build).
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
      {apple ? <AppleSignInButton library={apple} disabled={disabled} onError={onError} /> : null}
      <GoogleSignInButton disabled={disabled} onError={onError} />
    </View>
  );
}
