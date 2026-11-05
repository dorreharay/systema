import { getName, registerLocale } from 'i18n-iso-countries';
import de from 'i18n-iso-countries/langs/de.json';
import en from 'i18n-iso-countries/langs/en.json';
import es from 'i18n-iso-countries/langs/es.json';
import fr from 'i18n-iso-countries/langs/fr.json';
import it from 'i18n-iso-countries/langs/it.json';
import ja from 'i18n-iso-countries/langs/ja.json';
import pl from 'i18n-iso-countries/langs/pl.json';
import pt from 'i18n-iso-countries/langs/pt.json';
import uk from 'i18n-iso-countries/langs/uk.json';

import type { Language } from './i18n';
import { deviceTimeZone } from './choices';
import { COUNTRY_ZONES } from './country-zones';

// The country is the one thing a person says about where they work. The time zone follows from it (a country with several offers
// them), and so do the messengers to offer (see messengers.ts). Only the time zone is kept in the account: every zone belongs to
// exactly one country, so the country is read back from it.

[de, en, es, fr, it, ja, pl, pt, uk].forEach(registerLocale);

/** The name of a country (ISO 3166-1 alpha-2 code) in the language of the app; English where a language lacks it. */
export const countryName = (code: string, language: Language) => getName(code, language) ?? getName(code, 'en') ?? code;

/** Every country that has a time zone, by its name in the language of the app. */
export function countryList(language: Language) {
  return Object.keys(COUNTRY_ZONES)
    .map((code) => ({ code, name: countryName(code, language) }))
    .sort((a, b) => a.name.localeCompare(b.name, language))
    .map((country) => country.code);
}

// The zones a country with several offers, from west to east: the ones people live and work in. The tz database has more
// (twenty-nine in the United States) that differ in the history of their clocks, not in what time it is now. Every other country
// has just one zone, the first of its list.
const ZONE_CHOICES: Record<string, readonly string[]> = {
  US: [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
    'Pacific/Honolulu',
  ],
  CA: [
    'America/Vancouver', 'America/Edmonton', 'America/Regina', 'America/Winnipeg', 'America/Toronto', 'America/Halifax',
    'America/St_Johns',
  ],
  MX: ['America/Tijuana', 'America/Hermosillo', 'America/Mazatlan', 'America/Mexico_City', 'America/Cancun'],
  BR: ['America/Rio_Branco', 'America/Manaus', 'America/Sao_Paulo', 'America/Noronha'],
  AU: ['Australia/Perth', 'Australia/Darwin', 'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Sydney'],
  RU: [
    'Europe/Kaliningrad', 'Europe/Moscow', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk',
    'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka',
  ],
  ID: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'],
  PT: ['Europe/Lisbon', 'Atlantic/Azores'],
  ES: ['Europe/Madrid', 'Atlantic/Canary'],
};

// The zone a country starts with where it is not the first of its choices (or of the tz database's list: Crimea comes before Kyiv).
const MAIN_ZONE: Record<string, string> = {
  CA: 'America/Toronto',
  BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City',
  AU: 'Australia/Sydney',
  RU: 'Europe/Moscow',
  UA: 'Europe/Kyiv',
  UZ: 'Asia/Tashkent',
};

// Names that were changed in the tz database and that a phone may still give, and what they are called now.
const ZONE_ALIASES: Record<string, string> = {
  'Europe/Kiev': 'Europe/Kyiv',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Belfast': 'Europe/London',
};

/** The name a time zone has now: a phone may still give "Europe/Kiev" for "Europe/Kyiv". */
export const canonicalZone = (zone: string) => ZONE_ALIASES[zone] ?? zone;

let countryByZone: Map<string, string> | undefined;

/** The country a time zone is in; nothing for UTC, or for a name that is not a zone of a country. */
export function countryOfZone(zone: string | null | undefined) {
  if (!zone) return undefined;
  if (!countryByZone) {
    countryByZone = new Map();
    for (const [country, zones] of Object.entries(COUNTRY_ZONES)) {
      for (const name of zones) countryByZone.set(name, country);
    }
  }
  return countryByZone.get(canonicalZone(zone));
}

/** The country the phone is set to, by its time zone. */
export const deviceCountry = () => countryOfZone(deviceTimeZone());

/** The country of an account: the one its time zone is in, or the phone's while the account has only UTC (it has not been set up). */
export const countryOfAccount = (zone: string | null | undefined) => countryOfZone(zone) ?? deviceCountry();

/** The time zones to choose from in a country: one for most, several for the large ones. */
export function zoneChoices(country: string): readonly string[] {
  const choices = ZONE_CHOICES[country];
  if (choices) return choices;
  const zone = MAIN_ZONE[country] ?? COUNTRY_ZONES[country]?.[0];
  return zone ? [zone] : [];
}

/**
 * The time zone to set when a country is chosen: the one the account has, if it is in that country (nothing to change); else the
 * phone's, if the phone is in that country; else the main zone of the country.
 */
export function zoneForCountry(country: string, current?: string | null) {
  const own = current ? canonicalZone(current) : undefined;
  if (own && countryOfZone(own) === country) return own;
  const device = canonicalZone(deviceTimeZone());
  if (countryOfZone(device) === country) return device;
  return MAIN_ZONE[country] ?? zoneChoices(country)[0] ?? 'UTC';
}
