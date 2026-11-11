/**
 * A small integration-test harness for the API, with no dependencies.
 *
 * - Manages a dedicated test database (create, migrate, empty between runs)
 * - Starts the real server as a child process against that database
 * - Gives a client that keeps cookies, and assertion helpers
 *
 * Run the tests with:  npm run test:api
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { SignJWT, exportJWK, exportPKCS8, generateKeyPair, jwtVerify } from 'jose';

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Connection defaults follow the standard libpq variables, so the tests run as they are in both
 * common setups:
 *
 *   - A local install (Homebrew, Postgres.app) names the superuser role after the OS user. That is
 *     the default below.
 *   - Docker and CI use the official image, where the role is `postgres`:
 *     PGUSER=postgres PGPASSWORD=postgres npm run test:api
 *
 * TEST_ADMIN_URL and TEST_DATABASE_URL, when set, win outright.
 */
const PG = {
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || '5432',
  user: process.env.PGUSER || os.userInfo().username,
  password: process.env.PGPASSWORD || '',
};

function pgUrl(database) {
  const credentials = PG.password
    ? `${encodeURIComponent(PG.user)}:${encodeURIComponent(PG.password)}`
    : encodeURIComponent(PG.user);
  return `postgresql://${credentials}@${PG.host}:${PG.port}/${database}`;
}

// Only used to issue CREATE DATABASE: Postgres will not create a database from a connection to it.
const adminUrl = process.env.TEST_ADMIN_URL || pgUrl('postgres');
const dbUrl = process.env.TEST_DATABASE_URL || pgUrl('systema_test');

export const CONFIG = {
  adminUrl,
  dbUrl,
  dbName: new URL(dbUrl).pathname.replace(/^\//, '') || 'systema_test',
  port: Number(process.env.TEST_PORT || 3998),
  jwtSecret: 'integration-test-secret-integration-test-secret',
  seedAdmin: { email: 'root@test.local', password: 'RootPass123!', name: 'Root Admin' },
};

function psql(url, sql) {
  return spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
}

/** Runs a query and returns the single value it selects. For reading what the API hides. */
export function dbScalar(sql) {
  const result = spawnSync('psql', [CONFIG.dbUrl, '-tAc', sql], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`psql query failed: ${result.stderr}`);
  return result.stdout.trim();
}

/** Runs a statement that changes the test database. */
export function dbExec(sql) {
  const result = psql(CONFIG.dbUrl, sql);
  if (result.status !== 0) throw new Error(`psql statement failed: ${result.stderr}`);
}

/**
 * Setting up the database fails before a single test runs, and psql's own error ("role ... does not
 * exist") rarely points at the fix. Say which role and host were tried, and how to change them.
 */
function connectionError(what, stderr) {
  return [
    `Could not ${what} "${CONFIG.dbName}".`,
    `  psql: ${(stderr || '').trim().split('\n').join('\n         ')}`,
    `  Connected as role "${PG.user}" at ${PG.host}:${PG.port}.`,
    '  If that role does not exist, point the tests at one that does:',
    '    PGUSER=postgres PGPASSWORD=postgres npm run test:api      # Docker / CI',
    '    PGUSER=$(whoami) npm run test:api                         # local install',
    '  Or set TEST_ADMIN_URL and TEST_DATABASE_URL to full connection strings.',
  ].join('\n');
}

export function resetDatabase() {
  const exists = spawnSync(
    'psql',
    [CONFIG.adminUrl, '-tAc', `SELECT 1 FROM pg_database WHERE datname='${CONFIG.dbName}'`],
    { encoding: 'utf8' }
  );
  if (exists.status !== 0) throw new Error(connectionError('look for the test database', exists.stderr));

  if (exists.stdout.trim() !== '1') {
    const created = psql(CONFIG.adminUrl, `CREATE DATABASE ${CONFIG.dbName}`);
    if (created.status !== 0) throw new Error(connectionError('create the test database', created.stderr));
  }

  const migrated = spawnSync('node', ['src/db/migrate.js'], {
    cwd: BACKEND,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: CONFIG.dbUrl, NODE_ENV: 'development' },
  });
  if (migrated.status !== 0) throw new Error(`Migration failed: ${migrated.stderr || migrated.stdout}`);

  // Empties the tables and leaves Drizzle's own bookkeeping alone.
  const truncated = psql(CONFIG.dbUrl, 'TRUNCATE users RESTART IDENTITY CASCADE');
  if (truncated.status !== 0) throw new Error(connectionError('empty the test database', truncated.stderr));
}

/**
 * Starts the server and waits until it answers. `logs()` returns what it has printed, which is how
 * a test reads an email (without SMTP settings the server prints it instead of sending it).
 */
export async function startServer({ port = CONFIG.port, env = {} } = {}) {
  const base = `http://127.0.0.1:${port}`;
  // A server that is already on the port (the dev server is on 4000) would answer for the new one, and the tests would
  // run against it, and its database, without anyone being told.
  const taken = await fetch(`${base}/api/health`).then(
    () => true,
    () => false
  );
  if (taken) throw new Error(`Port ${port} is in use: the tests need a port of their own (TEST_PORT)`);

  const child = spawn('node', ['src/index.js'], {
    cwd: BACKEND,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DATABASE_URL: CONFIG.dbUrl,
      JWT_SECRET: CONFIG.jwtSecret,
      BCRYPT_ROUNDS: '4', // the real cost makes every test wait for a quarter of a second
      AUTH_RATE_LIMIT_MAX: '1000',
      STUDIO_INTEREST_RATE_LIMIT_MAX: '1000',
      APP_URL: 'http://app.test',
      SMTP_HOST: '',
      SMTP_USER: '',
      SEED_ADMIN_EMAIL: CONFIG.seedAdmin.email,
      SEED_ADMIN_PASSWORD: CONFIG.seedAdmin.password,
      SEED_ADMIN_NAME: CONFIG.seedAdmin.name,
      // The tests of everything else start from an empty catalog; the ones of the starter catalog turn it on.
      STARTER_CATALOG: 'false',
      // An account is not asked to confirm its email address unless a test turns it on (EMAIL_VERIFICATION_REQUIRED: 'true'): a developer's
      // .env must not decide that.
      EMAIL_VERIFICATION_REQUIRED: 'false',
      // Sign in with Apple is off unless a test turns it on (startFakeApple().env): a developer's .env must not decide that.
      APPLE_CLIENT_IDS: '',
      APPLE_KEYS_URL: '',
      APPLE_AUTH_URL: '',
      APPLE_TEAM_ID: '',
      APPLE_KEY_ID: '',
      APPLE_PRIVATE_KEY: '',
      ...env,
    },
  });

  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`The server exited early:\n${output}`);
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      // not listening yet
    }
    await sleep(100);
    if (attempt === 99) throw new Error(`The server did not start:\n${output}`);
  }

  return {
    base,
    logs: () => output,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    },
  };
}

/**
 * Stands in for Google. It serves the public key its ID tokens are checked with and signs tokens the way Google does, so
 * the server's real check runs without the network: start the server with GOOGLE_CLIENT_IDS=`clientId` and
 * GOOGLE_CERTS_URL=`certsUrl`. It also answers the two questions the server asks about an access token (the web build signs in
 * with one): `tokeninfoUrl` says whom a token was made out to, `userinfoUrl` says who the person is (set GOOGLE_TOKENINFO_URL and
 * GOOGLE_USERINFO_URL to them).
 */
export async function startFakeGoogle({ clientId = 'test-web-client.apps.googleusercontent.com' } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };

  // The access tokens it has handed out: what tokeninfo and userinfo say about each.
  const accessTokens = new Map();
  let issued = 0;
  const asked = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const send = (status, body) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(body));
      };
      const path = req.url.split('?')[0];

      if (path === '/tokeninfo') {
        // The token is in the form of a POST, as the server sends it (Google takes it in the address of a GET too).
        const token = new URLSearchParams(raw).get('access_token') ?? new URL(req.url, 'http://127.0.0.1').searchParams.get('access_token');
        asked.push({ endpoint: 'tokeninfo', method: req.method, contentType: req.headers['content-type'], address: req.url, token });
        const entry = accessTokens.get(token);
        if (!entry || entry.expired) return send(400, { error: 'invalid_token', error_description: 'Invalid Value' });
        if (entry.tokeninfoStatus) return send(entry.tokeninfoStatus, { error: 'backend_error' });
        return send(200, {
          azp: entry.aud,
          aud: entry.aud,
          sub: entry.sub,
          scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          exp: String(Math.floor(Date.now() / 1000) + 3599),
          expires_in: '3599',
          // Google leaves the address out when the person did not give the scope for it.
          ...(entry.email !== undefined && { email: entry.email, email_verified: entry.emailVerified }),
          access_type: 'online',
        });
      }

      if (path === '/userinfo') {
        const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
        asked.push({ endpoint: 'userinfo', method: req.method, authorization: req.headers.authorization, address: req.url, token });
        const entry = accessTokens.get(token);
        if (!entry || entry.expired) return send(401, { error: 'invalid_request', error_description: 'Invalid Credentials' });
        if (entry.userinfoStatus) return send(entry.userinfoStatus, { error: 'backend_error' });
        return send(200, {
          sub: entry.userinfoSub ?? entry.sub,
          ...(entry.name !== undefined && { name: entry.name }),
          ...(entry.email !== undefined && { email: entry.email, email_verified: entry.emailVerified === 'true' }),
        });
      }

      // Everything else is the keys, wherever the server was told to look.
      return send(200, { keys: [jwk] });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    clientId,
    certsUrl: `${base}/certs`,
    tokeninfoUrl: `${base}/tokeninfo`,
    userinfoUrl: `${base}/userinfo`,
    /** What a server needs to sign in with this Google, the ID token and the access token alike. */
    env: {
      GOOGLE_CLIENT_IDS: clientId,
      GOOGLE_CERTS_URL: `${base}/certs`,
      GOOGLE_TOKENINFO_URL: `${base}/tokeninfo`,
      GOOGLE_USERINFO_URL: `${base}/userinfo`,
    },
    /**
     * An ID token as Google would issue it to this app. `claims` add to or replace its claims; `key` signs it with another
     * key than the one served, and `expires` is when it stops being valid (seconds since 1970, or a duration such as '1h').
     */
    idToken: ({ key = privateKey, expires = '1h', ...claims } = {}) =>
      new SignJWT({ iss: 'https://accounts.google.com', aud: clientId, email_verified: true, ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuedAt()
        .setExpirationTime(expires)
        .sign(key),
    /**
     * An access token as Google would give the web build for this app: what the server asks about it is answered from `claims`
     * (`sub`, `email`, `name`; `aud` for the client it was made out to; `email_verified`, a boolean or a string; `email: undefined`
     * for a person who did not give the scope for it). `expired` makes Google not know it any more; `tokeninfoStatus` and
     * `userinfoStatus` make that endpoint answer with that status whatever it is asked; `userinfoSub` makes userinfo name someone else.
     */
    accessToken: ({ aud = clientId, sub, email, name, email_verified = 'true', expired = false, tokeninfoStatus, userinfoStatus, userinfoSub } = {}) => {
      const token = `ya29.test-access-token-${++issued}`;
      accessTokens.set(token, { aud, sub, email, name, emailVerified: String(email_verified), expired, tokeninfoStatus, userinfoStatus, userinfoSub });
      return token;
    },
    /** What the server asked of `endpoint` (`'tokeninfo'` or `'userinfo'`), oldest first. */
    asked: (endpoint) => asked.filter((request) => request.endpoint === endpoint),
    /** A key Google never published, for a token that is forged. */
    otherKey: async () => (await generateKeyPair('RS256')).privateKey,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Stands in for Apple. It serves the public key its identity tokens are checked with and signs tokens the way Apple does, and
 * it answers the two calls the server makes for itself, `/auth/token` and `/auth/revoke`, after checking the client secret
 * they come with as Apple does (signed with the Sign in with Apple key, naming the team, the key and the client it speaks
 * for). It knows two clients, as the real one does for an app that is also on the web: the app (`clientId`, a bundle ID, whom
 * the token of the native sign-in is made out to) and the web sign-in (`webClientId`, a Services ID, whom the token of the
 * browser is made out to). Start the server with `env`, which is everything Sign in with Apple needs.
 */
export async function startFakeApple({ clientId = 'com.test.restring', webClientId = 'com.test.restring.web' } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'apple-test-key', alg: 'RS256', use: 'sig' };
  // The key (a .p8 file) the server asks Apple for things with: Apple knows the public half.
  const signing = await generateKeyPair('ES256', { extractable: true });
  const teamId = 'TESTTEAM01';
  const keyId = 'TESTKEY001';
  const privatePem = await exportPKCS8(signing.privateKey);

  const asked = [];
  const answers = {};
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', async () => {
      const send = (status, body) => {
        res.statusCode = status;
        if (body === undefined) return res.end();
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify(body));
      };
      if (req.method === 'GET' && req.url === '/auth/keys') return send(200, { keys: [jwk] });

      const endpoint = req.method === 'POST' ? { '/auth/token': 'token', '/auth/revoke': 'revoke' }[req.url] : undefined;
      if (!endpoint) return send(404, { error: 'not_found' });

      const { client_secret: clientSecret, ...fields } = Object.fromEntries(new URLSearchParams(raw));
      const secret = await jwtVerify(clientSecret ?? '', signing.publicKey, {
        algorithms: ['ES256'],
        issuer: teamId,
        audience: 'https://appleid.apple.com',
        // The client secret speaks for the same client the request is made as.
        subject: fields.client_id,
      }).then(
        ({ payload, protectedHeader }) => ({ valid: true, header: protectedHeader, claims: payload }),
        (err) => ({ valid: false, reason: err.message })
      );
      asked.push({ endpoint, contentType: req.headers['content-type'], fields, secret });

      if (answers[endpoint]) return send(answers[endpoint].status, answers[endpoint].body);
      if (!secret.valid || ![clientId, webClientId].includes(fields.client_id)) return send(400, { error: 'invalid_client' });
      if (endpoint === 'token') {
        if (fields.grant_type !== 'authorization_code' || !fields.code) return send(400, { error: 'invalid_request' });
        // The refresh token is made from the code, so that a test can tell whose it is.
        return send(200, {
          access_token: `access-${fields.code}`,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: `refresh-${fields.code}`,
          id_token: 'not-read.by.the-server',
        });
      }
      // /revoke answers 200 with nothing.
      return fields.token ? send(200) : send(400, { error: 'invalid_request' });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const authUrl = `http://127.0.0.1:${server.address().port}/auth`;
  const keysUrl = `${authUrl}/keys`;

  return {
    clientId,
    webClientId,
    teamId,
    keyId,
    authUrl,
    keysUrl,
    /** What a server needs to sign in with this Apple and to ask it for things. The key is on one line, the way a host holds it. */
    env: {
      // The app first, then the web: the order a real setting has.
      APPLE_CLIENT_IDS: `${clientId},${webClientId}`,
      APPLE_KEYS_URL: keysUrl,
      APPLE_AUTH_URL: authUrl,
      APPLE_TEAM_ID: teamId,
      APPLE_KEY_ID: keyId,
      APPLE_PRIVATE_KEY: privatePem.trim().replace(/\n/g, '\\n'),
    },
    /**
     * An identity token as Apple would issue it to this app (`aud: webClientId` for the one the browser gets). `claims` add to
     * or replace its claims (`sub`, `email`, `email_verified`, `is_private_email`, `aud`, `iss`); `key` signs it with another
     * key than the one served, and `expires` is when it stops being valid (seconds since 1970, or a duration such as '10m').
     */
    identityToken: ({ key = privateKey, expires = '10m', ...claims } = {}) =>
      new SignJWT({ iss: 'https://appleid.apple.com', aud: clientId, email_verified: 'true', ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'apple-test-key' })
        .setIssuedAt()
        .setExpirationTime(expires)
        .sign(key),
    /** A key Apple never published, for a token that is forged. */
    otherKey: async () => (await generateKeyPair('RS256')).privateKey,
    /** What the server asked of `endpoint` (`'token'` or `'revoke'`), oldest first: `{ fields, contentType, secret }`. */
    asked: (endpoint) => asked.filter((request) => request.endpoint === endpoint),
    /** From now on `endpoint` answers `status` and `body` whatever it is asked; with no arguments, as it should again. */
    answer: (endpoint, status, body) => {
      if (status === undefined) delete answers[endpoint];
      else answers[endpoint] = { status, body };
    },
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Stands in for Resend. It keeps every request it is asked to send an email with in `sent` and answers 200 with an id, or,
 * after `answer(status, body)`, with that. Start the server with RESEND_API_KEY and RESEND_API_URL=`apiUrl`.
 */
export async function startFakeResend() {
  const sent = [];
  const reply = { status: 200, body: { id: 'fake-email-id' } };
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      sent.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body: raw ? JSON.parse(raw) : undefined,
      });
      res.statusCode = reply.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    apiUrl: `http://127.0.0.1:${server.address().port}`,
    sent,
    answer: (status, body) => Object.assign(reply, { status, body }),
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Stands in for RevenueCat's REST API. `customers` holds what GET /v1/subscribers/{id} gives for an id (its `subscriber`); an id it
 * does not know is answered 201 with an empty customer, as RevenueCat makes one. A request without the right key is answered 401.
 * `requests` keeps what it was asked; after `answer(status)` every request is answered with that status (and `answer(null)` ends it).
 * Start the server with REVENUECAT_SECRET_KEY=`secretKey` and REVENUECAT_API_URL=`apiUrl`.
 */
export async function startFakeRevenueCat({ secretKey = 'sk_test_fake_key' } = {}) {
  const customers = new Map();
  const requests = [];
  const failure = { status: null };
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    if (failure.status) {
      res.statusCode = failure.status;
      return res.end(JSON.stringify({ message: 'a failure that was asked for' }));
    }
    if (req.headers.authorization !== `Bearer ${secretKey}`) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ code: 7225, message: 'Invalid API key' }));
    }
    const match = /^\/subscribers\/([^/?]+)/.exec(req.url ?? '');
    if (req.method !== 'GET' || !match) {
      res.statusCode = 404;
      return res.end('{}');
    }
    const id = decodeURIComponent(match[1]);
    res.statusCode = customers.has(id) ? 200 : 201;
    res.end(
      JSON.stringify({
        request_date_ms: Date.now(),
        subscriber: customers.get(id) ?? { original_app_user_id: id, entitlements: {}, subscriptions: {} },
      })
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    apiUrl: `http://127.0.0.1:${server.address().port}`,
    secretKey,
    customers,
    requests,
    answer: (status) => {
      failure.status = status;
    },
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** An HTTP client that keeps cookies, like a browser. `token` is sent as a Bearer header. */
export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
    this.token = undefined;
  }

  async request(method, path, body, headers = {}) {
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const res = await fetch(this.base + path, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(cookie && { cookie }),
        ...(this.token && { authorization: `Bearer ${this.token}` }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value === '' || /expires=thu, 01 jan 1970/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }

  /** A request whose body is raw bytes, and whose answer is returned as bytes too. */
  async rawRequest(method, path, body, contentType) {
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const res = await fetch(this.base + path, {
      method,
      headers: {
        ...(contentType && { 'content-type': contentType }),
        ...(cookie && { cookie }),
        ...(this.token && { authorization: `Bearer ${this.token}` }),
      },
      body,
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    const isJson = (res.headers.get('content-type') || '').includes('json');
    return { status: res.status, data: isJson ? JSON.parse(bytes.toString()) : bytes, headers: res.headers };
  }

  get = (path, headers) => this.request('GET', path, undefined, headers);
  post = (path, body = {}, headers) => this.request('POST', path, body, headers);
  patch = (path, body = {}, headers) => this.request('PATCH', path, body, headers);
  delete = (path, headers) => this.request('DELETE', path, undefined, headers);
}

export function assertTrue(value, message) {
  if (!value) throw new Error(`Expected a truthy value: ${message}`);
}

export function assertEq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}: expected ${e}, got ${a}`);
}

export function assertStatus(res, expected) {
  if (res.status !== expected) {
    throw new Error(`Expected status ${expected}, got ${res.status}: ${JSON.stringify(res.data)}`);
  }
}
