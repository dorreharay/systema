import express from 'express';
import { z } from 'zod';
import { STRING_TYPES } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseQuery } from '../middleware/validate.js';
import { rackets, referenceInfo, strings } from '../utils/reference.js';
import { searchText } from '../utils/validators.js';

const router = express.Router();
router.use(requireAuth);
// The list does not change while the server runs, so an app may keep an answer for a while.
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, max-age=3600');
  next();
});

const MAX_LIMIT = 50;

const whole = (message) => z.coerce.number(message).int(message);

const racketQuery = z.object({
  q: searchText,
  brand: z.string().trim().max(80).optional(),
  limit: whole('Use a whole number').min(1, 'At least 1').max(MAX_LIMIT, `At most ${MAX_LIMIT}`).optional(),
  offset: whole('Use a whole number').min(0, 'Cannot be negative').optional(),
});
const stringQuery = racketQuery.extend({ type: z.enum(STRING_TYPES, 'Unknown string type').optional() });

// GET /api/reference: what the list holds
router.get('/', (req, res) => {
  res.json(referenceInfo());
});

// GET /api/reference/rackets?q=&brand=&limit=&offset=
router.get('/rackets', (req, res) => {
  res.json(rackets.search(parseQuery(racketQuery, req.query)));
});

// GET /api/reference/strings?q=&brand=&type=&limit=&offset=
router.get('/strings', (req, res) => {
  res.json(strings.search(parseQuery(stringQuery, req.query)));
});

export default router;
