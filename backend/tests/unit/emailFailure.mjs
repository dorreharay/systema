import assert from 'node:assert/strict';
import { describeEmailFailure } from '../../src/utils/emailFailure.js';

const cases = [
  [{ code: 'EAUTH' }, 502, 'email_account_rejected'],
  [{ responseCode: 535 }, 502, 'email_account_rejected'],
  [{ code: 'ECONNREFUSED' }, 502, 'email_unreachable'],
  [{ code: 'ETIMEDOUT' }, 502, 'email_unreachable'],
  [{ response: '452 Daily sending limit exceeded' }, 429, 'email_limit_reached'],
  [{ code: 'EENVELOPE' }, 422, 'email_address_refused'],
  [{ responseCode: 550 }, 422, 'email_address_refused'],
  [{ responseCode: 554 }, 502, 'email_refused'],
  [{ message: 'something else' }, 502, 'email_failed'],
];

for (const [error, status, code] of cases) {
  const failure = describeEmailFailure(error, 'a@test.local');
  assert.equal(failure.status, status, JSON.stringify(error));
  assert.equal(failure.code, code, JSON.stringify(error));
  assert.ok(failure.message && failure.reason, 'a message and a reason');
}

// Nothing that identifies the mail server reaches the person.
const leak = describeEmailFailure({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED smtp.internal:587' });
assert.ok(!leak.message.includes('smtp.internal'));
assert.ok(!leak.reason.includes('smtp.internal'));

console.log('emailFailure: ok');
