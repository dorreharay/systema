/**
 * Sends one email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 *
 * It is for a host that lets the server open no SMTP connection (Railway's Hobby plan). A failure is thrown the way
 * nodemailer reports one (`code`, `responseCode`, `response`), so that describeEmailFailure turns it into words in the same
 * way as it does for SMTP. Nothing of the key is in what is thrown.
 */

const TIMEOUT_MS = 10_000;

/** Returns the id Resend gave the email. `fetchImpl` is for a test. */
export async function sendWithResend({ apiKey, apiUrl, from, to, subject, text, html }, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${apiUrl}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, ...(html && { html }) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw Object.assign(new Error(`Resend could not be reached: ${error?.message}`), {
      code: timedOut ? 'ETIMEDOUT' : 'ESOCKET',
    });
  }

  const body = await response.json().catch(() => ({}));
  if (response.ok) return body.id;
  throw failureOf(response.status, body);
}

/** Resend's answer to a refused email as an error that describeEmailFailure understands. */
function failureOf(status, body) {
  const message = body?.message ?? `answered ${status}`;
  const error = new Error(`Resend: ${message}`);
  // What describeEmailFailure reads the text of a limit from.
  error.response = `${status} ${message}`;
  if (status === 401 || status === 403) {
    // The key is wrong, not allowed to send, or suspended; or the domain of the sender is not verified. Nothing the person
    // who pressed the button can do anything about.
    error.code = 'EAUTH';
  } else if (status >= 400 && status < 429) {
    // The email itself was refused (a field that is wrong): 554 is SMTP's "transaction failed".
    error.responseCode = 554;
  } else if (status >= 500) {
    error.responseCode = status;
  }
  // 429: its own message says the quota or the rate that was reached, which describeEmailFailure recognises.
  return error;
}
