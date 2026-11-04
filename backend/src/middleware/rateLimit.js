import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { isIP } from 'node:net';
import { config } from '../config.js';

/**
 * The address a request is counted under. A host that cannot say how many proxies are in front of the server (Railway) sets
 * a header with the client's address on its own edge, and CLIENT_IP_HEADER names it: that one is the client, where `req.ip`
 * would be a proxy on the way, a different one from one request to the next. Without it, or when it holds no address, it is
 * `req.ip`.
 */
export function clientIp(req, header = config.clientIpHeader) {
  const value = header ? req.headers[header] : undefined;
  const address = (Array.isArray(value) ? value[0] : value)?.trim();
  return address && isIP(address) ? address : req.ip;
}

/**
 * For the endpoints that take a password or send an email: logging in, signing up, asking for a
 * reset. Counted per IP address. The counter is in memory, so with several server instances each
 * has its own; move it to Redis (rate-limit-redis) if that matters.
 */
export const authLimiter = rateLimit({
  windowMs: config.authRateLimit.windowMs,
  limit: config.authRateLimit.max,
  keyGenerator: (req) => ipKeyGenerator(clientIp(req) ?? ''),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many attempts. Try again later.', code: 'rate_limited' });
  },
});
