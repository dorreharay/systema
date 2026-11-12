/**
 * What the forms and buttons do, as far as the phone is concerned: check what the server would check (from the data the phone has,
 * and answering with the server's own errors, so that the forms need to know nothing of it), put the change in the queue, and
 * let the engine take it to the server.
 *
 * A change to something that has not been sent yet goes into the operation that makes it (editing a client before they are in
 * the server's list is just a different new client); a change to something the server has is an operation of its own. A stock
 * is never sent as a number: it is sent as how many were added or taken, so that two phones do not undo each other.
 */
import { ApiError } from '../api-error';
import { orderNumber } from '../format';
import { phoneKey } from '../phone';
import { assertOrderAllowed, type OrderCap } from '../subscription';
import type { CatalogString, Client, OrderDetail, OrderInput, Person, Racket, Service } from '../types';
import type { WorkshopRole } from '../workshop';
import { newId } from './ids';
import type { ClientInput, RacketInput, ServiceInput, StringInput } from './inputs';
import { discardSet, inOrder, opMeta } from './outbox';
import { applyOp, countedTakes, shortages, wantedTakes } from './reduce';
import type { OfflineStore } from './store';
import type { SyncEngine } from './sync';
import type { Op, OpOf, OrderCreateInput, OrderSnapshot, Tables } from './types';

// How long an order that has just been made waits for the server to number it before the screen goes on without.
const FIRST_TRY_MS = 1_500;

const invalid = (field: string, message: string) => new ApiError(400, message, 'validation_error', { [field]: message });
const trimmed = (value: string | null | undefined) => (value ?? '').trim() || null;

const emailOf = (value: string | null | undefined) => {
  const email = trimmed(value)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('email', 'Invalid email');
  return email;
};

const defined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;

const PHONE_TAKEN = 'A client with this phone number already exists';

/** Throws the server's `phone_taken` when another client has the number. */
function assertPhoneFree(t: Tables, phone: string, exceptId?: string) {
  const key = phoneKey(phone);
  if (!key) return;
  const taken = Object.values(t.clients).find((client) => client.id !== exceptId && phoneKey(client.phone) === key);
  if (taken) {
    throw new ApiError(409, PHONE_TAKEN, 'phone_taken', { phone: PHONE_TAKEN }, { client: { id: taken.id, name: taken.name } });
  }
}

export type Actions = ReturnType<typeof createActions>;

export function createActions(
  store: OfflineStore,
  engine: Pick<SyncEngine, 'kick' | 'waitFor'>,
  {
    firstTryMs = FIRST_TRY_MS,
    orderCap = () => null,
    stockOn = () => true,
    self = () => null,
  }: {
    firstTryMs?: number;
    // The limit of new orders in a month that the plan of the account sets, asked each time an order is made; none: no limit.
    orderCap?: () => OrderCap | null;
    // Whether the plan counts the stock. Where it does not (Free) an order is never refused for what is not in the stock.
    stockOn?: () => boolean;
    // Who is working and in what role, asked each time an order is made: a master's own order is theirs, a receptionist's goes to the queue
    // (the server decides the same; the phone shows it at once).
    self?: () => { person: Person | null; role: WorkshopRole } | null;
  } = {}
) {
  const tables = () => store.getSnapshot().tables;
  // Each change is dated a moment after the one before it, so that what was done later is always later (an order made in the same
  // millisecond as the one before it still comes after it).
  let lastAt = 0;
  const stamp = () => {
    lastAt = Math.max(Date.parse(store.now()), lastAt + 1);
    return { id: newId(), at: new Date(lastAt).toISOString() };
  };

  function ready() {
    const snapshot = store.getSnapshot();
    if (!snapshot.ready || !snapshot.userId) throw new Error('The offline data is not loaded');
  }

  /** Puts changes in the queue, and has them sent. */
  async function send(...ops: Op[]) {
    ready();
    await store.enqueue(...ops);
    engine.kick();
  }

  /**
   * An edit made with the whole form of something. When what it edits is not at the server yet, it goes into the operation that
   * makes it; otherwise it is an operation of its own, and the earlier ones made with the same form, that it replaces, go.
   */
  async function change(
    subject: string,
    types: { create: Op['type']; update: Op['type'] },
    next: { merge: (create: Op) => Op; update: () => Op }
  ) {
    ready();
    await store.edit((ops, inflight) => {
      const replaced = (op: Op) =>
        op.type === types.update &&
        op.subject === subject &&
        'form' in op &&
        op.form === true &&
        op.id !== inflight &&
        opMeta(op).creates.length === 0;
      const kept = ops.filter((op) => !replaced(op));
      // A create that was sent (and whose answer never came) may be at the server already: it is not changed, the edit follows it.
      const create = kept.find((op) => op.type === types.create && op.subject === subject && op.id !== inflight && !op.sent);
      // Made over, it is a new try: whatever the server said to the old one is no longer true of it. What the edit points at may
      // have been made after the create in the queue, and the create then moves after it.
      if (create) {
        return inOrder(kept.map((op) => (op === create ? { ...next.merge(op), failure: undefined, tries: undefined } : op)));
      }
      return [...kept, next.update()];
    });
    engine.kick();
  }

  // --- Clients -----------------------------------------------------------------------------------

  async function createClient(input: ClientInput): Promise<Client> {
    const name = trimmed(input.name);
    const phone = trimmed(input.phone);
    if (!name) throw invalid('name', 'Enter the name');
    if (!phone) throw invalid('phone', 'Enter the phone number');
    const email = emailOf(input.email);
    assertPhoneFree(tables(), phone);
    const id = newId();
    await send({ ...stamp(), type: 'client.create', subject: id, fields: { name, phone, email, notes: trimmed(input.notes) } });
    return tables().clients[id];
  }

  async function updateClient(id: string, input: ClientInput): Promise<Client> {
    const current = tables().clients[id];
    if (!current) throw new ApiError(404, 'Not found');
    const patch: Partial<OpOf<'client.create'>['fields']> = {};
    if (input.name !== undefined) {
      patch.name = trimmed(input.name) ?? '';
      if (!patch.name) throw invalid('name', 'Enter the name');
    }
    if (input.phone !== undefined) {
      patch.phone = trimmed(input.phone) ?? '';
      if (!patch.phone) throw invalid('phone', 'Enter the phone number');
      // Only a number that changes is looked up: a client who shares theirs with another can still be edited.
      if (phoneKey(patch.phone) !== phoneKey(current.phone)) assertPhoneFree(tables(), patch.phone, id);
    }
    if (input.email !== undefined) patch.email = emailOf(input.email);
    if (input.notes !== undefined) patch.notes = trimmed(input.notes);

    await change(
      id,
      { create: 'client.create', update: 'client.update' },
      {
        merge: (create) => ({ ...create, fields: { ...(create as OpOf<'client.create'>).fields, ...patch } }) as Op,
        update: () => ({ ...stamp(), type: 'client.update', subject: id, patch, form: true }),
      }
    );
    return tables().clients[id] ?? current;
  }

  async function deleteClient(id: string) {
    const client = tables().clients[id];
    if (!client) throw new ApiError(404, 'Not found');
    await send({ ...stamp(), type: 'client.delete', subject: id, label: client.name });
    return { ok: true as const };
  }

  // --- Rackets -----------------------------------------------------------------------------------

  async function createRacket(input: RacketInput): Promise<Racket> {
    const brand = trimmed(input.brand);
    const model = trimmed(input.model);
    if (!brand) throw invalid('brand', 'Enter the brand');
    if (!model) throw invalid('model', 'Enter the model');
    const clientId = input.client_id ?? null;
    if (clientId && !tables().clients[clientId]) throw invalid('client_id', 'Unknown client');
    const stock = input.stock ?? 0;
    if (!Number.isInteger(stock) || stock < 0) throw invalid('stock', 'Use a whole number');
    const id = newId();
    await send({
      ...stamp(),
      type: 'racket.create',
      subject: id,
      fields: { client_id: clientId, brand, model, notes: trimmed(input.notes), track_stock: !!input.track_stock, stock },
    });
    return tables().rackets[id];
  }

  async function updateRacket(id: string, input: RacketInput): Promise<Racket> {
    const current = tables().rackets[id];
    if (!current) throw new ApiError(404, 'Not found');
    const catalog = current.client_id === null;
    const patch: OpOf<'racket.update'>['patch'] = {};
    if (input.brand !== undefined) {
      patch.brand = trimmed(input.brand) ?? '';
      if (!patch.brand) throw invalid('brand', 'Enter the brand');
    }
    if (input.model !== undefined) {
      patch.model = trimmed(input.model) ?? '';
      if (!patch.model) throw invalid('model', 'Enter the model');
    }
    if (input.notes !== undefined) patch.notes = trimmed(input.notes);
    if (input.client_id) {
      if (catalog) throw invalid('client_id', 'A catalog racket has no owner');
      if (!tables().clients[input.client_id]) throw invalid('client_id', 'Unknown client');
      patch.client_id = input.client_id;
    }
    if (catalog && input.track_stock !== undefined) patch.track_stock = input.track_stock;

    if (Object.keys(patch).length > 0) {
      await change(
        id,
        { create: 'racket.create', update: 'racket.update' },
        {
          merge: (create) => {
            const made = create as OpOf<'racket.create'>;
            return { ...made, fields: { ...made.fields, ...defined(patch) } } as Op;
          },
          update: () => ({ ...stamp(), type: 'racket.update', subject: id, patch, form: true }),
        }
      );
    }
    if (catalog && input.stock !== undefined) {
      if (!Number.isInteger(input.stock) || input.stock < 0) throw invalid('stock', 'Use a whole number');
      const delta = input.stock - current.stock;
      if (delta !== 0) await send({ ...stamp(), type: 'racket.stock', subject: id, delta });
    }
    return tables().rackets[id] ?? current;
  }

  async function deleteRacket(id: string) {
    const racket = tables().rackets[id];
    if (!racket) throw new ApiError(404, 'Not found');
    await send({ ...stamp(), type: 'racket.delete', subject: id, label: `${racket.brand} ${racket.model}` });
    return { ok: true as const };
  }

  // --- Strings -----------------------------------------------------------------------------------

  async function createString(input: StringInput): Promise<CatalogString> {
    const brand = trimmed(input.brand);
    const model = trimmed(input.model);
    if (!brand) throw invalid('brand', 'Enter the brand');
    if (!model) throw invalid('model', 'Enter the model');
    const stock = input.stock ?? 0;
    if (!Number.isInteger(stock * 2) || stock < 0) throw invalid('stock', 'Use whole or half sets');
    const id = newId();
    await send({
      ...stamp(),
      type: 'string.create',
      subject: id,
      fields: {
        brand,
        model,
        gauge: trimmed(input.gauge),
        type: input.type ?? 'other',
        default_price: input.default_price ?? null,
        track_stock: !!input.track_stock,
        stock,
      },
    });
    return tables().strings[id];
  }

  async function updateString(id: string, input: StringInput): Promise<CatalogString> {
    const current = tables().strings[id];
    if (!current) throw new ApiError(404, 'Not found');
    const patch: OpOf<'string.update'>['patch'] = {};
    if (input.brand !== undefined) {
      patch.brand = trimmed(input.brand) ?? '';
      if (!patch.brand) throw invalid('brand', 'Enter the brand');
    }
    if (input.model !== undefined) {
      patch.model = trimmed(input.model) ?? '';
      if (!patch.model) throw invalid('model', 'Enter the model');
    }
    if (input.gauge !== undefined) patch.gauge = trimmed(input.gauge);
    if (input.type !== undefined) patch.type = input.type;
    if (input.default_price !== undefined) patch.default_price = input.default_price;
    if (input.track_stock !== undefined) patch.track_stock = input.track_stock;

    if (Object.keys(patch).length > 0) {
      await change(
        id,
        { create: 'string.create', update: 'string.update' },
        {
          merge: (create) => {
            const made = create as OpOf<'string.create'>;
            return { ...made, fields: { ...made.fields, ...defined(patch) } } as Op;
          },
          update: () => ({ ...stamp(), type: 'string.update', subject: id, patch, form: true }),
        }
      );
    }
    if (input.stock !== undefined) {
      if (!Number.isInteger(input.stock * 2) || input.stock < 0) throw invalid('stock', 'Use whole or half sets');
      const delta = input.stock - current.stock;
      if (delta !== 0) await send({ ...stamp(), type: 'string.stock', subject: id, delta });
    }
    return tables().strings[id] ?? current;
  }

  async function deleteString(id: string) {
    const string = tables().strings[id];
    if (!string) throw new ApiError(404, 'Not found');
    await send({ ...stamp(), type: 'string.delete', subject: id, label: `${string.brand} ${string.model}` });
    return { ok: true as const };
  }

  // --- Services ----------------------------------------------------------------------------------

  async function createService(input: ServiceInput): Promise<Service> {
    const name = trimmed(input.name);
    if (!name) throw invalid('name', 'Enter the name');
    const id = newId();
    await send({
      ...stamp(),
      type: 'service.create',
      subject: id,
      fields: { name, price: input.price ?? null, kind: input.kind ?? 'extra', active: input.active ?? true },
    });
    return tables().services[id];
  }

  async function updateService(id: string, input: ServiceInput): Promise<Service> {
    const current = tables().services[id];
    if (!current) throw new ApiError(404, 'Not found');
    const patch: OpOf<'service.update'>['patch'] = {};
    if (input.name !== undefined) {
      patch.name = trimmed(input.name) ?? '';
      if (!patch.name) throw invalid('name', 'Enter the name');
    }
    if (input.price !== undefined) patch.price = input.price;
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.active !== undefined) patch.active = input.active;

    await change(
      id,
      { create: 'service.create', update: 'service.update' },
      {
        merge: (create) => {
          const made = create as OpOf<'service.create'>;
          return { ...made, fields: { ...made.fields, ...patch } } as Op;
        },
        // Only the form that edits the whole of a service replaces the ones before it.
        update: () => ({ ...stamp(), type: 'service.update', subject: id, patch, form: input.name !== undefined }),
      }
    );
    return tables().services[id] ?? current;
  }

  // --- Orders ------------------------------------------------------------------------------------

  const snapshotOf = (t: Tables, clientId: string, racketId: string | undefined, current?: OrderDetail): OrderSnapshot => {
    const client = t.clients[clientId];
    const racket = racketId ? t.rackets[racketId] : undefined;
    return {
      client: client
        ? { id: client.id, name: client.name, phone: client.phone, email: client.email }
        : (current?.client ?? { id: clientId, name: '', phone: null, email: null }),
      racket: racket
        ? { id: racket.id, brand: racket.brand, model: racket.model, client_id: racket.client_id }
        : (current?.racket ?? { id: racketId ?? '', brand: '', model: '', client_id: null }),
    };
  };

  /** What the server would find wrong with the things an order points at. */
  function assertReferences(t: Tables, input: OrderInput, current?: OrderDetail) {
    const clientId = input.client_id ?? current?.client.id;
    if (!clientId || !t.clients[clientId]) {
      // An order keeps its client even when they are hidden since.
      if (!(current && clientId === current.client.id)) throw invalid('client_id', 'Unknown client');
    }
    if (input.racket_id && input.racket_id !== current?.racket.id) {
      const racket = t.rackets[input.racket_id];
      if (!racket) throw invalid('racket_id', 'Unknown racket');
      if (racket.client_id !== null && racket.client_id !== clientId) {
        throw invalid('racket_id', 'This racket belongs to another client');
      }
    }
    const customer = input.customer_strings ?? current?.customer_strings ?? false;
    if (!customer) {
      if (input.main_string_id && input.main_string_id !== current?.main_string_id && !t.strings[input.main_string_id]) {
        throw invalid('main_string_id', 'Unknown string');
      }
      if (input.cross_string_id && input.cross_string_id !== current?.cross_string_id && !t.strings[input.cross_string_id]) {
        throw invalid('cross_string_id', 'Unknown string');
      }
    }
    for (const line of input.services ?? []) {
      if (line.service_id && !t.services[line.service_id]) throw invalid('services', 'Unknown service');
    }
  }

  /** Throws the server's `out_of_stock` when what the order wants of the stock is not there. */
  function assertStock(before: Tables, after: Tables, orderId: string, previous?: OrderDetail) {
    const order = after.orders[orderId];
    if (!order) return;
    const field = (take: { kind: string; id: string }) =>
      take.kind === 'racket' ? 'racket_id' : take.id === order.main_string_id ? 'main_string_id' : 'cross_string_id';
    const wanted = wantedTakes(order);
    // An order whose racket and strings are as they were takes nothing more.
    const key = (takes: { kind: string; id: string; qty: number }[]) => takes.map((take) => `${take.kind}:${take.id}:${take.qty}`).sort().join();
    if (previous && key(wantedTakes(previous)) === key(wanted)) return;
    const own = previous ? countedTakes(before, wantedTakes(previous)) : [];
    const short = shortages(before, wanted, field, own);
    if (short.length > 0) {
      throw new ApiError(
        409,
        'Not enough in stock',
        'out_of_stock',
        Object.fromEntries(short.map((name) => [name, 'Not enough in stock']))
      );
    }
  }

  async function createOrder(given: OrderInput & { assignee?: Person | null }): Promise<OrderDetail> {
    const { assignee: chosen, ...input } = given;
    delete input.assignee_id;
    const t = tables();
    if (!input.client_id) throw invalid('client_id', 'Choose a client');
    if (!input.racket_id && !input.new_racket) throw invalid('racket_id', 'Choose a racket');
    if (input.racket_id && input.new_racket) throw invalid('racket_id', 'Send either racket_id or new_racket');
    assertReferences(t, input);
    // The plan's limit, as the server would answer it (a 402 `order_limit_reached`): the orders on the phone are counted, those made
    // without a connection too, so that the stringer is told at once and not when the order reaches the server.
    const cap = orderCap();
    if (cap) assertOrderAllowed(Object.values(t.orders), cap, Date.parse(store.now()));

    const id = newId();
    // A racket that is named gets its id now, so that what is done to it before the order is sent can name it.
    const create: OrderCreateInput = {
      ...defined(input),
      client_id: input.client_id,
      ...(input.new_racket && { new_racket: { ...input.new_racket, id: input.new_racket.id ?? newId() } }),
    };
    delete create.status;
    // Who takes it in is the person at the phone; who strings it depends on the role. Without a team there is no assignee at all: the
    // field is left out, and the server leaves it empty too.
    const me = self();
    const assignee = me?.role === 'master' ? me.person : me?.role === 'owner' ? (chosen ?? null) : null;
    const op: OpOf<'order.create'> = {
      ...stamp(),
      type: 'order.create',
      subject: id,
      input: create,
      snapshot: snapshotOf(t, input.client_id, input.racket_id),
      ...(me && { by: me.person }),
      ...(assignee && { assignee }),
    };
    if (stockOn()) assertStock(t, applyOp(t, op), id);

    await send(op);
    // Online, the server numbers it in a moment: wait for that, but not for long.
    await engine.waitFor(op.id, firstTryMs);
    return tables().orders[id];
  }

  async function updateOrder(id: string, input: OrderInput): Promise<OrderDetail> {
    const t = tables();
    const current = t.orders[id];
    if (!current) throw new ApiError(404, 'Not found');
    if (input.racket_id && input.new_racket) throw invalid('racket_id', 'Send either racket_id or new_racket');
    assertReferences(t, input, current);

    // A change made with the whole form holds every field; the buttons of the order's page send a status or a payment.
    const form = input.client_id !== undefined;
    const patch: OrderInput = {
      ...defined(input),
      ...(input.new_racket && { new_racket: { ...input.new_racket, id: input.new_racket.id ?? newId() } }),
    };
    const op: OpOf<'order.update'> = {
      ...stamp(),
      type: 'order.update',
      subject: id,
      patch,
      form,
      snapshot: snapshotOf(t, patch.client_id ?? current.client.id, patch.racket_id ?? current.racket.id, current),
    };
    if (stockOn()) assertStock(t, applyOp(t, op), id, current);

    if (!form) {
      await send(op);
      return tables().orders[id] ?? current;
    }
    await change(
      id,
      { create: 'order.create', update: 'order.update' },
      {
        merge: (create) => {
          const made = create as OpOf<'order.create'>;
          const merged: OrderCreateInput = { ...made.input, ...defined(patch), client_id: patch.client_id ?? made.input.client_id };
          // A racket that is pointed at replaces one that was named, and the other way round.
          if (patch.racket_id) delete merged.new_racket;
          if (patch.new_racket) delete merged.racket_id;
          delete merged.status;
          return { ...made, input: merged, snapshot: op.snapshot ?? made.snapshot } as Op;
        },
        update: () => op,
      }
    );
    return tables().orders[id] ?? current;
  }

  async function deleteOrder(id: string) {
    const current = tables().orders[id];
    if (!current) throw new ApiError(404, 'Not found');
    ready();
    // An order that the server has never heard of is simply forgotten: no number is used up, nothing is taken from the stock.
    let forgotten = false;
    await store.edit((ops, inflight) => {
      const create = ops.find((op) => op.type === 'order.create' && op.subject === id);
      // One that was sent (and whose answer never came) may be at the server: it is deleted there too.
      if (!create || create.id === inflight || create.sent) return ops;
      const meta = opMeta(create);
      // It made a racket, which other changes may name: it stays, and the order is deleted in the ordinary way.
      if (meta.creates.length !== 1) return ops;
      forgotten = true;
      const gone = discardSet(ops, create.id);
      return ops.filter((op) => !gone.has(op.id));
    });
    if (!forgotten) {
      await send({ ...stamp(), type: 'order.delete', subject: id, label: `${orderNumber(current.number)}, ${current.client.name}` });
    }
    engine.kick();
    return { ok: true as const };
  }

  /**
   * Gives the order to a person, or back to the queue (null). The server may say no (someone took it first: 409 `order_taken`; a role that
   * does not allow it: 403): such a change is not left in the queue to be played again on the screen, it is taken out and the refusal is thrown.
   */
  async function assignOrder(id: string, assignee: Person | null): Promise<OrderDetail> {
    const current = tables().orders[id];
    if (!current) throw new ApiError(404, 'Not found');
    if ((current.assignee?.id ?? null) === (assignee?.id ?? null)) return current;
    const op: OpOf<'order.assign'> = { ...stamp(), type: 'order.assign', subject: id, assignee };
    await send(op);
    const taken = await engine.waitFor(op.id, firstTryMs);
    if (!taken) {
      const left = store.getSnapshot().outbox.find((candidate) => candidate.id === op.id);
      if (left?.failure) {
        await store.discard(op.id);
        engine.kick();
        throw new ApiError(left.failure.status, left.failure.message, left.failure.code);
      }
    }
    return tables().orders[id] ?? current;
  }

  async function deletePhoto(photoId: string) {
    const order = Object.values(tables().orders).find((candidate) => candidate.photos.some((photo) => photo.id === photoId));
    if (!order) return { ok: true as const };
    await send({ ...stamp(), type: 'photo.delete', subject: photoId, orderId: order.id });
    return { ok: true as const };
  }

  return {
    createClient,
    updateClient,
    deleteClient,
    createRacket,
    updateRacket,
    deleteRacket,
    createString,
    updateString,
    deleteString,
    createService,
    updateService,
    createOrder,
    updateOrder,
    deleteOrder,
    assignOrder,
    deletePhoto,
  };
}
