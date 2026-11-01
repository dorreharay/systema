import { and, eq } from 'drizzle-orm';
import express from 'express';
import { db } from '../db/index.js';
import { orderPhotos } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound, rejectMalformedIds } from '../utils/http.js';

const router = express.Router();
router.use(requireAuth);
rejectMalformedIds(router);

const owned = (id, userId) => and(eq(orderPhotos.id, id), eq(orderPhotos.user_id, userId));

// GET /api/photos/:id: the image. A photo never changes, so the app may keep it.
router.get('/:id', async (req, res) => {
  const [photo] = await db
    .select({ content_type: orderPhotos.content_type, data: orderPhotos.data })
    .from(orderPhotos)
    .where(owned(req.params.id, req.user.id))
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
  const deleted = await db.delete(orderPhotos).where(owned(req.params.id, req.user.id)).returning({ id: orderPhotos.id });
  if (deleted.length === 0) throw notFound();
  res.json({ ok: true });
});

export default router;
