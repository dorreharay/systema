import { and, eq } from 'drizzle-orm';
import express from 'express';
import { db } from '../db/index.js';
import { orderPhotos, orders } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound, rejectMalformedIds } from '../utils/http.js';
import { MASTER, visibleOrders, writableWorkshop } from '../utils/workshop.js';

const router = express.Router();
router.use(requireAuth, writableWorkshop);
rejectMalformedIds(router);

const owned = (id, userId) => and(eq(orderPhotos.id, id), eq(orderPhotos.user_id, userId));

/** A master sees the photos of the orders they can see (the queue and their own), and nobody else's. */
async function assertVisible(req, id) {
  if (req.workshop.role !== MASTER) return;
  const [row] = await db
    .select({ id: orderPhotos.id })
    .from(orderPhotos)
    .innerJoin(orders, eq(orderPhotos.order_id, orders.id))
    .where(and(owned(id, req.workshop.ownerId), visibleOrders(req.workshop, req.user.id)))
    .limit(1);
  if (!row) throw notFound();
}

// GET /api/photos/:id: the image. A photo never changes, so the app may keep it.
router.get('/:id', async (req, res) => {
  await assertVisible(req, req.params.id);
  const [photo] = await db
    .select({ content_type: orderPhotos.content_type, data: orderPhotos.data })
    .from(orderPhotos)
    .where(owned(req.params.id, req.workshop.ownerId))
    .limit(1);
  if (!photo) throw notFound();

  res.set({
    'Content-Type': photo.content_type,
    'Cache-Control': 'private, max-age=86400, immutable',
  });
  res.send(photo.data);
});

// DELETE /api/photos/:id
router.delete('/:id', async (req, res) => {
  await assertVisible(req, req.params.id);
  const deleted = await db.delete(orderPhotos).where(owned(req.params.id, req.workshop.ownerId)).returning({ id: orderPhotos.id });
  if (deleted.length === 0) throw notFound();
  res.json({ ok: true });
});

export default router;
