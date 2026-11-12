import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import express from 'express';
import { db } from '../db/index.js';
import { orders } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { isValidTimeZone } from '../utils/dates.js';
import { orderColumns, serializeOrder, withOrderJoins } from '../utils/orders.js';
import { visibleOrders, writableWorkshop } from '../utils/workshop.js';

const router = express.Router();
router.use(requireAuth, writableWorkshop);

const ACTIVE = ['received', 'in_progress', 'ready'];
const UPCOMING = 5;

// GET /api/dashboard: the numbers for the home screen and the orders that are due first. A master's are those of the queue and their own.
router.get('/', async (req, res) => {
  const timeZone = isValidTimeZone(req.workshop.owner.timezone) ? req.workshop.owner.timezone : 'UTC';

  const [counts] = await db
    .select({
      active_orders: sql`count(*) filter (where ${orders.status} in ('received', 'in_progress', 'ready'))::int`,
      ready_for_pickup: sql`count(*) filter (where ${orders.status} = 'ready')::int`,
      // "This month" is the stringer's month, not the server's.
      completed_this_month: sql`count(*) filter (where ${orders.status} = 'completed' and ${orders.completed_at} >= date_trunc('month', now() at time zone ${timeZone}) at time zone ${timeZone})::int`,
    })
    .from(orders)
    .where(and(eq(orders.user_id, req.workshop.ownerId), visibleOrders(req.workshop, req.user.id)));

  const upcoming = await withOrderJoins(db.select(orderColumns).from(orders))
    .where(and(eq(orders.user_id, req.workshop.ownerId), inArray(orders.status, ACTIVE), visibleOrders(req.workshop, req.user.id)))
    .orderBy(sql`${orders.due_date} asc nulls last`, asc(orders.number))
    .limit(UPCOMING);

  res.json({ ...counts, active: upcoming.map(serializeOrder) });
});

export default router;
