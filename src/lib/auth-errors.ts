import { ApiError } from '@/lib/api';

const MESSAGES: Record<string, string> = {
  network: 'Не вдалося зʼєднатися із сервером. Перевірте інтернет і спробуйте ще раз.',
  invalid_credentials: 'Невірний email або пароль',
  account_inactive: 'Акаунт вимкнено. Зверніться до підтримки.',
  email_taken: 'Акаунт з таким email уже існує',
  rate_limited: 'Забагато спроб. Спробуйте за кілька хвилин.',
  invalid_reset_token: 'Посилання недійсне або застаріло. Запросіть нове.',
  validation_error: 'Перевірте введені дані',
};

/** What to tell the person when a request to the backend fails. */
export function describeAuthError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code && MESSAGES[error.code]) {
      return MESSAGES[error.code];
    }
    if (error.status >= 500) {
      return 'Помилка на сервері. Спробуйте пізніше.';
    }
  }
  return 'Щось пішло не так. Спробуйте ще раз.';
}

export const isApiError = (error: unknown, code: string) =>
  error instanceof ApiError && error.code === code;
