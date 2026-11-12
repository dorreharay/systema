import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workshopMembers } from '../db/schema.js';
import { needsConfirmation } from './emailVerified.js';
import { subscriptionOf } from './plans.js';
import { displayName, loadWorkshop, OWNER } from './workshop.js';

/**
 * What the API says about the workshop a person works in (part of the user). `member` is false for someone in their own workshop, whatever
 * their plan; `team` says that there are other people in it (for the owner: that they have invited someone who has joined).
 */
function workshopBlock(user, workshop, hasMembers) {
  // (For someone in their own workshop the owner is the user as it is now: `workshop.owner` may have been read before a change.)
  const owner = workshop.member ? workshop.owner : user;
  return {
    owner_id: workshop.ownerId,
    role: workshop.role,
    member: workshop.member,
    name: owner.workshop_name,
    owner_name: workshop.member ? displayName(owner) : null,
    paused: workshop.paused,
    team: workshop.member || hasMembers,
  };
}

/**
 * The plan of a person, as the API shows it. A member of a workshop has the plan of the workshop (its owner pays for it), not theirs,
 * and does not buy or ask for anything: the screens that do are for the owner. Only the owner sees the money of the month.
 */
function subscriptionBlock(user, workshop) {
  if (!workshop.member) return subscriptionOf(user);
  const subscription = subscriptionOf(workshop.owner);
  return {
    ...subscription,
    member: true,
    studio_waitlist: false,
    entitlements: { ...subscription.entitlements, month_overview: workshop.role === OWNER && subscription.entitlements.month_overview },
  };
}

/**
 * A user as the API shows it: without the password hash or anything about a password reset. Someone who works in a workshop that is not
 * their own shows the settings of that workshop (currency, time zone, unit of tension), because everything they see is in them, and has
 * nothing to set up.
 */
export function toPublicUser(user, workshop, hasMembers = false) {
  const settings = workshop.member ? workshop.owner : user;
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    is_active: user.is_active,
    workshop_name: settings.workshop_name,
    currency: settings.currency,
    tension_unit: settings.tension_unit,
    timezone: settings.timezone,
    language: user.language,
    notifications_enabled: user.notifications_enabled,
    // An account made with Google or Apple has none: the app does not ask such a person for a password to confirm deleting it.
    has_password: Boolean(user.password_hash),
    // False while the address has to be confirmed and has not been (see utils/emailVerification.js): the app asks for the code until then. Always
    // true where confirming is not required (a local server).
    email_verified: !needsConfirmation(user),
    // False until the first-run setup is done; the app shows the setup screen while it is. A member has nothing to set up: the owner did.
    setup_completed: workshop.member || user.setup_completed_at !== null,
    // The plan the account holds and what it allows (see utils/plans.js).
    subscription: subscriptionBlock(user, workshop),
    // Whose data this person sees, and in what role (see utils/workshop.js).
    workshop: workshopBlock(user, workshop, hasMembers),
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

/** Whether the workshop of this owner has anyone else in it. */
export async function ownerHasMembers(ownerId, executor = db) {
  const [{ count }] = await executor
    .select({ count: sql`count(*)::int` })
    .from(workshopMembers)
    .where(eq(workshopMembers.owner_id, ownerId));
  return count > 0;
}

/**
 * `toPublicUser` for a route: it finds the workshop of the person (pass `workshop` when the request has it already, which every request
 * that went through `requireAuth` does) and whether the owner has a team.
 */
export async function publicUser(user, workshop) {
  const where = workshop ?? (await loadWorkshop(user));
  return toPublicUser(user, where, where.member ? true : await ownerHasMembers(user.id));
}
