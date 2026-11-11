import { eq, inArray } from 'drizzle-orm';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { syncLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { HttpError, notFound } from '../utils/http.js';
import { PERIODS, PLANS } from '../utils/plans.js';
import { accountIdsOf, syncPlan } from '../utils/revenuecat.js';
import { toPublicUser } from '../utils/user.js';

const router = express.Router();

// POST /api/billing/sync: the app has just bought something, or restored it, and asks the server to read what the store says about the
// signed-in account now, instead of waiting for RevenueCat's notice. It answers with the account, plan included, as /api/auth/me does.
router.post('/sync', syncLimiter, requireAuth, async (req, res) => {
  const user = await syncPlan(req.user.id);
  if (!user) throw notFound();
  res.json(toPublicUser(user));
});

// RevenueCat's notices (a purchase, a renewal, a cancellation, a refund) are signed with one header that is set both in its dashboard
// and here (REVENUECAT_WEBHOOK_AUTH). Without that setting the route does not exist, so that it is never open to anyone.
const webhookOnly = (req, res, next) => (config.billing.revenuecat.webhookAuth ? next() : next(notFound()));

const sameText = (given, expected) => {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

// POST /api/billing/revenuecat: a notice says that something changed for a customer; what it says is not used (see utils/revenuecat.js),
// the server asks RevenueCat for the state of the customer. A notice about nobody here is answered 200, or RevenueCat would send it
// again for an hour; one that cannot be dealt with because RevenueCat cannot be asked is answered with an error, so that it does.
router.post('/revenuecat', webhookOnly, async (req, res) => {
  if (!sameText(req.headers.authorization, config.billing.revenuecat.webhookAuth)) {
    throw new HttpError(401, 'Not authenticated', { code: 'unauthenticated' });
  }
  const event = req.body?.event;
  if (!event || typeof event !== 'object') throw new HttpError(400, 'The notice has no event');
  // The dashboard's "send test" button.
  if (event.type === 'TEST') return res.json({ ok: true, synced: 0 });

  const ids = accountIdsOf(event);
  const known = ids.length > 0 ? await db.select({ id: users.id }).from(users).where(inArray(users.id, ids)) : [];
  for (const { id } of known) await syncPlan(id);
  res.json({ ok: true, synced: known.length });
});

// Where the plan comes from at a real server is the store (see ../../docs/subscriptions.md). Until it is connected, and on a
// developer's machine, an account can be given a plan by hand. The route does not exist (404) unless BILLING_DEV_GRANTS is on, and that
// is never so in production.
const devOnly = (req, res, next) => (config.billing.devGrants ? next() : next(notFound()));

const grantSchema = z.object({
  plan: z.enum(PLANS),
  period: z.enum(PERIODS).optional(),
  trial: z.boolean().optional(),
  renews: z.boolean().optional(),
  // How many days from now the plan lasts; negative: it ran out that many days ago. `null`: it never ends. Left out: a trial lasts
  // 14 days, a month 30, a year 365.
  days: z.number().int().min(-3650).max(3650).nullable().optional(),
});

const defaultDays = ({ trial, period }) => (trial ? 14 : period === 'year' ? 365 : 30);

// POST /api/billing/dev-grant: gives the signed-in account a plan. `{ "plan": "free" }` takes it away.
router.post('/dev-grant', devOnly, requireAuth, validateBody(grantSchema), async (req, res) => {
  const { plan, trial = false, renews = true } = req.body;
  const period = req.body.period ?? 'month';
  const free = plan === 'free';
  const days = req.body.days === undefined ? defaultDays({ trial, period }) : req.body.days;

  const [user] = await db
    .update(users)
    .set({
      plan,
      plan_period: free ? null : period,
      plan_expires_at: free || days === null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      plan_trial: !free && trial,
      plan_renews: !free && renews,
    })
    .where(eq(users.id, req.user.id))
    .returning();
  res.json(toPublicUser(user));
});

export default router;
