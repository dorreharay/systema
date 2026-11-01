import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { ApiError } from '@/lib/api';
import {
  fetchMe,
  forgotPasswordRequest,
  loginRequest,
  logoutRequest,
  registerRequest,
  resetPasswordRequest,
  type AuthResponse,
  type User,
} from '@/lib/auth-api';
import { clearToken, getToken, saveToken } from '@/lib/token-storage';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: User; token: string };

type AuthContextValue = {
  /** `loading` only until the saved session has been checked, once, when the app starts. */
  status: AuthState['status'];
  user: User | null;
  token: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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
        if (!cancelled) setState({ status: 'signedIn', user, token });
      } catch (error) {
        // The server said the token is no good: forget it. Any other failure (no network) keeps it,
        // so the next start tries again.
        if (error instanceof ApiError && error.status === 401) {
          await clearToken();
        }
        if (!cancelled) setState({ status: 'signedOut' });
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startSession({ user, token }: AuthResponse) {
    await saveToken(token);
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
      setState({ status: 'signedOut' });
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
