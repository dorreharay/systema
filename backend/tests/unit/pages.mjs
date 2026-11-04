import assert from 'node:assert/strict';
import { SITE_URL, resetPasswordPage } from '../../src/utils/pages.js';

const token = 'Zk3_-aB9xY2mQ7pLwE5rT8uNcV1dHfGjK4sOiUyA6bX';

// A token: the page opens the app with it, by itself and with a button.
const page = resetPasswordPage(token);
const link = `systema://reset-password?token=${token}`;
assert.ok(page.includes(`<meta http-equiv="refresh" content="0;url=${link}">`), 'it tries to open the app at once');
assert.ok(page.includes(`href="${link}"`), 'and has a button for it');
assert.ok(!page.includes('<script'), 'no script: the content security policy would not allow it');
assert.ok(page.includes('no-referrer'), 'the token does not leave in a Referer');
assert.ok(page.includes('<svg class="logo"'), 'the page carries the wordmark');
assert.ok(page.includes('prefers-color-scheme:dark'), 'and has a dark look');

// The language: Ukrainian by default, English when asked, and nothing else (what is not a language of the app is Ukrainian).
assert.ok(page.includes('<html lang="uk">') && page.includes('Відкриваємо re:string'), 'Ukrainian by default');
const english = resetPasswordPage(token, 'en');
assert.ok(english.includes('<html lang="en">') && english.includes('Opening re:string'), 'English when asked');
assert.ok(!english.includes('Відкриваємо'), 'and then none of the Ukrainian');
assert.ok(resetPasswordPage(token, 'de').includes('<html lang="uk">'), 'any other language is Ukrainian');
assert.ok(english.includes(`href="${link}"`), 'the button is the same in both');

// Anything that is not a token gets the page that says so, with no link and nothing of what was sent in it.
const attack = '"><script>alert(1)</script>';
for (const bad of [undefined, '', 'short', ['a'.repeat(30), 'b'.repeat(30)], { token: 'x' }, attack, `${token}"onmouseover="x`, 'a'.repeat(300), 'tok en'.repeat(5)]) {
  for (const [language, says] of [['uk', 'не працює'], ['en', 'doesn’t work']]) {
    const refused = resetPasswordPage(bad, language);
    assert.ok(!refused.includes('systema://'), `no link for ${JSON.stringify(bad)}`);
    assert.ok(!refused.includes('http-equiv="refresh"'), 'and no redirect');
    assert.ok(!refused.includes('<script'), 'and nothing of what was sent');
    assert.ok(refused.includes(says), `it says the link does not work, in ${language}`);
  }
}

// Where someone who typed the domain of the server goes.
assert.equal(SITE_URL, 'https://tryrestring.com/');

console.log('pages: ok');
