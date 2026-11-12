/**
 * The team of a Studio workshop: who is in it, the invitations, joining and leaving, and the report of the month by person.
 *
 * The routes exist only where Studio does (`config.billing.studioEnabled`, and the plans on). Who may do what is in ../../docs/studio.md:
 * the owner runs the team; a master or a receptionist sees it, and leaves it.
 */
import { and, asc, eq, gte, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { MEMBER_ROLES, orders, users, workshopInvites, workshopMembers } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { lockId } from '../utils/clientIds.js';
import { addDays, isValidTimeZone, monthOf, todayIn } from '../utils/dates.js';
import { HttpError, notFound, rejectMalformedIds } from '../utils/http.js';
import { teamAllowed } from '../utils/plans.js';
import { publicUser } from '../utils/user.js';
import {
  MASTER, OWNER, RECEPTIONIST, assertRole, displayName, formatCode, hashCode, inviteLink, newInviteCode, normalizeCode, seatsUsed,
} from '../utils/workshop.js';

const router = express.Router();

// Without Studio at this server the team does not exist, as it did not before.
const studioOnly = (req, res, next) => (config.billing.enabled && config.billing.studioEnabled ? next() : next(notFound()));
router.use(studioOnly, requireAuth);
rejectMalformedIds(router);

const seatLimit = () => config.billing.studioSeats;

/** The owner runs the team: not a master or a receptionist, and not someone who works in another's workshop. */
const ownerOnly = (req) => assertRole(req.workshop, OWNER);

const roleSchema = z.enum(MEMBER_ROLES, 'Choose a role');
const codeSchema = z.object({
  code: z.string({ error: 'Enter the code' }).max(40).transform(normalizeCode).pipe(z.string().min(6, 'Enter the code')),
});

const dayMs = 24 * 60 * 60 * 1000;

/** The invitation that this code is, if it is one and has not run out. */
async function findInvite(executor, code, now = new Date()) {
  const [invite] = await executor
    .select({ invite: workshopInvites, owner: users })
    .from(workshopInvites)
    .innerJoin(users, eq(workshopInvites.owner_id, users.id))
    .where(eq(workshopInvites.code_hash, hashCode(code)))
    .limit(1);
  if (!invite || invite.invite.expires_at.getTime() <= now.getTime() || !invite.owner.is_active) {
    throw new HttpError(404, 'This invitation is wrong or has run out', { code: 'invite_invalid' });
  }
  return invite;
}

/**
 * What happens to the work of a person who leaves the workshop, or whose role is no longer one that strings: the orders that are not done go
 * back to the queue, so that nobody waits for someone who is not there. The ones that are done keep their name, for the report.
 */
const releaseWork = (executor, ownerId, personId) =>
  executor
    .update(orders)
    .set({ assignee_id: null, assigned_at: null })
    .where(and(eq(orders.user_id, ownerId), eq(orders.assignee_id, personId), ne(orders.status, 'completed')));

// GET /api/team: the people, the seats and (for the owner) the invitations that are waiting.
router.get('/', async (req, res) => {
  const { ownerId, owner, role, member, paused } = req.workshop;
  const now = new Date();
  const owns = !member;

  const people = await db
    .select({ member: workshopMembers, user: users })
    .from(workshopMembers)
    .innerJoin(users, eq(workshopMembers.user_id, users.id))
    .where(eq(workshopMembers.owner_id, ownerId))
    .orderBy(asc(workshopMembers.created_at));

  // An invitation that has run out takes no seat and shows no more; it is cleared when the owner looks.
  if (owns) {
    await db.delete(workshopInvites).where(and(eq(workshopInvites.owner_id, ownerId), lt(workshopInvites.expires_at, now)));
  }
  const invites = owns
    ? await db.select().from(workshopInvites).where(eq(workshopInvites.owner_id, ownerId)).orderBy(asc(workshopInvites.created_at))
    : [];

  const used = 1 + people.length + invites.length;
  res.json({
    workshop: { owner_id: ownerId, name: owner.workshop_name, paused },
    role,
    seats: { limit: seatLimit(), used },
    // Whether the owner can add someone now: Studio is held, and there is a seat.
    can_invite: owns && teamAllowed(owner) && used < seatLimit(),
    members: [
      { id: null, user_id: owner.id, name: displayName(owner), role: OWNER, email: owns ? owner.email : undefined, you: owns, joined_at: owner.created_at },
      ...people.map(({ member: row, user }) => ({
        id: row.id,
        user_id: user.id,
        name: displayName(user),
        role: row.role,
        email: owns ? user.email : undefined,
        you: user.id === req.user.id,
        joined_at: row.created_at,
      })),
    ],
    invites: invites.map((invite) => ({ id: invite.id, role: invite.role, expires_at: invite.expires_at })),
  });
});

// POST /api/team/invites: an invitation for a role. The code is in the answer, once: only a hash of it is kept.
router.post('/invites', validateBody(z.object({ role: roleSchema })), async (req, res) => {
  ownerOnly(req);
  const { ownerId, owner } = req.workshop;
  if (!teamAllowed(owner)) {
    throw new HttpError(402, 'Studio is needed to invite people', { code: 'studio_required' });
  }

  const now = new Date();
  const code = newInviteCode();
  const invite = await db.transaction(async (tx) => {
    // Two invitations made at once must not both take the last seat.
    await lockId(tx, 'team', ownerId, 'seats');
    await tx.delete(workshopInvites).where(and(eq(workshopInvites.owner_id, ownerId), lt(workshopInvites.expires_at, now)));
    if ((await seatsUsed(tx, ownerId, now)) >= seatLimit()) {
      throw new HttpError(409, `A workshop holds ${seatLimit()} people`, { code: 'no_seats', data: { limit: seatLimit() } });
    }
    const [created] = await tx
      .insert(workshopInvites)
      .values({
        owner_id: ownerId,
        role: req.body.role,
        code_hash: hashCode(code),
        expires_at: new Date(now.getTime() + config.billing.inviteDays * dayMs),
      })
      .returning();
    return created;
  });

  res.status(201).json({
    invite: { id: invite.id, role: invite.role, expires_at: invite.expires_at, code: formatCode(code), link: inviteLink(code) },
  });
});

// DELETE /api/team/invites/:id: takes an invitation back.
router.delete('/invites/:id', async (req, res) => {
  ownerOnly(req);
  const deleted = await db
    .delete(workshopInvites)
    .where(and(eq(workshopInvites.id, req.params.id), eq(workshopInvites.owner_id, req.workshop.ownerId)))
    .returning({ id: workshopInvites.id });
  if (deleted.length === 0) throw notFound();
  res.json({ ok: true });
});

// PATCH /api/team/members/:id: another role for a person (`id` is the one the list gives). A receptionist does not string, so what
// they had in hand goes back to the queue.
router.patch('/members/:id', validateBody(z.object({ role: roleSchema })), async (req, res) => {
  ownerOnly(req);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(workshopMembers)
      .set({ role: req.body.role })
      .where(and(eq(workshopMembers.id, req.params.id), eq(workshopMembers.owner_id, req.workshop.ownerId)))
      .returning();
    if (!row) throw notFound();
    if (row.role === RECEPTIONIST) await releaseWork(tx, req.workshop.ownerId, row.user_id);
  });
  res.json({ ok: true });
});

// DELETE /api/team/members/:id: the owner takes a person out. The access goes at once: the next request of that person is already in
// their own workshop.
router.delete('/members/:id', async (req, res) => {
  ownerOnly(req);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(workshopMembers)
      .where(and(eq(workshopMembers.id, req.params.id), eq(workshopMembers.owner_id, req.workshop.ownerId)))
      .returning();
    if (!row) throw notFound();
    await releaseWork(tx, req.workshop.ownerId, row.user_id);
  });
  res.json({ ok: true });
});

// POST /api/team/leave: a person leaves the workshop they work in and is in their own again, with everything they had there.
router.post('/leave', async (req, res) => {
  if (!req.workshop.member) throw new HttpError(409, 'You are not in anyone\'s workshop', { code: 'not_a_member' });
  await db.transaction(async (tx) => {
    await tx.delete(workshopMembers).where(eq(workshopMembers.user_id, req.user.id));
    await releaseWork(tx, req.workshop.ownerId, req.user.id);
  });
  res.json(await publicUser(req.user));
});

// POST /api/team/preview: what an invitation is for, before it is accepted: whose workshop, and in what role.
router.post('/preview', authLimiter, validateBody(codeSchema), async (req, res) => {
  const { invite, owner } = await findInvite(db, req.body.code);
  res.json({ workshop: { name: owner.workshop_name, owner_name: displayName(owner) }, role: invite.role, expires_at: invite.expires_at });
});

// POST /api/team/join: accepts an invitation. From then on the person sees the data of that workshop, in that role. Their own stays in
// their account, as it was, for when they leave. Answers with the account, as /api/auth/me does.
router.post('/join', authLimiter, validateBody(codeSchema), async (req, res) => {
  const user = await db.transaction(async (tx) => {
    const { invite, owner } = await findInvite(tx, req.body.code);
    if (owner.id === req.user.id) {
      throw new HttpError(409, 'This is your own workshop', { code: 'own_workshop' });
    }
    if (req.workshop.member) {
      throw new HttpError(409, 'You work in a workshop already: leave it first', { code: 'already_member' });
    }
    if (!teamAllowed(owner)) {
      throw new HttpError(409, 'This workshop no longer has Studio', { code: 'studio_inactive' });
    }
    const [mine] = await tx.select({ id: workshopMembers.id }).from(workshopMembers).where(eq(workshopMembers.owner_id, req.user.id)).limit(1);
    if (mine) {
      throw new HttpError(409, 'You run a team of your own: it has to be empty first', { code: 'has_team' });
    }

    await lockId(tx, 'team', owner.id, 'seats');
    // The invitation is used once; it may have been taken between the look above and the lock.
    const used = await tx.delete(workshopInvites).where(eq(workshopInvites.id, invite.id)).returning({ id: workshopInvites.id });
    if (used.length === 0) throw new HttpError(404, 'This invitation is wrong or has run out', { code: 'invite_invalid' });

    await tx.insert(workshopMembers).values({ owner_id: owner.id, user_id: req.user.id, role: invite.role });
    // The invitations they had made for a workshop of their own mean nothing now.
    await tx.delete(workshopInvites).where(eq(workshopInvites.owner_id, req.user.id));
    // Nothing to set up: the workshop's settings are the owner's.
    const [updated] = await tx
      .update(users)
      .set({ setup_completed_at: sql`coalesce(${users.setup_completed_at}, now())` })
      .where(eq(users.id, req.user.id))
      .returning();
    return updated;
  });
  res.json(await publicUser(user));
});

const reportQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM').optional() });

const money = (value) => Math.round(Number(value ?? 0) * 100) / 100;

// GET /api/team/report?month=YYYY-MM: the month by person: the orders made, what was paid and the time from "in progress" to "ready". The
// owner sees everyone, and the orders that nobody had; a master sees their own line; a receptionist nothing. Money is counted as the
// overview of the month counts it: an order is on the day it was marked paid. "Month" is the workshop's, in its time zone.
router.get('/report', async (req, res) => {
  assertRole(req.workshop, OWNER, MASTER);
  const { ownerId, owner } = req.workshop;
  const zone = isValidTimeZone(owner.timezone) ? owner.timezone : 'UTC';
  const { month: asked } = parseQuery(reportQuery, req.query);
  const month = asked ?? todayIn(zone).slice(0, 7);
  const span = monthOf(`${month}-01`);
  const from = sql`(${span.start}::date)::timestamp at time zone ${zone}`;
  const to = sql`(${addDays(span.end, 1)}::date)::timestamp at time zone ${zone}`;
  const mine = req.workshop.role === MASTER ? eq(orders.assignee_id, req.user.id) : undefined;
  const scope = and(eq(orders.user_id, ownerId), mine);

  const [made, paid, times] = await Promise.all([
    db
      .select({ person: orders.assignee_id, count: sql`count(*)::int` })
      .from(orders)
      .where(and(scope, gte(orders.created_at, from), lt(orders.created_at, to)))
      .groupBy(orders.assignee_id),
    db
      .select({ person: orders.assignee_id, total: sql`coalesce(sum(${orders.total}), 0)` })
      .from(orders)
      .where(and(scope, eq(orders.is_paid, true), isNotNull(orders.paid_at), gte(orders.paid_at, from), lt(orders.paid_at, to)))
      .groupBy(orders.assignee_id),
    db
      .select({
        person: orders.assignee_id,
        hours: sql`avg(extract(epoch from (${orders.ready_at} - ${orders.started_at})) / 3600)`,
      })
      .from(orders)
      .where(and(scope, isNotNull(orders.started_at), isNotNull(orders.ready_at), gte(orders.ready_at, from), lt(orders.ready_at, to)))
      .groupBy(orders.assignee_id),
  ]);

  const key = (person) => person ?? 'none';
  const rows = new Map();
  const row = (person) => {
    if (!rows.has(key(person))) rows.set(key(person), { person, orders: 0, revenue: 0, avg_hours: null });
    return rows.get(key(person));
  };
  for (const item of made) row(item.person).orders = item.count;
  for (const item of paid) row(item.person).revenue = money(item.total);
  for (const item of times) row(item.person).avg_hours = Math.round(Number(item.hours) * 10) / 10;
  // The owner and the masters are always in the report, even in a month when they had nothing; a master sees only their own line.
  if (req.workshop.role === OWNER) {
    row(ownerId);
    const staff = await db
      .select({ user_id: workshopMembers.user_id })
      .from(workshopMembers)
      .where(and(eq(workshopMembers.owner_id, ownerId), eq(workshopMembers.role, MASTER)));
    for (const { user_id: id } of staff) row(id);
  } else {
    row(req.user.id);
  }

  const ids = [...rows.values()].map((item) => item.person).filter(Boolean);
  const names = ids.length > 0 ? await db.select().from(users).where(inArray(users.id, ids)) : [];
  const roles = ids.length > 0
    ? await db.select().from(workshopMembers).where(and(eq(workshopMembers.owner_id, ownerId), inArray(workshopMembers.user_id, ids)))
    : [];
  const nameOf = new Map(names.map((user) => [user.id, displayName(user)]));
  const roleOf = new Map(roles.map((member) => [member.user_id, member.role]));

  const total = [...rows.values()].reduce((sum, item) => sum + item.revenue, 0);
  const lines = [...rows.values()]
    .map((item) => ({
      person: item.person
        ? { id: item.person, name: nameOf.get(item.person) ?? null, role: item.person === ownerId ? OWNER : (roleOf.get(item.person) ?? null) }
        : null,
      orders: item.orders,
      revenue: item.revenue,
      avg_hours: item.avg_hours,
      share: total > 0 ? Math.round((item.revenue / total) * 1000) / 1000 : null,
    }))
    // The owner first, then by the money, the queue (nobody) last.
    .sort((a, b) => (a.person?.id === ownerId ? -1 : b.person?.id === ownerId ? 1 : !a.person ? 1 : !b.person ? -1 : b.revenue - a.revenue));

  res.json({
    month,
    currency: owner.currency,
    rows: lines,
    totals: req.workshop.role === OWNER ? { orders: lines.reduce((sum, item) => sum + item.orders, 0), revenue: money(total) } : null,
  });
});

export default router;
