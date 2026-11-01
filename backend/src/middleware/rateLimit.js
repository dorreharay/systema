import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

/**
 * For the endpoints that take a password or send an email: logging in, signing up, asking for a
 * reset. Counted per IP address. The counter is in memory, so with several server instances each
 * has its own; move it to Redis (rate-limit-redis) if that matters.
 */
export const authLimiter = rateLimit({
  windowMs: config.authRateLimit.windowMs,
  limit: config.authRateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many attempts. Try again later.', code: 'rate_limited' });
  },
});
