/**
 * Where the offline layer keeps its two files. The phone writes them to its document directory (`file-storage.ts`); the tests
 * keep them in memory.
 */
export interface OfflineStorage {
  /** The text of the file, or null when there is none (or it cannot be read). */
  read(name: string): Promise<string | null>;
  /** Replaces the file: whole, or not at all. */
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** The names of the files there are (the ones this layer wrote, and the leftovers of a write that was cut). */
  list(): Promise<string[]>;
}

export class MemoryStorage implements OfflineStorage {
  files = new Map<string, string>();

  async list() {
    return [...this.files.keys()];
  }

  async read(name: string) {
    return this.files.get(name) ?? null;
  }

  async write(name: string, text: string) {
    this.files.set(name, text);
  }

  async remove(name: string) {
    this.files.delete(name);
  }
}
