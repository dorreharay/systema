// Currencies to choose from: a short list of the ones people actually use, shown by code and symbol. The time zone is not
// chosen from a list of its own: it follows from the country (see countries.ts).

import type { TensionUnit } from './types';

export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'UAH', 'PLN', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK',
  'CZK', 'HUF', 'RON', 'TRY', 'JPY', 'CNY', 'INR', 'BRL', 'MXN', 'ZAR', 'AED',
];

// The countries (ISO 3166-1 alpha-2) that use each of the currencies above, USD apart: it is what a country that is not here is given.
// Only the currencies the app offers are here, so a country whose own money is not in the list (Argentina, Korea, Russia...) is offered
// US dollars, which is also the answer for the United States. A currency that is added to CURRENCIES needs its countries here:
// `node scripts/test-currency.mjs` says when one has none.
export const CURRENCY_COUNTRIES: Record<string, readonly string[]> = {
  EUR: [
    'AD', 'AT', 'AX', 'BE', 'BG', 'BL', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GF', 'GP', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MC',
    'ME', 'MF', 'MQ', 'MT', 'NL', 'PM', 'PT', 'RE', 'SI', 'SK', 'SM', 'TF', 'VA', 'XK', 'YT',
  ],
  GBP: ['GB', 'GG', 'GI', 'IM', 'JE'],
  UAH: ['UA'],
  PLN: ['PL'],
  CAD: ['CA'],
  AUD: ['AU', 'CC', 'CX', 'HM', 'KI', 'NF', 'NR', 'TV'],
  CHF: ['CH', 'LI'],
  SEK: ['SE'],
  NOK: ['BV', 'NO', 'SJ'],
  DKK: ['DK', 'FO', 'GL'],
  CZK: ['CZ'],
  HUF: ['HU'],
  RON: ['RO'],
  TRY: ['TR'],
  JPY: ['JP'],
  CNY: ['CN'],
  INR: ['IN'],
  BRL: ['BR'],
  MXN: ['MX'],
  ZAR: ['ZA'],
  AED: ['AE'],
};

const currencyByCountry = new Map<string, string>(
  Object.entries(CURRENCY_COUNTRIES).flatMap(([currency, countries]) => countries.map((country) => [country, currency] as const))
);

/**
 * The currency to offer to someone who works in this country (ISO 3166-1 alpha-2 code): the country's own when the app has it
 * (CURRENCIES), US dollars when it has not, and when the country is not known.
 */
export const currencyOfCountry = (country: string | null | undefined) => (country ? currencyByCountry.get(country) : undefined) ?? 'USD';

// The countries (ISO 3166-1 alpha-2) where the tension of a racket's strings is usually given in pounds. No country has an official unit for
// it, so this is the practice of the people who string rackets there: the United States, Canada and Britain, Japan, Korea, China, Taiwan and
// Hong Kong, the badminton countries of South-East Asia, Brazil and Mexico. Everywhere else, and where nothing is known about the country,
// it is kilograms. A country is added by adding its code here (`node scripts/test-tension-unit.mjs` checks the list).
export const LBS_COUNTRIES: readonly string[] = ['US', 'CA', 'GB', 'JP', 'KR', 'CN', 'TW', 'HK', 'SG', 'MY', 'TH', 'PH', 'BR', 'MX'];

const lbsCountries = new Set(LBS_COUNTRIES);

/** The unit to offer for the tension of strings to someone who works in this country: pounds where they are the usual one, kilograms elsewhere and when the country is not known. */
export const tensionUnitOfCountry = (country: string | null | undefined): TensionUnit => (country && lbsCountries.has(country) ? 'lbs' : 'kg');

/** The time zone this device is set to, or UTC when it cannot tell. */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** A time zone by its city: "America/New_York" -> "New York"; "UTC" stays as it is. */
export const timeZoneLabel = (zone: string) => zone.split('/').slice(-1)[0].replace(/_/g, ' ');
