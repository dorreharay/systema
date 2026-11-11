import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { STRING_TYPES, catalogStrings } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { idConflict } from '../utils/clientIds.js';
import { notFound, rejectMalformedIds } from '../utils/http.js';
import { claimOperation } from '../utils/operations.js';
import { toNumber } from '../utils/orders.js';
import { stockTracked } from '../utils/plans.js';
import {
  MAX_STOCK, inStockQuery, matchesWords, money, opId, optionalText, requiredText, searchText, setsInStock, stockDelta, uuid,
} from '../utils/validators.js';

const router = express.Router();
router.use(requireAuth);
rejectMalformedIds(router);

const stringSchema = z.object({
  brand: requiredText(80, 'Enter the brand'),
  model: requiredText(120, 'Enter the model'),
  gauge: optionalText(30),
  type: z.enum(STRING_TYPES, 'Choose a string type').optional(),
  default_price: money.optional(),
  // Whether the stock is counted, and how many sets there are.
  track_stock: z.boolean().optional(),
  stock: setsInStock.optional(),
});

// A new string may bring the id the phone made up for it (see utils/clientIds.js). A change never takes one.
const newStringSchema = stringSchema.extend({ id: uuid.optional() });

// A change of the stock by an amount: half sets, since a hybrid takes half a set of each of its two strings. `op_id` makes the same
// request harmless when it is sent again (see utils/operations.js).
const stockChangeSchema = z.object({
  delta: stockDelta.refine((value) => Number.isInteger(value * 2), 'Use whole or half sets'),
  op_id: opId,
});

const listQuery = z.object({ q: searchText, in_stock: inStockQuery });

const owned = (id, userId) =>
  and(eq(catalogStrings.id, id), eq(catalogStrings.user_id, userId), isNull(catalogStrings.deleted_at));

// `tracked`: whether the plan of the account counts the stock (see `stockTracked`); the count is kept either way.
const serialize = (row, tracked = true) => {
  const counted = row.track_stock && tracked;
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    gauge: row.gauge,
    type: row.type,
    default_price: toNumber(row.default_price),
    track_stock: counted,
    stock: toNumber(row.stock),
    // What an order can use: not counted, or at least half a set left.
    available: !counted || Number(row.stock) > 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

async function findString(id, userId) {
  const [row] = await db.select().from(catalogStrings).where(owned(id, userId)).limit(1);
  if (!row) throw notFound();
  return row;
}

// GET /api/strings?q=&in_stock=
router.get('/', async (req, res) => {
  const { q, in_stock: inStock } = parseQuery(listQuery, req.query);
  const tracked = stockTracked(req.user);

  const rows = await db
    .select()
    .from(catalogStrings)
    .where(
      and(
        eq(catalogStrings.user_id, req.user.id),
        isNull(catalogStrings.deleted_at),
        // (Where the stock is not counted, every string is available.)
        inStock && tracked ? or(eq(catalogStrings.track_stock, false), gt(catalogStrings.stock, '0')) : undefined,
        q ? matchesWords(sql`${catalogStrings.brand} || ' ' || ${catalogStrings.model}`, q) : undefined
      )
    )
    .orderBy(sql`lower(${catalogStrings.brand})`, sql`lower(${catalogStrings.model})`);

  res.json({ items: rows.map((row) => serialize(row, tracked)) });
});

// POST /api/strings: a string with the `id` that this stringer already has is not made again; it is answered with 200 and the
// string as it is. The id of another stringer's string is a 409.
router.post('/', validateBody(newStringSchema), async (req, res) => {
  const { id, ...fields } = req.body;
  const tracked = stockTracked(req.user);
  const [row] = await db
    .insert(catalogStrings)
    // Where the stock is not counted (Free), a new string is not counted either, whatever the request says.
    .values({ ...fields, ...(!tracked && { track_stock: false }), ...(id && { id }), user_id: req.user.id })
    .onConflictDoNothing({ target: catalogStrings.id })
    .returning();
  if (row) return res.status(201).json(serialize(row, tracked));

  const [existing] = await db.select().from(catalogStrings).where(eq(catalogStrings.id, id)).limit(1);
  if (!existing || existing.user_id !== req.user.id) throw idConflict();
  res.status(200).json(serialize(existing, tracked));
});

// GET /api/strings/:id
router.get('/:id', async (req, res) => {
  res.json(serialize(await findString(req.params.id, req.user.id), stockTracked(req.user)));
});

// PATCH /api/strings/:id
router.patch('/:id', validateBody(stringSchema.partial()), async (req, res) => {
  const found = await findString(req.params.id, req.user.id);
  const tracked = stockTracked(req.user);
  // Whether it is counted is not written where the stock is not counted (Free): what the form shows there is the paused view, and
  // writing it back would switch the counting off for good. The count itself is still taken.
  const { track_stock: _trackStock, ...uncounted } = req.body;
  const changes = tracked ? req.body : uncounted;
  const [row] =
    Object.keys(changes).length > 0
      ? await db.update(catalogStrings).set(changes).where(owned(req.params.id, req.user.id)).returning()
      : [found];
  res.json(serialize(row, tracked));
});

// POST /api/strings/:id/stock: adds `delta` sets to the stock (a negative one takes them away), never below 0 and never above
// what a stock may be. The stock of a string that is not counted is changed too; counting it is a change of `track_stock`.
router.post('/:id/stock', validateBody(stockChangeSchema), async (req, res) => {
  await findString(req.params.id, req.user.id);
  const { delta, op_id: key } = req.body;
  await db.transaction(async (tx) => {
    // A key that was written before: the change was made, and it is not made again.
    if (!(await claimOperation(tx, req.user.id, key)) || delta === 0) return;
    const changed = await tx
      .update(catalogStrings)
      .set({ stock: sql`least(greatest(${catalogStrings.stock} + ${delta}, 0), ${MAX_STOCK})` })
      .where(owned(req.params.id, req.user.id))
      .returning({ id: catalogStrings.id });
    // Removed since the check above: the key goes with the change.
    if (changed.length === 0) throw notFound();
  });
  res.json(serialize(await findString(req.params.id, req.user.id), stockTracked(req.user)));
});

// DELETE /api/strings/:id: orders keep the name of the string they were made with
router.delete('/:id', async (req, res) => {
  await findString(req.params.id, req.user.id);
  await db
    .update(catalogStrings)
    .set({ deleted_at: new Date() })
    .where(owned(req.params.id, req.user.id));
  res.json({ ok: true });
});

export default router;
