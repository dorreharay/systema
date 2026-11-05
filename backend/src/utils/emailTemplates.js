import { config } from '../config.js';
import { fill, messagesFor } from './messages/index.js';

const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * The email with the link to choose a new password, in the language of the account (`language`; English for one the server does
 * not know). `name` may be missing.
 */
export function passwordResetEmail({ name, url, minutes, language }) {
  const text = messagesFor(language).email;
  const greeting = name ? fill(text.greeting, { name }) : text.greetingAnonymous;
  const expiry = fill(text.expiry, { minutes });
  const lines = [greeting, '', text.instructionText, '', url, '', expiry];

  return {
    subject: fill(text.subject, { appName: config.appName }),
    text: lines.join('\n'),
    html: [
      '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">',
      `<p>${escapeHtml(greeting)}</p>`,
      `<p>${escapeHtml(text.instructionHtml)}</p>`,
      `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#173c32;color:#fff;text-decoration:none;font-weight:600">${escapeHtml(text.button)}</a></p>`,
      `<p style="color:#555">${escapeHtml(expiry)}</p>`,
      '</div>',
    ].join(''),
  };
}
