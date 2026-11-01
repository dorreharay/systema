import Constants from 'expo-constants';
import { Platform, TurboModuleRegistry } from 'react-native';

const API_PORT = 4000;
const REQUEST_TIMEOUT_MS = 10_000;
// A photo is several megabytes, which a phone on a slow connection takes a while to send.
const UPLOAD_TIMEOUT_MS = 60_000;

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

type SendOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: BodyInit;
  token?: string | null;
  timeoutMs: number;
};

/** Sends the request and throws an `ApiError` for anything but a success. */
async function send(path: string, { method, headers, body, token, timeoutMs }: SendOptions) {
  // Outside the try below: a missing address is a mistake in the setup, not a lost connection.
  const url = `${apiUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { ...headers, ...(token && { Authorization: `Bearer ${token}` }) },
      body,
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

  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new ApiError(response.status, data?.error ?? response.statusText, data?.code, data?.fields);
  }
  return response;
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
};

export async function api<T>(
  path: string,
  { method = 'GET', body, token, timeoutMs = REQUEST_TIMEOUT_MS }: RequestOptions = {}
): Promise<T> {
  const response = await send(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    token,
    timeoutMs,
  });
  return (await response.json().catch(() => undefined)) as T;
}

/** Sends a file as the body of a POST, and returns the JSON the server answers with. */
export async function apiUpload<T>(path: string, file: Blob, contentType: string, token?: string | null) {
  const response = await send(path, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: file,
    token,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
  return (await response.json()) as T;
}

/** Fetches a file the API serves (an order photo needs the token, so an <Image> cannot load it). */
export async function apiBlob(path: string, token?: string | null) {
  const response = await send(path, { method: 'GET', token, timeoutMs: UPLOAD_TIMEOUT_MS });
  return response.blob();
}
