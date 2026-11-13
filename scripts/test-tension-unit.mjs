// Tests of the tension unit that is offered for a country (src/lib/choices.ts), in plain Node:
//
//   node scripts/test-tension-unit.mjs
//
// The setup screen offers the unit that is usual for the country that the person works in, and kilograms where the app knows nothing of it.
import './register-ts.mjs';

import assert from 'node:assert/strict';

const { LBS_COUNTRIES, tensionUnitOfCountry } = await import('../src/lib/choices.ts');
const { COUNTRY_ZONES } = await import('../src/lib/country-zones.ts');

// Every country of the list is one that the person can choose in the app, and is listed once.
for (const country of LBS_COUNTRIES) {
  assert.ok(country in COUNTRY_ZONES, `${country} is in the list of pounds but the app has no such country`);
}
assert.equal(new Set(LBS_COUNTRIES).size, LBS_COUNTRIES.length, 'a country is listed twice');

// Pounds where they are the usual unit.
for (const country of LBS_COUNTRIES) {
  assert.equal(tensionUnitOfCountry(country), 'lbs', `${country} is offered pounds`);
}
for (const country of ['US', 'CA', 'GB', 'JP', 'KR', 'CN', 'BR', 'MX']) {
  assert.ok(LBS_COUNTRIES.includes(country), `${country} is expected to be in the list of pounds`);
}

// Kilograms everywhere else the app offers.
for (const country of ['UA', 'PL', 'DE', 'FR', 'IT', 'ES', 'PT', 'NL', 'CZ', 'SE', 'TR', 'IN', 'AU', 'NZ']) {
  assert.equal(tensionUnitOfCountry(country), 'kg', `${country} is offered kilograms`);
}

// A place that is not known, or has no data, is offered kilograms; a code is matched as it is (upper case).
for (const country of ['ZZ', '', 'us']) {
  assert.equal(tensionUnitOfCountry(country), 'kg', `${JSON.stringify(country)} is offered kilograms`);
}
assert.equal(tensionUnitOfCountry(undefined), 'kg', 'no country');
assert.equal(tensionUnitOfCountry(null), 'kg', 'a country that is null');

console.log('tension unit: ok');
