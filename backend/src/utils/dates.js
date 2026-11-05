/** Time zones and "today" for a stringer who may work in another zone than the server. */

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Today's calendar date in that time zone, as YYYY-MM-DD. */
export function todayIn(timeZone) {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  // The en-CA locale writes a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const pad = (value) => String(value).padStart(2, '0');
const iso = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;

/** The calendar date `days` after (negative: before) a YYYY-MM-DD date. */
export function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return iso(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/** The first and the last day of the month a YYYY-MM-DD date is in, and how many days it has. */
export function monthOf(date) {
  const [year, month] = date.split('-').map(Number);
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: iso(year, month, 1), end: iso(year, month, length), length };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back the phone may date what it did while it had no connection. */
export const EVENT_BACKDATE_DAYS = 90;

/**
 * When something happened, as the phone says (`at`): a status that was changed or an order that was paid with no connection
 * is dated by the moment of the tap and not by the moment the request got through, so the day's revenue and the times on the
 * order are right. A moment that is missing, is in the future (a clock that is ahead) or is more than 90 days ago (a clock that is
 * wrong) is not believed: it is `now`.
 */
export function eventTime(at, now = new Date()) {
  if (!at) return now;
  const moment = new Date(at);
  const time = moment.getTime();
  if (Number.isNaN(time) || time > now.getTime() || time < now.getTime() - EVENT_BACKDATE_DAYS * DAY_MS) return now;
  return moment;
}
