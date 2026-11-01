import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
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
  matchesWords, optionalText, requiredText, searchQuery, uuid,
} from '../utils/validators.js';

const router = express.Router();
router.use(requireAuth);
rejectMalformedIds(router);

const racketSchema = z.object({
  client_id: uuid,
  brand: requiredText(80, 'Enter the brand'),
  model: requiredText(120, 'Enter the model'),
  notes: optionalText(2000),
});

const ordersCount = sql`(select count(*)::int from orders o where o.racket_id = "rackets"."id")`;

const owned = (id, userId) => and(eq(rackets.id, id), eq(rackets.user_id, userId), isNull(rackets.deleted_at));

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

const serialize = (row, last) => ({
  id: row.racket.id,
  client_id: row.racket.client_id,
  client_name: row.client.name,
  brand: row.racket.brand,
  model: row.racket.model,
  notes: row.racket.notes,
  orders_count: row.orders_count,
  last_setup: serializeLastSetup(last),
  created_at: row.racket.created_at,
  updated_at: row.racket.updated_at,
});

const selectRackets = () =>
  db
    .select({ racket: rackets, client: { id: clients.id, name: clients.name }, orders_count: ordersCount })
    .from(rackets)
    .innerJoin(clients, eq(rackets.client_id, clients.id));

/** The racket with its owner, or 404. */
async function findRacket(id, userId) {
  const [row] = await selectRackets().where(owned(id, userId)).limit(1);
  if (!row) throw notFound();
  return row;
}

/** A racket belongs to one of this stringer's clients. */
async function assertClient(clientId, userId) {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.user_id, userId), isNull(clients.deleted_at)))
    .limit(1);
  if (!client) {
    throw new HttpError(400, 'Unknown client', { code: 'validation_error', fields: { client_id: 'Unknown client' } });
  }
}

// GET /api/rackets?q=&client_id=
router.get('/', async (req, res) => {
  const { q } = parseQuery(searchQuery, req.query);
  const { client_id: clientId } = parseQuery(z.object({ client_id: uuid.optional() }), req.query);

  const rows = await selectRackets()
    .where(
      and(
        eq(rackets.user_id, req.user.id),
        isNull(rackets.deleted_at),
        clientId && eq(rackets.client_id, clientId),
        q && matchesWords(sql`${rackets.brand} || ' ' || ${rackets.model} || ' ' || ${clients.name}`, q)
      )
    )
    .orderBy(sql`lower(${rackets.brand})`, sql`lower(${rackets.model})`);

  const latest = await latestOrders(req.user.id, rows.map((row) => row.racket.id));
  res.json({ items: rows.map((row) => serialize(row, latest.get(row.racket.id))) });
});

// POST /api/rackets
router.post('/', validateBody(racketSchema), async (req, res) => {
  await assertClient(req.body.client_id, req.user.id);
  const [created] = await db
    .insert(rackets)
    .values({ ...req.body, user_id: req.user.id })
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
  await findRacket(req.params.id, req.user.id);
  if (req.body.client_id) await assertClient(req.body.client_id, req.user.id);
  await db.update(rackets).set(req.body).where(owned(req.params.id, req.user.id));

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
