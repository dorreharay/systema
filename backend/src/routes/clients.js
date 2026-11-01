import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { clients, orders, rackets } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { notFound, rejectMalformedIds } from '../utils/http.js';
import { orderColumns, serializeOrder, withOrderJoins } from '../utils/orders.js';
import {
  matchesWords, optionalEmail, optionalText, requiredText, searchQuery,
} from '../utils/validators.js';

const router = express.Router();
router.use(requireAuth);
rejectMalformedIds(router);

const clientSchema = z.object({
  name: requiredText(120, 'Enter the name'),
  phone: optionalText(40),
  email: optionalEmail,
  notes: optionalText(2000),
});

// Written out in full: Drizzle drops the table name from the columns of a single-table query, which
// would make `id` below mean the inner table's.
const stats = {
  rackets_count: sql`(select count(*)::int from rackets r where r.client_id = "clients"."id" and r.deleted_at is null)`,
  orders_count: sql`(select count(*)::int from orders o where o.client_id = "clients"."id")`,
  last_order_date: sql`(select max(o.received_date) from orders o where o.client_id = "clients"."id")`,
};

const owned = (id, userId) => and(eq(clients.id, id), eq(clients.user_id, userId), isNull(clients.deleted_at));

/** The client as an object, or 404. */
async function findClient(id, userId) {
  const [client] = await db
    .select({ client: clients, ...stats })
    .from(clients)
    .where(owned(id, userId))
    .limit(1);
  if (!client) throw notFound();
  return client;
}

const serialize = ({ client, rackets_count, orders_count, last_order_date }) => ({
  id: client.id,
  name: client.name,
  phone: client.phone,
  email: client.email,
  notes: client.notes,
  rackets_count,
  orders_count,
  last_order_date,
  created_at: client.created_at,
  updated_at: client.updated_at,
});

// GET /api/clients?q=
router.get('/', async (req, res) => {
  const { q } = parseQuery(searchQuery, req.query);

  const rows = await db
    .select({ client: clients, ...stats })
    .from(clients)
    .where(
      and(
        eq(clients.user_id, req.user.id),
        isNull(clients.deleted_at),
        q && matchesWords(sql`${clients.name} || ' ' || coalesce(${clients.phone}, '')`, q)
      )
    )
    .orderBy(sql`lower(${clients.name})`);

  res.json({ items: rows.map(serialize) });
});

// POST /api/clients
router.post('/', validateBody(clientSchema), async (req, res) => {
  const [client] = await db
    .insert(clients)
    .values({ ...req.body, user_id: req.user.id })
    .returning();
  res.status(201).json(serialize({ client, rackets_count: 0, orders_count: 0, last_order_date: null }));
});

// GET /api/clients/:id: the client with their rackets and order history
router.get('/:id', async (req, res) => {
  const found = await findClient(req.params.id, req.user.id);

  const clientRackets = await db
    .select({
      id: rackets.id,
      brand: rackets.brand,
      model: rackets.model,
      notes: rackets.notes,
      orders_count: sql`(select count(*)::int from orders o where o.racket_id = "rackets"."id")`,
    })
    .from(rackets)
    .where(and(eq(rackets.client_id, found.client.id), isNull(rackets.deleted_at)))
    .orderBy(sql`lower(${rackets.brand})`, sql`lower(${rackets.model})`);

  const history = await withOrderJoins(db.select(orderColumns).from(orders))
    .where(and(eq(orders.client_id, found.client.id), eq(orders.user_id, req.user.id)))
    .orderBy(desc(orders.number))
    .limit(100);

  res.json({ ...serialize(found), rackets: clientRackets, orders: history.map(serializeOrder) });
});

// PATCH /api/clients/:id
router.patch('/:id', validateBody(clientSchema.partial()), async (req, res) => {
  await findClient(req.params.id, req.user.id);
  await db.update(clients).set(req.body).where(owned(req.params.id, req.user.id));
  res.json(serialize(await findClient(req.params.id, req.user.id)));
});

// DELETE /api/clients/:id: hides the client and their rackets; their orders stay in the history
router.delete('/:id', async (req, res) => {
  await findClient(req.params.id, req.user.id);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(clients).set({ deleted_at: now }).where(owned(req.params.id, req.user.id));
    await tx
      .update(rackets)
      .set({ deleted_at: now })
      .where(and(eq(rackets.client_id, req.params.id), isNull(rackets.deleted_at)));
  });
  res.json({ ok: true });
});

export default router;
