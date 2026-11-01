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
    // False until the first-run setup is done; the app shows the setup screen while it is.
    setup_completed: user.setup_completed_at !== null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}
