import Constants from 'expo-constants';
import { Platform, TurboModuleRegistry } from 'react-native';

const API_PORT = 4000;
const REQUEST_TIMEOUT_MS = 10_000;

/** The machine that runs Metro. `undefined` when the app was not loaded from one. */
function devServerHost() {
  // "192.168.0.88:8081", when the app is opened from the Expo CLI
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0];
  }
  // A development build opened from its own launcher has no such setting. Then it is the address
  // the JavaScript bundle was loaded from, which is where Expo itself looks for the server.
  try {
    const sourceCode = TurboModuleRegistry.get<{ getConstants(): { scriptURL?: string | null } }>(
      'SourceCode'
    );
    return sourceCode?.getConstants().scriptURL?.match(/^https?:\/\/([^:/]+)/)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Where the backend is. Set EXPO_PUBLIC_API_URL to point at a deployed one. While developing it is
 * found on its own: the machine that runs Metro, on the port the backend uses (so a phone on the same
 * network reaches it without any setting).
 */
function apiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (__DEV__) {
    if (Platform.OS === 'web') {
      return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
    }
    let host = devServerHost();
    // On an Android emulator `localhost` is the emulator itself; the computer is at 10.0.2.2.
    if (host === 'localhost' && Platform.OS === 'android') {
      host = '10.0.2.2';
    }
    if (host) {
      return `http://${host}:${API_PORT}`;
    }
  }
  throw new Error('The backend address is unknown: set EXPO_PUBLIC_API_URL');
}

/**
 * An answer from the backend that is not a success: `{ error, code?, fields? }`. Status 0 and code
 * `network` mean the server could not be reached at all.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;

  constructor(status: number, message: string, code?: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
};

export async function api<T>(
  path: string,
  { method = 'GET', body, token, timeoutMs = REQUEST_TIMEOUT_MS }: RequestOptions = {}
): Promise<T> {
  // Outside the try below: a missing address is a mistake in the setup, not a lost connection.
  const url = `${apiUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn(`[api] ${method} ${url} failed:`, error);
    }
    throw new ApiError(0, 'The server could not be reached', 'network');
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? response.statusText, data?.code, data?.fields);
  }
  return data as T;
}
