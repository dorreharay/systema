import assert from 'node:assert/strict';
import { describeEmailFailure } from '../../src/utils/emailFailure.js';
import { sendWithResend } from '../../src/utils/resend.js';

const KEY = 're_secret_key_123';
const email = { apiKey: KEY, apiUrl: 'https://resend.test', from: '"re:string" <noreply@mail.test>', to: 'a@test.local', subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' };

/** A fetch that answers with `status` and `body`, and remembers what it was asked. */
function fakeFetch(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetchImpl, calls };
}

// What is sent: where, how, and with what.
{
  const { fetchImpl, calls } = fakeFetch(200, { id: 'email-1' });
  assert.equal(await sendWithResend(email, fetchImpl), 'email-1', 'the id of the email');
  const [{ url, init }] = calls;
  assert.equal(url, 'https://resend.test/emails');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.authorization, `Bearer ${KEY}`);
  assert.equal(init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { from: email.from, to: ['a@test.local'], subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' });
}
{
  const { fetchImpl, calls } = fakeFetch(200, { id: 'email-2' });
  await sendWithResend({ ...email, html: undefined }, fetchImpl);
  assert.ok(!('html' in JSON.parse(calls[0].init.body)), 'no html, none sent');
}

// What a refusal turns into, said the way an SMTP failure is.
const failureOf = async (status, body) => {
  const { fetchImpl } = fakeFetch(status, body);
  try {
    await sendWithResend(email, fetchImpl);
  } catch (error) {
    return { error, said: describeEmailFailure(error, email.to) };
  }
  throw new Error(`${status} was not a failure`);
};
const cases = [
  [401, { name: 'validation_error', message: 'API key is invalid' }, 'email_account_rejected'],
  [403, { name: 'validation_error', message: 'The mail.test domain is not verified' }, 'email_account_rejected'],
  [429, { name: 'daily_quota_exceeded', message: 'You have exceeded your daily email sending quota.' }, 'email_limit_reached'],
  [429, { name: 'rate_limit_exceeded', message: 'Too many requests. Please limit the number of requests per second.' }, 'email_limit_reached'],
  [422, { name: 'validation_error', message: 'Invalid `to` field' }, 'email_refused'],
  [400, { name: 'validation_error', message: 'Missing `subject` field' }, 'email_refused'],
  [500, { name: 'application_error', message: 'An unexpected error occurred.' }, 'email_refused'],
  [502, undefined, 'email_refused'],
];
for (const [status, body, code] of cases) {
  const { error, said } = await failureOf(status, body);
  assert.equal(said.code, code, `${status} ${JSON.stringify(body)}`);
  assert.ok(!error.message.includes(KEY), 'the key is not in the error');
}

// A service that cannot be reached, or does not answer in time.
for (const [name, message] of [['TypeError', 'fetch failed'], ['TimeoutError', 'The operation timed out']]) {
  const down = async () => {
    throw Object.assign(new Error(message), { name });
  };
  await assert.rejects(
    () => sendWithResend(email, down),
    (error) => {
      assert.equal(describeEmailFailure(error, email.to).code, 'email_unreachable', name);
      assert.ok(!error.message.includes(KEY));
      return true;
    }
  );
}

console.log('resend: ok');
