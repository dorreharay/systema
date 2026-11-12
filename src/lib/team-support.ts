/**
 * What the team screens share (the team, the invitation sheet, joining): the words for what the server refuses, the code as it is typed
 * and shown, and the check that the phone has nothing unsent before it changes whose workshop it works in.
 */
import { ApiError } from '@/lib/api-error';
import { describeError } from '@/lib/errors';
import type { TKey, Translate } from '@/lib/i18n';
import { engine, offlineStore } from '@/lib/offline/app';

// The codes the team routes answer with (backend/src/routes/team.js and the role checks) and what each means to the person. A code with no
// entry here is left to `describeError`, which has the words for the rest (no connection, too many attempts, a server in trouble).
const MESSAGES: Record<string, TKey> = {
  invite_invalid: 'team_error_invite_invalid',
  own_workshop: 'team_error_own_workshop',
  already_member: 'team_error_already_member',
  studio_inactive: 'team_error_studio_inactive',
  has_team: 'team_error_has_team',
  no_seats: 'team_invite_no_seats',
  studio_required: 'team_invite_needs_studio',
  forbidden_role: 'team_error_forbidden',
  workshop_paused: 'team_error_paused',
};

/** What to tell the person when a team request is refused: never the raw text the server sent. */
export function describeTeamError(error: unknown, t: Translate) {
  const key = error instanceof ApiError && error.code ? MESSAGES[error.code] : undefined;
  return key ? t(key) : describeError(error, t);
}

const CODE_LENGTH = 10;
const CODE_GROUP = 5;
// The server takes any code of at least this many letters and digits (it finds out whether it is a good one).
const CODE_LEAST = 6;

/**
 * A code as it is typed or pasted: capitals and digits only, in two groups of five (`ABCDE-FGHJK`). The link of the invitation pasted whole
 * (`https://myrestring.com/join?code=ABCDEFGHJK`) is the code in it.
 */
export function formatInviteCode(text: string) {
  const inLink = /[?&]code=([A-Za-z0-9-]+)/.exec(text);
  const clean = (inLink ? inLink[1] : text).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
  return clean.length > CODE_GROUP ? `${clean.slice(0, CODE_GROUP)}-${clean.slice(CODE_GROUP)}` : clean;
}

/** Whether what was typed is long enough to be asked about. */
export const isInviteCodeComplete = (text: string) => text.replace(/[^A-Za-z0-9]/g, '').length >= CODE_LEAST;

/**
 * Joining a workshop or leaving one changes whose data the phone works in, so nothing may be left on the phone that has not reached the
 * server: it would be sent to the wrong workshop, or refused. Sends what is waiting and answers whether the queue is empty after that.
 */
export async function nothingUnsent() {
  if (offlineStore.getSnapshot().outbox.length === 0) return true;
  await engine.syncNow();
  return offlineStore.getSnapshot().outbox.length === 0;
}
