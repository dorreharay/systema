import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  ORDER_STATUSES, catalogStrings, clients, orderPhotos, orderServices, orders, rackets, services, users, workshopMembers,
} from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { idConflict, isIdCollision, lockId } from '../utils/clientIds.js';
import { eventTime, todayIn } from '../utils/dates.js';
import { HttpError, notFound, rejectMalformedIds } from '../utils/http.js';
import { detectImageType } from '../utils/images.js';
import {
  orderColumns, orderTotal, serializeOrder, toNumber, withOrderJoins,
} from '../utils/orders.js';
import { assertCanMakeOrder, stockTracked } from '../utils/plans.js';
import { nameKey } from '../utils/reference.js';
import { giveBackStock, stockWanted, takeStock } from '../utils/stock.js';
import {
  flagQuery, isoDate, matchesWords, momentAt, money, optionalText, requiredText, searchText, tensionKg, timeOfDay, uuid,
} from '../utils/validators.js';
import { MASTER, OWNER, RECEPTIONIST, assertRole, visibleOrders, writableWorkshop } from '../utils/workshop.js';

const router = express.Router();
router.use(requireAuth, writableWorkshop);
rejectMalformedIds(router);

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const ACTIVE = ['received', 'in_progress', 'ready'];

// What an order takes from the stock depends only on these: changing any other field never moves any stock.
const STOCK_FIELDS = ['racket_id', 'customer_strings', 'hybrid', 'main_string_id', 'cross_string_id'];

// A racket of the client that is named instead of pointed at, for one that is not in the client's rackets yet. It is the
// client's racket of that name if they have one; otherwise it is made together with the order, in the same transaction,
// so that an order that is not made leaves no racket behind. The racket may bring the id the phone made up for it (see
// utils/clientIds.js); when the client has a racket of that name already, that one is used and the id is not.
const newRacket = z.object({
  id: uuid.optional(),
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

// A new order may bring the id the phone made up for it, and the moment it was made (see utils/clientIds.js, utils/dates.js). In a
// workshop with a team the owner may also give it to someone straight away (`assignee_id`); a master's own order is theirs, and the
// receptionist leaves it for the queue.
const newOrderFields = orderFields.extend({ id: uuid.optional(), at: momentAt, assignee_id: uuid.nullish() });

// An order is for one racket, pointed at or named.
const orderSchema = newOrderFields
  .refine((body) => !!body.racket_id || !!body.new_racket, { error: 'Choose a racket', path: ['racket_id'] })
  .refine((body) => !(body.racket_id && body.new_racket), bothRackets);

// An edit may leave the racket alone.
const updateSchema = orderFields
  .partial()
  .extend({ status: z.enum(ORDER_STATUSES).optional(), at: momentAt })
  .refine((body) => !(body.racket_id && body.new_racket), bothRackets);

const listQuery = z.object({
  status: z.enum([...ORDER_STATUSES, 'active']).optional(),
  q: searchText,
  client_id: uuid.optional(),
  racket_id: uuid.optional(),
  // Whose: your own (`me`), the queue (`none`), or a person's.
  assignee: z.union([z.literal('me'), z.literal('none'), uuid]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
  // Each order with its service lines and its photos, as GET /api/orders/:id has them.
  details: flagQuery,
});

const fieldError = (field, message) =>
  new HttpError(400, message, { code: 'validation_error', fields: { [field]: message } });

const ownedOrder = (id, userId) => and(eq(orders.id, id), eq(orders.user_id, userId));

// (`executor` is the transaction when the order is read inside one: see `lockOrder`. `visible` is the condition of who may see it: a
// master does not see the orders of the others, and for them they do not exist.)
async function loadOrder(id, userId, executor = db, visible = undefined) {
  const [row] = await withOrderJoins(executor.select(orderColumns).from(orders))
    .where(and(ownedOrder(id, userId), visible))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

/** Whether this person may change this order: the owner and the receptionist any, a master only the ones that are theirs. */
function assertCanChange(req, order) {
  if (req.workshop.role === MASTER && order.assignee_id !== req.user.id) {
    throw new HttpError(403, 'A master changes only the orders that are theirs', { code: 'forbidden_role' });
  }
}

/**
 * Who an order may be given to: the owner, or a master of the workshop (a receptionist takes orders in, and does not string them).
 * Throws the 400 of the field when it is someone else.
 */
async function assertWorker(executor, ownerId, personId) {
  if (personId === ownerId) return;
  const [member] = await executor
    .select({ id: workshopMembers.id })
    .from(workshopMembers)
    .where(and(eq(workshopMembers.owner_id, ownerId), eq(workshopMembers.user_id, personId), eq(workshopMembers.role, MASTER)))
    .limit(1);
  if (!member) throw fieldError('assignee_id', 'Unknown person');
}

/**
 * Makes the requests that change or delete this order wait for each other, until the transaction `tx` has ended. What an order took
 * from the stock is read after taking this lock, never before: two copies of one request (the answer of the first never reached the
 * phone, so it was sent again while the first was still being made) would both give back what the order took and both take what it
 * needs, and the stock would move twice.
 */
const lockOrder = (tx, id, userId) => lockId(tx, 'order-change', userId, id);

const serializeLine = (line) => ({
  id: line.id,
  service_id: line.service_id,
  name: line.name,
  price: toNumber(line.price),
});

async function loadLines(orderId, executor = db) {
  return executor.select().from(orderServices).where(eq(orderServices.order_id, orderId)).orderBy(asc(orderServices.name));
}

const photoColumns = {
  id: orderPhotos.id,
  content_type: orderPhotos.content_type,
  size: orderPhotos.size,
  created_at: orderPhotos.created_at,
};

/** An order with its service lines and the list of its photos (not the photos themselves). */
async function orderDetail(id, userId, visible = undefined) {
  const row = await loadOrder(id, userId, db, visible);
  const [lines, photos] = await Promise.all([
    loadLines(id),
    db.select(photoColumns).from(orderPhotos).where(eq(orderPhotos.order_id, id)).orderBy(asc(orderPhotos.created_at)),
  ]);
  return { ...serializeOrder(row), services: lines.map(serializeLine), photos };
}

/** The same for a page of orders: the lines and the photos of all of them, each read with one query. */
async function withDetails(rows) {
  const ids = rows.map(({ order }) => order.id);
  if (ids.length === 0) return [];
  const [lines, photos] = await Promise.all([
    db.select().from(orderServices).where(inArray(orderServices.order_id, ids)).orderBy(asc(orderServices.name)),
    db
      .select({ ...photoColumns, order_id: orderPhotos.order_id })
      .from(orderPhotos)
      .where(inArray(orderPhotos.order_id, ids))
      .orderBy(asc(orderPhotos.created_at)),
  ]);
  const group = (items, pick) => {
    const byOrder = new Map();
    for (const item of items) byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), pick(item)]);
    return byOrder;
  };
  const linesByOrder = group(lines, serializeLine);
  const photosByOrder = group(photos, ({ order_id: _order, ...photo }) => photo);
  return rows.map((row) => ({
    ...serializeOrder(row),
    services: linesByOrder.get(row.order.id) ?? [],
    photos: photosByOrder.get(row.order.id) ?? [],
  }));
}

/**
 * Whether this stringer has an order with this id already: a request that is made again, because the phone never heard the
 * answer. Free is false; the id of another stringer's order is a 409.
 */
async function hasOrderWithId(executor, id, userId) {
  const [row] = await executor.select({ user_id: orders.user_id }).from(orders).where(eq(orders.id, id)).limit(1);
  if (!row) return false;
  if (row.user_id !== userId) throw idConflict();
  return true;
}

const stringLabel = (row) => [row.brand, row.model, row.gauge].filter(Boolean).join(' ');

/**
 * The string a field points at. A string the order already used keeps the name it was saved with, so
 * editing an old order never rewrites it; a newly chosen one is named from the catalog.
 */
async function resolveString(userId, { id, name, previousId, previousName, field }, executor = db) {
  if (!id) return { id: null, name: name ?? null };
  if (id === previousId) return { id, name: previousName ?? name ?? null };

  const [row] = await executor
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
async function resolveRacket(userId, next, previous, executor = db) {
  if (next.new_racket) {
    const owned = await executor
      .select({ id: rackets.id, brand: rackets.brand, model: rackets.model })
      .from(rackets)
      .where(and(eq(rackets.user_id, userId), eq(rackets.client_id, next.client_id), isNull(rackets.deleted_at)));
    const key = nameKey(next.new_racket.brand, next.new_racket.model);
    const have = owned.find((row) => nameKey(row.brand, row.model) === key);
    return { racket: { id: have?.id ?? null, client_id: next.client_id }, make: have ? null : next.new_racket };
  }

  const [racket] = await executor
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

/** A racket of a client, made inside the transaction `tx` of the order that names it, with the id the phone gave it if it did. Answers with its id. */
async function makeRacket(tx, userId, clientId, { id, brand, model }) {
  const [made] = await tx
    .insert(rackets)
    .values({ ...(id && { id }), user_id: userId, client_id: clientId, brand, model })
    .returning({ id: rackets.id });
  return made.id;
}

/**
 * Checks the references of an order against this stringer's data and works out what is stored (`values`): the
 * string names, which fields apply to this kind of setup, and the total; what it wants from the stock (`wanted`); and,
 * when the racket is named and does not exist yet, what it is to be made from (`make`). Inside a transaction, `executor` is that
 * transaction, so that what is looked at is what the request that holds the lock of the order sees.
 */
async function prepare(userId, next, previous, executor = db) {
  const [client] = await executor
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

  const { racket, make } = await resolveRacket(userId, next, previous, executor);

  if (next.due_time && !next.due_date) throw fieldError('due_time', 'Choose a date first');

  // Strings the customer brings are not from the catalog, and only a hybrid has a second string.
  const main = await resolveString(
    userId,
    {
      id: next.customer_strings ? null : next.main_string_id,
      name: next.main_string_name,
      previousId: previous?.main_string_id,
      previousName: previous?.main_string_name,
      field: 'main_string_id',
    },
    executor
  );
  const cross = next.hybrid
    ? await resolveString(
        userId,
        {
          id: next.customer_strings ? null : next.cross_string_id,
          name: next.cross_string_name,
          previousId: previous?.cross_string_id,
          previousName: previous?.cross_string_name,
          field: 'cross_string_id',
        },
        executor
      )
    : { id: null, name: null };

  const serviceIds = next.services.map((line) => line.service_id).filter(Boolean);
  if (serviceIds.length > 0) {
    const found = await executor
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
    eq(orders.user_id, req.workshop.ownerId),
    visibleOrders(req.workshop, req.user.id),
    query.assignee === 'me' ? eq(orders.assignee_id, req.user.id) : undefined,
    query.assignee === 'none' ? isNull(orders.assignee_id) : undefined,
    query.assignee && query.assignee !== 'me' && query.assignee !== 'none' ? eq(orders.assignee_id, query.assignee) : undefined,
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

  const page = rows.slice(0, query.limit);
  res.json({
    items: query.details ? await withDetails(page) : page.map(serializeOrder),
    has_more: rows.length > query.limit,
  });
});

// POST /api/orders. An order with the `id` that this stringer already has is not made again: it is answered with 200 and the order
// as it is, and nothing is looked at, taken from the stock or numbered. `at` is the moment the order was made on the phone.
router.post('/', validateBody(orderSchema), async (req, res) => {
  const { id, at, assignee_id: requestedAssignee, ...body } = req.body;

  if (id && (await hasOrderWithId(db, id, req.workshop.ownerId))) {
    return res.status(200).json(await orderDetail(id, req.workshop.ownerId, visibleOrders(req.workshop, req.user.id)));
  }

  // Who strings it. A master's own order is theirs; the receptionist leaves it for the queue; the owner may give it to someone.
  const { role } = req.workshop;
  if (role === MASTER && requestedAssignee && requestedAssignee !== req.user.id) {
    throw new HttpError(403, 'A master cannot give an order to someone else', { code: 'forbidden_role' });
  }
  if (role === RECEPTIONIST && requestedAssignee) {
    throw new HttpError(403, 'A receptionist cannot give an order to someone', { code: 'forbidden_role' });
  }
  const assignee = role === MASTER ? req.user.id : (requestedAssignee ?? null);
  if (assignee) await assertWorker(db, req.workshop.ownerId, assignee);

  const next = {
    customer_strings: false,
    hybrid: false,
    received_date: todayIn(req.workshop.owner.timezone),
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
  const { values, wanted, make } = await prepare(req.workshop.ownerId, next, undefined);

  let repeated = false;
  let orderId;
  try {
    orderId = await db.transaction(async (tx) => {
      if (id) {
        // Two copies of one request at the same moment: the second waits here for the first, and finds its order.
        await lockId(tx, 'orders', req.workshop.ownerId, id);
        if (await hasOrderWithId(tx, id, req.workshop.ownerId)) {
          repeated = true;
          return id;
        }
      }

      // The counter is only ever read and raised by this one statement, so two orders created at once
      // never get the same number.
      const [{ order_counter }] = await tx
        .update(users)
        .set({ order_counter: sql`${users.order_counter} + 1` })
        .where(eq(users.id, req.workshop.ownerId))
        .returning({ order_counter: users.order_counter });

      // The update above holds this stringer's row until the transaction ends, so two orders made at once are counted one after the
      // other. An order the plan does not allow fails here, and the number it was given goes back with it.
      await assertCanMakeOrder(tx, req.workshop.owner, { at });

      // A racket that was named and is not the client's yet is made here, with the order: it only exists if the order does.
      const racketId = make ? await makeRacket(tx, req.workshop.ownerId, values.client_id, make) : values.racket_id;

      // An order that finds too little in the stock fails here, and the number it was given goes back with it, and so
      // does the racket that was made for it. Where the stock is not counted (Free) it takes nothing and finds nothing missing.
      const taken = await takeStock(tx, req.workshop.ownerId, stockTracked(req.workshop.owner) ? wanted : []);

      const moment = eventTime(at);
      const [created] = await tx
        .insert(orders)
        .values({
          ...values,
          ...(id && { id }),
          racket_id: racketId,
          user_id: req.workshop.ownerId,
          number: order_counter,
          stock_used: taken,
          accepted_by_id: req.user.id,
          assignee_id: assignee,
          assigned_at: assignee ? moment : null,
          created_at: moment,
          ...(body.is_paid && { is_paid: true, paid_at: moment }),
        })
        .returning({ id: orders.id });
      await insertLines(tx, created.id, next.services);
      return created.id;
    });
  } catch (err) {
    // The id of the order, or of the racket it named, was used by someone else at the same moment.
    if (isIdCollision(err)) throw idConflict();
    throw err;
  }

  res.status(repeated ? 200 : 201).json(await orderDetail(orderId, req.workshop.ownerId, visibleOrders(req.workshop, req.user.id)));
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  res.json(await orderDetail(req.params.id, req.workshop.ownerId, visibleOrders(req.workshop, req.user.id)));
});

// PATCH /api/orders/:id: any of the fields above, plus `status`. `services` replaces the whole list.
router.patch('/:id', validateBody(updateSchema), async (req, res) => {
  // `at` is the moment the phone made the change, which dates the status and the payment.
  const { at, ...body } = req.body;
  const now = eventTime(at);
  try {
    await db.transaction(async (tx) => {
      // Everything about the order is read here, once the requests before this one have finished with it: a copy of a change that
      // is already made finds the order as that change left it, and moves nothing again.
      await lockOrder(tx, req.params.id, req.workshop.ownerId);
      const { order: previous } = await loadOrder(req.params.id, req.workshop.ownerId, tx, visibleOrders(req.workshop, req.user.id));
      assertCanChange(req, previous);

      const current = {
        ...previous,
        main_tension: toNumber(previous.main_tension),
        cross_tension: toNumber(previous.cross_tension),
        labor_price: toNumber(previous.labor_price),
        string_price: toNumber(previous.string_price),
      };
      const lines =
        body.services ??
        (await loadLines(previous.id, tx)).map((line) => ({
          service_id: line.service_id,
          name: line.name,
          price: toNumber(line.price),
        }));
      const next = { ...current, services: lines };
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && key !== 'services') next[key] = value;
      }

      const { values: prepared, wanted, make } = await prepare(req.workshop.ownerId, next, previous, tx);

      // A racket that was named and is not the client's yet is made here, with the change: it only exists if the change does.
      const values = make
        ? { ...prepared, racket_id: await makeRacket(tx, req.workshop.ownerId, prepared.client_id, make) }
        : prepared;

      // What the order took goes back and what it needs now is taken, but only when what it points at has changed:
      // an order that is only moved on, or paid, leaves the stock alone.
      const stockChange = {};
      if (STOCK_FIELDS.some((field) => previous[field] !== values[field])) {
        await giveBackStock(tx, req.workshop.ownerId, previous.stock_used);
        stockChange.stock_used = await takeStock(tx, req.workshop.ownerId, stockTracked(req.workshop.owner) ? wanted : []);
      }

      await tx
        .update(orders)
        .set({
          ...values,
          ...stockChange,
          ...(body.status && statusChanges(body.status, previous, now)),
          ...paymentChanges(body.is_paid, previous, now),
        })
        .where(ownedOrder(previous.id, req.workshop.ownerId));

      if (body.services) {
        await tx.delete(orderServices).where(eq(orderServices.order_id, previous.id));
        await insertLines(tx, previous.id, body.services);
      }
    });
  } catch (err) {
    // The id the phone gave to the racket it named was used by someone else.
    if (isIdCollision(err)) throw idConflict();
    throw err;
  }

  res.json(await orderDetail(req.params.id, req.workshop.ownerId, visibleOrders(req.workshop, req.user.id)));
});

// DELETE /api/orders/:id: the order with its services and photos; what it took from the stock goes back
router.delete('/:id', async (req, res) => {
  // A master does not delete: an order is taken in, and gone, by the owner or the receptionist.
  assertRole(req.workshop, OWNER, RECEPTIONIST);
  await db.transaction(async (tx) => {
    // What the order took is read once the requests before this one have finished with it, so that it is given back once: of two
    // copies of one delete, the second finds the order gone.
    await lockOrder(tx, req.params.id, req.workshop.ownerId);
    const { order } = await loadOrder(req.params.id, req.workshop.ownerId, tx);
    await giveBackStock(tx, req.workshop.ownerId, order.stock_used);
    await tx.delete(orders).where(ownedOrder(req.params.id, req.workshop.ownerId));
  });
  res.json({ ok: true });
});

const assignSchema = z.object({ assignee_id: uuid.nullable(), at: momentAt });

// POST /api/orders/:id/assign: gives the order to a person (`assignee_id`) or back to the queue (`null`). The owner gives it to themselves
// or to a master, or takes it back. A master takes an order nobody has, or lets go of one of their own; if someone took it a moment before
// them, it is a 409 `order_taken`. A receptionist does not give orders. Giving it to who has it already changes nothing.
router.post('/:id/assign', validateBody(assignSchema), async (req, res) => {
  assertRole(req.workshop, OWNER, MASTER);
  const { assignee_id: target, at } = req.body;
  const me = req.user.id;

  await db.transaction(async (tx) => {
    await lockOrder(tx, req.params.id, req.workshop.ownerId);
    const { order: previous } = await loadOrder(req.params.id, req.workshop.ownerId, tx);
    if (previous.assignee_id === target) return;

    if (req.workshop.role === MASTER) {
      const takes = target === me && previous.assignee_id === null;
      const lets = target === null && previous.assignee_id === me;
      if (!takes && !lets) {
        if (previous.assignee_id !== null && previous.assignee_id !== me) {
          throw new HttpError(409, 'Someone else has this order already', { code: 'order_taken' });
        }
        throw new HttpError(403, 'A master takes an order for themselves, or lets go of their own', { code: 'forbidden_role' });
      }
    }
    if (target) await assertWorker(tx, req.workshop.ownerId, target);

    await tx
      .update(orders)
      .set({ assignee_id: target, assigned_at: target ? eventTime(at) : null })
      .where(ownedOrder(previous.id, req.workshop.ownerId));
  });

  res.json(await orderDetail(req.params.id, req.workshop.ownerId, visibleOrders(req.workshop, req.user.id)));
});

// POST /api/orders/:id/photos: the body is the image itself (JPEG, PNG, WebP or HEIC), up to 8 MB
router.post('/:id/photos', express.raw({ type: () => true, limit: MAX_PHOTO_BYTES }), async (req, res) => {
  const { order } = await loadOrder(req.params.id, req.workshop.ownerId, db, visibleOrders(req.workshop, req.user.id));
  assertCanChange(req, order);

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
      user_id: req.workshop.ownerId,
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
