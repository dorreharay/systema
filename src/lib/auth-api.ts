import { api } from '@/lib/api';

export type User = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'user' | 'admin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AuthResponse = { user: User; token: string };

export const loginRequest = (email: string, password: string) =>
  api<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password } });

export const registerRequest = (email: string, password: string) =>
  api<AuthResponse>('/api/auth/register', { method: 'POST', body: { email, password } });

// A short timeout: this is the request the app waits for before it shows anything.
export const fetchMe = (token: string) => api<User>('/api/auth/me', { token, timeoutMs: 8_000 });

export const logoutRequest = (token: string) =>
  api<{ ok: true }>('/api/auth/logout', { method: 'POST', token });

export const forgotPasswordRequest = (email: string) =>
  api<{ ok: true }>('/api/auth/forgot-password', { method: 'POST', body: { email } });

export const resetPasswordRequest = (token: string, password: string) =>
  api<{ ok: true }>('/api/auth/reset-password', { method: 'POST', body: { token, password } });
