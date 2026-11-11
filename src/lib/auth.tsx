import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '@/lib/api';
import { requestAppleCredential } from '@/lib/apple-sign-in';
import {
  appleLoginRequest,
  deleteAccountRequest,
  emailConfirmed,
  fetchMe,
  forgotPasswordRequest,
  googleLoginRequest,
  loginRequest,
  logoutRequest,
  registerRequest,
  resendVerificationRequest,
  resetPasswordRequest,
  updateProfileRequest,
  verifyEmailRequest,
  type AuthResponse,
  type ProfilePatch,
  type User,
} from '@/lib/auth-api';
import { bestEffort } from '@/lib/best-effort';
import { forgetGoogleAccount, requestGoogleCredential } from '@/lib/google-sign-in';
import type { Language } from '@/lib/i18n';
import { getItem, removeItem, setItem } from '@/lib/local-storage';
import { offlineStore } from '@/lib/offline/app';
import { clearReminders } from '@/lib/reminders';
import { clearToken, getToken, saveToken } from '@/lib/token-storage';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  // `offline`: the app was opened without a connection, so `user` is what was saved on the device.
  | { status: 'signedIn'; user: User; token: string; offline?: boolean };

const USER_KEY = 'cached_user';
const RETRY_MS = 8_000;
// How long signing out waits for any one thing it takes away (the files of the offline layer, say): a storage that does not
// answer must not keep a person in the app.
const FORGET_STEP_MS = 5_000;

/** The profile as it was when last seen, so the app can open without a connection. */
async function readCachedUser() {
  try {
    const saved = await getItem(USER_KEY);
    return saved ? (JSON.parse(saved) as User) : null;
  } catch {
    return null;
  }
}

const cacheUser = (user: User) => setItem(USER_KEY, JSON.stringify(user));

type AuthContextValue = {
  /** `loading` only until the saved session has been checked, once, when the app starts. */
  status: AuthState['status'];
  user: User | null;
  token: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** `language` is the one the app is in: a new account is made in it. */
  signUp: (email: string, password: string, language?: Language) => Promise<void>;
  /**
   * Opens Google's sign-in (on the web, its window) and, once the person has chosen an account, signs in with it. Closing the sheet
   * is not an error. `language` is the one the app is in: an account that is made now is made in it.
   */
  signInWithGoogle: (language?: Language) => Promise<void>;
  /**
   * Opens Apple's sign-in sheet (on the web, its window) and, once the person has approved, signs in with it. Closing the sheet is
   * not an error. `language` is the one the app is in: an account that is made now is made in it.
   */
  signInWithApple: (language?: Language) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * The server said the session is over (a 401): this device forgets it. What the person had not sent yet stays on the phone, for
   * when they sign in again; signing out by hand is what removes it.
   */
  endSession: () => void;
  /**
   * Deletes the account and everything in it for good, then signs out. The password is what the server asks for when the
   * account has one (`invalid_password` otherwise); the session stays when it is refused.
   */
  deleteAccount: (password?: string) => Promise<void>;
  /** Saves preferences to the account and returns the user as the server now has them. */
  updateProfile: (patch: ProfilePatch) => Promise<User>;
  /** Takes a profile the server has just sent (the answer to a purchase, say) as the signed-in person's. */
  setUser: (user: User) => void;
  /** Asks the server for the profile again. Answers with it, or with `null` when the server could not be asked. */
  refreshUser: () => Promise<User | null>;
  /**
   * Types in the code that was emailed when the account was made (for an account that has to confirm its address). Once the server
   * accepts it the profile says so, and the app opens. A code the server turns down is an `ApiError`: `invalid_code`, `code_expired`,
   * `code_attempts_exceeded`.
   */
  verifyEmail: (code: string) => Promise<void>;
  /** Emails a new code. Answers with the seconds to wait before another can be asked for; `code_cooldown` and `code_limit` are `ApiError`s. */
  resendVerification: () => Promise<number>;
  requestPasswordReset: (email: string) => Promise<void>;
  /** Sets the new password with the token of the reset link. A person who is signed in on this device is signed out by it. */
  resetPassword: (token: string, password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = use(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const queryClient = useQueryClient();

  // Picks up the session saved on this device. The token is checked with the server, so a session
  // that was ended elsewhere (or whose password changed) is not restored.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setState({ status: 'signedOut' });
        return;
      }
      // The profile saved on this device opens the app at once, with a connection or without: waiting for the server would keep
      // the splash screen up for as long as a dead connection takes to give up. The server's answer follows and confirms it,
      // or ends the session (it was ended elsewhere, or the password changed).
      const cached = await readCachedUser();
      if (cached && !cancelled) setState({ status: 'signedIn', user: cached, token, offline: true });
      try {
        const user = await fetchMe(token);
        void cacheUser(user);
        if (!cancelled) setState({ status: 'signedIn', user, token });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          // The server said the token is no good: forget it.
          await clearToken();
          await removeItem(USER_KEY);
          if (!cancelled) setState({ status: 'signedOut' });
        } else if (!cached && !cancelled) {
          // No connection and nothing saved to open with.
          setState({ status: 'signedOut' });
        }
        // Otherwise the app is open on the saved profile, and the retry below asks again until the server answers.
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // The server no longer accepts this session (it ended elsewhere, the password changed, the account was
  // removed): any request that is answered with 401 sends the person back to sign in, instead of leaving
  // them on a screen that can no longer load anything.
  const endSession = useCallback(() => {
    // Deferred: this runs while the cache is notifying, and clearing it right there would cut that short.
    setTimeout(async () => {
      await clearToken();
      await removeItem(USER_KEY);
      queryClient.clear();
      setState((current) => (current.status === 'signedIn' ? { status: 'signedOut' } : current));
    }, 0);
  }, [queryClient]);

  // The server turns the account away until its address is confirmed, though the profile on the phone says it is (one saved before the
  // server asked for it): the screen for the code comes up. (The profile is asked for again each time the app comes to the front, which
  // puts it right for good.)
  const askForCode = useCallback(() => {
    setState((current) =>
      current.status === 'signedIn' && emailConfirmed(current.user)
        ? { ...current, user: { ...current.user, email_verified: false } }
        : current
    );
  }, []);

  useEffect(() => {
    const sessionEnded = (error: unknown) => error instanceof ApiError && error.status === 401;
    const unconfirmed = (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === 'email_not_verified';
    const react = (error: unknown) => {
      if (sessionEnded(error)) endSession();
      else if (unconfirmed(error)) askForCode();
    };
    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') react(event.action.error);
    });
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') react(event.action.error);
    });
    return () => {
      stopQueries();
      stopMutations();
    };
  }, [queryClient, endSession, askForCode]);

  // Opened offline: ask again until the server answers, so the profile is the real one and a session
  // that was ended elsewhere is noticed.
  const offlineToken = state.status === 'signedIn' && state.offline ? state.token : null;
  useEffect(() => {
    if (!offlineToken) return;
    const timer = setInterval(async () => {
      try {
        const user = await fetchMe(offlineToken);
        void cacheUser(user);
        setState({ status: 'signedIn', user, token: offlineToken });
        void queryClient.invalidateQueries();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearToken();
          await removeItem(USER_KEY);
          queryClient.clear();
          setState({ status: 'signedOut' });
        }
      }
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [offlineToken, queryClient]);

  // The plan can change without the app (a renewal, a refund, a purchase made on another device): the profile is asked for again each time
  // the app comes to the front. Without a connection, or when the session is over, the profile on the phone stays; the requests that
  // follow notice a session that has ended.
  const sessionToken = state.status === 'signedIn' ? state.token : null;
  useEffect(() => {
    if (!sessionToken) return;
    const listener = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return;
      try {
        const user = await fetchMe(sessionToken);
        void cacheUser(user);
        setState((current) =>
          current.status === 'signedIn' && current.token === sessionToken ? { status: 'signedIn', user, token: sessionToken } : current
        );
      } catch {
        // kept as it is
      }
    });
    return () => listener.remove();
  }, [sessionToken]);

  async function startSession({ user, token }: AuthResponse) {
    await saveToken(token);
    void cacheUser(user);
    setState({ status: 'signedIn', user, token });
  }

  /**
   * Forgets the session on this device: the token, the saved profile, the Google account, the reminders and what was cached. The
   * copy of their data that the phone keeps, and what they had not sent, go with it, unless `keepUnsent` is set: a stringer who
   * signs in again with a new password is the same stringer, and has the changes they made without a connection still to send.
   *
   * Each step is done as well as it can be and none stops the next, so whatever goes wrong (the files cannot be removed, the
   * storage does not answer) the person ends up signed out, never in the app behind an error. This never rejects.
   */
  async function forgetSession({ keepUnsent = false }: { keepUnsent?: boolean } = {}) {
    const forget = (step: () => unknown) =>
      bestEffort(step, FORGET_STEP_MS, (error) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[auth] part of the session was not forgotten', error);
      });
    // The token first: it is what brings the person back in at the next start.
    await forget(clearToken);
    await forget(() => removeItem(USER_KEY));
    // The next sign-in with Google must ask which account, not hand over this one.
    await forget(forgetGoogleAccount);
    // The reminders are about this stringer's orders: they must not go on showing up on a phone nobody is signed in on.
    await forget(clearReminders);
    if (!keepUnsent) await forget(() => offlineStore.wipe());
    // The next person to sign in on this device must not see this stringer's orders, even for a moment.
    queryClient.clear();
    setState({ status: 'signedOut' });
  }

  const value: AuthContextValue = {
    status: state.status,
    user: state.status === 'signedIn' ? state.user : null,
    token: state.status === 'signedIn' ? state.token : null,
    signIn: async (email, password) => startSession(await loginRequest(email, password)),
    signUp: async (email, password, language) => startSession(await registerRequest(email, password, language)),
    signInWithGoogle: async (language) => {
      const credential = await requestGoogleCredential();
      // The person closed Google's sheet without choosing an account.
      if (credential) {
        await startSession(await googleLoginRequest(credential, language));
      }
    },
    signInWithApple: async (language) => {
      const credential = await requestAppleCredential();
      // The person closed Apple's sheet without approving.
      if (credential) {
        await startSession(await appleLoginRequest(credential, language));
      }
    },
    signOut: async () => {
      if (state.status === 'signedIn') {
        // Ending the session on the server is best effort: the device forgets it either way.
        await logoutRequest(state.token).catch(() => undefined);
      }
      await forgetSession();
    },
    endSession,
    deleteAccount: async (password) => {
      if (state.status !== 'signedIn') {
        throw new Error('Not signed in');
      }
      await deleteAccountRequest(state.token, password);
      await forgetSession();
    },
    updateProfile: async (patch) => {
      if (state.status !== 'signedIn') {
        throw new Error('Not signed in');
      }
      const user = await updateProfileRequest(state.token, patch);
      void cacheUser(user);
      setState({ status: 'signedIn', user, token: state.token });
      return user;
    },
    setUser: (user) => {
      if (state.status !== 'signedIn') return;
      void cacheUser(user);
      setState({ status: 'signedIn', user, token: state.token });
    },
    refreshUser: async () => {
      if (state.status !== 'signedIn') return null;
      try {
        const user = await fetchMe(state.token);
        void cacheUser(user);
        setState({ status: 'signedIn', user, token: state.token });
        return user;
      } catch {
        return null;
      }
    },
    verifyEmail: async (code) => {
      if (state.status !== 'signedIn') {
        throw new Error('Not signed in');
      }
      const user = await verifyEmailRequest(state.token, code);
      void cacheUser(user);
      setState({ status: 'signedIn', user, token: state.token });
    },
    resendVerification: async () => {
      if (state.status !== 'signedIn') {
        throw new Error('Not signed in');
      }
      return (await resendVerificationRequest(state.token)).retry_after;
    },
    requestPasswordReset: async (email) => {
      await forgotPasswordRequest(email);
    },
    resetPassword: async (token, password) => {
      await resetPasswordRequest(token, password);
      // The server has ended every session opened before now. If someone is signed in here (the link can be asked for in
      // Settings), this device forgets its session at once and not at the next request answered with 401: they sign in
      // again with the new password, and find what they had not sent yet still waiting.
      if (state.status === 'signedIn') {
        await forgetSession({ keepUnsent: true });
      }
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}
