/**
 * What the screens read from the copy: the lists with their filters, the search and the order the server puts them in, and the
 * pages of one client, one racket and one order. The rules are the server's (backend/src/routes), so that a list looks the same
 * whether it was asked of the server or read here.
 */
import type {
  CatalogString,
  Client,
  ClientDetail,
  Dashboard,
  Order,
  OrderDetail,
  OrderStatus,
  Person,
  Racket,
  RacketDetail,
  Service,
} from '../types';
import { newerOrder } from './reduce';
import type { Tables } from './types';

const ACTIVE: OrderStatus[] = ['received', 'in_progress', 'ready'];

export const isActive = (order: Pick<Order, 'status'>) => ACTIVE.includes(order.status);

const lower = (text: string) => text.toLowerCase();

/** "wil pro" finds "Wilson Pro Staff": every word of the search has to be somewhere in the text, in any order, in any case. */
export function matchesWords(haystack: string, search: string) {
  const text = lower(haystack);
  return search
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(lower(word)));
}

const byName = <T>(key: (item: T) => string) => (a: T, b: T) => {
  const x = lower(key(a));
  const y = lower(key(b));
  return x < y ? -1 : x > y ? 1 : 0;
};

// --- Orders ----------------------------------------------------------------------------------

export type OrderFilter = {
  status?: OrderStatus | 'active';
  q?: string;
  clientId?: string;
  racketId?: string;
  // Only in a workshop with a team: the orders of the person at the phone (`me` is their id), or the queue, the ones nobody has taken.
  queue?: 'mine' | 'none';
  me?: string;
};

/** In the queue: nobody has taken it, and it is still to be done (a finished order with no performer is old news, not work). */
export const inQueue = (order: Pick<Order, 'assignee' | 'status'>) => !order.assignee && order.status !== 'completed';

/** The queue by the day it is due, then the order it came in; finished work after it, the latest first. */
function queueOrder(a: Order, b: Order) {
  const finished = Number(a.status === 'completed') - Number(b.status === 'completed');
  if (finished) return finished;
  if (a.status === 'completed') {
    return (b.completed_at ?? '').localeCompare(a.completed_at ?? '') || newerOrder(a, b);
  }
  if (a.due_date !== b.due_date) {
    if (a.due_date === null) return 1;
    if (b.due_date === null) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  // Oldest first; an order with no number yet came in after all that have one.
  return -newerOrder(a, b);
}

export function selectOrders(t: Tables, { status, q = '', clientId, racketId, queue, me }: OrderFilter = {}): Order[] {
  const search = q.trim();
  const number = search.match(/^#?(\d{1,9})$/)?.[1];
  const items = Object.values(t.orders).filter((order) => {
    if (status === 'active' ? !isActive(order) : status && order.status !== status) return false;
    if (clientId && order.client.id !== clientId) return false;
    if (racketId && order.racket.id !== racketId) return false;
    if (queue === 'mine' && (!me || order.assignee?.id !== me)) return false;
    if (queue === 'none' && !inQueue(order)) return false;
    if (!search) return true;
    return (
      (number !== undefined && order.number === Number(number)) ||
      matchesWords(
        `${order.client.name} ${order.racket.brand} ${order.racket.model} ${order.main_string_name ?? ''}`,
        search
      )
    );
  });
  // A list of the finished ones only is just the latest first.
  return items.sort(status === 'completed' ? (a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '') || newerOrder(a, b) : queueOrder);
}

/** The work of a workshop with a team, worked out from the orders on the phone: who has how much in hand, and what waits in the queue. */
export type QueueSummary = {
  /** Orders still to be done that nobody has taken. */
  queue: number;
  /** Orders still to be done that `me` has. */
  mine: number;
  /** Everyone who has an order in hand, the busiest first. */
  people: { person: Person; count: number }[];
};

export function selectQueue(t: Tables, me?: string): QueueSummary {
  let queue = 0;
  let mine = 0;
  const counts = new Map<string, { person: Person; count: number }>();
  for (const order of Object.values(t.orders)) {
    if (!isActive(order)) continue;
    const who = order.assignee;
    if (!who) {
      queue++;
      continue;
    }
    if (who.id === me) mine++;
    const entry = counts.get(who.id);
    if (entry) entry.count++;
    else counts.set(who.id, { person: who, count: 1 });
  }
  const people = [...counts.values()].sort((a, b) => b.count - a.count || byName((x: { person: Person }) => x.person.name)(a, b));
  return { queue, mine, people };
}

export const selectOrder = (t: Tables, id: string | undefined): OrderDetail | undefined => (id ? t.orders[id] : undefined);

// --- Clients ---------------------------------------------------------------------------------

export function selectClients(t: Tables, q = ''): Client[] {
  const search = q.trim();
  return Object.values(t.clients)
    .filter((client) => !search || matchesWords(`${client.name} ${client.phone ?? ''}`, search))
    .sort(byName((client) => client.name));
}

const HISTORY = 100;

export function selectClient(t: Tables, id: string | undefined): ClientDetail | undefined {
  const client = id ? t.clients[id] : undefined;
  if (!client) return undefined;
  const orders = Object.values(t.orders);
  const rackets = Object.values(t.rackets)
    .filter((racket) => racket.client_id === client.id)
    .sort((a, b) => byName((racket: Racket) => racket.brand)(a, b) || byName((racket: Racket) => racket.model)(a, b))
    .map((racket) => ({
      id: racket.id,
      brand: racket.brand,
      model: racket.model,
      notes: racket.notes,
      orders_count: racket.orders_count,
    }));
  return {
    ...client,
    rackets,
    orders: orders
      .filter((order) => order.client.id === client.id)
      .sort(newerOrder)
      .slice(0, HISTORY),
  };
}

// --- Rackets ---------------------------------------------------------------------------------

export type RacketFilter = {
  q?: string;
  clientId?: string;
  kind?: 'client' | 'catalog';
  inStock?: boolean;
};

export function selectRackets(t: Tables, { q = '', clientId, kind, inStock }: RacketFilter = {}): Racket[] {
  const search = q.trim();
  return Object.values(t.rackets)
    .filter((racket) => {
      if (clientId && racket.client_id !== clientId) return false;
      if (kind === 'client' && racket.client_id === null) return false;
      if (kind === 'catalog' && racket.client_id !== null) return false;
      // What an order can use: not counted, or at least one left.
      if (inStock && racket.track_stock && racket.stock <= 0) return false;
      return !search || matchesWords(`${racket.brand} ${racket.model} ${racket.client_name ?? ''}`, search);
    })
    .sort((a, b) => byName((racket: Racket) => racket.brand)(a, b) || byName((racket: Racket) => racket.model)(a, b));
}

export function selectRacket(t: Tables, id: string | undefined): RacketDetail | undefined {
  const racket = id ? t.rackets[id] : undefined;
  if (!racket) return undefined;
  return {
    ...racket,
    orders: Object.values(t.orders)
      .filter((order) => order.racket.id === racket.id)
      .sort(newerOrder),
  };
}

// --- Strings and services --------------------------------------------------------------------

export function selectStrings(t: Tables, q = '', inStock = false): CatalogString[] {
  const search = q.trim();
  return Object.values(t.strings)
    .filter((string) => {
      if (inStock && string.track_stock && string.stock <= 0) return false;
      return !search || matchesWords(`${string.brand} ${string.model}`, search);
    })
    .sort((a, b) => byName((string: CatalogString) => string.brand)(a, b) || byName((string: CatalogString) => string.model)(a, b));
}

/**
 * Active ones first, labor before extras (the server's order; the server also keeps the order they were made in). A search is by the
 * name, and is the phone's own: the server lists them all (there are few).
 */
export function selectServices(t: Tables, q = ''): Service[] {
  const search = q.trim();
  return Object.values(t.services)
    .filter((service) => !search || matchesWords(service.name, search))
    .map((service, index) => ({ service, index }))
    .sort(
      (a, b) =>
        Number(b.service.active) - Number(a.service.active) ||
        Number(b.service.kind === 'labor') - Number(a.service.kind === 'labor') ||
        a.index - b.index
    )
    .map(({ service }) => service);
}

// --- Home ------------------------------------------------------------------------------------

/** How far a time zone is ahead of UTC at this moment, in milliseconds. */
function zoneOffsetMs(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour') % 24, part('minute'), part('second'));
  return local - Math.floor(ms / 1000) * 1000;
}

/** The moment the stringer's month began, wherever they are: "this month" is theirs, not the phone's or the server's. */
export function monthStart(timeZone: string | undefined, now: number) {
  try {
    const zone = timeZone || 'UTC';
    const local = new Date(now + zoneOffsetMs(now, zone));
    const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
    // The offset at the start of the month may not be the one of today (the clocks change): ask again at the first guess.
    return guess - zoneOffsetMs(guess - zoneOffsetMs(guess, zone), zone);
  } catch {
    const date = new Date(now);
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  }
}

const UPCOMING = 5;

/** The numbers of the home screen, and the orders that are due first: worked out from the orders on the phone. */
export function selectDashboard(t: Tables, timeZone: string | undefined, now: number): Dashboard {
  const orders = Object.values(t.orders);
  const since = monthStart(timeZone, now);
  let ready = 0;
  let completedThisMonth = 0;
  const active: Order[] = [];
  for (const order of orders) {
    if (isActive(order)) active.push(order);
    if (order.status === 'ready') ready++;
    if (order.status === 'completed' && order.completed_at && Date.parse(order.completed_at) >= since) completedThisMonth++;
  }
  return {
    active_orders: active.length,
    ready_for_pickup: ready,
    completed_this_month: completedThisMonth,
    active: active
      .sort((a, b) => {
        if (a.due_date !== b.due_date) {
          if (a.due_date === null) return 1;
          if (b.due_date === null) return -1;
          return a.due_date < b.due_date ? -1 : 1;
        }
        return -newerOrder(a, b);
      })
      .slice(0, UPCOMING),
  };
}
