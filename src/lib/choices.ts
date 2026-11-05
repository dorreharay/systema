// Currencies to choose from: a short list of the ones people actually use, shown by code and symbol. The time zone is not
// chosen from a list of its own: it follows from the country (see countries.ts).

export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'UAH', 'PLN', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK',
  'CZK', 'HUF', 'RON', 'TRY', 'JPY', 'CNY', 'INR', 'BRL', 'MXN', 'ZAR', 'AED',
];

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
