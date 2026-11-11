import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';
import { emailVerificationEmail } from '../../src/utils/emailTemplates.js';
import { CODE_LENGTH, hashCode, newCode, normalizeCode, sameHash } from '../../src/utils/emailVerification.js';
import { needsConfirmation } from '../../src/utils/emailVerified.js';
import { LANGUAGES } from '../../src/utils/messages/index.js';

// A code: six digits, and not the same every time
assert.equal(CODE_LENGTH, 6, 'six digits');
const codes = new Set();
for (let i = 0; i < 2000; i++) {
  const code = newCode();
  assert.match(code, /^\d{6}$/, `a code is six digits: ${code}`);
  codes.add(code);
}
assert.ok(codes.size > 1800, 'the codes are not the same over and over');

// What a person types, as the code it may be
assert.equal(normalizeCode('123456'), '123456', 'plain');
assert.equal(normalizeCode(' 123456 '), '123456', 'with spaces around');
assert.equal(normalizeCode('123 456'), '123456', 'as it is copied from an email');
assert.equal(normalizeCode('123-456'), '123456', 'with a dash');
assert.equal(normalizeCode('000123'), '000123', 'leading zeros stay');
for (const bad of ['12345', '1234567', 'abcdef', '12 34 5a', '', '   ', null, undefined, '١٢٣٤٥٦', '12.3456']) {
  assert.equal(normalizeCode(bad), null, `not a code: ${JSON.stringify(bad)}`);
}

// The hash a code is kept as: keyed, and its own for each account
const secret = 'a-secret-for-the-test-a-secret-for-the-test';
const a = hashCode('11111111-1111-4111-8111-111111111111', '123456', secret);
assert.match(a, /^[0-9a-f]{64}$/, 'a hex digest');
assert.equal(a, hashCode('11111111-1111-4111-8111-111111111111', '123456', secret), 'the same every time');
assert.notEqual(a, hashCode('22222222-2222-4222-8222-222222222222', '123456', secret), 'not the same for another account');
assert.notEqual(a, hashCode('11111111-1111-4111-8111-111111111111', '123457', secret), 'not the same for another code');
assert.notEqual(a, hashCode('11111111-1111-4111-8111-111111111111', '123456', `${secret}x`), 'not the same for another secret');
assert.ok(sameHash(a, a), 'the same hash is the same');
assert.ok(!sameHash(a, hashCode('11111111-1111-4111-8111-111111111111', '654321', secret)), 'another one is not');
assert.ok(!sameHash(a, a.slice(0, 62)), 'one of another length is not');

// Who has to confirm: only where it is required, and only until it is done
const required = { required: true };
const optional = { required: false };
assert.equal(needsConfirmation({ email_verified_at: null }, required), true, 'required, not confirmed');
assert.equal(needsConfirmation({ email_verified_at: new Date() }, required), false, 'required, confirmed');
assert.equal(needsConfirmation({ email_verified_at: null }, optional), false, 'not required');

// Where it is required by default: production, and nowhere else; either can be set by hand.
const base = { JWT_SECRET: 'x'.repeat(48), DATABASE_URL: 'postgresql://u@localhost/db', CORS_ORIGINS: 'https://example.com', APP_URL: 'https://example.com' };
assert.equal(loadConfig({ ...base, NODE_ENV: 'development' }).emailVerification.required, false, 'a local server does not ask');
assert.equal(loadConfig({ ...base, NODE_ENV: 'test' }).emailVerification.required, false, 'the tests do not ask');
assert.equal(loadConfig({ ...base, NODE_ENV: 'production' }).emailVerification.required, true, 'production asks');
assert.equal(loadConfig({ ...base, NODE_ENV: 'production', EMAIL_VERIFICATION_REQUIRED: 'false' }).emailVerification.required, false, 'unless it is turned off');
assert.equal(loadConfig({ ...base, NODE_ENV: 'development', EMAIL_VERIFICATION_REQUIRED: 'true' }).emailVerification.required, true, 'or turned on');
const defaults = loadConfig({ ...base, NODE_ENV: 'development' }).emailVerification;
assert.deepEqual(
  [defaults.codeMinutes, defaults.maxAttempts, defaults.resendSeconds, defaults.sendsPerHour],
  [15, 5, 60, 6],
  'the limits a code has'
);

// The email: the code is in the subject and in the text, in the language of the account, and a name cannot break the page
for (const language of LANGUAGES) {
  const email = emailVerificationEmail({ name: 'Ann', code: '482915', minutes: 15, language });
  assert.ok(email.subject.includes('482915'), `${language}: the code is in the subject`);
  assert.ok(email.text.split('\n').includes('482915'), `${language}: the code has a line of its own in the text`);
  assert.ok(email.text.includes('15'), `${language}: the minutes are said`);
  assert.ok(email.html.includes('482915'), `${language}: the code is in the page`);
  assert.ok(!/\{\w+\}/.test(email.subject + email.text + email.html), `${language}: nothing is left to fill in`);
}
const english = emailVerificationEmail({ name: 'Ann', code: '482915', minutes: 15, language: 'en' });
assert.ok(english.text.startsWith('Hello, Ann!'), 'English greets by name');
assert.ok(emailVerificationEmail({ code: '482915', minutes: 15, language: 'en' }).text.startsWith('Hello!'), 'and without one');
assert.ok(emailVerificationEmail({ name: 'Ann', code: '482915', minutes: 15, language: 'xx' }).subject.includes('confirmation code'), 'English for a language it does not know');
const tricky = emailVerificationEmail({ name: '<b>Ann</b> & "co"', code: '482915', minutes: 15, language: 'en' });
assert.ok(!tricky.html.includes('<b>Ann'), 'a name is not taken for markup');
assert.ok(tricky.html.includes('&lt;b&gt;Ann'), 'but is shown');

console.log('emailVerification: ok');
