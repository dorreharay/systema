import { config } from '../config.js';
import { LOGO_SVG } from './brand.js';
import { LANGUAGES, fill, messagesFor } from './messages/index.js';

// A token is made of letters, digits, "-" and "_" (see tokens.js). Anything else is not one and is not put into a page.
const TOKEN = /^[\w-]{16,128}$/;

/** Where a visitor who typed the domain of the server (myrestring.com) is sent: the website. */
export const SITE_URL = 'https://tryrestring.com/';

const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// The look of the page: the colours of the website and the app, light and dark, with the card in the middle.
const STYLE = `:root{color-scheme:light dark;--bg:#f4f5f6;--card:#fff;--ink:#12171c;--muted:#667085;--brand:#173c32;--on-brand:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0b1210;--card:#12171c;--ink:#e6efeb;--muted:#9aa5a0;--brand:#e6efeb;--on-brand:#0b1210}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{width:100%;max-width:400px;padding:36px 28px;border-radius:24px;background:var(--card);text-align:center}
.logo{display:block;width:auto;height:28px;margin:0 auto 28px;color:var(--brand)}
h1{margin:0 0 8px;font-size:22px;line-height:1.3}
p{margin:0 0 24px;color:var(--muted)}
.button{display:block;padding:16px 24px;border-radius:16px;background:var(--brand);color:var(--on-brand);font-weight:600;text-decoration:none}
.hint{margin:20px 0 0;font-size:14px}`;

/**
 * The page behind the link in a password reset email. Mail clients do not make the app's own address (`systema://…`) a link,
 * so the email holds an https address, and this page hands the token on to the app: it tries to open it by itself and has a
 * button for when that is not allowed. It has no script, which the server's content security policy would not allow, and it
 * speaks the language of the visitor (`language`, one of the app's; Ukrainian otherwise, see messages/). A `token` that is not one gets a page
 * that says the link does not work, with nothing of what was sent.
 */
export function resetPasswordPage(token, language = 'uk') {
  const valid = typeof token === 'string' && TOKEN.test(token);
  const lang = LANGUAGES.includes(language) ? language : 'uk';
  const text = messagesFor(lang).page;
  const link = valid ? `${config.appScheme}://reset-password?token=${encodeURIComponent(token)}` : null;
  const name = escapeHtml(config.appName);
  const say = (key) => fill(escapeHtml(text[key]), { name });

  const content = valid
    ? `<h1>${say('opening')}</h1>
<p>${say('explain')}</p>
<a class="button" href="${escapeHtml(link)}">${say('open')}</a>
<p class="hint">${say('hint')}</p>`
    : `<h1>${say('brokenTitle')}</h1>
<p>${say('broken')}</p>`;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${name}</title>
${valid ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(link)}">` : ''}
<style>
${STYLE}
</style>
</head>
<body>
<main>
${LOGO_SVG}
${content}
</main>
</body>
</html>
`;
}
