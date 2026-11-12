import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import express from 'express';
import { db } from '../db/index.js';
import { clients, orders } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { addDays, isValidTimeZone, monthOf, todayIn } from '../utils/dates.js';
import { OWNER, workshopRoles, writableWorkshop } from '../utils/workshop.js';

const router = express.Router();
router.use(requireAuth, writableWorkshop, workshopRoles(OWNER));

// Work that is still to be done. A racket that is ready is done: it waits to be picked up.
const TO_DO = ['received', 'in_progress'];
const WEEK_DAYS = 7;
const LIST = 5;

const money = (value) => Math.round(Number(value ?? 0) * 100) / 100;

/** Clients with what their orders add up to, the largest first: paid orders (the best clients) or unpaid ones (who owes). */
function clientTotals(userId, paid) {
  const total = sql`sum(${orders.total})`;
  return db
    .select({ id: clients.id, name: clients.name, total, orders: sql`count(*)::int` })
    .from(orders)
    .innerJoin(clients, eq(orders.client_id, clients.id))
    .where(
      and(
        eq(orders.user_id, userId),
        isNull(clients.deleted_at),
        eq(orders.is_paid, paid),
        gt(orders.total, '0')
      )
    )
    .groupBy(clients.id, clients.name)
    .orderBy(desc(total), asc(clients.name))
    .limit(LIST);
}

const serializeClientTotal = (row) => ({
  client: { id: row.id, name: row.name },
  total: money(row.total),
  orders: row.orders,
});

// GET /api/insights: what the home screen shows besides the numbers, in three parts.
//   revenue      what was paid this month, day by day, and what the same days of last month came to
//   workload     the work still to do on each of the next seven days, and what is already late
//   receivables  what is still to be paid, who owes it, and who the best clients are
// "Today" and "this month" are the stringer's, in their time zone.
router.get('/', async (req, res) => {
  const userId = req.workshop.ownerId;
  const timeZone = isValidTimeZone(req.workshop.owner.timezone) ? req.workshop.owner.timezone : 'UTC';
  const today = todayIn(timeZone);

  // Revenue is money received: an order counts on the day it was marked paid.
  const month = monthOf(today);
  const lastMonth = monthOf(addDays(month.start, -1));
  const paidOn = sql`(${orders.paid_at} at time zone ${timeZone})::date`;
  const paidRows = await db
    .select({ day: sql`${paidOn}::text`, total: sql`coalesce(sum(${orders.total}), 0)` })
    .from(orders)
    .where(
      and(
        eq(orders.user_id, userId),
        eq(orders.is_paid, true),
        isNotNull(orders.paid_at),
        sql`${paidOn} between ${lastMonth.start}::date and ${month.end}::date`
      )
    )
    .groupBy(sql`1`);
  const paidByDay = new Map(paidRows.map((row) => [row.day, money(row.total)]));

  const days = Array.from({ length: month.length }, (_, index) => {
    const date = addDays(month.start, index);
    return { date, total: paidByDay.get(date) ?? 0 };
  });
  // Last month is compared for the same days only: halfway through this month, all of last month would always win.
  const elapsed = Number(today.slice(8));
  let previousTotal = 0;
  for (const [date, total] of paidByDay) {
    if (date <= lastMonth.end && Number(date.slice(8)) <= elapsed) previousTotal += total;
  }

  const weekEnd = addDays(today, WEEK_DAYS - 1);
  const dueRows = await db
    .select({ day: orders.due_date, count: sql`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.user_id, userId),
        inArray(orders.status, TO_DO),
        gte(orders.due_date, today),
        lte(orders.due_date, weekEnd)
      )
    )
    .groupBy(orders.due_date);
  const dueByDay = new Map(dueRows.map((row) => [row.day, row.count]));
  const [late] = await db
    .select({ count: sql`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.user_id, userId), inArray(orders.status, TO_DO), lt(orders.due_date, today)));

  const [unpaid] = await db
    .select({ total: sql`coalesce(sum(${orders.total}), 0)`, count: sql`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.user_id, userId), eq(orders.is_paid, false), gt(orders.total, '0')));
  const [debtors, topClients] = await Promise.all([clientTotals(userId, false), clientTotals(userId, true)]);

  res.json({
    today,
    revenue: {
      total: money(days.reduce((sum, day) => sum + day.total, 0)),
      previous_total: money(previousTotal),
      days,
    },
    workload: {
      overdue: late.count,
      days: Array.from({ length: WEEK_DAYS }, (_, index) => {
        const date = addDays(today, index);
        return { date, count: dueByDay.get(date) ?? 0 };
      }),
    },
    receivables: {
      unpaid_total: money(unpaid.total),
      unpaid_orders: unpaid.count,
      debtors: debtors.map(serializeClientTotal),
      top_clients: topClients.map(serializeClientTotal),
    },
  });
});

export default router;
