import { Directory, File, Paths } from 'expo-file-system';

// The drafts of orders, kept on the device: a small file for each, in the folder of the app's documents,
// which the system does not clear. A read or a write that fails is "nothing saved".
const folder = new Directory(Paths.document, 'order-drafts');
const fileOf = (key: string) => new File(folder, `${key}.json`);

export async function readDraftFile(key: string) {
  try {
    const file = fileOf(key);
    return file.exists ? await file.text() : null;
  } catch {
    return null;
  }
}

export async function writeDraftFile(key: string, text: string) {
  try {
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    const file = fileOf(key);
    if (!file.exists) file.create();
    await file.write(text);
  } catch {
    // not saved: the form still has what was typed
  }
}

export async function removeDraftFile(key: string) {
  try {
    const file = fileOf(key);
    if (file.exists) file.delete();
  } catch {
    // nothing to remove
  }
}

/** Whether a picture that a draft points at is still there: the system clears the cache it was taken to. */
export function pictureExists(uri: string) {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}
