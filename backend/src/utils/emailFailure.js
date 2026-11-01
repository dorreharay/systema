/**
 * What went wrong with an email, in words the person who pressed the button can act on.
 *
 * nodemailer reports a failure as an error with a `code` ("ESOCKET", "EAUTH") and, when the mail
 * server answered, an SMTP `responseCode` ("550") and its `response` text. None of that means
 * anything to the person using the app, and some of it must not reach them (a host name, an
 * account). So each kind of failure is turned into:
 *
 *   status   the HTTP status to answer with
 *   code     for the app, which shows `message` whenever a `code` is present
 *   message  a sentence for the error message: what happened and what to do next
 *   reason   the same thing as a short phrase that completes "…could not be sent because ___", for
 *            the warning shown when the action worked and only its email did not
 *
 * Plain function, no nodemailer: see tests/unit/emailFailure.mjs.
 */

const UNREACHABLE = ['ESOCKET', 'ECONNECTION', 'EDNS', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ETLS'];
const LIMIT = /quota|rate limit|limit exceeded|too many|sending limit/i;

export function describeEmailFailure(err, to) {
  const code = err?.code;
  const reply = Number(err?.responseCode) || 0;
  const text = `${err?.response ?? ''} ${err?.message ?? ''}`;

  if (code === 'EAUTH' || [530, 534, 535].includes(reply)) {
    return {
      status: 502,
      code: 'email_account_rejected',
      message: 'The email server did not accept this application’s email account, so no email can be sent until that is fixed. Contact your administrator.',
      reason: 'the email server did not accept this application’s email account',
    };
  }

  if (UNREACHABLE.includes(code)) {
    return {
      status: 502,
      code: 'email_unreachable',
      message: 'The email server could not be reached, so the email was not sent. Try again in a moment; if it keeps happening, contact your administrator.',
      reason: 'the email server could not be reached',
    };
  }

  if (LIMIT.test(text) || reply === 452 || reply === 421) {
    return {
      status: 429,
      code: 'email_limit_reached',
      message: 'The email server’s sending limit has been reached, so the email was not sent. Try again later.',
      reason: 'the email server’s sending limit was reached',
    };
  }

  const refusedAddress = code === 'EENVELOPE' || [550, 551, 553].includes(reply);
  if (refusedAddress) {
    const who = to ? ` ${to}` : '';
    return {
      status: 422,
      code: 'email_address_refused',
      message: `The email server did not accept the address${who}, so the email was not sent. Check that it is spelled correctly.`,
      reason: 'the email server did not accept the address',
    };
  }

  if (reply >= 500) {
    return {
      status: 502,
      code: 'email_refused',
      message: 'The email server refused the message, so it was not sent. Try again; if it keeps happening, contact your administrator.',
      reason: 'the email server refused the message',
    };
  }

  return {
    status: 502,
    code: 'email_failed',
    message: 'The email could not be sent. Try again in a moment; if it keeps happening, contact your administrator.',
    reason: 'the email server reported a problem',
  };
}
