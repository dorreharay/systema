import { ApiError } from '@/lib/api';
import type { TKey, Translate } from '@/lib/i18n';

// The messages for the error codes the backend sends. A code with no entry falls back to what the
// status says.
const MESSAGES: Record<string, TKey> = {
  network: 'error_network',
  invalid_credentials: 'error_invalid_credentials',
  invalid_password: 'error_invalid_password',
  account_inactive: 'error_account_inactive',
  email_taken: 'error_email_taken',
  rate_limited: 'error_rate_limited',
  invalid_reset_token: 'error_invalid_reset_token',
  invalid_code: 'error_invalid_code',
  code_expired: 'error_code_expired',
  code_attempts_exceeded: 'error_code_attempts',
  code_cooldown: 'error_code_cooldown',
  code_limit: 'error_code_limit',
  email_not_sent: 'error_email_not_sent',
  email_not_verified: 'error_email_not_verified',
  validation_error: 'error_validation',
  unsupported_image: 'error_unsupported_image',
  photo_limit: 'error_photo_limit',
  payload_too_large: 'error_photo_too_large',
  out_of_stock: 'error_out_of_stock',
  order_limit_reached: 'error_order_limit',
  google_token_invalid: 'error_google_token',
  google_email_unverified: 'error_google_email_unverified',
  google_account_mismatch: 'error_google_mismatch',
  google_not_configured: 'error_google_unavailable',
  apple_token_invalid: 'error_apple_token',
  apple_email_missing: 'error_apple_email_missing',
  apple_account_mismatch: 'error_apple_mismatch',
  apple_not_configured: 'error_apple_unavailable',
};

/** Why signing in with Google could not be done on this device. The server turning a token down is an `ApiError`. */
export class GoogleSignInError extends Error {
  reason: 'not_configured' | 'unavailable' | 'play_services' | 'failed';

  constructor(reason: GoogleSignInError['reason']) {
    super(`Google sign-in: ${reason}`);
    this.name = 'GoogleSignInError';
    this.reason = reason;
  }
}

const GOOGLE_MESSAGES: Record<GoogleSignInError['reason'], TKey> = {
  // The build has no client IDs, or was made before the sign-in was added: nothing the person can do about either.
  not_configured: 'error_google_unavailable',
  unavailable: 'error_google_unavailable',
  play_services: 'error_google_play_services',
  failed: 'error_google_failed',
};

/** Why signing in with Apple could not be done on this device. The server turning a token down is an `ApiError`. */
export class AppleSignInError extends Error {
  reason: 'unavailable' | 'failed';

  constructor(reason: AppleSignInError['reason']) {
    super(`Apple sign-in: ${reason}`);
    this.name = 'AppleSignInError';
    this.reason = reason;
  }
}

const APPLE_MESSAGES: Record<AppleSignInError['reason'], TKey> = {
  // A build made before the sign-in was added: nothing the person can do about it.
  unavailable: 'error_apple_unavailable',
  failed: 'error_apple_failed',
};

/** What to tell the person when a request to the backend fails: never the raw text the server sent. */
export function describeError(error: unknown, t: Translate) {
  if (error instanceof GoogleSignInError) {
    return t(GOOGLE_MESSAGES[error.reason]);
  }
  if (error instanceof AppleSignInError) {
    return t(APPLE_MESSAGES[error.reason]);
  }
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

/**
 * The same for what cannot be done without a connection (signing in or up, a new password, deleting the account): with none, it
 * says so, and not only that the server could not be reached.
 */
export function describeAuthError(error: unknown, t: Translate) {
  return isOffline(error) ? t('error_network_required') : describeError(error, t);
}

export const isApiError = (error: unknown, code: string): error is ApiError =>
  error instanceof ApiError && error.code === code;

/** The server's message for one field of a form, when it named one. */
export const fieldError = (error: unknown, field: string) =>
  error instanceof ApiError ? error.fields?.[field] : undefined;

/** Whether this is a failure to reach the server at all (no connection, a timeout). */
export const isOffline = (error: unknown) => error instanceof ApiError && error.status === 0;
