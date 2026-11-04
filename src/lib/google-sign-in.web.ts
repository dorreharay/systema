import { GoogleSignInError } from '@/lib/errors';

// The web build has no native Google sign-in, and its screens do not show the button.
export const googleSignInSupported = false;

export async function requestGoogleIdToken(): Promise<string | null> {
  throw new GoogleSignInError('unavailable');
}

export async function forgetGoogleAccount() {}
