import assert from 'node:assert/strict';
import { assertConfig, loadConfig } from '../../src/config.js';

const dev = loadConfig({});
assert.equal(dev.isProduction, false);
assert.equal(dev.port, 4000);
assert.equal(dev.databaseSsl, false, 'no TLS to a local database');
assert.equal(dev.trustProxy, 0);
assert.ok(dev.corsOrigins.includes('http://localhost:8081'));

const production = loadConfig({ NODE_ENV: 'production', APP_URL: 'https://app.example.com/' });
assert.equal(production.isProduction, true);
assert.equal(production.appUrl, 'https://app.example.com', 'no trailing slash');
assert.deepEqual(production.corsOrigins, ['https://app.example.com'], 'only the app in production');
assert.equal(production.databaseSsl, true);
assert.equal(production.trustProxy, 1);

const custom = loadConfig({ PORT: '4000', DATABASE_SSL: 'false', NODE_ENV: 'production', CORS_ORIGINS: 'https://a.test, https://b.test', SMTP_PORT: 'x' });
assert.equal(custom.port, 4000);
assert.equal(custom.databaseSsl, false, 'an explicit value wins');
assert.deepEqual(custom.corsOrigins, ['https://a.test', 'https://b.test']);
assert.equal(custom.smtp.port, 587, 'a value that is not a number falls back');
assert.equal(loadConfig({ SEED_ADMIN_EMAIL: 'Root@Test.Local' }).seedAdmin.email, 'root@test.local');

assert.throws(() => assertConfig(loadConfig({})), /DATABASE_URL[\s\S]*JWT_SECRET/);
assert.throws(() => assertConfig(loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'short' })), /too short/);
assert.doesNotThrow(() => assertConfig(loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(32) })));

console.log('config: ok');
