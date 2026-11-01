import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import express from 'express';
import { db } from '../db/index.js';
import { orders } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { isValidTimeZone } from '../utils/dates.js';
import { orderColumns, serializeOrder, withOrderJoins } from '../utils/orders.js';

const router = express.Router();
router.use(requireAuth);

const ACTIVE = ['received', 'in_progress', 'ready'];
const UPCOMING = 5;

// GET /api/dashboard: the numbers for the home screen and the orders that are due first
router.get('/', async (req, res) => {
  const timeZone = isValidTimeZone(req.user.timezone) ? req.user.timezone : 'UTC';

  const [counts] = await db
    .select({
      active_orders: sql`count(*) filter (where ${orders.status} in ('received', 'in_progress', 'ready'))::int`,
      ready_for_pickup: sql`count(*) filter (where ${orders.status} = 'ready')::int`,
      // "This month" is the stringer's month, not the server's.
      completed_this_month: sql`count(*) filter (where ${orders.status} = 'completed' and ${orders.completed_at} >= date_trunc('month', now() at time zone ${timeZone}) at time zone ${timeZone})::int`,
    })
    .from(orders)
    .where(eq(orders.user_id, req.user.id));

  const upcoming = await withOrderJoins(db.select(orderColumns).from(orders))
    .where(and(eq(orders.user_id, req.user.id), inArray(orders.status, ACTIVE)))
    .orderBy(sql`${orders.due_date} asc nulls last`, asc(orders.number))
    .limit(UPCOMING);

  res.json({ ...counts, active: upcoming.map(serializeOrder) });
});

export default router;
