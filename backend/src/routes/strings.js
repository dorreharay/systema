import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { STRING_TYPES, catalogStrings } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { notFound, rejectMalformedIds } from '../utils/http.js';
import { toNumber } from '../utils/orders.js';
import {
  inStockQuery, matchesWords, money, optionalText, requiredText, searchText, setsInStock,
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

const listQuery = z.object({ q: searchText, in_stock: inStockQuery });

const owned = (id, userId) =>
  and(eq(catalogStrings.id, id), eq(catalogStrings.user_id, userId), isNull(catalogStrings.deleted_at));

const serialize = (row) => ({
  id: row.id,
  brand: row.brand,
  model: row.model,
  gauge: row.gauge,
  type: row.type,
  default_price: toNumber(row.default_price),
  track_stock: row.track_stock,
  stock: toNumber(row.stock),
  // What an order can use: not counted, or at least half a set left.
  available: !row.track_stock || Number(row.stock) > 0,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

async function findString(id, userId) {
  const [row] = await db.select().from(catalogStrings).where(owned(id, userId)).limit(1);
  if (!row) throw notFound();
  return row;
}

// GET /api/strings?q=&in_stock=
router.get('/', async (req, res) => {
  const { q, in_stock: inStock } = parseQuery(listQuery, req.query);

  const rows = await db
    .select()
    .from(catalogStrings)
    .where(
      and(
        eq(catalogStrings.user_id, req.user.id),
        isNull(catalogStrings.deleted_at),
        inStock ? or(eq(catalogStrings.track_stock, false), gt(catalogStrings.stock, '0')) : undefined,
        q ? matchesWords(sql`${catalogStrings.brand} || ' ' || ${catalogStrings.model}`, q) : undefined
      )
    )
    .orderBy(sql`lower(${catalogStrings.brand})`, sql`lower(${catalogStrings.model})`);

  res.json({ items: rows.map(serialize) });
});

// POST /api/strings
router.post('/', validateBody(stringSchema), async (req, res) => {
  const [row] = await db
    .insert(catalogStrings)
    .values({ ...req.body, user_id: req.user.id })
    .returning();
  res.status(201).json(serialize(row));
});

// GET /api/strings/:id
router.get('/:id', async (req, res) => {
  res.json(serialize(await findString(req.params.id, req.user.id)));
});

// PATCH /api/strings/:id
router.patch('/:id', validateBody(stringSchema.partial()), async (req, res) => {
  await findString(req.params.id, req.user.id);
  const [row] = await db
    .update(catalogStrings)
    .set(req.body)
    .where(owned(req.params.id, req.user.id))
    .returning();
  res.json(serialize(row));
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
