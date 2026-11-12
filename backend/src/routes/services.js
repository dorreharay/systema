import { and, asc, eq, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { services } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { idConflict } from '../utils/clientIds.js';
import { notFound, rejectMalformedIds } from '../utils/http.js';
import { toNumber } from '../utils/orders.js';
import { money, requiredText, uuid } from '../utils/validators.js';
import { OWNER, workshopRoles, writableWorkshop } from '../utils/workshop.js';

const router = express.Router();
router.use(requireAuth, writableWorkshop);
rejectMalformedIds(router);

const serviceSchema = z.object({
  name: requiredText(100, 'Enter the name'),
  price: money.optional(),
  kind: z.enum(['labor', 'extra']).optional(),
  active: z.boolean().optional(),
});

// A new service may bring the id the phone made up for it (see utils/clientIds.js). A change never takes one.
const newServiceSchema = serviceSchema.extend({ id: uuid.optional() });

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
    .where(eq(services.user_id, req.workshop.ownerId))
    .orderBy(
      sql`${services.active} desc`,
      sql`(${services.kind} = 'labor') desc`,
      asc(services.created_at)
    );
  res.json({ items: rows.map(serialize) });
});

// POST /api/services: a service with the `id` that this stringer already has is not made again; it is answered with 200 and the
// service as it is. The id of another stringer's service is a 409.
router.post('/', workshopRoles(OWNER), validateBody(newServiceSchema), async (req, res) => {
  const { id, ...fields } = req.body;
  const [row] = await db
    .insert(services)
    .values({ ...fields, ...(id && { id }), user_id: req.workshop.ownerId })
    .onConflictDoNothing({ target: services.id })
    .returning();
  if (row) return res.status(201).json(serialize(row));

  const [existing] = await db.select().from(services).where(eq(services.id, id)).limit(1);
  if (!existing || existing.user_id !== req.workshop.ownerId) throw idConflict();
  res.status(200).json(serialize(existing));
});

// PATCH /api/services/:id: also how a service is archived (`active: false`) and brought back
router.patch('/:id', workshopRoles(OWNER), validateBody(serviceSchema.partial()), async (req, res) => {
  await findService(req.params.id, req.workshop.ownerId);
  const [row] = await db
    .update(services)
    .set(req.body)
    .where(owned(req.params.id, req.workshop.ownerId))
    .returning();
  res.json(serialize(row));
});

export default router;
