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
