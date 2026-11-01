export async function getItem(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage is not available: the next start falls back to the default
  }
}

export async function removeItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing to remove
  }
}
