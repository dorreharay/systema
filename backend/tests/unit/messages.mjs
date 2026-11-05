import assert from 'node:assert/strict';
import { LANGUAGES, fill, messagesFor } from '../../src/utils/messages/index.js';

const english = messagesFor('en');
const words = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',');

// The languages of the app, as the app lists them.
assert.deepEqual(LANGUAGES, ['en', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'uk', 'pl']);

// Every language says everything English does, with the same {words} to fill in.
for (const language of LANGUAGES) {
  const messages = messagesFor(language);
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(english).sort(), `${language}: the same groups as English`);
  for (const group of Object.keys(english)) {
    assert.deepEqual(Object.keys(messages[group]).sort(), Object.keys(english[group]).sort(), `${language}.${group}: the same texts as English`);
    for (const [key, text] of Object.entries(english[group])) {
      const translated = messages[group][key];
      assert.ok(typeof translated === 'string' && translated.trim() !== '', `${language}.${group}.${key} is text`);
      assert.equal(words(translated), words(text), `${language}.${group}.${key} has the same {words} as English`);
    }
  }
}

// A language the server does not know is English; a {word} with no value stays as it is.
assert.equal(messagesFor('xx'), english);
assert.equal(messagesFor(undefined), english);
assert.equal(fill('Hi {name}, {minutes} min {other}', { name: 'Ann', minutes: 60 }), 'Hi Ann, 60 min {other}');

console.log('messages: ok');
