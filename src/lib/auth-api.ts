import { api } from '@/lib/api';
import type { AppleCredential } from '@/lib/apple-sign-in';
import type { Language } from '@/lib/i18n';
import type { TensionUnit } from '@/lib/types';

export type User = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'user' | 'admin';
  is_active: boolean;
  workshop_name: string | null;
  currency: string;
  tension_unit: TensionUnit;
  timezone: string;
  language: Language;
  notifications_enabled: boolean;
  // False for an account made with Google or Apple: there is no password to confirm deleting it with. A profile that an older version
  // of the app saved on the device does not say, and is taken to have one.
  has_password: boolean;
  // False until the first-run setup has been completed.
  setup_completed: boolean;
  created_at: string;
  updated_at: string;
};

/** What PATCH /api/auth/me accepts. */
export type ProfilePatch = Partial<
  Pick<
    User,
    | 'full_name'
    | 'workshop_name'
    | 'currency'
    | 'tension_unit'
    | 'timezone'
    | 'language'
    | 'notifications_enabled'
  >
> & { setup_completed?: true };

export type AuthResponse = { user: User; token: string };

export const loginRequest = (email: string, password: string) =>
  api<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password } });

/** The language the app is in goes along, so that the account is made in it. */
export const registerRequest = (email: string, password: string, language?: Language) =>
  api<AuthResponse>('/api/auth/register', { method: 'POST', body: { email, password, language } });

/**
 * Signs in (or up) with the ID token Google gave the app: the server checks it, and finds or makes the account (in the language the
 * app is in, which an account that exists already keeps its own).
 */
export const googleLoginRequest = (idToken: string, language?: Language) =>
  api<AuthResponse>('/api/auth/google', { method: 'POST', body: { id_token: idToken, language } });

/**
 * Signs in (or up) with what Apple gave the app: the server checks the identity token, and finds or makes the account.
 * The name is sent because Apple gives it only the first time; the code lets the server revoke Apple's token on deletion.
 */
export const appleLoginRequest = (credential: AppleCredential, language?: Language) =>
  api<AuthResponse>('/api/auth/apple', {
    method: 'POST',
    body: {
      identity_token: credential.identityToken,
      language,
      ...(credential.authorizationCode && { authorization_code: credential.authorizationCode }),
      ...(credential.fullName && { full_name: credential.fullName }),
    },
  });

// A short timeout: this is the request the app waits for before it shows anything.
export const fetchMe = (token: string) => api<User>('/api/auth/me', { token, timeoutMs: 8_000 });

export const logoutRequest = (token: string) =>
  api<{ ok: true }>('/api/auth/logout', { method: 'POST', token });

/** Deletes the account and everything in it, for good. The password is what the server asks for when the account has one. */
export const deleteAccountRequest = (token: string, password?: string) =>
  api<{ ok: true }>('/api/auth/delete-account', { method: 'POST', token, body: { password } });

export const forgotPasswordRequest = (email: string) =>
  api<{ ok: true }>('/api/auth/forgot-password', { method: 'POST', body: { email } });

export const resetPasswordRequest = (token: string, password: string) =>
  api<{ ok: true }>('/api/auth/reset-password', { method: 'POST', body: { token, password } });

export const updateProfileRequest = (token: string, patch: ProfilePatch) =>
  api<User>('/api/auth/me', { method: 'PATCH', token, body: patch });
