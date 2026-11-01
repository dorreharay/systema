import { and, asc, eq, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { services } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notFound, rejectMalformedIds } from '../utils/http.js';
import { toNumber } from '../utils/orders.js';
import { money, requiredText } from '../utils/validators.js';

const router = express.Router();
router.use(requireAuth);
rejectMalformedIds(router);

const serviceSchema = z.object({
  name: requiredText(100, 'Enter the name'),
  price: money.optional(),
  kind: z.enum(['labor', 'extra']).optional(),
  active: z.boolean().optional(),
});

const owned = (id, userId) => and(eq(services.id, id), eq(services.user_id, userId));

const serialize = (row) => ({
  id: row.id,
  name: row.name,
  price: toNumber(row.price),
  kind: row.kind,
  active: row.active,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

async function findService(id, userId) {
  const [row] = await db.select().from(services).where(owned(id, userId)).limit(1);
  if (!row) throw notFound();
  return row;
}

// GET /api/services: active ones first, labor before extras
router.get('/', async (req, res) => {
  const rows = await db
    .select()
    .from(services)
    .where(eq(services.user_id, req.user.id))
    .orderBy(
      sql`${services.active} desc`,
      sql`(${services.kind} = 'labor') desc`,
      asc(services.created_at)
    );
  res.json({ items: rows.map(serialize) });
});

// POST /api/services
router.post('/', validateBody(serviceSchema), async (req, res) => {
  const [row] = await db
    .insert(services)
    .values({ ...req.body, user_id: req.user.id })
    .returning();
  res.status(201).json(serialize(row));
});

// PATCH /api/services/:id: also how a service is archived (`active: false`) and brought back
router.patch('/:id', validateBody(serviceSchema.partial()), async (req, res) => {
  await findService(req.params.id, req.user.id);
  const [row] = await db
    .update(services)
    .set(req.body)
    .where(owned(req.params.id, req.user.id))
    .returning();
  res.json(serialize(row));
});

export default router;
