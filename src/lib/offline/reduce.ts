/**
 * What each operation does to the copy of the data: the rules of the server (backend/src/routes), played on the phone, so
 * that a change shows at once and looks as the server will have it. The server stays the judge: when it has taken an operation,
 * its own answer replaces what is played here (`overlay`), and the next full read of its data replaces all of it.
 *
 * Every function is pure: it returns new tables and leaves the ones it was given alone (so a screen can tell by identity what
 * changed), and every operation is applied once on its own (an operation that finds its work already done does nothing).
 */
import type {
  CatalogString,
  Client,
  ClientSummary,
  LastSetup,
  OrderDetail,
  OrderInput,
  OrderRacket,
  OrderService,
  Racket,
  Service,
} from '../types';
import { nameKey } from '../reference';
import type { Op, OpOf, Tables } from './types';

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Labor + strings + services. Null while nothing has a price, so "free" and "not decided" differ (the server's rule). */
export function orderTotal(
  labor: number | null | undefined,
  string: number | null | undefined,
  services: { price: number | null }[]
) {
  const amounts = [labor, string, ...services.map((line) => line.price)].filter(
    (amount): amount is number => amount !== null && amount !== undefined
  );
  return amounts.length === 0 ? null : round2(amounts.reduce((sum, amount) => sum + amount, 0));
}

export const stringLabel = (string: { brand: string; model: string; gauge: string | null }) =>
  [string.brand, string.model, string.gauge].filter(Boolean).join(' ');

const summaryOf = (client: Client): ClientSummary => ({
  id: client.id,
  name: client.name,
  phone: client.phone,
  email: client.email,
});

const orderRacketOf = (racket: Racket): OrderRacket => ({
  id: racket.id,
  brand: racket.brand,
  model: racket.model,
  client_id: racket.client_id,
});

/** Newest first, with an order that has no number yet (it was made on the phone, after all the others) before them all. */
export function newerOrder(a: Pick<OrderDetail, 'number' | 'created_at'>, b: Pick<OrderDetail, 'number' | 'created_at'>) {
  const x = a.number ?? Number.POSITIVE_INFINITY;
  const y = b.number ?? Number.POSITIVE_INFINITY;
  if (x !== y) return x > y ? -1 : 1;
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

/** How a racket was last strung: what "Use Previous Setup" copies. */
export function lastSetupOf(order: OrderDetail): LastSetup {
  return {
    order_id: order.id,
    number: order.number,
    received_date: order.received_date,
    customer_strings: order.customer_strings,
    hybrid: order.hybrid,
    main_string_id: order.main_string_id,
    main_string_name: order.main_string_name,
    cross_string_id: order.cross_string_id,
    cross_string_name: order.cross_string_name,
    main_tension: order.main_tension,
    cross_tension: order.cross_tension,
    knots: order.knots,
    stringing_notes: order.stringing_notes,
    labor_price: order.labor_price,
    string_price: order.string_price,
  };
}

// --- Stock -----------------------------------------------------------------------------------

export type Take = { kind: 'racket' | 'string'; id: string; qty: number };

type Takes = {
  customer_strings: boolean;
  hybrid: boolean;
  main_string_id: string | null;
  cross_string_id: string | null;
  racket: { id: string; client_id: string | null };
};

/** What an order wants from the stock: one catalog racket, and a set of its string (half a set of each of a hybrid's two). */
export function wantedTakes(order: Takes): Take[] {
  const wanted = new Map<string, Take>();
  const want = (kind: Take['kind'], id: string | null, qty: number) => {
    if (!id) return;
    const key = `${kind}:${id}`;
    wanted.set(key, { kind, id, qty: (wanted.get(key)?.qty ?? 0) + qty });
  };
  if (order.racket.client_id === null) want('racket', order.racket.id, 1);
  if (!order.customer_strings) {
    want('string', order.main_string_id, order.hybrid ? 0.5 : 1);
    if (order.hybrid) want('string', order.cross_string_id, 0.5);
  }
  return [...wanted.values()];
}

/** Of those, what is counted: an item that is not counted is always there, and nothing is taken from it. */
export const countedTakes = (t: Tables, takes: Take[]) =>
  takes.filter((take) => (take.kind === 'racket' ? t.rackets[take.id]?.track_stock : t.strings[take.id]?.track_stock));

const roundHalf = (value: number) => Math.round(value * 2) / 2;

/** A racket or string with this many left. It never goes below nothing (the server's rule). */
function withStock<T extends Racket | CatalogString>(item: T, stock: number): T {
  const next = Math.max(0, stock);
  return { ...item, stock: next, available: !item.track_stock || next > 0 };
}

/** Takes (`sign` -1) or gives back (+1) what these entries are. */
export function moveStock(t: Tables, takes: Take[], sign: 1 | -1): Tables {
  let { rackets, strings } = t;
  for (const take of takes) {
    if (take.kind === 'racket') {
      const racket = rackets[take.id];
      if (racket) rackets = { ...rackets, [racket.id]: withStock(racket, racket.stock + sign * take.qty) };
    } else {
      const string = strings[take.id];
      if (string) strings = { ...strings, [string.id]: withStock(string, roundHalf(string.stock + sign * take.qty)) };
    }
  }
  return rackets === t.rackets && strings === t.strings ? t : { ...t, rackets, strings };
}

/**
 * What of the stock an order cannot get: the fields that name the racket and the strings that have run out, like the server's
 * `out_of_stock`. `previous` is the order as it was, whose own share is still in the stock and counts as there.
 */
export function shortages(
  t: Tables,
  wanted: Take[],
  fieldOf: (take: Take) => string,
  previous: Take[] = []
): string[] {
  const own = new Map(previous.map((take) => [`${take.kind}:${take.id}`, take.qty]));
  const short: string[] = [];
  for (const take of countedTakes(t, wanted)) {
    const item = take.kind === 'racket' ? t.rackets[take.id] : t.strings[take.id];
    if (item && item.stock + (own.get(`${take.kind}:${take.id}`) ?? 0) < take.qty) short.push(fieldOf(take));
  }
  return short;
}

// --- Small helpers ---------------------------------------------------------------------------

const put = <T>(table: Record<string, T>, id: string, value: T) => ({ ...table, [id]: value });

function omit<T>(table: Record<string, T>, id: string) {
  const { [id]: removed, ...rest } = table;
  void removed;
  return rest;
}

const withClient = (t: Tables, id: string | null | undefined, change: (client: Client) => Client): Tables => {
  const client = id ? t.clients[id] : undefined;
  return client ? { ...t, clients: put(t.clients, client.id, change(client)) } : t;
};

const withRacket = (t: Tables, id: string | null | undefined, change: (racket: Racket) => Racket): Tables => {
  const racket = id ? t.rackets[id] : undefined;
  return racket ? { ...t, rackets: put(t.rackets, racket.id, change(racket)) } : t;
};

/** The racket's last setup and the client's last order date, worked out again from the orders the phone has. */
function refreshStats(t: Tables, clientIds: (string | null | undefined)[], racketIds: (string | null | undefined)[]) {
  let next = t;
  const orders = Object.values(t.orders);
  for (const id of new Set(clientIds.filter((value): value is string => !!value))) {
    next = withClient(next, id, (client) => {
      const dates = orders.filter((order) => order.client.id === id).map((order) => order.received_date);
      const last = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
      return client.last_order_date === last ? client : { ...client, last_order_date: last };
    });
  }
  for (const id of new Set(racketIds.filter((value): value is string => !!value))) {
    next = withRacket(next, id, (racket) => {
      if (racket.client_id === null) return racket;
      const latest = orders.filter((order) => order.racket.id === id).sort(newerOrder)[0];
      return { ...racket, last_setup: latest ? lastSetupOf(latest) : null };
    });
  }
  return next;
}

const bump = (value: number, by: number) => Math.max(0, value + by);

// --- The racket and the strings of an order --------------------------------------------------

/**
 * The racket of an order. One that is named is the client's racket of that name when they have one (the names are compared
 * as the server compares them), and otherwise is made here, with the id it was named with.
 */
function resolveRacket(
  t: Tables,
  clientId: string,
  clientName: string,
  input: Pick<OrderInput, 'racket_id' | 'new_racket'>,
  snapshot: OrderRacket | undefined
): { racket: OrderRacket; tables: Tables } {
  const named = input.new_racket;
  if (named && !input.racket_id) {
    const key = nameKey(named.brand, named.model);
    const have = Object.values(t.rackets).find(
      (racket) => racket.client_id === clientId && nameKey(racket.brand, racket.model) === key
    );
    if (have) return { racket: orderRacketOf(have), tables: t };
    const id = named.id ?? snapshot?.id;
    if (id && t.rackets[id]) return { racket: orderRacketOf(t.rackets[id]), tables: t };
    if (!id) throw new Error('A racket that is named for an order needs an id');
    const made: Racket = {
      id,
      client_id: clientId,
      client_name: clientName,
      brand: named.brand,
      model: named.model,
      notes: null,
      track_stock: false,
      stock: 0,
      available: true,
      orders_count: 0,
      last_setup: null,
    };
    const tables = withClient({ ...t, rackets: put(t.rackets, id, made) }, clientId, (client) => ({
      ...client,
      rackets_count: client.rackets_count + 1,
    }));
    return { racket: orderRacketOf(made), tables };
  }
  const racket = input.racket_id ? t.rackets[input.racket_id] : undefined;
  if (racket) return { racket: orderRacketOf(racket), tables: t };
  if (snapshot) return { racket: snapshot, tables: t };
  throw new Error('An order needs a racket');
}

/** The string a field points at: the catalog's name for a string that is newly chosen, and the name it had for one it already used. */
function resolveString(
  t: Tables,
  id: string | null | undefined,
  name: string | null | undefined,
  previousId?: string | null,
  previousName?: string | null
) {
  if (!id) return { id: null, name: name ?? null };
  if (id === previousId) return { id, name: previousName ?? name ?? null };
  const string = t.strings[id];
  return { id, name: string ? stringLabel(string) : (name ?? null) };
}

type SetupFields = Pick<
  OrderDetail,
  | 'customer_strings'
  | 'hybrid'
  | 'main_string_id'
  | 'main_string_name'
  | 'cross_string_id'
  | 'cross_string_name'
  | 'main_tension'
  | 'cross_tension'
  | 'knots'
  | 'stringing_notes'
  | 'labor_price'
  | 'string_price'
  | 'notes'
  | 'received_date'
  | 'due_date'
  | 'due_time'
>;

/** The fields of an order that a form sets, as the server stores them: what does not apply to this kind of setup is empty. */
function settle(t: Tables, next: Partial<SetupFields>, previous?: OrderDetail): SetupFields & { total: number | null } {
  const customer = !!next.customer_strings;
  const hybrid = !!next.hybrid;
  const main = resolveString(
    t,
    customer ? null : next.main_string_id,
    next.main_string_name,
    previous?.main_string_id,
    previous?.main_string_name
  );
  const cross = hybrid
    ? resolveString(
        t,
        customer ? null : next.cross_string_id,
        next.cross_string_name,
        previous?.cross_string_id,
        previous?.cross_string_name
      )
    : { id: null, name: null };
  const string_price = customer ? null : (next.string_price ?? null);
  const due_date = next.due_date ?? null;
  return {
    customer_strings: customer,
    hybrid,
    main_string_id: main.id,
    main_string_name: main.name,
    cross_string_id: cross.id,
    cross_string_name: cross.name,
    main_tension: next.main_tension ?? null,
    cross_tension: next.cross_tension ?? null,
    knots: next.knots ?? null,
    stringing_notes: next.stringing_notes ?? null,
    labor_price: next.labor_price ?? null,
    string_price,
    notes: next.notes ?? null,
    received_date: next.received_date ?? '',
    due_date,
    due_time: due_date ? (next.due_time ?? null) : null,
    total: null,
  };
}

const defined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;

const linesOf = (orderId: string, lines: NonNullable<OrderInput['services']>): OrderService[] =>
  lines.map((line, index) => ({
    id: `${orderId}:${index}`,
    service_id: line.service_id,
    name: line.name,
    price: line.price,
  }));

// --- Orders ----------------------------------------------------------------------------------

function createOrder(t: Tables, op: OpOf<'order.create'>): Tables {
  if (t.orders[op.subject]) return t;
  const input = op.input;
  const client = t.clients[input.client_id];
  const clientSummary = client ? summaryOf(client) : op.snapshot.client;

  const { racket, tables: withRacketMade } = resolveRacket(t, input.client_id, clientSummary.name, input, op.snapshot.racket);
  let next = withRacketMade;

  const fields = settle(next, defined({ ...input, received_date: input.received_date ?? op.at.slice(0, 10) }));
  const lines = linesOf(op.subject, input.services ?? []);
  const paid = !!input.is_paid;
  const order: OrderDetail = {
    id: op.subject,
    number: null,
    status: 'received',
    is_paid: paid,
    paid_at: paid ? op.at : null,
    client: clientSummary,
    racket,
    ...fields,
    total: orderTotal(fields.labor_price, fields.string_price, lines),
    started_at: null,
    ready_at: null,
    completed_at: null,
    accepted_by: op.by ?? null,
    assignee: op.assignee ?? null,
    assigned_at: op.assignee ? op.at : null,
    created_at: op.at,
    updated_at: op.at,
    services: lines,
    photos: [],
  };

  next = moveStock(next, countedTakes(next, wantedTakes(order)), -1);
  next = { ...next, orders: put(next.orders, order.id, order) };
  next = withClient(next, clientSummary.id, (c) => ({
    ...c,
    orders_count: c.orders_count + 1,
    last_order_date: !c.last_order_date || c.last_order_date < order.received_date ? order.received_date : c.last_order_date,
  }));
  next = withRacket(next, racket.id, (r) => ({ ...r, orders_count: r.orders_count + 1 }));
  return refreshStats(next, [], [racket.id]);
}

/** The timestamps that go with a status. Moving back to an earlier status clears the later ones (the server's rule). */
function statusChanges(status: OrderDetail['status'], previous: OrderDetail, now: string) {
  if (status === previous.status) return {};
  return {
    status,
    started_at: status === 'received' ? null : (previous.started_at ?? now),
    ready_at: status === 'ready' || status === 'completed' ? (previous.ready_at ?? now) : null,
    completed_at: status === 'completed' ? now : null,
  };
}

const STOCK_FIELDS = ['customer_strings', 'hybrid', 'main_string_id', 'cross_string_id'] as const;

function updateOrder(t: Tables, op: OpOf<'order.update'>): Tables {
  const previous = t.orders[op.subject];
  if (!previous) return t;
  const patch = op.patch;
  const now = op.at;

  let next = t;
  const clientId = patch.client_id ?? previous.client.id;
  const client = next.clients[clientId];
  const clientSummary =
    client ? summaryOf(client) : clientId === previous.client.id ? previous.client : (op.snapshot?.client ?? previous.client);

  let racket = previous.racket;
  if (patch.new_racket) {
    const resolved = resolveRacket(next, clientId, clientSummary.name, patch, op.snapshot?.racket);
    racket = resolved.racket;
    next = resolved.tables;
  } else if (patch.racket_id && patch.racket_id !== previous.racket.id) {
    racket = next.rackets[patch.racket_id] ? orderRacketOf(next.rackets[patch.racket_id]) : (op.snapshot?.racket ?? racket);
  }

  const fields = settle(
    next,
    { ...previous, ...defined({ ...patch, client_id: undefined, racket_id: undefined, services: undefined }) },
    previous
  );
  const lines = patch.services ? linesOf(op.subject, patch.services) : previous.services;
  const paid = patch.is_paid ?? previous.is_paid;
  const order: OrderDetail = {
    ...previous,
    ...fields,
    ...(patch.status ? statusChanges(patch.status, previous, now) : {}),
    is_paid: paid,
    paid_at: paid === previous.is_paid ? previous.paid_at : paid ? now : null,
    client: clientSummary,
    racket,
    total: orderTotal(fields.labor_price, fields.string_price, lines),
    services: lines,
    updated_at: now,
  };

  // What the order took goes back and what it needs now is taken, but only when what it points at has changed: an order that
  // is only moved on, or paid, leaves the stock alone.
  const stockChanged = order.racket.id !== previous.racket.id || STOCK_FIELDS.some((field) => order[field] !== previous[field]);
  if (stockChanged) {
    next = moveStock(next, countedTakes(next, wantedTakes(previous)), 1);
    next = moveStock(next, countedTakes(next, wantedTakes(order)), -1);
  }

  next = { ...next, orders: put(next.orders, order.id, order) };
  if (clientSummary.id !== previous.client.id) {
    next = withClient(next, previous.client.id, (c) => ({ ...c, orders_count: bump(c.orders_count, -1) }));
    next = withClient(next, clientSummary.id, (c) => ({ ...c, orders_count: c.orders_count + 1 }));
  }
  if (racket.id !== previous.racket.id) {
    next = withRacket(next, previous.racket.id, (r) => ({ ...r, orders_count: bump(r.orders_count, -1) }));
    next = withRacket(next, racket.id, (r) => ({ ...r, orders_count: r.orders_count + 1 }));
  }
  return refreshStats(next, [previous.client.id, clientSummary.id], [previous.racket.id, racket.id]);
}

function assignOrder(t: Tables, op: OpOf<'order.assign'>): Tables {
  const order = t.orders[op.subject];
  if (!order) return t;
  return {
    ...t,
    orders: put(t.orders, order.id, { ...order, assignee: op.assignee, assigned_at: op.assignee ? op.at : null }),
  };
}

function deleteOrder(t: Tables, op: OpOf<'order.delete'>): Tables {
  const order = t.orders[op.subject];
  if (!order) return t;
  let next = moveStock(t, countedTakes(t, wantedTakes(order)), 1);
  next = { ...next, orders: omit(next.orders, order.id) };
  next = withClient(next, order.client.id, (c) => ({ ...c, orders_count: bump(c.orders_count, -1) }));
  next = withRacket(next, order.racket.id, (r) => ({ ...r, orders_count: bump(r.orders_count, -1) }));
  return refreshStats(next, [order.client.id], [order.racket.id]);
}

// --- The rest --------------------------------------------------------------------------------

function createClient(t: Tables, op: OpOf<'client.create'>): Tables {
  if (t.clients[op.subject]) return t;
  const client: Client = { id: op.subject, ...op.fields, rackets_count: 0, orders_count: 0, last_order_date: null };
  return { ...t, clients: put(t.clients, client.id, client) };
}

function updateClient(t: Tables, op: OpOf<'client.update'>): Tables {
  const client = t.clients[op.subject];
  if (!client) return t;
  const next: Client = { ...client, ...defined(op.patch) };
  const summary = summaryOf(next);
  const orders = Object.fromEntries(
    Object.entries(t.orders).map(([id, order]) => [id, order.client.id === next.id ? { ...order, client: summary } : order])
  );
  const rackets = Object.fromEntries(
    Object.entries(t.rackets).map(([id, racket]) => [
      id,
      racket.client_id === next.id && racket.client_name !== next.name ? { ...racket, client_name: next.name } : racket,
    ])
  );
  return { ...t, clients: put(t.clients, next.id, next), orders, rackets };
}

/** Hides the client and their rackets; their orders stay in the history, as the server keeps them. */
function deleteClient(t: Tables, op: OpOf<'client.delete'>): Tables {
  if (!t.clients[op.subject]) return t;
  const rackets = Object.fromEntries(Object.entries(t.rackets).filter(([, racket]) => racket.client_id !== op.subject));
  return { ...t, clients: omit(t.clients, op.subject), rackets };
}

function createRacket(t: Tables, op: OpOf<'racket.create'>): Tables {
  if (t.rackets[op.subject]) return t;
  const { client_id: clientId, stock, track_stock: track, ...rest } = op.fields;
  const owner = clientId ? t.clients[clientId] : undefined;
  // Only a catalog racket is counted; a client's is theirs, not for sale, and always there.
  const counted = clientId === null && track;
  const racket: Racket = {
    id: op.subject,
    client_id: clientId,
    client_name: owner?.name ?? null,
    ...rest,
    track_stock: counted,
    stock: clientId === null ? Math.max(0, stock) : 0,
    available: !counted || stock > 0,
    orders_count: 0,
    last_setup: null,
  };
  const next = { ...t, rackets: put(t.rackets, racket.id, racket) };
  return withClient(next, clientId, (client) => ({ ...client, rackets_count: client.rackets_count + 1 }));
}

function updateRacket(t: Tables, op: OpOf<'racket.update'>): Tables {
  const racket = t.rackets[op.subject];
  if (!racket) return t;
  const { client_id: clientId, track_stock: track, ...rest } = op.patch;
  let next: Racket = { ...racket, ...defined(rest) };
  let tables = t;
  if (racket.client_id !== null) {
    // A client's racket can go to another client, but never has an empty owner.
    if (clientId && clientId !== racket.client_id) {
      const owner = t.clients[clientId];
      next = { ...next, client_id: clientId, client_name: owner?.name ?? next.client_name };
      tables = withClient(tables, racket.client_id, (c) => ({ ...c, rackets_count: bump(c.rackets_count, -1) }));
      tables = withClient(tables, clientId, (c) => ({ ...c, rackets_count: c.rackets_count + 1 }));
    }
  } else if (track !== undefined) {
    next = { ...next, track_stock: track, available: !track || next.stock > 0 };
  }
  const orders = Object.fromEntries(
    Object.entries(tables.orders).map(([id, order]) => [
      id,
      order.racket.id === next.id ? { ...order, racket: orderRacketOf(next) } : order,
    ])
  );
  return { ...tables, rackets: put(tables.rackets, next.id, next), orders };
}

function stockRacket(t: Tables, op: OpOf<'racket.stock'>): Tables {
  const racket = t.rackets[op.subject];
  if (!racket || racket.client_id !== null) return t;
  return { ...t, rackets: put(t.rackets, racket.id, withStock(racket, racket.stock + Math.round(op.delta))) };
}

function deleteRacket(t: Tables, op: OpOf<'racket.delete'>): Tables {
  const racket = t.rackets[op.subject];
  if (!racket) return t;
  const next = { ...t, rackets: omit(t.rackets, racket.id) };
  return withClient(next, racket.client_id, (c) => ({ ...c, rackets_count: bump(c.rackets_count, -1) }));
}

function createString(t: Tables, op: OpOf<'string.create'>): Tables {
  if (t.strings[op.subject]) return t;
  const { stock, ...rest } = op.fields;
  const string: CatalogString = {
    id: op.subject,
    ...rest,
    stock: Math.max(0, stock),
    available: !rest.track_stock || stock > 0,
  };
  return { ...t, strings: put(t.strings, string.id, string) };
}

function updateString(t: Tables, op: OpOf<'string.update'>): Tables {
  const string = t.strings[op.subject];
  if (!string) return t;
  const next = { ...string, ...defined(op.patch) };
  return { ...t, strings: put(t.strings, next.id, { ...next, available: !next.track_stock || next.stock > 0 }) };
}

function stockString(t: Tables, op: OpOf<'string.stock'>): Tables {
  const string = t.strings[op.subject];
  if (!string) return t;
  return { ...t, strings: put(t.strings, string.id, withStock(string, roundHalf(string.stock + op.delta))) };
}

const deleteString = (t: Tables, op: OpOf<'string.delete'>): Tables =>
  t.strings[op.subject] ? { ...t, strings: omit(t.strings, op.subject) } : t;

function createService(t: Tables, op: OpOf<'service.create'>): Tables {
  if (t.services[op.subject]) return t;
  const service: Service = { id: op.subject, ...op.fields };
  return { ...t, services: put(t.services, service.id, service) };
}

function updateService(t: Tables, op: OpOf<'service.update'>): Tables {
  const service = t.services[op.subject];
  return service ? { ...t, services: put(t.services, service.id, { ...service, ...defined(op.patch) }) } : t;
}

function deletePhoto(t: Tables, op: OpOf<'photo.delete'>): Tables {
  const order = t.orders[op.orderId];
  if (!order || !order.photos.some((photo) => photo.id === op.subject)) return t;
  return {
    ...t,
    orders: put(t.orders, order.id, { ...order, photos: order.photos.filter((photo) => photo.id !== op.subject) }),
  };
}

/** The copy as it is once this operation has been done. */
export function applyOp(t: Tables, op: Op): Tables {
  switch (op.type) {
    case 'client.create':
      return createClient(t, op);
    case 'client.update':
      return updateClient(t, op);
    case 'client.delete':
      return deleteClient(t, op);
    case 'racket.create':
      return createRacket(t, op);
    case 'racket.update':
      return updateRacket(t, op);
    case 'racket.stock':
      return stockRacket(t, op);
    case 'racket.delete':
      return deleteRacket(t, op);
    case 'string.create':
      return createString(t, op);
    case 'string.update':
      return updateString(t, op);
    case 'string.stock':
      return stockString(t, op);
    case 'string.delete':
      return deleteString(t, op);
    case 'service.create':
      return createService(t, op);
    case 'service.update':
      return updateService(t, op);
    case 'order.create':
      return createOrder(t, op);
    case 'order.update':
      return updateOrder(t, op);
    case 'order.delete':
      return deleteOrder(t, op);
    case 'order.assign':
      return assignOrder(t, op);
    case 'photo.delete':
      return deletePhoto(t, op);
  }
}

/** The copy with every operation of the queue done, in order. */
export const replay = (base: Tables, ops: readonly Op[]) => ops.reduce(applyOp, base);

/**
 * Puts the server's own answer to an operation in place of what was played here: the number of an order, its total, the stock
 * as it stands. `answer` is the body the server sent back.
 */
export function overlay(t: Tables, op: Op, answer: unknown): Tables {
  if (!answer || typeof answer !== 'object' || !('id' in answer)) return t;
  switch (op.type) {
    case 'client.create':
    case 'client.update':
      return { ...t, clients: put(t.clients, op.subject, answer as Client) };
    case 'racket.create':
    case 'racket.update':
    case 'racket.stock':
      return { ...t, rackets: put(t.rackets, op.subject, answer as Racket) };
    case 'string.create':
    case 'string.update':
    case 'string.stock':
      return { ...t, strings: put(t.strings, op.subject, answer as CatalogString) };
    case 'service.create':
    case 'service.update':
      return { ...t, services: put(t.services, op.subject, answer as Service) };
    case 'order.create':
    case 'order.update':
    case 'order.assign': {
      const order = answer as OrderDetail;
      return { ...t, orders: put(t.orders, op.subject, { ...order, services: order.services ?? [], photos: order.photos ?? [] }) };
    }
    default:
      return t;
  }
}

/** The racket an order was made with when it is not the one it was named with (the client had one of that name already). */
export function racketMadeFor(op: Op): string | undefined {
  if (op.type === 'order.create' || op.type === 'order.update') {
    const named = op.type === 'order.create' ? op.input.new_racket : op.patch.new_racket;
    return named?.id;
  }
  return undefined;
}

