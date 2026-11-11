import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { isIP } from 'node:net';
import { config } from '../config.js';
import { studioPageUrl } from '../utils/pages.js';

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

/**
 * For the form of the Studio waiting list on the website, which anyone can post: a few an hour from one address. A browser's form is
 * answered with a redirect back to the page, where an error box is waiting (it has no script to show a message), anything else with a 429.
 */
export const studioInterestLimiter = rateLimit({
  windowMs: config.studioInterestRateLimit.windowMs,
  limit: config.studioInterestRateLimit.max,
  keyGenerator: (req) => ipKeyGenerator(clientIp(req) ?? ''),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    if (req.is('application/x-www-form-urlencoded')) return res.redirect(303, studioPageUrl(req.body?.lang === 'en' ? 'en' : 'uk', '#error'));
    res.status(429).json({ error: 'Too many attempts. Try again later.', code: 'rate_limited' });
  },
});

/**
 * For the request that makes the server read the purchases again (it asks RevenueCat, which has limits of its own): a few a minute
 * from one address are far more than a person who has just bought something or restored it needs.
 */
export const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.billing.syncRateLimitMax,
  keyGenerator: (req) => ipKeyGenerator(clientIp(req) ?? ''),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many attempts. Try again later.', code: 'rate_limited' });
  },
});
