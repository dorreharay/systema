import { HttpError } from '../utils/http.js';

/** An /api path nothing answers. */
export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: 'Not found' });
};

/**
 * Turns whatever a route threw into the one error shape the API has:
 * `{ error, code?, fields? }`. Anything unexpected is a 500 whose text is not sent to the client,
 * because it could name a table, a query or a path.
 */
// Express recognises an error handler by its four parameters.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.code && { code: err.code }),
      ...(err.fields && { fields: err.fields }),
    });
  }

  // Raised by express.json(): a body that is not JSON, or is too large.
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON', code: 'invalid_json' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request body is too large', code: 'payload_too_large' });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'Internal server error' });
}
