import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { describeEmailFailure } from './emailFailure.js';

let transporter;

const smtpConfigured = () => Boolean(config.smtp.host && config.smtp.user);

function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    // A mail server that does not answer must fail quickly. nodemailer's own defaults wait up to two
    // minutes, and the person who pressed the button is waiting for the answer.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return transporter;
}

/**
 * Sends one email. It throws if the mail server cannot be reached or refuses it, so use it where
 * the email *is* the job. An email that merely goes with an action is sent with
 * `sendEmailsBestEffort` instead.
 *
 * Without SMTP settings nothing is sent. While developing, the email is printed instead, with its
 * links, so a password reset can be tried without a mail server.
 */
export async function sendEmail({ to, subject, text, html }) {
  if (!smtpConfigured()) {
    if (config.isProduction) {
      console.warn(`[email] Not sent, SMTP is not configured. To: ${to}, Subject: ${subject}`);
    } else {
      console.log(`[email] Not sent, SMTP is not configured. To: ${to}\n  Subject: ${subject}\n\n${text}\n`);
    }
    return;
  }

  await getTransporter().sendMail({
    from: `"${config.smtp.fromName}" <${config.smtp.fromAddress}>`,
    to,
    subject,
    text,
    ...(html && { html }),
  });
}

/**
 * Sends the emails that go with an action and never throws: the action has already happened, and an
 * email that could not be sent does not undo it. Returns `{ failed, reason }`: the addresses it could
 * not reach and, as a short phrase, why (see emailFailure.js).
 */
export async function sendEmailsBestEffort(emails) {
  const results = await Promise.allSettled(emails.map((email) => sendEmail(email)));
  const failed = [];
  let reason;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return;
    console.error(`[email] Could not send "${emails[index].subject}" to ${emails[index].to}: ${result.reason?.message}`);
    failed.push(emails[index].to);
    reason ??= describeEmailFailure(result.reason, emails[index].to).reason;
  });
  return { failed, reason };
}
