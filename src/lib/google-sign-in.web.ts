import { useEffect } from 'react';

import { GoogleSignInError } from '@/lib/errors';
import type { GoogleCredential } from '@/lib/google-sign-in';
import { loadScript } from '@/lib/load-script';

// The OAuth client ID of the Google Cloud project that the apps and the backend share (see docs/google-sign-in.md). It is not
// a secret. The access token Google's library gives the page is made out to it, and the backend accepts it only for a client
// that is in its list (GOOGLE_CLIENT_IDS), the same one the phone's ID token is made out to. The page's own address has to be
// among that client's "Authorized JavaScript origins" (docs/web-sign-in.md).
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

/** Whether the screens offer the Google button: in the browser, once the project's Web client ID is known. */
export const googleSignInSupported = Boolean(WEB_CLIENT_ID);

// Google's "Sign in with Google" library (Google Identity Services), loaded when a screen with the button is opened and not before.
const LIBRARY_URL = 'https://accounts.google.com/gsi/client';

/** Asks for the person's email and name, and nothing else: the scopes that need no review by Google. */
const SCOPES = 'openid email profile';

type TokenResponse = { access_token?: string; error?: string };
type TokenError = { type?: string };

/** The part of Google's library this file uses (`window.google.accounts.oauth2`): the token model, made for a page with its own button. */
type TokenClient = { requestAccessToken(overrides?: { prompt?: string }): void };
type GoogleOAuth2 = {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback: (error: TokenError) => void;
  }): TokenClient;
};

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

// The press that is waiting for Google's window. There is one window at a time.
let waiting: { resolve: (credential: GoogleCredential | null) => void; reject: (error: GoogleSignInError) => void } | undefined;

function answered(response: TokenResponse) {
  const request = waiting;
  waiting = undefined;
  if (response.access_token) {
    request?.resolve({ accessToken: response.access_token });
  } else if (response.error === 'access_denied') {
    // The person said no in Google's window: as good as closing it.
    request?.resolve(null);
  } else {
    request?.reject(new GoogleSignInError('failed'));
  }
}

function failed(error: TokenError) {
  const request = waiting;
  waiting = undefined;
  // Closing the window is not a failure, and there is nothing to say about it. A window that would not open is.
  if (error.type === 'popup_closed') {
    request?.resolve(null);
  } else {
    request?.reject(new GoogleSignInError('failed'));
  }
}

let client: TokenClient | undefined;
let library: Promise<TokenClient> | undefined;

/** Google's library, loaded and set up once. */
function loadLibrary() {
  library ??= (async () => {
    if (!WEB_CLIENT_ID) {
      throw new GoogleSignInError('not_configured');
    }
    // Already there when something else on the page has put it there.
    if (!window.google?.accounts?.oauth2) {
      await loadScript(LIBRARY_URL);
    }
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      throw new GoogleSignInError('failed');
    }
    client = oauth2.initTokenClient({ client_id: WEB_CLIENT_ID, scope: SCOPES, callback: answered, error_callback: failed });
    return client;
  })().catch((error: unknown) => {
    // A library that did not load is asked for again at the next press.
    library = undefined;
    throw error instanceof GoogleSignInError ? error : new GoogleSignInError('failed');
  });
  return library;
}

/**
 * Starts loading Google's library, so that it is there when the button is pressed: a browser opens a window only in what the person
 * just did, and a window that is opened after waiting for something is blocked.
 */
export function usePrepareGoogleSignIn() {
  useEffect(() => {
    if (WEB_CLIENT_ID) {
      loadLibrary().catch(() => undefined);
    }
  }, []);
}

/**
 * Opens Google's window to choose an account and gives back the access token for the backend to ask Google about. `null` when the
 * person closed it without choosing one: that is not a failure, and there is nothing to say about it.
 *
 * Why an access token and not an ID token, as the phone has: Google's library gives a page an ID token only through a button that
 * Google draws, and a page that has a button of its own (this one has, the same as in the app) cannot ask for one. A button of
 * Google's laid over the page's own, drawn in nothing, does not work either: Google draws it in a frame that refuses a press it cannot
 * see.
 */
export async function requestGoogleCredential(): Promise<GoogleCredential | null> {
  // With the library in place, the window opens in this very call (see usePrepareGoogleSignIn); without it, a press waits for it,
  // and the browser may then refuse the window: the person presses again, with the library there.
  const tokenClient = client ?? (await loadLibrary());
  return new Promise<GoogleCredential | null>((resolve, reject) => {
    // An earlier window that was never answered is given up.
    waiting?.resolve(null);
    waiting = { resolve, reject };
    // Always asks which account, so that the next person at this keyboard is not handed the last one.
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });
}

/**
 * The token model leaves nothing of the person behind in the page, and the window asks which account every time: there is
 * nothing to forget when they sign out.
 */
export async function forgetGoogleAccount() {}
