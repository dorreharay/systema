import assert from 'node:assert/strict';
import { EVENT_BACKDATE_DAYS, eventTime } from '../../src/utils/dates.js';

const now = new Date('2026-11-05T12:00:00.000Z');
const ago = (ms) => new Date(now.getTime() - ms).toISOString();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// A moment the phone gives, in the past, is believed: as Z, with an offset or with milliseconds.
assert.equal(eventTime(ago(5 * MINUTE), now).toISOString(), ago(5 * MINUTE));
assert.equal(eventTime('2026-11-04T09:30:00+02:00', now).toISOString(), '2026-11-04T07:30:00.000Z');
assert.equal(eventTime('2026-11-05T11:59:59.123Z', now).toISOString(), '2026-11-05T11:59:59.123Z');
assert.equal(eventTime(ago(2 * DAY), now).toISOString(), ago(2 * DAY));
assert.equal(eventTime(ago(EVENT_BACKDATE_DAYS * DAY - MINUTE), now).toISOString(), ago(EVENT_BACKDATE_DAYS * DAY - MINUTE), 'just inside 90 days');

// The moment of the request itself is fine, and is the same moment.
assert.equal(eventTime(now.toISOString(), now).getTime(), now.getTime());

// Nothing, or a moment that cannot be right, is now: missing, in the future, more than 90 days ago, not a date.
assert.equal(eventTime(undefined, now), now, 'missing');
assert.equal(eventTime(null, now), now, 'null');
assert.equal(eventTime('', now), now, 'empty');
assert.equal(eventTime(new Date(now.getTime() + MINUTE).toISOString(), now), now, 'a minute ahead');
assert.equal(eventTime('2027-01-01T00:00:00Z', now), now, 'far ahead');
assert.equal(eventTime(ago(EVENT_BACKDATE_DAYS * DAY + MINUTE), now), now, 'just over 90 days ago');
assert.equal(eventTime('2020-01-01T00:00:00Z', now), now, 'years ago');
assert.equal(eventTime('not a date', now), now, 'not a date');

// Without a second argument the moment is the real now.
const before = Date.now();
const real = eventTime(undefined).getTime();
assert.ok(real >= before && real <= Date.now(), 'now by default');

console.log('eventTime: ok');
