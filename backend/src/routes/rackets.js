import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { clients, orders, rackets } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { idConflict } from '../utils/clientIds.js';
import { HttpError, notFound, rejectMalformedIds } from '../utils/http.js';
import { claimOperation } from '../utils/operations.js';
import {
  orderColumns, serializeLastSetup, serializeOrder, withOrderJoins,
} from '../utils/orders.js';
import { stockTracked } from '../utils/plans.js';
import {
  MAX_STOCK, inStockQuery, matchesWords, opId, optionalText, racketsInStock, requiredText, searchText, stockDelta, uuid,
} from '../utils/validators.js';

const router = express.Router();
router.use(requireAuth);
rejectMalformedIds(router);

// A racket belongs to a client, or, with no `client_id`, is a racket of the stringer's catalog that they keep in stock.
const racketSchema = z.object({
  client_id: uuid.nullish(),
  brand: requiredText(80, 'Enter the brand'),
  model: requiredText(120, 'Enter the model'),
  notes: optionalText(2000),
  // Only for a catalog racket: whether it is counted, and how many there are.
  track_stock: z.boolean().optional(),
  stock: racketsInStock.optional(),
});

// A new racket may bring the id the phone made up for it (see utils/clientIds.js). A change never takes one.
const newRacketSchema = racketSchema.extend({ id: uuid.optional() });

// A change of the stock by an amount, in rackets. `op_id` makes the same request harmless when it is sent again (see utils/operations.js).
const stockChangeSchema = z.object({
  delta: stockDelta.int('Use a whole number'),
  op_id: opId,
});

const listQuery = z.object({
  q: searchText,
  client_id: uuid.optional(),
  // The rackets of clients, or the catalog's.
  kind: z.enum(['client', 'catalog']).optional(),
  in_stock: inStockQuery,
});

const ordersCount = sql`(select count(*)::int from orders o where o.racket_id = "rackets"."id")`;

const owned = (id, userId) => and(eq(rackets.id, id), eq(rackets.user_id, userId), isNull(rackets.deleted_at));

const fieldError = (field, message) =>
  new HttpError(400, message, { code: 'validation_error', fields: { [field]: message } });

/** The newest order of each of these rackets, by racket id. */
async function latestOrders(userId, racketIds) {
  if (racketIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([orders.racket_id])
    .from(orders)
    .where(and(eq(orders.user_id, userId), inArray(orders.racket_id, racketIds)))
    .orderBy(orders.racket_id, desc(orders.number));
  return new Map(rows.map((order) => [order.racket_id, order]));
}

// `tracked`: whether the plan of the account counts the stock (see `stockTracked`); the count is kept either way.
const serialize = (row, last, tracked = true) => {
  const { racket } = row;
  const catalog = racket.client_id === null;
  // The stock is only for a catalog racket; a client's is not counted and is always there.
  const counted = catalog && racket.track_stock && tracked;
  return {
    id: racket.id,
    client_id: racket.client_id,
    client_name: row.client?.name ?? null,
    brand: racket.brand,
    model: racket.model,
    notes: racket.notes,
    track_stock: counted,
    stock: catalog ? racket.stock : 0,
    available: !counted || racket.stock > 0,
    orders_count: row.orders_count,
    // How it was strung last time is for the client it belongs to: a catalog racket goes to many.
    last_setup: catalog ? null : serializeLastSetup(last),
    created_at: racket.created_at,
    updated_at: racket.updated_at,
  };
};

const selectRackets = () =>
  db
    .select({ racket: rackets, client: { id: clients.id, name: clients.name }, orders_count: ordersCount })
    .from(rackets)
    .leftJoin(clients, eq(rackets.client_id, clients.id));

/** The racket with its owner, or 404. */
async function findRacket(id, userId) {
  const [row] = await selectRackets().where(owned(id, userId)).limit(1);
  if (!row) throw notFound();
  return row;
}

/**
 * The racket with this id as GET shows it, when this stringer has it (a hidden one too: it was made, and a repeat of the request
 * that made it is answered). Undefined when the id is free; the id of another stringer's racket is a 409.
 */
async function racketWithId(id, userId, tracked) {
  const [row] = await selectRackets().where(eq(rackets.id, id)).limit(1);
  if (!row) return undefined;
  if (row.racket.user_id !== userId) throw idConflict();
  const latest = await latestOrders(userId, [id]);
  return serialize(row, latest.get(id), tracked);
}

/** A client's racket belongs to one of this stringer's clients. */
async function assertClient(clientId, userId) {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.user_id, userId), isNull(clients.deleted_at)))
    .limit(1);
  if (!client) throw fieldError('client_id', 'Unknown client');
}

// GET /api/rackets?q=&client_id=&kind=&in_stock=
router.get('/', async (req, res) => {
  const { q, client_id: clientId, kind, in_stock: inStock } = parseQuery(listQuery, req.query);
  const tracked = stockTracked(req.user);

  const rows = await selectRackets()
    .where(
      and(
        eq(rackets.user_id, req.user.id),
        isNull(rackets.deleted_at),
        clientId ? eq(rackets.client_id, clientId) : undefined,
        kind === 'client' ? isNotNull(rackets.client_id) : undefined,
        kind === 'catalog' ? isNull(rackets.client_id) : undefined,
        // What an order can use: not counted, or at least one left. (Where the stock is not counted, that is everything.)
        inStock && tracked ? or(eq(rackets.track_stock, false), gt(rackets.stock, 0)) : undefined,
        q
          ? matchesWords(sql`${rackets.brand} || ' ' || ${rackets.model} || ' ' || coalesce(${clients.name}, '')`, q)
          : undefined
      )
    )
    .orderBy(sql`lower(${rackets.brand})`, sql`lower(${rackets.model})`);

  const latest = await latestOrders(req.user.id, rows.map((row) => row.racket.id));
  res.json({ items: rows.map((row) => serialize(row, latest.get(row.racket.id), tracked)) });
});

// POST /api/rackets: a client's racket, or (without `client_id`) a catalog racket with its stock. A racket with the `id` that this
// stringer already has is not made again: it is answered with 200 and the racket as it is, whatever the client is now.
router.post('/', validateBody(newRacketSchema), async (req, res) => {
  const { id, client_id: clientId, track_stock: trackStock, stock, ...rest } = req.body;
  const tracked = stockTracked(req.user);

  if (id) {
    const found = await racketWithId(id, req.user.id, tracked);
    if (found) return res.status(200).json(found);
  }
  if (clientId) await assertClient(clientId, req.user.id);

  const [created] = await db
    .insert(rackets)
    .values({
      ...rest,
      ...(id && { id }),
      user_id: req.user.id,
      client_id: clientId ?? null,
      // Where the stock is not counted (Free), a new racket is not counted either, whatever the request says.
      ...(!clientId && { track_stock: tracked && (trackStock ?? false), stock: stock ?? 0 }),
    })
    .onConflictDoNothing({ target: rackets.id })
    .returning();
  if (!created) {
    // A copy of this same request, or another stringer's use of the id, got in between the look above and the insert.
    const found = await racketWithId(id, req.user.id, tracked);
    if (!found) throw idConflict();
    return res.status(200).json(found);
  }
  res.status(201).json(serialize(await findRacket(created.id, req.user.id), undefined, tracked));
});

// GET /api/rackets/:id: the racket and every time it was strung, newest first
router.get('/:id', async (req, res) => {
  const row = await findRacket(req.params.id, req.user.id);
  const history = await withOrderJoins(db.select(orderColumns).from(orders))
    .where(and(eq(orders.racket_id, row.racket.id), eq(orders.user_id, req.user.id)))
    .orderBy(desc(orders.number));

  res.json({
    ...serialize(row, history[0]?.order, stockTracked(req.user)),
    orders: history.map(serializeOrder),
  });
});

// PATCH /api/rackets/:id
router.patch('/:id', validateBody(racketSchema.partial()), async (req, res) => {
  const { racket } = await findRacket(req.params.id, req.user.id);
  const { client_id: clientId, track_stock: trackStock, stock, ...changes } = req.body;
  const tracked = stockTracked(req.user);

  if (racket.client_id) {
    // A client's racket can go to another client, but never has an empty owner, and its stock is not counted.
    if (clientId === null) throw fieldError('client_id', 'A client\'s racket needs its owner');
    if (clientId) {
      await assertClient(clientId, req.user.id);
      changes.client_id = clientId;
    }
  } else {
    // A catalog racket has no owner; its stock can be counted and changed.
    if (clientId) throw fieldError('client_id', 'A catalog racket has no owner');
    // Whether it is counted is not written where the stock is not counted (Free): what the form shows there is the paused view, and
    // writing it back would switch the counting off for good. The count itself is still taken.
    if (trackStock !== undefined && tracked) changes.track_stock = trackStock;
    if (stock !== undefined) changes.stock = stock;
  }

  if (Object.keys(changes).length > 0) {
    await db.update(rackets).set(changes).where(owned(req.params.id, req.user.id));
  }

  const row = await findRacket(req.params.id, req.user.id);
  const latest = await latestOrders(req.user.id, [row.racket.id]);
  res.json(serialize(row, latest.get(row.racket.id), tracked));
});

// POST /api/rackets/:id/stock: adds `delta` rackets to the stock of a catalog racket (a negative one takes them away), never below 0 and
// never above what a stock may be. A racket that is not counted is changed too; counting it is a change of `track_stock`.
router.post('/:id/stock', validateBody(stockChangeSchema), async (req, res) => {
  const { racket } = await findRacket(req.params.id, req.user.id);
  if (racket.client_id) throw fieldError('delta', 'Only a catalog racket has a stock');

  const { delta, op_id: key } = req.body;
  await db.transaction(async (tx) => {
    // A key that was written before: the change was made, and it is not made again.
    if (!(await claimOperation(tx, req.user.id, key)) || delta === 0) return;
    const changed = await tx
      .update(rackets)
      .set({ stock: sql`least(greatest(${rackets.stock} + ${delta}, 0), ${MAX_STOCK})` })
      .where(owned(req.params.id, req.user.id))
      .returning({ id: rackets.id });
    // Removed since the check above: the key goes with the change.
    if (changed.length === 0) throw notFound();
  });

  const row = await findRacket(req.params.id, req.user.id);
  const latest = await latestOrders(req.user.id, [row.racket.id]);
  res.json(serialize(row, latest.get(row.racket.id), stockTracked(req.user)));
});

// DELETE /api/rackets/:id: hides it; its orders stay in the history
router.delete('/:id', async (req, res) => {
  await findRacket(req.params.id, req.user.id);
  await db.update(rackets).set({ deleted_at: new Date() }).where(owned(req.params.id, req.user.id));
  res.json({ ok: true });
});

export default router;
