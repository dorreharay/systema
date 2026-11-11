import { needsConfirmation } from './emailVerified.js';
import { subscriptionOf } from './plans.js';

/** A user as the API shows it: without the password hash or anything about a password reset. */
export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    is_active: user.is_active,
    workshop_name: user.workshop_name,
    currency: user.currency,
    tension_unit: user.tension_unit,
    timezone: user.timezone,
    language: user.language,
    notifications_enabled: user.notifications_enabled,
    // An account made with Google or Apple has none: the app does not ask such a person for a password to confirm deleting it.
    has_password: Boolean(user.password_hash),
    // False while the address has to be confirmed and has not been (see utils/emailVerification.js): the app asks for the code until then. Always
    // true where confirming is not required (a local server).
    email_verified: !needsConfirmation(user),
    // False until the first-run setup is done; the app shows the setup screen while it is.
    setup_completed: user.setup_completed_at !== null,
    // The plan the account holds and what it allows (see utils/plans.js).
    subscription: subscriptionOf(user),
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}
