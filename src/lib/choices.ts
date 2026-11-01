// Currencies and time zones to choose from. Short lists of the ones people actually use; a currency is
// shown by its code and symbol, a time zone by its city.

export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'UAH', 'PLN', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK',
  'CZK', 'HUF', 'RON', 'TRY', 'JPY', 'CNY', 'INR', 'BRL', 'MXN', 'ZAR', 'AED',
];

export const TIME_ZONES = [
  'UTC',
  'Europe/Kyiv', 'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Rome', 'Europe/Zurich', 'Europe/Vienna', 'Europe/Prague',
  'Europe/Warsaw', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Helsinki',
  'Europe/Athens', 'Europe/Bucharest', 'Europe/Istanbul', 'Europe/Moscow',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix',
  'America/Anchorage', 'America/Toronto', 'America/Vancouver', 'America/Mexico_City',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Bogota',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo',
  'Asia/Seoul', 'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
];

/** The time zone this device is set to, or UTC when it cannot tell. */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "Europe/Kyiv" -> "Kyiv"; "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
export const timeZoneLabel = (zone: string) =>
  zone === 'UTC' ? 'UTC' : `${zone.split('/').slice(-1)[0].replace(/_/g, ' ')} (${zone.split('/')[0]})`;
