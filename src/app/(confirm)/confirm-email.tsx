import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import AuthSubmit from '@/components/auth-submit';
import FormMessage from '@/components/form-message';
import TextField from '@/components/text-field';
import { colors } from '@/components/ui/colors';
import Shortcut from '@/components/ui/shortcut';
import { useAuth } from '@/lib/auth';
import { describeAuthError, isApiError, isOffline } from '@/lib/errors';
import { useI18n, type Translate } from '@/lib/i18n';

const CODE_LENGTH = 6;
// How long the server makes a person wait for another code (its setting, 60 seconds unless changed). It is only used to show the wait at
// once for an account that was made a moment ago; the server says how long it really is when it is asked too soon.
const RESEND_SECONDS = 60;

/** What was typed or pasted ("123 456", as it is copied from the email), as the digits of a code: no more than a code has. */
const digitsOf = (text: string) => text.replace(/\D/g, '').slice(0, CODE_LENGTH);

/** What to tell the person about a code the server turned down; the others are the usual ones. */
function describeCodeError(error: unknown, t: Translate) {
  if (isApiError(error, 'invalid_code') && typeof error.data?.attempts_left === 'number') {
    return t('error_invalid_code_left', { left: error.data.attempts_left });
  }
  return describeAuthError(error, t);
}

/** Whole seconds left of a wait that begins at once, and a way to begin another. Stops counting at zero. */
function useCountdown(initial: number) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + initial * 1000);
  const [left, setLeft] = useState(initial);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLeft(remaining);
      return remaining;
    };
    if (tick() === 0) return;
    const timer = setInterval(() => {
      if (tick() === 0) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [endsAt]);

  return [left, (seconds: number) => setEndsAt(Date.now() + seconds * 1000)] as const;
}

export default function ConfirmEmail() {
  const { t } = useI18n();
  const { user, verifyEmail, resendVerification, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  // An account made a moment ago was sent its first code a moment ago: asking for another has to wait (the server would say so).
  const [initialWait] = useState(() => {
    const age = user ? (Date.now() - Date.parse(user.created_at)) / 1000 : Infinity;
    return age >= 0 && age < RESEND_SECONDS ? Math.ceil(RESEND_SECONDS - age) : 0;
  });
  const [wait, startWait] = useCountdown(initialWait);

  async function submit(value: string) {
    if (submitting || value.length !== CODE_LENGTH) {
      return;
    }
    setSubmitting(true);
    setFormError(undefined);
    try {
      // Once the server takes the code the profile says the address is confirmed, and the root layout moves to the app.
      await verifyEmail(value);
    } catch (error) {
      setFormError(describeCodeError(error, t));
      // A code the server has turned down is no use again; one that did not get through (no connection) is kept to be sent again.
      if (!isOffline(error)) {
        setCode('');
      }
      setSubmitting(false);
    }
  }

  const change = (text: string) => {
    const digits = digitsOf(text);
    setCode(digits);
    setFormError(undefined);
    // The last digit sends it: no need to look for the button (the button is there all the same).
    if (digits.length === CODE_LENGTH) {
      void submit(digits);
    }
  };

  async function resend() {
    if (resending || wait > 0) {
      return;
    }
    setResending(true);
    setFormError(undefined);
    try {
      startWait(await resendVerification());
      setResent(true);
      setCode('');
    } catch (error) {
      if (isApiError(error, 'code_cooldown') && error.data?.retry_after) {
        // Too soon after the last one: the server says how long to wait, and the button counts it down.
        startWait(error.data.retry_after);
      } else {
        setFormError(describeAuthError(error, t));
      }
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout
      title={t('confirm_email_title')}
      subtitle={t('confirm_email_subtitle', { email: user?.email ?? '' })}
      centered
      footer={
        <View className="items-center">
          <View className="min-h-12 flex-row flex-wrap items-center justify-center">
            <Text className="text-[15.4px] font-normal text-white/80">
              {resent && wait > 0 ? t('resend_done') : t('resend_question')}
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              disabled={resending || wait > 0}
              className="min-h-12 justify-center px-2.5 hover:opacity-80 active:opacity-70"
              onPress={resend}>
              <Text className={`text-[15.4px] font-medium text-white ${wait > 0 ? 'opacity-60' : ''}`}>
                {resending ? t('resend_sending') : wait > 0 ? t('confirm_resend_wait', { seconds: wait }) : t('resend_action')}
              </Text>
            </Pressable>
          </View>
          {/* The address may have been typed wrong: starting over is signing out and signing up again. */}
          <View className="min-h-12 flex-row flex-wrap items-center justify-center">
            <Text className="text-[15.4px] font-normal text-white/80">{t('confirm_wrong_email')}</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              className="min-h-12 justify-center px-2.5 hover:opacity-80 active:opacity-70"
              onPress={() => void signOut()}>
              <Text className="text-[15.4px] font-medium text-white">{t('sign_out')}</Text>
            </Pressable>
          </View>
        </View>
      }>
      <View className="gap-4">
        <TextField
          label={t('field_confirm_code')}
          value={code}
          onChangeText={change}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => void submit(code)}
        />
        {formError ? <FormMessage message={formError} /> : null}
        <View className="pt-4">
          <AuthSubmit>
            {/* iOS puts a floating "Done" key above the number pad, over the right end of the button: the room under the button lifts the form
                (see AuthLayout) clear of it. */}
            <View className="ios:pb-6">
              <Shortcut
                slim
                label={t('confirm_action')}
                color={colors.white}
                contentColor={colors.ink}
                onPress={() => void submit(code)}
                loading={submitting}
                disabled={code.length !== CODE_LENGTH}
              />
            </View>
          </AuthSubmit>
        </View>
      </View>
    </AuthLayout>
  );
}
