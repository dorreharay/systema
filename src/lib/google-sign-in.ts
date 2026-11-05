import { Platform, TurboModuleRegistry } from 'react-native';

import { GoogleSignInError } from '@/lib/errors';

// The OAuth client IDs of the Google Cloud project (see docs/google-sign-in.md). They are not secrets: they are inside
// every copy of the app. Google makes the token out to the Web one, which is what the backend then checks it against;
// the iOS one is the app's own.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();

// The native side of the library. A build made before the package was added does not have it, and loading the library
// there throws: so the app asks for the module first, and does without until the build is made again.
const NATIVE_GOOGLE_SIGN_IN = 'RNGoogleSignin';

/** Whether the screens offer the Google button: on a phone, always (the web build has its own, see google-sign-in.web.ts). */
export const googleSignInSupported = Platform.OS !== 'web';

/**
 * What Google gave the app to sign in with, for the backend to check: on a phone the ID token, a signed proof of who signed in;
 * on the web an access token, which the backend asks Google about (a page gets an ID token only through a button Google draws).
 */
export type GoogleCredential = { idToken: string } | { accessToken: string };

/** Gets what the button will need ready before it is pressed. A phone has nothing to get: the library is part of the app. */
export function usePrepareGoogleSignIn() {}

type Library = typeof import('@react-native-google-signin/google-signin');

let configured = false;

/** The library, or null in a build that does not contain it. Loaded when first needed, not when the app starts. */
async function loadLibrary(): Promise<Library | null> {
  if (!TurboModuleRegistry.get(NATIVE_GOOGLE_SIGN_IN)) {
    return null;
  }
  return import('@react-native-google-signin/google-signin');
}

/**
 * Opens Google's sign-in and gives back the ID token for the backend to check. `null` when the person closed it without
 * choosing an account: that is not a failure, and there is nothing to say about it.
 */
export async function requestGoogleCredential(): Promise<GoogleCredential | null> {
  if (!WEB_CLIENT_ID || (Platform.OS === 'ios' && !IOS_CLIENT_ID)) {
    throw new GoogleSignInError('not_configured');
  }
  const google = await loadLibrary();
  if (!google) {
    throw new GoogleSignInError('unavailable');
  }

  if (!configured) {
    google.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID });
    configured = true;
  }

  try {
    // Android needs Google Play services; on iOS this is always true.
    await google.GoogleSignin.hasPlayServices();
    const response = await google.GoogleSignin.signIn();
    if (!google.isSuccessResponse(response)) {
      return null;
    }
    // Without the Web client ID Google gives no token at all.
    if (!response.data.idToken) {
      throw new GoogleSignInError('failed');
    }
    return { idToken: response.data.idToken };
  } catch (error) {
    if (error instanceof GoogleSignInError) {
      throw error;
    }
    if (google.isErrorWithCode(error)) {
      // Google's sheet is already open from an earlier press: let that one finish.
      if (error.code === google.statusCodes.IN_PROGRESS) {
        return null;
      }
      if (error.code === google.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new GoogleSignInError('play_services');
      }
    }
    if (__DEV__) {
      console.warn('[google] sign-in failed:', error);
    }
    throw new GoogleSignInError('failed');
  }
}

/**
 * Makes the library forget the Google account used on this device, so the next sign-in asks which one to use instead of
 * handing the last one to whoever picks up the phone. Best effort: there is nothing to say if it does not work.
 */
export async function forgetGoogleAccount() {
  try {
    await (await loadLibrary())?.GoogleSignin.signOut();
  } catch {
    // Nothing was signed in.
  }
}
