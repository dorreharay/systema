import { ApiError } from '@/lib/api';
import type { TKey, Translate } from '@/lib/i18n';

// The messages for the error codes the backend sends. A code with no entry falls back to what the
// status says.
const MESSAGES: Record<string, TKey> = {
  network: 'error_network',
  invalid_credentials: 'error_invalid_credentials',
  account_inactive: 'error_account_inactive',
  email_taken: 'error_email_taken',
  rate_limited: 'error_rate_limited',
  invalid_reset_token: 'error_invalid_reset_token',
  validation_error: 'error_validation',
  unsupported_image: 'error_unsupported_image',
  photo_limit: 'error_photo_limit',
  payload_too_large: 'error_photo_too_large',
};

/** What to tell the person when a request to the backend fails: never the raw text the server sent. */
export function describeError(error: unknown, t: Translate) {
  if (error instanceof ApiError) {
    if (error.code && MESSAGES[error.code]) {
      return t(MESSAGES[error.code]);
    }
    if (error.status === 404) {
      return t('error_not_found');
    }
    if (error.status >= 500) {
      return t('error_server');
    }
  }
  return t('error_generic');
}

export const isApiError = (error: unknown, code: string) =>
  error instanceof ApiError && error.code === code;

/** The server's message for one field of a form, when it named one. */
export const fieldError = (error: unknown, field: string) =>
  error instanceof ApiError ? error.fields?.[field] : undefined;

/** Whether this is a failure to reach the server at all (no connection, a timeout). */
export const isOffline = (error: unknown) => error instanceof ApiError && error.status === 0;
