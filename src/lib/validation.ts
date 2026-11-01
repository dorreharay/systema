import type { TKey } from '@/lib/i18n';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

// Each check answers with the key of the message to show, or nothing when the value is fine.
type Check = TKey | undefined;

export function validateEmail(email: string): Check {
  const value = email.trim();
  if (!value) {
    return 'validation_email_required';
  }
  if (!EMAIL_PATTERN.test(value)) {
    return 'validation_email_invalid';
  }
  return undefined;
}

export function validateRequiredPassword(password: string): Check {
  return password ? undefined : 'validation_password_required';
}

export function validateNewPassword(password: string): Check {
  if (!password) {
    return 'validation_password_required';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return 'validation_password_short';
  }
  return undefined;
}

export function validatePasswordConfirmation(password: string, confirmation: string): Check {
  if (!confirmation) {
    return 'validation_confirm_required';
  }
  if (confirmation !== password) {
    return 'validation_confirm_mismatch';
  }
  return undefined;
}
