import { useState } from 'react';
import { Text, View } from 'react-native';

import GoogleIcon from '@/components/icons/google-icon';
import Shortcut from '@/components/ui/shortcut';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { googleSignInSupported } from '@/lib/google-sign-in';
import { useI18n } from '@/lib/i18n';

// Google's own colours for its dark button, which is the one made for a dark background like the photo of the sign-in
// screens: the fill, the outline and the label, with its "G". Its branding guidelines ask for them as they are.
const GOOGLE_FILL = '#131314';
const GOOGLE_OUTLINE = 'border-[#8E918F]';
const GOOGLE_LABEL = '#E3E3E3';

type GoogleSignInButtonProps = {
  // The screen's own button is in the middle of a request.
  disabled?: boolean;
  // Puts a sentence among the screen's messages about the form; `undefined` takes the last one away.
  onError: (message: string | undefined) => void;
};

// "or" and the Google button, below the button that signs in with a password. Shown on the sign-in and the sign-up
// screen alike: Google makes the account when there is none.
export default function GoogleSignInButton({ disabled, onError }: GoogleSignInButtonProps) {
  const { t } = useI18n();
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

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
      await signInWithGoogle();
    } catch (error) {
      onError(describeError(error, t));
    }
    setBusy(false);
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-white/25" />
        <Text className="text-sm text-white/70">{t('or_divider')}</Text>
        <View className="h-px flex-1 bg-white/25" />
      </View>
      <Shortcut
        label={t('continue_with_google')}
        icon={GoogleIcon}
        color={GOOGLE_FILL}
        contentColor={GOOGLE_LABEL}
        className={`border ${GOOGLE_OUTLINE}`}
        onPress={press}
        loading={busy}
        disabled={disabled}
      />
    </View>
  );
}
