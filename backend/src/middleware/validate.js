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

  const fields = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || 'body';
    fields[field] ??= issue.message;
  }
  next(new HttpError(400, Object.values(fields)[0], { code: 'validation_error', fields }));
};
