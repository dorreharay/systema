const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string) {
  const value = email.trim();
  if (!value) {
    return 'Введіть email';
  }
  if (!EMAIL_PATTERN.test(value)) {
    return 'Некоректний email';
  }
  return undefined;
}

export function validateRequiredPassword(password: string) {
  return password ? undefined : 'Введіть пароль';
}

export function validateNewPassword(password: string) {
  if (!password) {
    return 'Введіть пароль';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Мінімум ${MIN_PASSWORD_LENGTH} символів`;
  }
  return undefined;
}

export function validatePasswordConfirmation(password: string, confirmation: string) {
  if (!confirmation) {
    return 'Підтвердіть пароль';
  }
  if (confirmation !== password) {
    return 'Паролі не збігаються';
  }
  return undefined;
}
