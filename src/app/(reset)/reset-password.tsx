import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import { useAuthRouter } from '@/components/auth-leave';
import AuthSubmit from '@/components/auth-submit';
import AuthSwitch from '@/components/auth-switch';
import FormMessage from '@/components/form-message';
import TextField, { type TextFieldRef } from '@/components/text-field';
import { colors } from '@/components/ui/colors';
import Shortcut from '@/components/ui/shortcut';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import {
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
  validatePasswordConfirmation,
} from '@/lib/validation';

function ResetPasswordForm() {
  const { t } = useI18n();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { replace } = useAuthRouter();
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const confirmationRef = useRef<TextFieldRef>(null);

  const changePassword = (value: string) => {
    setPassword(value);
    setErrors((current) => ({ ...current, password: undefined }));
  };

  const changeConfirmation = (value: string) => {
    setConfirmation(value);
    setErrors((current) => ({ ...current, confirmation: undefined }));
  };

  const submit = async () => {
    if (submitting) {
      return;
    }
    const keys = {
      password: validateNewPassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation),
    };
    setErrors({
      password: keys.password && t(keys.password, { min: MIN_PASSWORD_LENGTH }),
      confirmation: keys.confirmation && t(keys.confirmation),
    });
    setFormError(undefined);
    if (keys.password || keys.confirmation) {
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token ?? '', password);
      replace({ pathname: '/login', params: { reset: '1' } });
    } catch (failure) {
      setFormError(describeError(failure, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="gap-4">
      <TextField
        label={t('field_new_password')}
        value={password}
        onChangeText={changePassword}
        error={errors.password}
        placeholder={t('password_placeholder_min', { min: MIN_PASSWORD_LENGTH })}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmationRef.current?.focus()}
      />
      {/* No new-password hint on this one: with it, iOS goes on showing what was typed after the eye hides it again.
          It fills this field with the strong password it suggests for the one above all the same. */}
      <TextField
        ref={confirmationRef}
        label={t('field_confirm_password')}
        value={confirmation}
        onChangeText={changeConfirmation}
        error={errors.confirmation}
        placeholder={t('confirm_password_placeholder')}
        secureTextEntry
        autoCapitalize="none"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {formError ? <FormMessage message={formError} /> : null}
      <View className="pt-4">
        <AuthSubmit>
          <Shortcut slim label={t('change_password')} color={colors.white} contentColor={colors.ink} onPress={submit} loading={submitting} />
        </AuthSubmit>
      </View>
    </View>
  );
}

function ResetPasswordFooter() {
  const { t } = useI18n();
  const { status } = useAuth();
  const { back } = useAuthRouter();
  // Settled on the first render: once the password is changed the person is signed out, and the way out must not change
  // under the fade of the screen.
  const [signedIn] = useState(status === 'signedIn');

  // Someone who is signed in asked for the link in Settings. The sign-in screens are not for them: the way out is back to the app.
  if (signedIn) {
    return (
      <View className="flex-row items-center justify-center">
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => back('/home')}
          className="min-h-12 justify-center px-2.5 active:opacity-70">
          <Text className="text-[15.4px] font-medium text-white">{t('cancel')}</Text>
        </Pressable>
      </View>
    );
  }
  return <AuthSwitch question={t('reset_failed')} action={t('reset_request_new')} href="/forgot-password" replace />;
}

// Opened from the link in the password reset email: /reset-password?token=... It opens whether or not someone is signed in
// on this phone (see the root layout), and a person who is signed in is signed out once the password is changed: they sign
// in again with the new one.
export default function ResetPassword() {
  const { t } = useI18n();
  return (
    <AuthLayout title={t('reset_title')} subtitle={t('reset_subtitle')} centered footer={<ResetPasswordFooter />}>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
