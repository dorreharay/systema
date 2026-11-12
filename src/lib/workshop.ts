/**
 * The workshop a person works in and what their role there lets them do: the same rules as the server's (backend/src/utils/workshop.js, which
 * is the one that enforces them; this only keeps the screens from offering what the server would refuse). Pure, no React.
 *
 * Without Studio every account is the owner of a workshop of one, and can do everything: that is what a profile that says nothing about a
 * workshop (saved by an older version of the app, or from a server without Studio) is taken to be.
 */
import type { Person } from './types';

export type WorkshopRole = 'owner' | 'master' | 'receptionist';

/** `workshop` of the user, as the server sends it. */
export type WorkshopInfo = {
  owner_id: string;
  role: WorkshopRole;
  // Works in someone else's workshop (false: in their own, whatever their plan).
  member: boolean;
  // The workshop's name (the owner's setting), if it has one.
  name: string | null;
  // For a member: who the owner is.
  owner_name: string | null;
  // Its owner no longer has Studio: the members read and do not write.
  paused: boolean;
  // There are other people in it.
  team: boolean;
};

/** What a person may do in the workshop. */
export type Capabilities = {
  role: WorkshopRole;
  member: boolean;
  team: boolean;
  paused: boolean;
  /** Anything that changes data. A paused workshop is read-only for its members. */
  canWrite: boolean;
  /** The catalog, the stock counts and the price list: the owner's. */
  canEditCatalog: boolean;
  /** Give an order to a person (the owner), as against taking one for oneself (a master: `canTake`). */
  canAssign: boolean;
  canTake: boolean;
  canDeleteOrder: boolean;
  /** The money of the month: the overview of it on the home screen. */
  canSeeMoney: boolean;
  /** The report of the month by person (the owner sees everyone, a master their own line). */
  canSeeReport: boolean;
  canManageTeam: boolean;
};

const SOLO: WorkshopInfo = { owner_id: '', role: 'owner', member: false, name: null, owner_name: null, paused: false, team: false };

export function capabilitiesOf(workshop: WorkshopInfo | undefined): Capabilities {
  const info = workshop ?? SOLO;
  const { role, paused } = info;
  const writes = !(info.member && paused);
  return {
    role,
    member: info.member,
    team: info.team,
    paused: info.member && paused,
    canWrite: writes,
    canEditCatalog: role === 'owner' && writes,
    canAssign: role === 'owner' && writes && info.team,
    canTake: role === 'master' && writes,
    canDeleteOrder: (role === 'owner' || role === 'receptionist') && writes,
    canSeeMoney: role === 'owner',
    canSeeReport: info.team && (role === 'owner' || role === 'master'),
    canManageTeam: role === 'owner',
  };
}

/** The person at the phone, as an order names them. */
export const personOf = (user: { id: string; full_name: string | null; email: string } | null | undefined): Person | null =>
  user ? { id: user.id, name: user.full_name?.trim() || user.email.split('@')[0] } : null;

/** Initials for the round mark of a person: the first letters of two words, or the first two of one. */
export function initialsOf(name: string | null | undefined) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length > 1 ? [words[0], words[1]].map((word) => [...word][0]) : [...words[0]].slice(0, 2);
  return letters.join('').toUpperCase();
}

/** What an order is called in the queue lists. */
export type Queue = 'all' | 'mine' | 'none';
