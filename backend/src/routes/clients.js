import { and, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { clients, orders, rackets } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { idConflict, isIdCollision } from '../utils/clientIds.js';
import { HttpError, notFound, rejectMalformedIds } from '../utils/http.js';
import { orderColumns, serializeOrder, withOrderJoins } from '../utils/orders.js';
import { phoneKey } from '../utils/phone.js';
import {
  matchesWords, optionalEmail, optionalText, requiredText, searchQuery, uuid,
} from '../utils/validators.js';

const router = express.Router();
router.use(requireAuth);
rejectMalformedIds(router);

const clientSchema = z.object({
  name: requiredText(120, 'Enter the name'),
  phone: requiredText(40, 'Enter the phone number'),
  email: optionalEmail,
  notes: optionalText(2000),
});

// A new client may bring the id the phone made up for it (see utils/clientIds.js). A change never takes one.
const newClientSchema = clientSchema.extend({ id: uuid.optional() });

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

/**
 * Makes the stringer's other requests that make or change a client wait, so that two of them at the same moment cannot
 * both find a phone number free. (A unique index would say the same without the wait, but clients made before this check
 * may already share a number, and an index could not be built over them.)
 */
const lockClients = (tx, userId) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`clients:${userId}`}))`);

/** A client of this stringer, other than `exceptId`, whose phone is the same number as this one. */
async function findByPhone(tx, userId, phone, exceptId) {
  const key = phoneKey(phone);
  if (!key) return undefined;
  // The numbers that end in the same digits, so that few rows are read; the same number is then told from them by its key.
  const digits = sql`regexp_replace(${clients.phone}, '[^0-9]', '', 'g')`;
  const candidates = await tx
    .select({ id: clients.id, name: clients.name, phone: clients.phone })
    .from(clients)
    .where(
      and(
        eq(clients.user_id, userId),
        isNull(clients.deleted_at),
        isNotNull(clients.phone),
        sql`${digits} like ${`%${key.slice(-9)}`}`,
        exceptId && ne(clients.id, exceptId)
      )
    );
  return candidates.find((candidate) => phoneKey(candidate.phone) === key);
}

const PHONE_TAKEN = 'A client with this phone number already exists';

/** Throws the 409 that names the client who already has the number. */
async function rejectTakenPhone(tx, userId, phone, exceptId) {
  const taken = await findByPhone(tx, userId, phone, exceptId);
  if (!taken) return;
  throw new HttpError(409, PHONE_TAKEN, {
    code: 'phone_taken',
    fields: { phone: PHONE_TAKEN },
    data: { client: { id: taken.id, name: taken.name } },
  });
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

// POST /api/clients: a phone number that another client of the stringer has is a 409 (`phone_taken`). A client with the `id` that
// this stringer already has is not made again, whatever its phone: it is answered with 200 and the client as it is.
router.post('/', validateBody(newClientSchema), async (req, res) => {
  const { id, ...fields } = req.body;
  let result;
  try {
    result = await db.transaction(async (tx) => {
      await lockClients(tx, req.user.id);
      if (id) {
        const [existing] = await tx.select({ client: clients, ...stats }).from(clients).where(eq(clients.id, id)).limit(1);
        if (existing && existing.client.user_id !== req.user.id) throw idConflict();
        if (existing) return { found: existing };
      }
      await rejectTakenPhone(tx, req.user.id, fields.phone);
      const [created] = await tx
        .insert(clients)
        .values({ ...fields, ...(id && { id }), user_id: req.user.id })
        .returning();
      return { created };
    });
  } catch (err) {
    // Another stringer chose the same id at the same moment, and the database let them in first.
    if (isIdCollision(err)) throw idConflict();
    throw err;
  }
  if (result.found) return res.status(200).json(serialize(result.found));
  res.status(201).json(serialize({ client: result.created, rackets_count: 0, orders_count: 0, last_order_date: null }));
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

// PATCH /api/clients/:id: a new phone number that another client has is a 409 too
router.patch('/:id', validateBody(clientSchema.partial()), async (req, res) => {
  const { client } = await findClient(req.params.id, req.user.id);
  // Only a number that changes is looked up: a client who shares theirs with another (made before this check) can still be edited.
  const newNumber = req.body.phone !== undefined && phoneKey(req.body.phone) !== phoneKey(client.phone);
  await db.transaction(async (tx) => {
    if (newNumber) {
      await lockClients(tx, req.user.id);
      await rejectTakenPhone(tx, req.user.id, req.body.phone, client.id);
    }
    await tx.update(clients).set(req.body).where(owned(req.params.id, req.user.id));
  });
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
