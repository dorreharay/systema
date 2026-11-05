import type { OfflineStorage } from './storage';

const DATABASE = 'restring-offline';
const STORE = 'files';
const VERSION = 1;

/**
 * The offline files in the browser, for the web build: `file-storage.ts` writes to the phone's document directory, which
 * `expo-file-system` has no web version of, so here every file is a record of an IndexedDB store, under its name.
 *
 * IndexedDB and not localStorage, for three reasons. The base file holds every order the stringer has (up to MAX_ORDERS, about
 * 1.3 KB each as JSON: some 6.5 MB at the most), and a browser gives localStorage some 5 MB for the whole site. localStorage is
 * written on the thread that draws the page, and this file is written whole each time it changes. And the session token and the
 * saved profile live in localStorage too, so a quota the offline files had used up would stop a person from signing in.
 *
 * A record is replaced whole or not at all (a transaction that is cut short, or that the browser refuses for want of room, leaves
 * the old one), so the phone's write-beside-and-move is not needed, and there are no `.tmp` leftovers to list.
 *
 * Nothing is touched until the first read or write: the web build is also rendered once at build time, in Node, where there is no
 * IndexedDB, and this module is loaded there.
 */
export class FileStorage implements OfflineStorage {
  // (Written out, not as a parameter property: the tests run this file in Node, which only strips types.)
  private readonly factory: IDBFactory | undefined;
  // The connection, once asked for. Null when there is none: not asked for yet, the browser closed it, or the last try failed.
  private connection: Promise<IDBDatabase> | null = null;

  /** `factory` is where IndexedDB comes from: the page's own, unless the tests give another. */
  constructor(factory?: IDBFactory) {
    this.factory = factory;
  }

  /** The connection to the database, opened the first time and again whenever the one before is gone. */
  private connect(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    const opening: Promise<IDBDatabase> = new Promise((resolve, reject) => {
      const factory = this.factory ?? globalThis.indexedDB;
      if (!factory) {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const request = factory.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => {
        const database = request.result;
        const gone = () => {
          if (this.connection === opening) this.connection = null;
        };
        // Another tab wants a newer version, or the browser took the connection away (the site's data was cleared, say): let go of
        // it, so that the next use opens a new one instead of failing on this.
        database.onversionchange = () => {
          database.close();
          gone();
        };
        database.onclose = gone;
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
    });
    this.connection = opening;
    // A failed try is not kept: the next use tries again.
    opening.catch(() => {
      if (this.connection === opening) this.connection = null;
    });
    return opening;
  }

  /** Runs `work` on the store in a transaction of its own; answers what it asked for once the transaction has been committed. */
  private async transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const database = await this.connect();
      try {
        return await new Promise<T>((resolve, reject) => {
          const transaction = database.transaction(STORE, mode);
          const request = work(transaction.objectStore(STORE));
          transaction.oncomplete = () => resolve(request.result);
          transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('The transaction was aborted'));
        });
      } catch (error) {
        // The browser has closed this connection since it was opened (and has not said so yet): open another, once.
        if (attempt === 0 && (error as { name?: string } | null)?.name === 'InvalidStateError') {
          this.connection = null;
          continue;
        }
        throw error;
      }
    }
  }

  async read(name: string) {
    try {
      const text: unknown = await this.transact('readonly', (store) => store.get(name));
      return typeof text === 'string' ? text : null;
    } catch {
      return null;
    }
  }

  /** Rejects when the file could not be written (no room, no IndexedDB): what was there before is as it was. */
  async write(name: string, text: string) {
    await this.transact('readwrite', (store) => store.put(text, name));
  }

  async list() {
    try {
      const names = await this.transact('readonly', (store) => store.getAllKeys());
      return names.filter((name): name is string => typeof name === 'string');
    } catch {
      return [];
    }
  }

  async remove(name: string) {
    try {
      await this.transact('readwrite', (store) => store.delete(name));
    } catch {
      // Nothing to remove, or it cannot be: as on the phone, whoever asked goes on (signing out must not be stopped by it).
    }
  }
}
