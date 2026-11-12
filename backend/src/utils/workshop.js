/**
 * The workshop a person works in, and what their role there lets them do (Studio: see ../../docs/studio.md).
 *
 * The data of a workshop (clients, rackets, strings, services, orders, photos, the order counter and the plan) belongs to one account,
 * the owner's, and every table is scoped by that account's id. A person who works in someone else's workshop (a row of
 * `workshop_members`) is given that id for the data and their own for who they are: `req.workshop.ownerId` is what a route filters by,
 * `req.user.id` is who did it. A person who is in no one's workshop is the owner of their own, a workshop of one, and nothing about them
 * changes: this is what keeps Free and Pro working exactly as before.
 */
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { orders, users, workshopInvites, workshopMembers } from '../db/schema.js';
import { HttpError } from './http.js';
import { teamAllowed } from './plans.js';
import { hashToken } from './tokens.js';

export const OWNER = 'owner';
export const MASTER = 'master';
export const RECEPTIONIST = 'receptionist';

/** A workshop of one person: their own. */
const solo = (user) => ({ ownerId: user.id, owner: user, role: OWNER, member: false, paused: false });

/**
 * The workshop `user` works in: the one they are a member of, or their own. `paused` is for a member whose workshop no longer holds
 * Studio (see `teamAllowed`): they can look at everything and change nothing.
 */
export async function loadWorkshop(user, executor = db) {
  const [row] = await executor
    .select({ role: workshopMembers.role, owner: users })
    .from(workshopMembers)
    .innerJoin(users, eq(workshopMembers.owner_id, users.id))
    .where(eq(workshopMembers.user_id, user.id))
    .limit(1);
  // An owner whose account was switched off takes the workshop with it; the member is left with their own.
  if (!row || !row.owner.is_active) return solo(user);
  return { ownerId: row.owner.id, owner: row.owner, role: row.role, member: true, paused: !teamAllowed(row.owner) };
}

/** After `requireAuth`: a member of a paused workshop may read and nothing more (403 `workshop_paused`). */
export function writableWorkshop(req, res, next) {
  if (req.workshop.paused && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    throw new HttpError(403, 'The workshop is paused: its owner no longer has Studio', { code: 'workshop_paused' });
  }
  next();
}

/** After `requireAuth`: lets through only these roles of the workshop (403 `forbidden_role` for the others). */
export const workshopRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.workshop.role)) {
    throw new HttpError(403, 'Your role in this workshop does not allow that', { code: 'forbidden_role' });
  }
  next();
};

/** Throws the same 403 when `role` is not among `roles`: for a route that learns what it works on only after it looks. */
export function assertRole(workshop, ...roles) {
  if (!roles.includes(workshop.role)) {
    throw new HttpError(403, 'Your role in this workshop does not allow that', { code: 'forbidden_role' });
  }
}

/**
 * The orders a person may see: all of them, except for a master, who sees their own and the queue: the orders nobody has yet that are
 * still to be done. (The old orders nobody ever strung, those from before the workshop had a team, are not a queue: they stay with the owner
 * and the receptionist.) `undefined` is no condition.
 */
export const visibleOrders = (workshop, userId) =>
  workshop.role === MASTER
    ? or(eq(orders.assignee_id, userId), and(isNull(orders.assignee_id), ne(orders.status, 'completed')))
    : undefined;

/** What a person is called in a list: their name, or the start of their address when they have given none. */
export const displayName = (user) => user.full_name?.trim() || user.email.split('@')[0];

/** A person as the API shows them to the rest of the workshop: no address, no account. */
export const serializePerson = (user, role) => ({ id: user.id, name: displayName(user), role });

// An invitation code: easy to read out over the phone and to type, so no 0/O or 1/I/L. 31 symbols, 10 places: far more than a code that is
// good for a week and is tried a few times an hour from one address can be guessed from.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

export function newInviteCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** What a person typed (any case, with spaces or dashes) as the code it was meant to be. */
export const normalizeCode = (text) => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const hashCode = (code) => hashToken(normalizeCode(code));

/** The code in groups of five, as it is shown: `ABCDE-FGHJK`. */
export const formatCode = (code) => `${code.slice(0, 5)}-${code.slice(5)}`;

/** The link that opens the app (or the website) on the screen that takes the code. */
export const inviteLink = (code) => `${config.appUrl}/join?code=${code}`;

/** The seats of a workshop: the owner, the people in it and the invitations that are waiting and have not run out. */
export async function seatsUsed(executor, ownerId, now = new Date()) {
  const [{ members }] = await executor
    .select({ members: sql`count(*)::int` })
    .from(workshopMembers)
    .where(eq(workshopMembers.owner_id, ownerId));
  const [{ invites }] = await executor
    .select({ invites: sql`count(*)::int` })
    .from(workshopInvites)
    .where(and(eq(workshopInvites.owner_id, ownerId), gt(workshopInvites.expires_at, now)));
  return 1 + members + invites;
}
