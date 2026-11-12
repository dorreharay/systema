/**
 * Sends the queue to the server, and reads the server's data back.
 *
 * One run at a time. A run sends the operations of the queue in the order they were made (the ones that wait for a refused one
 * are left, the rest go on), and then, when something was sent or the data is old, reads everything again so that the phone
 * has what the server has: the numbers of the orders, the stock as it stands, what was done on another phone. When the server
 * cannot be reached the run stops and is tried again, after a pause that grows from two seconds to ten, and at once when
 * the app comes back to the front. Nothing has to be pressed for the changes made without a connection to be sent: the runs come
 * from the engine's own timer, from the app coming to the front, from the app being opened, and from each new change.
 */
import { ApiError } from '../api-error';
import type { CatalogString, Client, Insights, OrderDetail, Racket, Service } from '../types';
import type { OfflineStore } from './store';
import { emptyTables } from './types';
import type { Failure, Op, Tables } from './types';

export type Request = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  timeoutMs?: number;
};
/** Sends a request to the server and answers with its JSON, or throws an `ApiError`. */
export type Transport = (request: Request) => Promise<unknown>;

// The phone keeps the history of orders; past this many (the newest are kept) it stops, and says so.
export const MAX_ORDERS = 5000;
const PAGE = 100;
// How many times in a row the server may be down for an operation before it is put aside as refused.
const MAX_TRIES = 6;
// While the server cannot be reached, it is asked again after 2 s, then 4, 8, and every 10 s from then on: a connection that comes
// back is noticed within ten seconds, with nobody doing anything, and a failed request costs next to nothing.
const RETRY_FIRST_MS = 2_000;
const RETRY_LAST_MS = 10_000;
// Data that is older than this is read again when the app comes to the front, and every so often while it is there.
export const STALE_MS = 2 * 60_000;
const PULL_EVERY_MS = 5 * 60_000;

/** The request that does what an operation says. */
export function requestFor(op: Op): Request {
  switch (op.type) {
    case 'client.create':
      return { method: 'POST', path: '/api/clients', body: { id: op.subject, ...op.fields } };
    case 'client.update':
      return { method: 'PATCH', path: `/api/clients/${op.subject}`, body: op.patch };
    case 'client.delete':
      return { method: 'DELETE', path: `/api/clients/${op.subject}` };
    case 'racket.create': {
      const { client_id: clientId, track_stock: trackStock, stock, ...rest } = op.fields;
      // Only a racket of the catalog is counted; the server ignores the stock of a client's.
      return {
        method: 'POST',
        path: '/api/rackets',
        body: { id: op.subject, ...rest, ...(clientId ? { client_id: clientId } : { track_stock: trackStock, stock }) },
      };
    }
    case 'racket.update':
      return { method: 'PATCH', path: `/api/rackets/${op.subject}`, body: op.patch };
    case 'racket.stock':
      return { method: 'POST', path: `/api/rackets/${op.subject}/stock`, body: { delta: op.delta, op_id: op.id } };
    case 'racket.delete':
      return { method: 'DELETE', path: `/api/rackets/${op.subject}` };
    case 'string.create':
      return { method: 'POST', path: '/api/strings', body: { id: op.subject, ...op.fields } };
    case 'string.update':
      return { method: 'PATCH', path: `/api/strings/${op.subject}`, body: op.patch };
    case 'string.stock':
      return { method: 'POST', path: `/api/strings/${op.subject}/stock`, body: { delta: op.delta, op_id: op.id } };
    case 'string.delete':
      return { method: 'DELETE', path: `/api/strings/${op.subject}` };
    case 'service.create':
      return { method: 'POST', path: '/api/services', body: { id: op.subject, ...op.fields } };
    case 'service.update':
      return { method: 'PATCH', path: `/api/services/${op.subject}`, body: op.patch };
    case 'order.create':
      return {
        method: 'POST',
        path: '/api/orders',
        body: { id: op.subject, ...op.input, ...(op.assignee !== undefined && { assignee_id: op.assignee?.id ?? null }), at: op.at },
      };
    case 'order.update':
      return { method: 'PATCH', path: `/api/orders/${op.subject}`, body: { ...op.patch, at: op.at } };
    case 'order.delete':
      return { method: 'DELETE', path: `/api/orders/${op.subject}` };
    case 'order.assign':
      return { method: 'POST', path: `/api/orders/${op.subject}/assign`, body: { assignee_id: op.assignee?.id ?? null, at: op.at } };
    case 'photo.delete':
      return { method: 'DELETE', path: `/api/photos/${op.subject}` };
  }
}

const isDelete = (op: Op) => op.type.endsWith('.delete');

type Verdict = 'offline' | 'unauthorized' | 'trouble' | 'refused';

/** What a failed request means: no connection; the session is over; the server has a problem; or the server said no. */
function verdictOf(error: unknown): Verdict {
  if (!(error instanceof ApiError)) return 'refused';
  if (error.status === 0) return 'offline';
  if (error.status === 401) return 'unauthorized';
  if (error.status >= 500 || error.status === 408 || error.status === 429) return 'trouble';
  return 'refused';
}

function failureOf(error: unknown, at: string): Failure {
  if (error instanceof ApiError) {
    return { status: error.status, code: error.code, message: error.message, fields: error.fields, data: error.data, at };
  }
  // Not an answer of the server: a mistake in the app itself. It is put aside like a refusal, so that it does not stop the others.
  return { status: 400, code: 'client_error', message: error instanceof Error ? error.message : 'Unknown error', at };
}

// --- Reading the server's data ---------------------------------------------------------------

async function pageOrders(transport: Transport, status: 'active' | 'completed') {
  const items: OrderDetail[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = (await transport({
      method: 'GET',
      path: `/api/orders?status=${status}&limit=${PAGE}&offset=${offset}&details=1`,
    })) as { items: OrderDetail[]; has_more: boolean };
    items.push(...page.items);
    if (!page.has_more) return { items, truncated: false };
    if (items.length >= MAX_ORDERS) return { items, truncated: true };
  }
}

const byId = <T extends { id: string }>(items: T[]) => Object.fromEntries(items.map((item) => [item.id, item]));

/** Everything the phone keeps, read from the server. */
export async function pullAll(transport: Transport): Promise<{ tables: Tables; insights: Insights | null; truncated: boolean }> {
  const list = <T>(path: string) => transport({ method: 'GET', path }) as Promise<{ items: T[] }>;
  const [clients, rackets, strings, services, active, completed, insights] = await Promise.all([
    list<Client>('/api/clients'),
    list<Racket>('/api/rackets'),
    list<CatalogString>('/api/strings'),
    list<Service>('/api/services'),
    pageOrders(transport, 'active'),
    pageOrders(transport, 'completed'),
    // The charts are a nicety: the phone goes on without them.
    (transport({ method: 'GET', path: '/api/insights' }) as Promise<Insights>).catch(() => null),
  ]);
  const tables: Tables = {
    ...emptyTables(),
    clients: byId(clients.items),
    rackets: byId(rackets.items),
    strings: byId(strings.items),
    services: byId(services.items),
    orders: byId(
      [...active.items, ...completed.items].map((order) => ({
        ...order,
        services: order.services ?? [],
        photos: order.photos ?? [],
      }))
    ),
  };
  return { tables, insights, truncated: active.truncated || completed.truncated };
}

// --- The engine ------------------------------------------------------------------------------

export type EngineHooks = {
  // The server said the session is over (a 401): the app signs out; what is unsent stays on the phone.
  onUnauthorized: () => void;
  // False in the tests, which say when to run: no timers, and what is kicked runs at once.
  timers?: boolean;
};

export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private wantPull = false;
  private sentSomething = false;
  private stopped = true;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private kickTimer: ReturnType<typeof setTimeout> | undefined;
  private pullTimer: ReturnType<typeof setInterval> | undefined;

  private readonly store: OfflineStore;
  private readonly transport: Transport;
  private readonly hooks: EngineHooks;

  // (Written out, not as parameter properties: the tests run this file in Node, which only strips types.)
  constructor(store: OfflineStore, transport: Transport, hooks: EngineHooks) {
    this.store = store;
    this.transport = transport;
    this.hooks = hooks;
  }

  /** Begins to watch the queue; the first run sends what is waiting and reads the server's data. */
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.failures = 0;
    if (this.hooks.timers !== false) {
      this.pullTimer = setInterval(() => void this.syncNow({ pull: true }), PULL_EVERY_MS);
    }
    void this.syncNow({ pull: true });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.kickTimer);
    clearInterval(this.pullTimer);
  }

  /** The app has come back to the front: ask at once, whatever the pause was, and read the data again if it is old. */
  resume() {
    if (this.stopped) return;
    this.failures = 0;
    const pulledAt = this.store.getSnapshot().meta?.pulledAt;
    void this.syncNow({ pull: !pulledAt || this.store.getSnapshot().net.online === false || Date.now() - Date.parse(pulledAt) > STALE_MS });
  }

  /** Runs soon (a few changes made together are sent together). */
  kick(delayMs = 150) {
    if (this.stopped) return;
    if (this.hooks.timers === false) {
      void this.syncNow();
      return;
    }
    clearTimeout(this.kickTimer);
    this.kickTimer = setTimeout(() => void this.syncNow(), delayMs);
  }

  /** Sends what is waiting, and reads the server's data when `pull` is set (or when something was sent). Resolves when the run is over. */
  syncNow(options: { pull?: boolean } = {}): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (options.pull) this.wantPull = true;
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const run = (async () => {
      try {
        let outcome: Outcome;
        do {
          this.again = false;
          outcome = await this.cycle();
          // Someone asked for a run while this one was on (a change was made, the screen was pulled down, the app came to the front):
          // it gets one of its own, whatever came of this one.
        } while (this.again && outcome !== 'stopped' && !this.stopped);
      } finally {
        this.running = null;
      }
    })();
    this.running = run;
    return run;
  }

  /** Resolves with true once the operation has left the queue (the server took it), and with false when it was refused or `ms` ran out. */
  waitFor(opId: string, ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const settled = () => {
        const op = this.store.getSnapshot().outbox.find((candidate) => candidate.id === opId);
        return !op || !!op.failure;
      };
      const finish = (value: boolean) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(value);
      };
      const timer = setTimeout(() => finish(false), ms);
      const unsubscribe = this.store.subscribe(() => {
        if (settled()) finish(!this.store.getSnapshot().outbox.some((candidate) => candidate.id === opId));
      });
      if (settled()) finish(!this.store.getSnapshot().outbox.some((candidate) => candidate.id === opId));
    });
  }

  // --- One run ---------------------------------------------------------------------------------

  private async cycle(): Promise<Outcome> {
    const store = this.store;
    if (!store.getSnapshot().ready) return 'done';
    store.setNet({ syncing: true });
    try {
      const sent = await this.push();
      if (sent !== 'done') return this.giveUp(sent);

      const snapshot = store.getSnapshot();
      if (this.wantPull || this.sentSomething || !snapshot.meta?.pulledAt) {
        const read = await this.pull();
        if (read !== 'done') return this.giveUp(read);
        this.wantPull = false;
        this.sentSomething = false;
      }
      this.failures = 0;
      clearTimeout(this.retryTimer);
      store.setNet({ online: true, lastSyncAt: store.now() });
      return 'done';
    } finally {
      store.setNet({ syncing: false, settled: true });
    }
  }

  /** The run could not go on: `offline` says so on the screen; `trouble` (the server is ailing) does not. Either is tried again. */
  private giveUp(reason: Exclude<Outcome, 'done'>): Outcome {
    if (reason === 'stopped') return reason;
    this.store.setNet({ online: reason !== 'offline' });
    this.scheduleRetry();
    return reason;
  }

  private scheduleRetry() {
    if (this.stopped || this.hooks.timers === false) return;
    clearTimeout(this.retryTimer);
    const delay = Math.min(RETRY_FIRST_MS * 2 ** this.failures, RETRY_LAST_MS);
    this.failures++;
    this.retryTimer = setTimeout(() => void this.syncNow(), delay);
  }

  /** Sends the operations that can go, in order. */
  private async push(): Promise<Outcome> {
    const store = this.store;
    for (;;) {
      if (this.stopped) return 'stopped';
      const snapshot = store.getSnapshot();
      const op = snapshot.outbox.find((candidate) => !candidate.failure && !snapshot.blocked.has(candidate.id));
      if (!op) return 'done';

      // Whether the connection was known to be there. If it was and the request still fails with no answer, the request may have got
      // through and only the answer been lost; if the phone already knew it had none, nothing was sent.
      const connected = snapshot.net.online && snapshot.net.settled;
      store.setInflight(op.id);
      try {
        const answer = await this.transport(requestFor(op));
        await store.commit(op.id, answer);
        this.sentSomething = true;
        this.failures = 0;
      } catch (error) {
        const verdict = verdictOf(error);
        if (verdict === 'offline') {
          store.setInflight(null);
          if (connected) await store.maybeSent(op.id);
          return 'offline';
        }
        if (verdict === 'unauthorized') {
          store.setInflight(null);
          this.hooks.onUnauthorized();
          return 'stopped';
        }
        if (verdict === 'trouble') {
          if ((op.tries ?? 0) + 1 < MAX_TRIES) {
            await store.tried(op.id);
            return 'trouble';
          }
          await store.fail(op.id, failureOf(error, store.now()));
        } else if (isDelete(op) && error instanceof ApiError && error.status === 404) {
          // Gone already: the work is done.
          await store.commit(op.id, undefined);
          this.sentSomething = true;
        } else {
          await store.fail(op.id, failureOf(error, store.now()));
        }
      }
    }
  }

  private async pull(): Promise<Outcome> {
    try {
      const { tables, insights, truncated } = await pullAll(this.transport);
      await this.store.replaceBase(tables, {
        insights: insights ? { data: insights, at: this.store.now() } : undefined,
        truncated,
      });
      return 'done';
    } catch (error) {
      const verdict = verdictOf(error);
      if (verdict === 'offline') return 'offline';
      if (verdict === 'unauthorized') {
        this.hooks.onUnauthorized();
        return 'stopped';
      }
      return 'trouble';
    }
  }
}

type Outcome = 'done' | 'offline' | 'trouble' | 'stopped';
