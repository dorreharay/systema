/**
 * Ids that the phone makes up. The app works without a connection, so it points at a client, a racket or a string it made a
 * moment ago before the server has heard of it: it names them itself, with a UUID, and the server keeps the name. A request that
 * is sent again because its answer never arrived (the connection dropped after the server had done the work) must find what the
 * first one made and make nothing more, so a create with an id that is already this stringer's answers 200 with the row it has.
 * An id that is another stringer's is a 409 that says nothing else.
 */
import { sql } from 'drizzle-orm';
import { HttpError } from './http.js';

export const idConflict = () => new HttpError(409, 'This id is already in use', { code: 'id_conflict' });

const UNIQUE_VIOLATION = '23505';

/**
 * An insert that ran into a row with the same primary key: two stringers (or two requests) chose one id at the same moment, and
 * the database let one of them in. Other unique indexes (an order number, an email) are not this.
 */
export function isIdCollision(err) {
  const reason = [err, err?.cause].find((candidate) => candidate?.code === UNIQUE_VIOLATION);
  return String(reason?.constraint ?? '').endsWith('_pkey');
}

/**
 * Makes the other requests of this stringer that use the same id wait until the transaction `tx` has ended, so that two copies of
 * one request at the same moment make one row: the second one waits here, and then finds what the first made.
 */
export const lockId = (tx, kind, userId, id) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${kind}:${userId}:${id}`}))`);
