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
assert.equal(production.clientIpHeader, undefined, 'the address is req.ip unless a header is named');
assert.equal(loadConfig({ CLIENT_IP_HEADER: 'X-Real-IP' }).clientIpHeader, 'x-real-ip', 'a header name is lower case');
assert.equal(loadConfig({ CLIENT_IP_HEADER: '' }).clientIpHeader, undefined, 'an empty setting is none');

const custom = loadConfig({ PORT: '4000', DATABASE_SSL: 'false', NODE_ENV: 'production', CORS_ORIGINS: 'https://a.test, https://b.test', SMTP_PORT: 'x' });
assert.equal(custom.port, 4000);
assert.equal(custom.databaseSsl, false, 'an explicit value wins');
assert.deepEqual(custom.corsOrigins, ['https://a.test', 'https://b.test']);
assert.equal(custom.smtp.port, 587, 'a value that is not a number falls back');
assert.equal(loadConfig({ SEED_ADMIN_EMAIL: 'Root@Test.Local' }).seedAdmin.email, 'root@test.local');
assert.equal(dev.starterCatalog, true, 'a new account starts with a catalog');
assert.equal(loadConfig({ STARTER_CATALOG: 'false' }).starterCatalog, false, 'unless it is turned off');
assert.deepEqual(dev.googleClientIds, [], 'Google sign-in is off until a client ID is given');
assert.deepEqual(
  loadConfig({ GOOGLE_CLIENT_IDS: 'a.apps.googleusercontent.com, b.apps.googleusercontent.com' }).googleClientIds,
  ['a.apps.googleusercontent.com', 'b.apps.googleusercontent.com'],
  'a list'
);
assert.deepEqual(loadConfig({ GOOGLE_CLIENT_IDS: '' }).googleClientIds, [], 'an empty setting is none');
assert.equal(dev.googleCertsUrl, 'https://www.googleapis.com/oauth2/v3/certs', 'Google\'s own keys');
assert.equal(dev.googleTokeninfoUrl, 'https://oauth2.googleapis.com/tokeninfo', 'Google\'s own answer about an access token');
assert.equal(dev.googleUserinfoUrl, 'https://openidconnect.googleapis.com/v1/userinfo', 'and about the person');
assert.equal(loadConfig({ GOOGLE_TOKENINFO_URL: 'http://127.0.0.1:9/tokeninfo' }).googleTokeninfoUrl, 'http://127.0.0.1:9/tokeninfo');
assert.equal(loadConfig({ GOOGLE_USERINFO_URL: 'http://127.0.0.1:9/userinfo' }).googleUserinfoUrl, 'http://127.0.0.1:9/userinfo');
assert.equal(loadConfig({ GOOGLE_TOKENINFO_URL: '' }).googleTokeninfoUrl, 'https://oauth2.googleapis.com/tokeninfo', 'an empty setting is the default');

// Sign in with Apple.
assert.deepEqual(dev.appleClientIds, [], 'Apple sign-in is off until a bundle ID is given');
assert.deepEqual(
  loadConfig({ APPLE_CLIENT_IDS: 'com.example.app, com.example.app.dev' }).appleClientIds,
  ['com.example.app', 'com.example.app.dev'],
  'a list'
);
assert.deepEqual(loadConfig({ APPLE_CLIENT_IDS: '' }).appleClientIds, [], 'an empty setting is none');
assert.equal(dev.appleKeysUrl, 'https://appleid.apple.com/auth/keys', 'Apple\'s own keys');
assert.equal(dev.appleAuthUrl, 'https://appleid.apple.com/auth', 'and its own endpoints');
assert.equal(loadConfig({ APPLE_KEYS_URL: 'http://127.0.0.1:9/keys' }).appleKeysUrl, 'http://127.0.0.1:9/keys');
assert.equal(loadConfig({ APPLE_AUTH_URL: 'http://127.0.0.1:9/auth/' }).appleAuthUrl, 'http://127.0.0.1:9/auth', 'no trailing slash');
assert.equal(loadConfig({ APPLE_AUTH_URL: '' }).appleAuthUrl, 'https://appleid.apple.com/auth', 'an empty setting is the default');
assert.deepEqual([dev.appleTeamId, dev.appleKeyId, dev.applePrivateKey], [undefined, undefined, undefined], 'no key to ask Apple with');
assert.deepEqual(
  [loadConfig({ APPLE_TEAM_ID: 'TEAM123456' }).appleTeamId, loadConfig({ APPLE_KEY_ID: 'KEY1234567' }).appleKeyId],
  ['TEAM123456', 'KEY1234567']
);
assert.equal(
  loadConfig({ APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nMIGT\\nAbC=\\n-----END PRIVATE KEY-----' }).applePrivateKey,
  '-----BEGIN PRIVATE KEY-----\nMIGT\nAbC=\n-----END PRIVATE KEY-----',
  'a \\n in the variable is a line break'
);
assert.equal(loadConfig({ APPLE_PRIVATE_KEY: 'a\nb' }).applePrivateKey, 'a\nb', 'and a real one stays');
assert.equal(loadConfig({ APPLE_PRIVATE_KEY: '' }).applePrivateKey, undefined, 'an empty setting is none');

// Email: Resend over HTTPS, or SMTP; who emails come from.
assert.equal(dev.resend.apiKey, undefined, 'no Resend until it has a key');
assert.equal(dev.resend.apiUrl, 'https://api.resend.com');
assert.equal(loadConfig({ RESEND_API_KEY: 're_x', RESEND_API_URL: 'http://127.0.0.1:9/' }).resend.apiUrl, 'http://127.0.0.1:9', 'no trailing slash');
assert.deepEqual(
  loadConfig({ SMTP_FROM_NAME: 'Mail', SMTP_FROM_ADDRESS: 'smtp@test.local' }).emailFrom,
  { name: 'Mail', address: 'smtp@test.local' },
  'the SMTP sender is the sender'
);
assert.deepEqual(
  loadConfig({ SMTP_FROM_ADDRESS: 'smtp@test.local', EMAIL_FROM_NAME: 'Re', EMAIL_FROM_ADDRESS: 'noreply@mail.test' }).emailFrom,
  { name: 'Re', address: 'noreply@mail.test' },
  'EMAIL_FROM_* wins'
);
assert.equal(dev.appScheme, 'systema');
assert.equal(loadConfig({ APP_SCHEME: 'restring' }).appScheme, 'restring');

assert.throws(() => assertConfig(loadConfig({})), /DATABASE_URL[\s\S]*JWT_SECRET/);
assert.throws(
  () => assertConfig(loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(32), RESEND_API_KEY: 're_x' })),
  /EMAIL_FROM_ADDRESS/,
  'a Resend key needs the address emails come from'
);
assert.doesNotThrow(() =>
  assertConfig(loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(32), RESEND_API_KEY: 're_x', EMAIL_FROM_ADDRESS: 'noreply@mail.test' }))
);
assert.throws(() => assertConfig(loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'short' })), /too short/);
assert.doesNotThrow(() => assertConfig(loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(32) })));

// The Apple key is all or nothing, and needs an app to be for.
{
  const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(32) };
  const apple = { APPLE_CLIENT_IDS: 'com.example.app', APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: 'key' };
  const problems = (env) => {
    try {
      assertConfig(loadConfig({ ...base, ...env }));
    } catch (error) {
      return error.message;
    }
    return '';
  };

  assert.equal(problems({}), '', 'no Apple at all');
  assert.equal(problems({ APPLE_CLIENT_IDS: 'com.example.app' }), '', 'sign-in without the key');
  assert.equal(problems(apple), '', 'sign-in with the key');
  for (const name of ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_CLIENT_IDS']) {
    const message = problems({ ...apple, [name]: '' });
    assert.ok(message.includes(`${name} is not set`), `${name} is missing: ${message}`);
    assert.equal((message.match(/is not set/g) ?? []).length, 1, 'and only that one is named');
  }
  // One of the three alone names the other two.
  for (const [name, others] of [
    ['APPLE_TEAM_ID', ['APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']],
    ['APPLE_KEY_ID', ['APPLE_TEAM_ID', 'APPLE_PRIVATE_KEY']],
    ['APPLE_PRIVATE_KEY', ['APPLE_TEAM_ID', 'APPLE_KEY_ID']],
  ]) {
    const message = problems({ APPLE_CLIENT_IDS: 'com.example.app', [name]: apple[name] });
    assert.ok(others.every((other) => message.includes(`${other} is not set`)) && !message.includes(`${name} is not set`), `${name} alone: ${message}`);
    // And with no app too.
    assert.ok(problems({ [name]: apple[name] }).includes('APPLE_CLIENT_IDS is not set'), `${name} without an app`);
  }
}

console.log('config: ok');
