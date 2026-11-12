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
  const smtp = {
    host: text(env.SMTP_HOST),
    port: integer(env.SMTP_PORT, 587),
    secure: flag(env.SMTP_SECURE, false),
    user: text(env.SMTP_USER),
    pass: text(env.SMTP_PASS),
    fromName: text(env.SMTP_FROM_NAME) ?? text(env.APP_NAME) ?? 're:string',
    fromAddress: text(env.SMTP_FROM_ADDRESS) ?? text(env.SMTP_USER),
  };

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
    // Where Google says whom an access token was made out to, and who the person is. The web build signs in with an access token
    // (see utils/google.js), which is not signed the way an ID token is: Google is asked about it. Only a test changes these.
    googleTokeninfoUrl: text(env.GOOGLE_TOKENINFO_URL) ?? 'https://oauth2.googleapis.com/tokeninfo',
    googleUserinfoUrl: text(env.GOOGLE_USERINFO_URL) ?? 'https://openidconnect.googleapis.com/v1/userinfo',

    // Sign in with Apple: the identifiers an identity token may be made out to. The app's bundle ID comes first: it is what
    // the token of the native sign-in is for, and the one the server speaks for when it asks Apple something and no other is
    // named. After it, the Services ID of the web sign-in (Sign in with Apple JS), which is what the browser's token is for.
    // Empty turns Apple sign-in off (see utils/apple.js).
    appleClientIds: list(env.APPLE_CLIENT_IDS, []),
    // Where Apple publishes the keys it signs those tokens with, and the base of its /token and /revoke endpoints. Only a
    // test has a reason to change either.
    appleKeysUrl: text(env.APPLE_KEYS_URL) ?? 'https://appleid.apple.com/auth/keys',
    appleAuthUrl: (text(env.APPLE_AUTH_URL) ?? 'https://appleid.apple.com/auth').replace(/\/+$/, ''),
    // What the server needs to ask Apple for something itself (to turn the authorization code of a sign-in into a refresh
    // token, and to revoke that token when the account is deleted): the Developer team, and a Sign in with Apple key (.p8).
    // All three or none. A .p8 file in a one-line variable has its line breaks written as \n.
    appleTeamId: text(env.APPLE_TEAM_ID),
    appleKeyId: text(env.APPLE_KEY_ID),
    applePrivateKey: text(env.APPLE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),

    appUrl,
    // The app's own URL scheme (app.json: `scheme`), which the page behind a password reset link opens the app with.
    appScheme: text(env.APP_SCHEME) ?? 'systema',
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

    // Sign-ups for the Studio waiting list from the website, a form that anyone can post: per IP and hour.
    studioInterestRateLimit: { windowMs: 60 * 60 * 1000, max: integer(env.STUDIO_INTEREST_RATE_LIMIT_MAX, 5) },

    smtp,
    // Resend, over HTTPS: where the host lets a server open no SMTP connection (Railway's Hobby plan does not), a key is all
    // it takes. `apiUrl` is only changed by a test, which stands in for Resend.
    resend: {
      apiKey: text(env.RESEND_API_KEY),
      apiUrl: (text(env.RESEND_API_URL) ?? 'https://api.resend.com').replace(/\/+$/, ''),
    },
    // Who emails come from, whichever way they go out. An EMAIL_FROM_* setting wins over the SMTP_FROM_* ones.
    emailFrom: {
      name: text(env.EMAIL_FROM_NAME) ?? smtp.fromName,
      address: text(env.EMAIL_FROM_ADDRESS) ?? smtp.fromAddress,
    },

    // Whether a new account starts with a catalog of common rackets and strings, none in stock (see utils/defaults.js).
    starterCatalog: flag(env.STARTER_CATALOG, true),

    // Subscription plans (see utils/plans.js and ../docs/subscriptions.md). Off unless turned on: every account then has everything
    // and the app shows no plans at all, so this server can be deployed before the purchases are.
    billing: {
      enabled: flag(env.BILLING_ENABLED, false),
      // Whether the Studio plan really exists (several stringers in one workshop: see utils/workshop.js and routes/team.js). Off, Studio
      // is only a waiting list, as it was: no team routes, no invitations, no seats. It needs the plans to be on too.
      studioEnabled: flag(env.STUDIO_ENABLED, false),
      // How many people a Studio workshop holds, the owner included. Invitations that are waiting take a seat.
      studioSeats: Math.max(1, integer(env.STUDIO_SEATS, 3)),
      // How many days an invitation to a workshop can be used.
      inviteDays: Math.max(1, integer(env.STUDIO_INVITE_DAYS, 7)),
      // What Free allows: new orders in a calendar month of the stringer's own.
      freeOrdersPerMonth: Math.max(0, integer(env.FREE_ORDERS_PER_MONTH, 15)),
      // How many days a plan that has run out still holds: the store is slow with a renewal, and Apple tries a card that failed again.
      graceDays: Math.max(0, integer(env.BILLING_GRACE_DAYS, 3)),
      // Development only: lets an account give itself a plan (POST /api/billing/dev-grant) to try the screens without the store.
      // Never in production, whatever is set.
      devGrants: flag(env.BILLING_DEV_GRANTS, false) && !isProduction,
      // How many times a minute one address may ask the server to read the store again (POST /api/billing/sync).
      syncRateLimitMax: Math.max(1, integer(env.BILLING_SYNC_RATE_LIMIT_MAX, 10)),
      // RevenueCat is where the purchases are read from (see utils/revenuecat.js). Without the secret key the server cannot ask it
      // anything (the answer is 503); without `webhookAuth` the route that listens to its notices does not exist (404). The names of
      // the entitlements are the ones set in RevenueCat's dashboard.
      revenuecat: {
        secretKey: text(env.REVENUECAT_SECRET_KEY),
        apiUrl: (text(env.REVENUECAT_API_URL) ?? 'https://api.revenuecat.com/v1').replace(/\/+$/, ''),
        webhookAuth: text(env.REVENUECAT_WEBHOOK_AUTH),
        proEntitlement: text(env.REVENUECAT_PRO_ENTITLEMENT) ?? 'pro',
        studioEntitlement: text(env.REVENUECAT_STUDIO_ENTITLEMENT) ?? 'studio',
      },
    },

    // Confirming the email of an account made with an email and a password (see utils/emailVerification.js): a code goes to the address
    // and the account is not used until it is typed in. On in production unless it is turned off, and off everywhere else (a local
    // server, the tests) unless it is turned on, so that nobody has to read a code to develop. An account made with Google or Apple
    // needs no code: they say that the address is verified.
    emailVerification: {
      required: flag(env.EMAIL_VERIFICATION_REQUIRED, isProduction),
      // How long a code works, in minutes.
      codeMinutes: Math.max(1, integer(env.EMAIL_CODE_MINUTES, 15)),
      // How many wrong codes one code takes before it is no good and a new one has to be asked for.
      maxAttempts: Math.max(1, integer(env.EMAIL_CODE_ATTEMPTS, 5)),
      // The wait before another code can be asked for, in seconds, and how many codes may be sent to one account in an hour.
      resendSeconds: Math.max(0, integer(env.EMAIL_CODE_RESEND_SECONDS, 60)),
      sendsPerHour: Math.max(1, integer(env.EMAIL_CODE_SENDS_PER_HOUR, 6)),
    },

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
  if (settings.resend.apiKey && !settings.emailFrom.address) {
    problems.push('EMAIL_FROM_ADDRESS is not set (RESEND_API_KEY needs the address emails come from, on a domain verified with Resend)');
  }
  // The key that lets the server talk to Apple is a set of three, and is no use without the app it is for.
  const appleKey = {
    APPLE_TEAM_ID: settings.appleTeamId,
    APPLE_KEY_ID: settings.appleKeyId,
    APPLE_PRIVATE_KEY: settings.applePrivateKey,
  };
  if (Object.values(appleKey).some(Boolean)) {
    for (const [name, value] of Object.entries(appleKey)) {
      if (!value) problems.push(`${name} is not set (APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY go together)`);
    }
    if (settings.appleClientIds.length === 0) {
      problems.push('APPLE_CLIENT_IDS is not set (the Apple key needs the bundle ID of the app it is for)');
    }
  }
  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}\nSee backend/.env.example.`);
  }
}
