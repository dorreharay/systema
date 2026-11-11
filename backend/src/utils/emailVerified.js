import { config } from '../config.js';

/**
 * Whether the account has to confirm its email address before it is used: confirming is required at this server (see config.js) and the
 * address has not been confirmed yet. `settings` is for a test.
 */
export const needsConfirmation = (user, settings = config.emailVerification) => settings.required && !user.email_verified_at;
