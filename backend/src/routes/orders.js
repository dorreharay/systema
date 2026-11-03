import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  ORDER_STATUSES, catalogStrings, clients, orderPhotos, orderServices, orders, rackets, services, users,
} from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { todayIn } from '../utils/dates.js';
import { HttpError, notFound, rejectMalformedIds } from '../utils/http.js';
import { detectImageType } from '../utils/images.js';
import {
  orderColumns, orderTotal, serializeOrder, toNumber, withOrderJoins,
} from '../utils/orders.js';
import { nameKey } from '../utils/reference.js';
import { giveBackStock, stockWanted, takeStock } from '../utils/stock.js';
import {
  isoDate, matchesWords, money, optionalText, requiredText, searchText, tensionKg, timeOfDay, uuid,
} from '../utils/validators.js';

const router = express.Router();
router.use(requireAuth);
rejectMalformedIds(router);

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const ACTIVE = ['received', 'in_progress', 'ready'];

// What an order takes from the stock depends only on these: changing any other field never moves any stock.
const STOCK_FIELDS = ['racket_id', 'customer_strings', 'hybrid', 'main_string_id', 'cross_string_id'];

// A racket of the client that is named instead of pointed at, for one that is not in the client's rackets yet. It is the
// client's racket of that name if they have one; otherwise it is made together with the order, in the same transaction,
// so that an order that is not made leaves no racket behind.
const newRacket = z.object({
  brand: requiredText(80, 'Enter the brand'),
  model: requiredText(120, 'Enter the model'),
});

const orderFields = z.object({
  client_id: uuid,
  racket_id: uuid.optional(),
  new_racket: newRacket.optional(),
  received_date: isoDate.optional(),
  due_date: isoDate.nullish(),
  due_time: timeOfDay.nullish(),
  customer_strings: z.boolean().optional(),
  hybrid: z.boolean().optional(),
  main_string_id: uuid.nullish(),
  main_string_name: optionalText(160),
  cross_string_id: uuid.nullish(),
  cross_string_name: optionalText(160),
  main_tension: tensionKg.optional(),
  cross_tension: tensionKg.optional(),
  knots: z.union([z.literal(2), z.literal(4)], 'Choose 2 or 4 knots').nullish(),
  stringing_notes: optionalText(2000),
  notes: optionalText(4000),
  labor_price: money.optional(),
  string_price: money.optional(),
  services: z
    .array(z.object({ service_id: uuid.nullish(), name: requiredText(100), price: money.optional() }))
    .max(20)
    .optional(),
  is_paid: z.boolean().optional(),
});

const bothRackets = { error: 'Send either racket_id or new_racket', path: ['racket_id'] };

// An order is for one racket, pointed at or named.
const orderSchema = orderFields
  .refine((body) => !!body.racket_id || !!body.new_racket, { error: 'Choose a racket', path: ['racket_id'] })
  .refine((body) => !(body.racket_id && body.new_racket), bothRackets);

// An edit may leave the racket alone.
const updateSchema = orderFields
  .partial()
  .extend({ status: z.enum(ORDER_STATUSES).optional() })
  .refine((body) => !(body.racket_id && body.new_racket), bothRackets);

const listQuery = z.object({
  status: z.enum([...ORDER_STATUSES, 'active']).optional(),
  q: searchText,
  client_id: uuid.optional(),
  racket_id: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

const fieldError = (field, message) =>
  new HttpError(400, message, { code: 'validation_error', fields: { [field]: message } });

const ownedOrder = (id, userId) => and(eq(orders.id, id), eq(orders.user_id, userId));

async function loadOrder(id, userId) {
  const [row] = await withOrderJoins(db.select(orderColumns).from(orders))
    .where(ownedOrder(id, userId))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

const serializeLine = (line) => ({
  id: line.id,
  service_id: line.service_id,
  name: line.name,
  price: toNumber(line.price),
});

async function loadLines(orderId) {
  return db.select().from(orderServices).where(eq(orderServices.order_id, orderId)).orderBy(asc(orderServices.name));
}

/** An order with its service lines and the list of its photos (not the photos themselves). */
async function orderDetail(id, userId) {
  const row = await loadOrder(id, userId);
  const [lines, photos] = await Promise.all([
    loadLines(id),
    db
      .select({
        id: orderPhotos.id,
        content_type: orderPhotos.content_type,
        size: orderPhotos.size,
        created_at: orderPhotos.created_at,
      })
      .from(orderPhotos)
      .where(eq(orderPhotos.order_id, id))
      .orderBy(asc(orderPhotos.created_at)),
  ]);
  return { ...serializeOrder(row), services: lines.map(serializeLine), photos };
}

const stringLabel = (row) => [row.brand, row.model, row.gauge].filter(Boolean).join(' ');

/**
 * The string a field points at. A string the order already used keeps the name it was saved with, so
 * editing an old order never rewrites it; a newly chosen one is named from the catalog.
 */
async function resolveString(userId, { id, name, previousId, previousName, field }) {
  if (!id) return { id: null, name: name ?? null };
  if (id === previousId) return { id, name: previousName ?? name ?? null };

  const [row] = await db
    .select()
    .from(catalogStrings)
    .where(and(eq(catalogStrings.id, id), eq(catalogStrings.user_id, userId), isNull(catalogStrings.deleted_at)))
    .limit(1);
  if (!row) throw fieldError(field, 'Unknown string');
  return { id, name: stringLabel(row) };
}

/**
 * The racket of an order: `{ id, client_id }`, and `make` when it does not exist yet. A racket that is pointed at must
 * be this stringer's and go with this client (a client's racket goes with its owner; a catalog racket, one with no
 * owner, goes with any client). One that is named (`new_racket`) is the client's racket of that name when they have
 * it, and otherwise is to be made: `make` is its brand and model, and the route makes it inside the transaction of the
 * order, because a racket that is made before the order is made stays when the order is not.
 */
async function resolveRacket(userId, next, previous) {
  if (next.new_racket) {
    const owned = await db
      .select({ id: rackets.id, brand: rackets.brand, model: rackets.model })
      .from(rackets)
      .where(and(eq(rackets.user_id, userId), eq(rackets.client_id, next.client_id), isNull(rackets.deleted_at)));
    const key = nameKey(next.new_racket.brand, next.new_racket.model);
    const have = owned.find((row) => nameKey(row.brand, row.model) === key);
    return { racket: { id: have?.id ?? null, client_id: next.client_id }, make: have ? null : next.new_racket };
  }

  const [racket] = await db
    .select({ id: rackets.id, client_id: rackets.client_id })
    .from(rackets)
    .where(
      and(
        eq(rackets.id, next.racket_id),
        eq(rackets.user_id, userId),
        previous?.racket_id === next.racket_id ? undefined : isNull(rackets.deleted_at)
      )
    )
    .limit(1);
  if (!racket) throw fieldError('racket_id', 'Unknown racket');
  if (racket.client_id !== null && racket.client_id !== next.client_id) {
    throw fieldError('racket_id', 'This racket belongs to another client');
  }
  return { racket, make: null };
}

/** A racket of a client, made inside the transaction `tx` of the order that names it. Answers with its id. */
async function makeRacket(tx, userId, clientId, { brand, model }) {
  const [made] = await tx
    .insert(rackets)
    .values({ user_id: userId, client_id: clientId, brand, model })
    .returning({ id: rackets.id });
  return made.id;
}

/**
 * Checks the references of an order against this stringer's data and works out what is stored (`values`): the
 * string names, which fields apply to this kind of setup, and the total; what it wants from the stock (`wanted`); and,
 * when the racket is named and does not exist yet, what it is to be made from (`make`).
 */
async function prepare(userId, next, previous) {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.id, next.client_id),
        eq(clients.user_id, userId),
        previous?.client_id === next.client_id ? undefined : isNull(clients.deleted_at)
      )
    )
    .limit(1);
  if (!client) throw fieldError('client_id', 'Unknown client');

  const { racket, make } = await resolveRacket(userId, next, previous);

  if (next.due_time && !next.due_date) throw fieldError('due_time', 'Choose a date first');

  // Strings the customer brings are not from the catalog, and only a hybrid has a second string.
  const main = await resolveString(userId, {
    id: next.customer_strings ? null : next.main_string_id,
    name: next.main_string_name,
    previousId: previous?.main_string_id,
    previousName: previous?.main_string_name,
    field: 'main_string_id',
  });
  const cross = next.hybrid
    ? await resolveString(userId, {
        id: next.customer_strings ? null : next.cross_string_id,
        name: next.cross_string_name,
        previousId: previous?.cross_string_id,
        previousName: previous?.cross_string_name,
        field: 'cross_string_id',
      })
    : { id: null, name: null };

  const serviceIds = next.services.map((line) => line.service_id).filter(Boolean);
  if (serviceIds.length > 0) {
    const found = await db
      .select({ id: services.id })
      .from(services)
      .where(and(inArray(services.id, serviceIds), eq(services.user_id, userId)));
    if (found.length !== new Set(serviceIds).size) throw fieldError('services', 'Unknown service');
  }

  const string_price = next.customer_strings ? null : next.string_price;
  return {
    make,
    values: {
      client_id: next.client_id,
      // Not known yet for a racket that is still to be made: the route fills it in once it has.
      racket_id: racket.id,
      received_date: next.received_date,
      due_date: next.due_date,
      due_time: next.due_time,
      customer_strings: next.customer_strings,
      hybrid: next.hybrid,
      main_string_id: main.id,
      main_string_name: main.name,
      cross_string_id: cross.id,
      cross_string_name: cross.name,
      main_tension: next.main_tension,
      cross_tension: next.cross_tension,
      knots: next.knots,
      stringing_notes: next.stringing_notes,
      notes: next.notes,
      labor_price: next.labor_price,
      string_price,
      total: orderTotal({ labor_price: next.labor_price, string_price, services: next.services }),
    },
    wanted: stockWanted({
      catalogRacketId: racket.client_id === null ? racket.id : null,
      customer_strings: next.customer_strings,
      hybrid: next.hybrid,
      main_string_id: main.id,
      cross_string_id: cross.id,
    }),
  };
}

/** The timestamps that go with a status. Moving back to an earlier status clears the later ones. */
function statusChanges(status, previous, now) {
  if (status === previous.status) return {};
  return {
    status,
    started_at: status === 'received' ? null : (previous.started_at ?? now),
    ready_at: status === 'ready' || status === 'completed' ? (previous.ready_at ?? now) : null,
    completed_at: status === 'completed' ? now : null,
  };
}

const paymentChanges = (isPaid, previous, now) =>
  isPaid === undefined || isPaid === previous.is_paid
    ? {}
    : { is_paid: isPaid, paid_at: isPaid ? now : null };

const insertLines = (tx, orderId, lines) =>
  lines.length > 0
    ? tx.insert(orderServices).values(lines.map((line) => ({ ...line, order_id: orderId, service_id: line.service_id ?? null })))
    : undefined;

// GET /api/orders?status=&q=&client_id=&racket_id=&limit=&offset=
router.get('/', async (req, res) => {
  const query = parseQuery(listQuery, req.query);
  const number = query.q?.match(/^#?(\d{1,9})$/)?.[1];

  const where = and(
    eq(orders.user_id, req.user.id),
    query.status === 'active' ? inArray(orders.status, ACTIVE) : undefined,
    query.status && query.status !== 'active' ? eq(orders.status, query.status) : undefined,
    query.client_id && eq(orders.client_id, query.client_id),
    query.racket_id && eq(orders.racket_id, query.racket_id),
    query.q &&
      or(
        number ? eq(orders.number, Number(number)) : undefined,
        matchesWords(
          sql`${clients.name} || ' ' || ${rackets.brand} || ' ' || ${rackets.model} || ' ' || coalesce(${orders.main_string_name}, '')`,
          query.q
        )
      )
  );

  // The queue first, by the day it is due and then in the order it came in; finished work after it,
  // the latest first. A finished-only list is just the latest first.
  const orderBy =
    query.status === 'completed'
      ? [desc(orders.completed_at), desc(orders.number)]
      : [
          sql`(${orders.status} = 'completed')`,
          sql`case when ${orders.status} = 'completed' then null else ${orders.due_date} end asc nulls last`,
          sql`case when ${orders.status} = 'completed' then ${orders.completed_at} end desc nulls last`,
          asc(orders.number),
        ];

  const rows = await withOrderJoins(db.select(orderColumns).from(orders))
    .where(where)
    .orderBy(...orderBy)
    .limit(query.limit + 1)
    .offset(query.offset);

  res.json({
    items: rows.slice(0, query.limit).map(serializeOrder),
    has_more: rows.length > query.limit,
  });
});

// POST /api/orders
router.post('/', validateBody(orderSchema), async (req, res) => {
  const body = req.body;
  const next = {
    customer_strings: false,
    hybrid: false,
    received_date: todayIn(req.user.timezone),
    due_date: null,
    due_time: null,
    main_string_id: null,
    main_string_name: null,
    cross_string_id: null,
    cross_string_name: null,
    main_tension: null,
    cross_tension: null,
    knots: null,
    stringing_notes: null,
    notes: null,
    labor_price: null,
    string_price: null,
    services: [],
    ...Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)),
  };
  const { values, wanted, make } = await prepare(req.user.id, next, undefined);

  const id = await db.transaction(async (tx) => {
    // The counter is only ever read and raised by this one statement, so two orders created at once
    // never get the same number.
    const [{ order_counter }] = await tx
      .update(users)
      .set({ order_counter: sql`${users.order_counter} + 1` })
      .where(eq(users.id, req.user.id))
      .returning({ order_counter: users.order_counter });

    // A racket that was named and is not the client's yet is made here, with the order: it only exists if the order does.
    const racketId = make ? await makeRacket(tx, req.user.id, values.client_id, make) : values.racket_id;

    // An order that finds too little in the stock fails here, and the number it was given goes back with it, and so
    // does the racket that was made for it.
    const taken = await takeStock(tx, req.user.id, wanted);

    const now = new Date();
    const [created] = await tx
      .insert(orders)
      .values({
        ...values,
        racket_id: racketId,
        user_id: req.user.id,
        number: order_counter,
        stock_used: taken,
        ...(body.is_paid && { is_paid: true, paid_at: now }),
      })
      .returning({ id: orders.id });
    await insertLines(tx, created.id, next.services);
    return created.id;
  });

  res.status(201).json(await orderDetail(id, req.user.id));
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  res.json(await orderDetail(req.params.id, req.user.id));
});

// PATCH /api/orders/:id: any of the fields above, plus `status`. `services` replaces the whole list.
router.patch('/:id', validateBody(updateSchema), async (req, res) => {
  const { order: previous } = await loadOrder(req.params.id, req.user.id);
  const body = req.body;

  const current = {
    ...previous,
    main_tension: toNumber(previous.main_tension),
    cross_tension: toNumber(previous.cross_tension),
    labor_price: toNumber(previous.labor_price),
    string_price: toNumber(previous.string_price),
  };
  const lines =
    body.services ??
    (await loadLines(previous.id)).map((line) => ({
      service_id: line.service_id,
      name: line.name,
      price: toNumber(line.price),
    }));
  const next = { ...current, services: lines };
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && key !== 'services') next[key] = value;
  }

  const { values: prepared, wanted, make } = await prepare(req.user.id, next, previous);
  const now = new Date();
  await db.transaction(async (tx) => {
    // A racket that was named and is not the client's yet is made here, with the change: it only exists if the change does.
    const values = make
      ? { ...prepared, racket_id: await makeRacket(tx, req.user.id, prepared.client_id, make) }
      : prepared;

    // What the order took goes back and what it needs now is taken, but only when what it points at has changed:
    // an order that is only moved on, or paid, leaves the stock alone.
    const stockChange = {};
    if (STOCK_FIELDS.some((field) => previous[field] !== values[field])) {
      await giveBackStock(tx, req.user.id, previous.stock_used);
      stockChange.stock_used = await takeStock(tx, req.user.id, wanted);
    }

    await tx
      .update(orders)
      .set({
        ...values,
        ...stockChange,
        ...(body.status && statusChanges(body.status, previous, now)),
        ...paymentChanges(body.is_paid, previous, now),
      })
      .where(ownedOrder(previous.id, req.user.id));

    if (body.services) {
      await tx.delete(orderServices).where(eq(orderServices.order_id, previous.id));
      await insertLines(tx, previous.id, body.services);
    }
  });

  res.json(await orderDetail(previous.id, req.user.id));
});

// DELETE /api/orders/:id: the order with its services and photos; what it took from the stock goes back
router.delete('/:id', async (req, res) => {
  const { order } = await loadOrder(req.params.id, req.user.id);
  await db.transaction(async (tx) => {
    await giveBackStock(tx, req.user.id, order.stock_used);
    await tx.delete(orders).where(ownedOrder(req.params.id, req.user.id));
  });
  res.json({ ok: true });
});

// POST /api/orders/:id/photos: the body is the image itself (JPEG, PNG, WebP or HEIC), up to 8 MB
router.post('/:id/photos', express.raw({ type: () => true, limit: MAX_PHOTO_BYTES }), async (req, res) => {
  await loadOrder(req.params.id, req.user.id);

  const contentType = detectImageType(req.body);
  if (!contentType) {
    throw new HttpError(415, 'Send a JPEG, PNG, WebP or HEIC image', { code: 'unsupported_image' });
  }

  const [{ count }] = await db
    .select({ count: sql`count(*)::int` })
    .from(orderPhotos)
    .where(eq(orderPhotos.order_id, req.params.id));
  if (count >= MAX_PHOTOS) {
    throw new HttpError(400, `An order can have up to ${MAX_PHOTOS} photos`, { code: 'photo_limit' });
  }

  const [photo] = await db
    .insert(orderPhotos)
    .values({
      user_id: req.user.id,
      order_id: req.params.id,
      content_type: contentType,
      size: req.body.length,
      data: req.body,
    })
    .returning({
      id: orderPhotos.id,
      content_type: orderPhotos.content_type,
      size: orderPhotos.size,
      created_at: orderPhotos.created_at,
    });
  res.status(201).json(photo);
});

export default router;
