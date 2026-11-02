const PREFIX = 'order-draft:';

export async function readDraftFile(key: string) {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export async function writeDraftFile(key: string, text: string) {
  try {
    localStorage.setItem(PREFIX + key, text);
  } catch {
    // storage is not available: the form still has what was typed
  }
}

export async function removeDraftFile(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // nothing to remove
  }
}
