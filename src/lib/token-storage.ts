import * as SecureStore from 'expo-secure-store';

const KEY = 'auth_token';

// The session token goes in the keychain (iOS) or the keystore (Android), not in plain storage.
// A read that fails is treated as "no token": the person signs in again.
export async function getToken() {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export const saveToken = (token: string) => SecureStore.setItemAsync(KEY, token);

export const clearToken = () => SecureStore.deleteItemAsync(KEY);
