const KEY = 'auth_token';

// expo-secure-store has no web version. localStorage is readable by any script on the page, so keep the web build free of
// third-party scripts: the only ones it has are the sign-in libraries of Google and Apple, which are loaded where the buttons
// are (the sign-in and sign-up screens) and nowhere else, and a host of the web build should allow no others (docs/web-sign-in.md).
export async function getToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string) {
  localStorage.setItem(KEY, token);
}

export async function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage is not available: there is nothing to clear
  }
}
