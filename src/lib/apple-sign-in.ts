import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { AppleSignInError } from '@/lib/errors';
import { NATIVE_APPLE_AUTHENTICATION, hasNativeModule } from '@/lib/native-modules';

export type AppleLibrary = typeof import('expo-apple-authentication');

/** What Apple gave the app: the signed proof of who signed in, and a code the server can trade for a refresh token. */
export type AppleCredential = {
  identityToken: string;
  authorizationCode: string | null;
  // Apple gives the name only the first time a person signs in to the app with it.
  fullName: string | null;
};

// Sign in with Apple is for iOS: Android and the web build do without it.
const appleSignInSupported = Platform.OS === 'ios';

// The native side of the library. A build made before the package was added does not have it, and loading the library
// there throws: so the app asks for the module first, and does without until the build is made again.
async function loadLibrary(): Promise<AppleLibrary | null> {
  if (!appleSignInSupported || !hasNativeModule(NATIVE_APPLE_AUTHENTICATION)) {
    return null;
  }
  return import('expo-apple-authentication');
}

let available: Promise<AppleLibrary | null> | undefined;

/** The library when this build contains it and this device can sign in with Apple, else null. Asked once. */
function loadAvailableLibrary() {
  available ??= loadLibrary()
    .then(async (apple) => ((await apple?.isAvailableAsync()) ? apple : null))
    .catch(() => null);
  return available;
}

/** The library once Apple has said this device can sign in; null until then, and for good where it cannot. */
export function useAppleLibrary() {
  const [library, setLibrary] = useState<AppleLibrary | null>(null);

  useEffect(() => {
    let live = true;
    void loadAvailableLibrary().then((apple) => {
      if (live) setLibrary(apple);
    });
    return () => {
      live = false;
    };
  }, []);

  return library;
}

/**
 * Opens Apple's sign-in sheet and gives back what the backend needs. `null` when the person closed the sheet: that is not a
 * failure, and there is nothing to say about it.
 */
export async function requestAppleCredential(): Promise<AppleCredential | null> {
  const apple = await loadLibrary();
  if (!apple) {
    throw new AppleSignInError('unavailable');
  }

  try {
    const credential = await apple.signInAsync({
      requestedScopes: [apple.AppleAuthenticationScope.FULL_NAME, apple.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) {
      throw new AppleSignInError('failed');
    }
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
    return {
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode,
      fullName: name || null,
    };
  } catch (error) {
    if (error instanceof AppleSignInError) {
      throw error;
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') {
      return null;
    }
    if (__DEV__) {
      console.warn('[apple] sign-in failed:', error);
    }
    throw new AppleSignInError('failed');
  }
}
