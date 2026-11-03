import assert from 'node:assert/strict';
import { STRING_TYPES } from '../../src/db/schema.js';
import { rackets, strings } from '../../src/utils/reference.js';
import { STARTER_RACKETS, STARTER_STRINGS } from '../../src/utils/starter.js';

// There is a catalog to start from.
assert.ok(STARTER_RACKETS.length >= 50, `rackets: ${STARTER_RACKETS.length}`);
assert.ok(STARTER_STRINGS.length >= 50, `strings: ${STARTER_STRINGS.length}`);

// Every racket is one of the reference list, in its spelling, and is there once.
const referenceRackets = new Set(rackets.items.map((item) => `${item.brand} ${item.model}`));
for (const racket of STARTER_RACKETS) {
  assert.deepEqual(Object.keys(racket).sort(), ['brand', 'model'], 'what is stored of a racket');
  assert.ok(referenceRackets.has(`${racket.brand} ${racket.model}`), `${racket.brand} ${racket.model} is a racket of the list`);
}
assert.equal(new Set(STARTER_RACKETS.map((racket) => `${racket.brand} ${racket.model}`)).size, STARTER_RACKETS.length);

// So is every string, with the type the list gives it, and a size the list knows, written the way the app writes it.
const referenceStrings = new Map(strings.items.map((item) => [`${item.brand} ${item.model}`, item]));
for (const string of STARTER_STRINGS) {
  assert.deepEqual(Object.keys(string).sort(), ['brand', 'gauge', 'model', 'type'], 'what is stored of a string');
  const item = referenceStrings.get(`${string.brand} ${string.model}`);
  assert.ok(item, `${string.brand} ${string.model} is a string of the list`);
  assert.ok(STRING_TYPES.includes(string.type), `${string.model}: a type of the app`);
  assert.equal(string.type, item.type, `${string.model}: the type of the list`);
  if (string.gauge !== null) {
    assert.match(string.gauge, /^\d\.\d{2} mm$/, `${string.model}: how a size is written`);
    assert.ok(item.gauges.includes(string.gauge.replace(' mm', '')), `${string.model}: a size of the list`);
  }
}
const stringKeys = STARTER_STRINGS.map((string) => `${string.brand} ${string.model} ${string.gauge}`);
assert.equal(new Set(stringKeys).size, stringKeys.length, 'a string is there once for each size');

// A model in more than one size is in the catalog once for each of them.
assert.deepEqual(
  STARTER_STRINGS.filter((string) => string.model === 'ALU Power').map((string) => string.gauge),
  ['1.25 mm', '1.30 mm']
);
// And one with no known size has none.
assert.equal(STARTER_STRINGS.find((string) => string.model === 'Sensation').gauge, null);

// What is left of the reference list is still there to be offered when something is typed.
assert.ok(rackets.items.length > STARTER_RACKETS.length && strings.items.length > STARTER_STRINGS.length);

console.log('starter: ok');
