import * as SecureStore from 'expo-secure-store';

// Small settings that are kept on the device and are not secret (the language shown before anyone has
// signed in). A read that fails is "nothing saved".
export async function getItem(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // not saved: the next start falls back to the default
  }
}

export async function removeItem(key: string) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // nothing to remove
  }
}
