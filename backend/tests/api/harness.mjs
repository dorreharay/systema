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
import os from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

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
      APP_URL: 'http://app.test',
      SMTP_HOST: '',
      SMTP_USER: '',
      SEED_ADMIN_EMAIL: CONFIG.seedAdmin.email,
      SEED_ADMIN_PASSWORD: CONFIG.seedAdmin.password,
      SEED_ADMIN_NAME: CONFIG.seedAdmin.name,
      ...env,
    },
  });

  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  const base = `http://127.0.0.1:${port}`;
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
