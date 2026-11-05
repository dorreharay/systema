import { File, Paths } from 'expo-file-system';

import type { OfflineStorage } from './storage';

/**
 * The offline files in the document directory: the system does not clear it when the phone runs low on space, as it may the
 * cache. A file is written beside itself first and moved over the old one, so that a phone that is switched off in the middle of
 * a write is left with the old file, or the new one, and never half of either.
 */
export class FileStorage implements OfflineStorage {
  private file(name: string) {
    return new File(Paths.document, name);
  }

  async read(name: string) {
    try {
      const target = this.file(name);
      if (target.exists) return await target.text();
      // The move of a first write did not happen: what was written beside it is all there is.
      const written = this.file(`${name}.tmp`);
      return written.exists ? await written.text() : null;
    } catch {
      return null;
    }
  }

  async write(name: string, text: string) {
    const target = this.file(name);
    const written = this.file(`${name}.tmp`);
    written.create({ overwrite: true });
    await written.write(text);
    await written.move(target, { overwrite: true });
  }

  async list() {
    try {
      return Paths.document.list().map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  async remove(name: string) {
    for (const file of [this.file(name), this.file(`${name}.tmp`)]) {
      try {
        if (file.exists) file.delete();
      } catch {
        // nothing to remove
      }
    }
  }
}
