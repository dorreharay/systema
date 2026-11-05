import { useEffect } from 'react';

import { AppleSignInError } from '@/lib/errors';
import { loadScript } from '@/lib/load-script';

// What Apple gave the page, in the shape the native sign-in has (see apple-sign-in.ts): the signed proof of who signed in, and a
// code the server can trade for a refresh token.
export type AppleCredential = {
  identityToken: string;
  authorizationCode: string | null;
  // Apple gives the name only the first time a person signs in to the app with it.
  fullName: string | null;
};

// The Services ID of the web sign-in (docs/web-sign-in.md). It is not a secret. The identity token Apple's library gives the
// page is made out to it, and not to the app's bundle ID, which is why the backend lists it too (APPLE_CLIENT_IDS). Without
// it the web build has no Apple button: Apple's library works only on an https address that is registered for the Services ID,
// so a page opened from localhost cannot use it.
const SERVICES_ID = process.env.EXPO_PUBLIC_APPLE_SERVICES_ID?.trim();

// Sign in with Apple JS, which is loaded when a screen with the button is opened and not before.
const LIBRARY_URL = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

type AppleResponse = {
  authorization?: { code?: string; id_token?: string };
  // Only the first time a person signs in to the app with Apple.
  user?: { name?: { firstName?: string; lastName?: string } };
};

/** The part of Apple's library this file uses (`window.AppleID`). */
type AppleID = {
  auth: {
    init(config: { clientId: string; scope: string; redirectURI: string; usePopup: true }): void;
    signIn(): Promise<AppleResponse>;
  };
};

declare global {
  interface Window {
    AppleID?: AppleID;
  }
}

/** Stands for Apple's library where the screens ask whether it is there: on the web it is, whenever the Services ID is known. */
export type AppleLibrary = { readonly web: true };
const WEB_LIBRARY: AppleLibrary = { web: true };

// Set once Apple's library is in the page and has been told who the page is. A press that finds it so can open Apple's window in
// that very press, which is all a browser allows a page to do (it blocks a window that is opened after waiting for something).
let initialized: AppleID | undefined;
let library: Promise<AppleID> | undefined;

/** Apple's library, loaded and set up once. */
function loadLibrary() {
  library ??= (async () => {
    if (!SERVICES_ID) {
      throw new AppleSignInError('unavailable');
    }
    // Already there when something else on the page has put it there.
    if (!window.AppleID) {
      await loadScript(LIBRARY_URL);
    }
    const apple = window.AppleID;
    if (!apple) {
      throw new AppleSignInError('failed');
    }
    // In a window of its own, and with this page as the place the answer goes back to: Apple posts the answer to that address's
    // origin, so it has to be the page's own, and registered with the Services ID as one of its Return URLs.
    apple.auth.init({ clientId: SERVICES_ID, scope: 'name email', redirectURI: `${window.location.origin}/`, usePopup: true });
    initialized = apple;
    return apple;
  })().catch((error: unknown) => {
    // A library that did not load is asked for again at the next press.
    library = undefined;
    throw error instanceof AppleSignInError ? error : new AppleSignInError('failed');
  });
  return library;
}

/**
 * Stands for the library where the screens ask whether this device can sign in with Apple: it can in a browser, once the Services
 * ID is known, and null for good where it is not. Starts loading Apple's library at once, so that it is there when the button is
 * pressed.
 */
export function useAppleLibrary() {
  useEffect(() => {
    if (SERVICES_ID) {
      loadLibrary().catch(() => undefined);
    }
  }, []);

  return SERVICES_ID ? WEB_LIBRARY : null;
}

/** What Apple's window answered, or null when it was closed without an answer. */
async function signInWith(apple: AppleID): Promise<AppleCredential | null> {
  try {
    // Called before anything is waited for: this is where the window opens, and it has to be in the press.
    const response = await apple.auth.signIn();
    const identityToken = response?.authorization?.id_token;
    if (!identityToken) {
      throw new AppleSignInError('failed');
    }
    const name = [response.user?.name?.firstName, response.user?.name?.lastName].filter(Boolean).join(' ');
    return { identityToken, authorizationCode: response.authorization?.code ?? null, fullName: name || null };
  } catch (error) {
    if (error instanceof AppleSignInError) {
      throw error;
    }
    // Apple's library rejects with `{ error: '<code>' }`. The person closing the window (or starting again) is not a failure,
    // and there is nothing to say about it.
    const code = typeof error === 'object' && error !== null && 'error' in error ? String(error.error) : '';
    if (['popup_closed_by_user', 'user_cancelled_authorize', 'user_trigger_new_signin_flow'].includes(code)) {
      return null;
    }
    if (__DEV__) {
      console.warn('[apple] sign-in failed:', error);
    }
    throw new AppleSignInError('failed');
  }
}

/**
 * Opens Apple's window and gives back what the backend needs. `null` when the person closed it: that is not a failure, and
 * there is nothing to say about it.
 */
export async function requestAppleCredential(): Promise<AppleCredential | null> {
  if (!SERVICES_ID) {
    throw new AppleSignInError('unavailable');
  }
  // With the library in place, the window opens in this very call (see `initialized`); without it, a press waits for it, and the
  // browser may then refuse the window: the person presses again, with the library there.
  return signInWith(initialized ?? (await loadLibrary()));
}
