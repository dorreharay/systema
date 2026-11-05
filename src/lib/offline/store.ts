/**
 * The offline store: the copy of the stringer's data that the screens read, and the queue of changes that has not reached the server.
 *
 * Two things are kept on the phone: `base`, what the server last said (with whatever it has taken from the queue since), and the
 * queue itself, the `outbox`. What a screen sees (`snapshot.tables`) is the base with every change of the queue played on it, so
 * a change shows at once, and taking one out of the queue puts everything back. The queue is written to its file at once; the
 * base is written whenever it changes, before the queue that no longer has the changes it took in (a change is never in neither).
 */
import { blockedBy, discardSet, marksOf, remapId } from './outbox';
import { applyOp, overlay, racketMadeFor, replay } from './reduce';
import type { OfflineStorage } from './storage';
import { emptyTables } from './types';
import type { BaseFile, Failure, Mark, Meta, Op, OutboxFile, Tables } from './types';

const BASE_PREFIX = 'restring-offline-base-';
const OUTBOX_PREFIX = 'restring-offline-outbox-';
// How many of the operations the base already includes are remembered (see `Meta.applied`).
const APPLIED_KEPT = 300;

/**
 * The two files of one stringer. Each has their own, named after them, so that whoever signs in on the same phone next never reads,
 * sends or removes the changes of another: what a stringer has not sent stays theirs until they sign in again.
 */
function filesOf(userId: string) {
  const key = userId.replace(/[^A-Za-z0-9_-]/g, '_');
  return { key, base: `${BASE_PREFIX}${key}.json`, outbox: `${OUTBOX_PREFIX}${key}.json` };
}

/** The stringer that a file name belongs to (`.tmp` is what a write leaves beside it for a moment). */
function keyOfFile(name: string) {
  const prefix = [BASE_PREFIX, OUTBOX_PREFIX].find((candidate) => name.startsWith(candidate));
  return prefix ? name.slice(prefix.length).replace(/\.json(\.tmp)?$/, '') : null;
}

export type Net = {
  // Whether the server answered the last time it was asked.
  online: boolean;
  syncing: boolean;
  // Whether a run has finished since the phone started: before that, "no data yet" only means the first run is on its way.
  settled: boolean;
  // The last time the phone and the server were in step: everything sent, and the server's data read again.
  lastSyncAt: string | null;
};

export type Snapshot = {
  // Changes with every change of anything below; a screen that has seen it knows nothing is new.
  version: number;
  // False until the saved files have been read (and while nobody is signed in).
  ready: boolean;
  userId: string | null;
  // Whether the server's data has ever been read: until then there is nothing to show.
  hasData: boolean;
  // What the screens read: the base with the queue played on it.
  tables: Tables;
  outbox: readonly Op[];
  // The operations that wait for another one that the server refused, with that one.
  blocked: ReadonlyMap<string, string>;
  // For each thing that has changes the server has not got: whether they wait, wait for a refused one, or were refused.
  marks: ReadonlyMap<string, Mark>;
  // The operation that is being sent now.
  inflight: string | null;
  meta: Meta | null;
  net: Net;
};

const freshNet = (): Net => ({ online: true, syncing: false, settled: false, lastSyncAt: null });

const initial = (): Snapshot => ({
  version: 0,
  ready: false,
  userId: null,
  hasData: false,
  tables: emptyTables(),
  outbox: [],
  blocked: new Map(),
  marks: new Map(),
  inflight: null,
  meta: null,
  net: freshNet(),
});

function parse<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export class OfflineStore {
  private listeners = new Set<() => void>();
  private snap: Snapshot = initial();
  // What the server last said, with the operations it has taken since.
  private base: Tables = emptyTables();
  private writing: Promise<void> = Promise.resolve();
  private dirty = { base: false, outbox: false };
  // Raised when the files are wiped, so that a write that was waiting for its turn does not bring them back.
  private generation = 0;

  private readonly storage: OfflineStorage;
  private readonly clock: () => number;

  // (Written out, not as parameter properties: the tests run this file in Node, which only strips types.)
  constructor(storage: OfflineStorage, clock: () => number = Date.now) {
    this.storage = storage;
    this.clock = clock;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snap;

  /** The time by the phone's clock, as the server reads it. */
  now = () => new Date(this.clock()).toISOString();

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch, version: this.snap.version + 1 };
    for (const listener of [...this.listeners]) listener();
  }

  /** The queue as it is now; the base is played with it, unless the caller already has the result. */
  private setOutbox(outbox: readonly Op[], tables?: Tables, patch: Partial<Snapshot> = {}) {
    const blocked = blockedBy(outbox);
    this.set({
      ...patch,
      outbox,
      blocked,
      marks: marksOf(outbox, blocked),
      tables: tables ?? replay(this.base, outbox),
    });
  }

  // --- Opening and closing -------------------------------------------------------------------

  /** Reads the saved files of this stringer, and only theirs: what others left on the phone is not read, sent or changed. */
  async open(userId: string) {
    if (this.snap.userId === userId && this.snap.ready) return;
    await this.writing;
    const generation = this.generation;
    this.base = emptyTables();
    this.set({ ...initial(), userId, version: this.snap.version });

    const files = filesOf(userId);
    const [baseText, outboxText] = await Promise.all([this.storage.read(files.base), this.storage.read(files.outbox)]);
    // The files were wiped (or the store closed) while they were being read: nothing of them is used.
    if (generation !== this.generation || this.snap.userId !== userId) return;

    let saved = parse<BaseFile>(baseText);
    let queue = parse<OutboxFile>(outboxText);
    // A file under this stringer's name that says it is somebody else's is not trusted (nothing writes one).
    if (saved && saved.meta?.userId !== userId) saved = null;
    if (queue && queue.userId !== userId) queue = null;
    if (saved && saved.meta?.v !== 1) saved = null;
    if (queue && queue.v !== 1) queue = null;

    // An operation the saved base already includes is not played again (the phone stopped between the two files).
    const applied = new Set(saved?.meta.applied ?? []);
    const ops = (queue?.ops ?? []).filter((op) => !applied.has(op.id));
    this.base = saved?.tables ?? emptyTables();
    const meta: Meta = saved?.meta ?? { v: 1, userId, pulledAt: null, insights: null, applied: [], truncated: false };
    this.setOutbox(ops, undefined, { ready: true, hasData: !!meta.pulledAt, meta });

    // The queue in its file still has the operations that were left out: it is saved now, so that a later write of the base (which
    // forgets what was applied) cannot leave a file that plays them again.
    if (queue && ops.length !== queue.ops.length) {
      this.dirty.outbox = true;
      void this.persist();
    }
    void this.tidy(userId);
  }

  /**
   * Removes what other stringers left on this phone that has nothing in it to lose: a copy of their data with no change waiting.
   * Whoever has a change that was not sent keeps their files, for when they sign in again.
   */
  private async tidy(userId: string) {
    try {
      const mine = filesOf(userId).key;
      const others = new Set<string>();
      for (const name of await this.storage.list()) {
        const key = keyOfFile(name);
        if (key && key !== mine) others.add(key);
      }
      for (const key of others) {
        const queue = parse<OutboxFile>(await this.storage.read(`${OUTBOX_PREFIX}${key}.json`));
        if (Array.isArray(queue?.ops) && queue.ops.length > 0) continue;
        // Whoever is signed in now may have changed since the list was read.
        if (this.snap.userId !== userId) return;
        await Promise.all([this.storage.remove(`${BASE_PREFIX}${key}.json`), this.storage.remove(`${OUTBOX_PREFIX}${key}.json`)]);
      }
    } catch {
      // Nothing to tidy: it will be tried again at the next start.
    }
  }

  /** Lets go of the data in memory (the files stay: the same stringer may sign in again and find their unsent changes). */
  async close() {
    // What was changed a moment ago is saved first, and so is what comes in while that is written.
    for (let round = 0; round < 3; round++) {
      await this.persist();
      if (!this.dirty.base && !this.dirty.outbox) break;
    }
    this.base = emptyTables();
    this.set({ ...initial(), version: this.snap.version });
  }

  /** Removes the saved data of the stringer who is signed in, for good: they signed out, or deleted the account. */
  async wipe() {
    const userId = this.snap.userId;
    this.generation++;
    this.dirty = { base: false, outbox: false };
    // The memory goes first: from here on nothing is written (a write that was waiting for its turn finds nobody signed in), so a
    // change that comes in while the files are being removed cannot bring them back.
    this.base = emptyTables();
    this.set({ ...initial(), version: this.snap.version });
    await this.writing;
    if (userId) {
      const files = filesOf(userId);
      await Promise.all([this.storage.remove(files.base), this.storage.remove(files.outbox)]);
    }
  }

  // --- Saving --------------------------------------------------------------------------------

  /** Writes what changed. Resolves once it is on the phone's storage (or could not be written: then it is tried again next time). */
  private persist(): Promise<void> {
    const generation = this.generation;
    this.writing = this.writing.then(async () => {
      if (generation !== this.generation) return;
      const { base, outbox } = this.dirty;
      this.dirty = { base: false, outbox: false };
      const { userId, ready, meta } = this.snap;
      if ((!base && !outbox) || !userId || !ready || !meta) return;
      const files = filesOf(userId);
      try {
        // The base first: the queue may be rid of an operation only once the base has what it did.
        if (base) {
          const file: BaseFile = { meta, tables: this.base };
          await this.storage.write(files.base, JSON.stringify(file));
        }
        const file: OutboxFile = { v: 1, userId, ops: [...this.snap.outbox] };
        await this.storage.write(files.outbox, JSON.stringify(file));
      } catch (error) {
        this.dirty = { base: this.dirty.base || base, outbox: true };
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[offline] could not save', error);
      }
    });
    return this.writing;
  }

  /** Waits for everything queued to be written; what could not be written before (the storage was full, say) is tried again. */
  flush() {
    return this.persist();
  }

  // --- The queue -----------------------------------------------------------------------------

  /** Adds changes to the end of the queue. They show at once; the returned promise resolves once they are saved. */
  enqueue(...ops: Op[]) {
    let tables = this.snap.tables;
    for (const op of ops) tables = applyOp(tables, op);
    this.setOutbox([...this.snap.outbox, ...ops], tables);
    this.dirty.outbox = true;
    return this.persist();
  }

  /**
   * Changes the queue: `change` is given it, and the operation that is being sent (which must stay as it is), and answers
   * the queue that is to be. Answering the same one changes nothing.
   */
  edit(change: (ops: readonly Op[], inflight: string | null) => readonly Op[]) {
    const next = change(this.snap.outbox, this.snap.inflight);
    if (next === this.snap.outbox) return Promise.resolve();
    this.setOutbox(next);
    this.dirty.outbox = true;
    return this.persist();
  }

  /** Gives up an operation, and what depends on it. Answers how many operations went. */
  async discard(opId: string) {
    const gone = discardSet(this.snap.outbox, opId);
    gone.delete(this.snap.inflight ?? '');
    if (gone.size === 0) return 0;
    await this.edit((ops) => ops.filter((op) => !gone.has(op.id)));
    return gone.size;
  }

  /** Lets an operation that was refused be sent again. */
  retry(opId: string) {
    return this.edit((ops) =>
      ops.map((op) => (op.id === opId && op.failure ? { ...op, failure: undefined, tries: undefined } : op))
    );
  }

  // --- What the engine tells ------------------------------------------------------------------

  setInflight(opId: string | null) {
    if (this.snap.inflight !== opId) this.set({ inflight: opId });
  }

  setNet(patch: Partial<Net>) {
    const net = { ...this.snap.net, ...patch };
    const before = this.snap.net;
    if (
      net.online !== before.online ||
      net.syncing !== before.syncing ||
      net.settled !== before.settled ||
      net.lastSyncAt !== before.lastSyncAt
    ) {
      this.set({ net });
    }
  }

  /** The server took the operation: it moves into the base, with the server's own answer in place of what was played here. */
  commit(opId: string, answer: unknown) {
    const op = this.snap.outbox.find((candidate) => candidate.id === opId);
    const meta = this.snap.meta;
    if (!op || !meta) return Promise.resolve();

    let base = overlay(applyOp(this.base, op), op, answer);
    let outbox = this.snap.outbox.filter((candidate) => candidate.id !== opId);

    // The client already had a racket of the name an order gave: the server used that one, and the one made here never was.
    const named = racketMadeFor(op);
    const real = (answer as { racket?: { id?: string } } | undefined)?.racket?.id;
    if (named && real && real !== named) {
      base = applyOp(base, { id: `${opId}:racket`, at: op.at, type: 'racket.delete', subject: named });
      outbox = remapId(outbox, named, real);
    }

    this.base = base;
    this.setOutbox(outbox, undefined, {
      inflight: null,
      meta: { ...meta, applied: [...meta.applied, opId].slice(-APPLIED_KEPT) },
    });
    this.dirty = { base: true, outbox: true };
    return this.persist();
  }

  /**
   * The server refused the operation: it stays in the queue, marked, until the stringer deals with it. It is put aside, and
   * whatever the server did with it, the stringer decides what comes of it: it may be changed again.
   */
  fail(opId: string, failure: Failure) {
    this.set({ inflight: null });
    return this.edit((ops) =>
      ops.map((op) => (op.id === opId ? { ...op, failure, tries: undefined, sent: undefined } : op))
    );
  }

  /**
   * The server could not be asked properly (it was ailing): the operation stays as it was, with one more try counted. The request
   * was made, and the server may have done the work whatever it said, so it is not changed any more (see `Base.sent`).
   */
  tried(opId: string) {
    this.set({ inflight: null });
    return this.edit((ops) => ops.map((op) => (op.id === opId ? { ...op, tries: (op.tries ?? 0) + 1, sent: true } : op)));
  }

  /**
   * The request of an operation was made over a connection that was there, and was cut before the answer came: the server may have
   * done the work. From now on the operation is not changed any more (see `Base.sent`).
   */
  maybeSent(opId: string) {
    if (!this.snap.outbox.some((op) => op.id === opId && !op.sent)) return Promise.resolve();
    return this.edit((ops) => ops.map((op) => (op.id === opId ? { ...op, sent: true } : op)));
  }

  /** The server's data, read again. The queue is played on it, so what has not been sent stays on the screen. */
  replaceBase(tables: Tables, extra: { insights?: Meta['insights']; truncated?: boolean }) {
    const meta = this.snap.meta;
    if (!meta) return Promise.resolve();
    this.base = tables;
    this.setOutbox(this.snap.outbox, undefined, {
      hasData: true,
      meta: {
        ...meta,
        pulledAt: this.now(),
        // The base now has everything the server has taken.
        applied: [],
        insights: extra.insights ?? meta.insights,
        truncated: extra.truncated ?? false,
      },
    });
    this.dirty = { base: true, outbox: true };
    return this.persist();
  }
}
