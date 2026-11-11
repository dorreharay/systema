// Tests of the currency that is offered for a country (src/lib/choices.ts), in plain Node:
//
//   node scripts/test-currency.mjs
//
// The setup screen offers the currency of the country that the person works in, and US dollars where the app has none for it.
import './register-ts.mjs';

import assert from 'node:assert/strict';

const { CURRENCIES, CURRENCY_COUNTRIES, currencyOfCountry } = await import('../src/lib/choices.ts');
const { COUNTRY_ZONES } = await import('../src/lib/country-zones.ts');

// The table and the list of currencies agree: nothing is offered that the app cannot show, and no currency is left without a country.
for (const code of Object.keys(CURRENCY_COUNTRIES)) {
  assert.ok(CURRENCIES.includes(code), `${code} has countries in the table but is not in CURRENCIES`);
}
for (const code of CURRENCIES.filter((currency) => currency !== 'USD')) {
  assert.ok(CURRENCY_COUNTRIES[code]?.length, `${code} is in CURRENCIES but no country is given it`);
  assert.ok(
    CURRENCY_COUNTRIES[code].some((country) => country in COUNTRY_ZONES),
    `${code} has no country that the person can choose in the app`
  );
}

// A country has one currency.
const owner = new Map();
for (const [code, countries] of Object.entries(CURRENCY_COUNTRIES)) {
  for (const country of countries) {
    assert.ok(!owner.has(country), `${country} is given ${owner.get(country)} and ${code}`);
    owner.set(country, code);
  }
}

// Every country the app lets a person choose gets a currency that the app offers.
for (const country of Object.keys(COUNTRY_ZONES)) {
  assert.ok(CURRENCIES.includes(currencyOfCountry(country)), `${country} is offered a currency the app does not have`);
}

// The countries of the app's own currencies
const expected = {
  UA: 'UAH', PL: 'PLN', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR', NL: 'EUR', IE: 'EUR', GR: 'EUR', HR: 'EUR', BG: 'EUR',
  GB: 'GBP', CA: 'CAD', AU: 'AUD', CH: 'CHF', LI: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', CZ: 'CZK', HU: 'HUF', RO: 'RON', TR: 'TRY',
  JP: 'JPY', CN: 'CNY', IN: 'INR', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', AE: 'AED', US: 'USD',
};
for (const [country, currency] of Object.entries(expected)) {
  assert.equal(currencyOfCountry(country), currency, `${country} is offered ${currency}`);
}

// A country the app has no money for, and a place that is not known, are offered US dollars.
for (const country of ['AR', 'KR', 'RU', 'IL', 'TH', 'HK', 'NZ', 'EG', 'ZZ', '', 'ua']) {
  assert.equal(currencyOfCountry(country), 'USD', `${JSON.stringify(country)} is offered US dollars`);
}
assert.equal(currencyOfCountry(undefined), 'USD', 'no country');
assert.equal(currencyOfCountry(null), 'USD', 'a country that is null');

console.log('currency: ok');
