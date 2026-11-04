import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reads backend/.env wherever the process was started from. `quiet` stops dotenv printing a tip
// on every start.
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env'), quiet: true });

const text = (value) => (value === undefined || value === '' ? undefined : value);
const flag = (value, fallback) => (text(value) === undefined ? fallback : value === 'true');
const integer = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const list = (value, fallback) =>
  text(value) ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback;

/** Every setting the server reads, in one place. `env` is a parameter so a test can pass its own. */
export function loadConfig(env = process.env) {
  const nodeEnv = text(env.NODE_ENV) ?? 'development';
  const isProduction = nodeEnv === 'production';
  // Where the app lives. Links in emails (a password reset) point here.
  const appUrl = (text(env.APP_URL) ?? 'http://localhost:8081').replace(/\/+$/, '');

  return {
    nodeEnv,
    isProduction,
    appName: text(env.APP_NAME) ?? 're:string',
    port: integer(env.PORT, 4000),

    databaseUrl: text(env.DATABASE_URL),
    // Hosted databases (Railway, RDS) want TLS; a local one does not.
    databaseSsl: flag(env.DATABASE_SSL, isProduction),

    jwtSecret: text(env.JWT_SECRET),
    sessionDays: 7,
    resetTokenMinutes: 60,
    bcryptRounds: integer(env.BCRYPT_ROUNDS, 12),

    // Sign in with Google: the OAuth client IDs an ID token may be meant for. The Web client ID is the one the app asks
    // the token for; the iOS one can be listed too. Empty turns Google sign-in off (see ../docs/google-sign-in.md).
    googleClientIds: list(env.GOOGLE_CLIENT_IDS, []),
    // Where Google publishes the keys it signs those tokens with. Only a test has a reason to change it.
    googleCertsUrl: text(env.GOOGLE_CERTS_URL) ?? 'https://www.googleapis.com/oauth2/v3/certs',

    appUrl,
    // Browsers only: a native app sends no Origin header and is not affected by CORS.
    corsOrigins: list(
      env.CORS_ORIGINS,
      isProduction ? [appUrl] : ['http://localhost:8081', 'http://localhost:19006', 'http://localhost:3000']
    ),
    // Number of proxies in front of the server (Railway, a load balancer), so that `req.ip` is the
    // client and not the proxy.
    trustProxy: integer(env.TRUST_PROXY, isProduction ? 1 : 0),
    // The header in which the host's own edge puts the address of the client (Railway: x-real-ip), for a host whose number
    // of proxies is not fixed, so that `trustProxy` cannot be set right. Empty: the address is `req.ip`.
    clientIpHeader: text(env.CLIENT_IP_HEADER)?.toLowerCase(),

    // Attempts per IP and 15 minutes at the endpoints that take a password or send an email.
    authRateLimit: { windowMs: 15 * 60 * 1000, max: integer(env.AUTH_RATE_LIMIT_MAX, 20) },

    smtp: {
      host: text(env.SMTP_HOST),
      port: integer(env.SMTP_PORT, 587),
      secure: flag(env.SMTP_SECURE, false),
      user: text(env.SMTP_USER),
      pass: text(env.SMTP_PASS),
      fromName: text(env.SMTP_FROM_NAME) ?? text(env.APP_NAME) ?? 're:string',
      fromAddress: text(env.SMTP_FROM_ADDRESS) ?? text(env.SMTP_USER),
    },

    // Whether a new account starts with a catalog of common rackets and strings, none in stock (see utils/defaults.js).
    starterCatalog: flag(env.STARTER_CATALOG, true),

    // First admin, created on start when there are no users yet (see bootstrap.js).
    seedAdmin: {
      email: text(env.SEED_ADMIN_EMAIL)?.toLowerCase(),
      password: text(env.SEED_ADMIN_PASSWORD),
      name: text(env.SEED_ADMIN_NAME) ?? 'Admin',
    },
  };
}

export const config = loadConfig();

/** The server cannot do anything useful without these, so it refuses to start rather than fail later. */
export function assertConfig(settings = config) {
  const problems = [];
  if (!settings.databaseUrl) problems.push('DATABASE_URL is not set');
  if (!settings.jwtSecret) {
    problems.push('JWT_SECRET is not set (generate one with: openssl rand -base64 48)');
  } else if (settings.jwtSecret.length < 32) {
    problems.push('JWT_SECRET is too short: use at least 32 characters');
  }
  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}\nSee backend/.env.example.`);
  }
}
