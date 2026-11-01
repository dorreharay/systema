import { HttpError } from '../utils/http.js';

/**
 * Checks `req.body` against a zod schema and replaces it with the parsed value (trimmed, lower
 * cased and so on, as the schema says). A body that does not fit is a 400 that names each field.
 */
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (result.success) {
    req.body = result.data;
    return next();
  }
  next(validationError(result.error));
};

function validationError(error) {
  const fields = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'body';
    fields[field] ??= issue.message;
  }
  return new HttpError(400, Object.values(fields)[0], { code: 'validation_error', fields });
}

/** The same for a query string, inside a route: returns the parsed value or throws the 400. */
export function parseQuery(schema, query) {
  const result = schema.safeParse(query ?? {});
  if (!result.success) throw validationError(result.error);
  return result.data;
}
