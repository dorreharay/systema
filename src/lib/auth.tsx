import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { ApiError } from '@/lib/api';
import {
  fetchMe,
  forgotPasswordRequest,
  loginRequest,
  logoutRequest,
  registerRequest,
  resetPasswordRequest,
  updateProfileRequest,
  type AuthResponse,
  type ProfilePatch,
  type User,
} from '@/lib/auth-api';
import { getItem, removeItem, setItem } from '@/lib/local-storage';
import { clearToken, getToken, saveToken } from '@/lib/token-storage';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  // `offline`: the app was opened without a connection, so `user` is what was saved on the device.
  | { status: 'signedIn'; user: User; token: string; offline?: boolean };

const USER_KEY = 'cached_user';
const RETRY_MS = 8_000;

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
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Saves preferences to the account and returns the user as the server now has them. */
  updateProfile: (patch: ProfilePatch) => Promise<User>;
  requestPasswordReset: (email: string) => Promise<void>;
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
      try {
        const user = await fetchMe(token);
        void cacheUser(user);
        if (!cancelled) setState({ status: 'signedIn', user, token });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          // The server said the token is no good: forget it.
          await clearToken();
          await removeItem(USER_KEY);
        } else {
          // No connection, or the server is down: the session is not at fault. Open the app with the
          // profile saved on this device, and check again below.
          const cached = await readCachedUser();
          if (cached && !cancelled) {
            setState({ status: 'signedIn', user: cached, token, offline: true });
            return;
          }
        }
        if (!cancelled) setState({ status: 'signedOut' });
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
  useEffect(() => {
    const sessionEnded = (error: unknown) => error instanceof ApiError && error.status === 401;
    const end = () => {
      // Deferred: this runs while the cache is notifying, and clearing it right there would cut that short.
      setTimeout(async () => {
        await clearToken();
        await removeItem(USER_KEY);
        queryClient.clear();
        setState((current) => (current.status === 'signedIn' ? { status: 'signedOut' } : current));
      }, 0);
    };
    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error' && sessionEnded(event.action.error)) end();
    });
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error' && sessionEnded(event.action.error)) end();
    });
    return () => {
      stopQueries();
      stopMutations();
    };
  }, [queryClient]);

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

  async function startSession({ user, token }: AuthResponse) {
    await saveToken(token);
    void cacheUser(user);
    setState({ status: 'signedIn', user, token });
  }

  const value: AuthContextValue = {
    status: state.status,
    user: state.status === 'signedIn' ? state.user : null,
    token: state.status === 'signedIn' ? state.token : null,
    signIn: async (email, password) => startSession(await loginRequest(email, password)),
    signUp: async (email, password) => startSession(await registerRequest(email, password)),
    signOut: async () => {
      if (state.status === 'signedIn') {
        // Ending the session on the server is best effort: the device forgets it either way.
        await logoutRequest(state.token).catch(() => undefined);
      }
      await clearToken();
      await removeItem(USER_KEY);
      // The next person to sign in on this device must not see this stringer's orders, even for a moment.
      queryClient.clear();
      setState({ status: 'signedOut' });
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
    requestPasswordReset: async (email) => {
      await forgotPasswordRequest(email);
    },
    resetPassword: async (token, password) => {
      await resetPasswordRequest(token, password);
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}
