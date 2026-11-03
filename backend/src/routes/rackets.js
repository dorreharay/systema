import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { clients, orders, rackets } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { HttpError, notFound, rejectMalformedIds } from '../utils/http.js';
import {
  orderColumns, serializeLastSetup, serializeOrder, withOrderJoins,
} from '../utils/orders.js';
import {
  inStockQuery, matchesWords, optionalText, racketsInStock, requiredText, searchText, uuid,
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

const serialize = (row, last) => {
  const { racket } = row;
  const catalog = racket.client_id === null;
  return {
    id: racket.id,
    client_id: racket.client_id,
    client_name: row.client?.name ?? null,
    brand: racket.brand,
    model: racket.model,
    notes: racket.notes,
    // The stock is only for a catalog racket; a client's is not counted and is always there.
    track_stock: catalog && racket.track_stock,
    stock: catalog ? racket.stock : 0,
    available: !catalog || !racket.track_stock || racket.stock > 0,
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

  const rows = await selectRackets()
    .where(
      and(
        eq(rackets.user_id, req.user.id),
        isNull(rackets.deleted_at),
        clientId ? eq(rackets.client_id, clientId) : undefined,
        kind === 'client' ? isNotNull(rackets.client_id) : undefined,
        kind === 'catalog' ? isNull(rackets.client_id) : undefined,
        // What an order can use: not counted, or at least one left.
        inStock ? or(eq(rackets.track_stock, false), gt(rackets.stock, 0)) : undefined,
        q
          ? matchesWords(sql`${rackets.brand} || ' ' || ${rackets.model} || ' ' || coalesce(${clients.name}, '')`, q)
          : undefined
      )
    )
    .orderBy(sql`lower(${rackets.brand})`, sql`lower(${rackets.model})`);

  const latest = await latestOrders(req.user.id, rows.map((row) => row.racket.id));
  res.json({ items: rows.map((row) => serialize(row, latest.get(row.racket.id))) });
});

// POST /api/rackets: a client's racket, or (without `client_id`) a catalog racket with its stock
router.post('/', validateBody(racketSchema), async (req, res) => {
  const { client_id: clientId, track_stock: trackStock, stock, ...rest } = req.body;
  if (clientId) await assertClient(clientId, req.user.id);

  const [created] = await db
    .insert(rackets)
    .values({
      ...rest,
      user_id: req.user.id,
      client_id: clientId ?? null,
      ...(!clientId && { track_stock: trackStock ?? false, stock: stock ?? 0 }),
    })
    .returning();
  res.status(201).json(serialize(await findRacket(created.id, req.user.id)));
});

// GET /api/rackets/:id: the racket and every time it was strung, newest first
router.get('/:id', async (req, res) => {
  const row = await findRacket(req.params.id, req.user.id);
  const history = await withOrderJoins(db.select(orderColumns).from(orders))
    .where(and(eq(orders.racket_id, row.racket.id), eq(orders.user_id, req.user.id)))
    .orderBy(desc(orders.number));

  res.json({
    ...serialize(row, history[0]?.order),
    orders: history.map(serializeOrder),
  });
});

// PATCH /api/rackets/:id
router.patch('/:id', validateBody(racketSchema.partial()), async (req, res) => {
  const { racket } = await findRacket(req.params.id, req.user.id);
  const { client_id: clientId, track_stock: trackStock, stock, ...changes } = req.body;

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
    if (trackStock !== undefined) changes.track_stock = trackStock;
    if (stock !== undefined) changes.stock = stock;
  }

  if (Object.keys(changes).length > 0) {
    await db.update(rackets).set(changes).where(owned(req.params.id, req.user.id));
  }

  const row = await findRacket(req.params.id, req.user.id);
  const latest = await latestOrders(req.user.id, [row.racket.id]);
  res.json(serialize(row, latest.get(row.racket.id)));
});

// DELETE /api/rackets/:id: hides it; its orders stay in the history
router.delete('/:id', async (req, res) => {
  await findRacket(req.params.id, req.user.id);
  await db.update(rackets).set({ deleted_at: new Date() }).where(owned(req.params.id, req.user.id));
  res.json({ ok: true });
});

export default router;
