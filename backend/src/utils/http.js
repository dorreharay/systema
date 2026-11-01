/**
 * Small helpers shared by the routers, so every route answers the same way and a missing or
 * forbidden record looks the same to the caller.
 *
 * Express 5 passes an error thrown (or a promise rejected) in a handler to the error handler on its
 * own, so a route simply throws one of these: see middleware/error.js.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === 'string' && UUID.test(value);

/**
 * An error a route can throw to answer with a specific status. `code` is a short machine-readable
 * reason (`email_taken`) for a screen that wants to react to one case in particular, rather than
 * match on the message. `fields` maps a field name to what is wrong with it.
 */
export class HttpError extends Error {
  constructor(status, message, { code, fields } = {}) {
    super(message);
    this.status = status;
    if (code) this.code = code;
    if (fields) this.fields = fields;
  }
}

/**
 * A record that does not exist and one the caller may not see are answered the same way, so the API
 * never confirms that an id belongs to someone else's data.
 */
export const notFound = () => new HttpError(404, 'Not found');

/** The record is visible, but this caller may not do this to it. */
export const forbidden = (message = 'You do not have permission to do that') =>
  new HttpError(403, message);

/**
 * Rejects a malformed `:id` before it reaches the database. Postgres answers a bad uuid with an
 * error whose text would otherwise be sent back to the client.
 */
export function rejectMalformedIds(router) {
  router.param('id', (req, res, next, id) => {
    if (!isUuid(id)) return next(notFound());
    next();
  });
}
