import type { Language } from '@/lib/i18n';
import type { Order, TensionUnit } from '@/lib/types';

const LBS_PER_KG = 2.2046226218;

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** 24 -> "24", 24.5 -> "24.5", 24.04 -> "24". */
export function formatNumber(value: number, maxDecimals = 1) {
  return String(round(value, maxDecimals));
}

// --- Tension ---------------------------------------------------------------------------------
// Tension is stored in kilograms. The unit in Settings only changes how it is shown and typed.

export const kgToUnit = (kg: number, unit: TensionUnit) => (unit === 'lbs' ? kg * LBS_PER_KG : kg);

/** What the person typed, in their unit, as the kilograms that are stored. */
export const unitToKg = (value: number, unit: TensionUnit) =>
  round(unit === 'lbs' ? value / LBS_PER_KG : value, 4);

export const formatTension = (kg: number | null, unit: TensionUnit) =>
  kg === null ? '—' : `${formatNumber(kgToUnit(kg, unit))} ${unit}`;

/** "24 / 23 kg" when the crosses differ from the mains, "24 kg" otherwise. */
export function formatTensions(mains: number | null, crosses: number | null, unit: TensionUnit) {
  if (mains === null) return crosses === null ? '—' : formatTension(crosses, unit);
  if (crosses === null || round(crosses, 2) === round(mains, 2)) return formatTension(mains, unit);
  return `${formatNumber(kgToUnit(mains, unit))} / ${formatNumber(kgToUnit(crosses, unit))} ${unit}`;
}

/** The text a tension field starts with. */
export const tensionToInput = (kg: number | null, unit: TensionUnit) =>
  kg === null ? '' : formatNumber(kgToUnit(kg, unit));

/** A number typed by a person: a comma works as the decimal point. Null when it is empty or not a number. */
export function parseDecimal(text: string) {
  const value = text.trim().replace(',', '.');
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// --- Money -----------------------------------------------------------------------------------

const LOCALES: Record<Language, string> = { en: 'en-US', uk: 'uk-UA' };

export function formatMoney(amount: number | null, currency: string, language: Language) {
  if (amount === null) return '—';
  try {
    return new Intl.NumberFormat(LOCALES[language], { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// Hermes on iOS answers a "narrow symbol" with the bare code, so the common ones are written out.
const SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', UAH: '₴', PLN: 'zł', CAD: '$', AUD: '$', SEK: 'kr', NOK: 'kr',
  DKK: 'kr', CZK: 'Kč', HUF: 'Ft', RON: 'lei', TRY: '₺', JPY: '¥', CNY: '¥', INR: '₹', BRL: 'R$',
  MXN: '$', ZAR: 'R',
};

/** The symbol or code in front of a price field. */
export function currencySymbol(currency: string, language: Language) {
  if (SYMBOLS[currency]) return SYMBOLS[currency];
  try {
    const parts = new Intl.NumberFormat(LOCALES[language], {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

// --- Dates -----------------------------------------------------------------------------------
// A date is a calendar day written YYYY-MM-DD, never a moment: it reads the same in every time zone.

const pad = (value: number) => String(value).padStart(2, '0');

export const toIso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

export function parseIso(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

/** Today's date where the stringer works. */
export function todayIso(timeZone?: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const [year, month, day] = [part('year'), part('month'), part('day')];
    if (year && month && day) return toIso(year, month, day);
  } catch {
    // an unknown time zone: use the device's date
  }
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(iso: string, days: number) {
  const { year, month, day } = parseIso(iso);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string) {
  const a = parseIso(from);
  const b = parseIso(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** 0 is Monday. */
export function weekdayOf(iso: string) {
  const { year, month, day } = parseIso(iso);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const MONTHS_SHORT: Record<Language, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  uk: ['січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.'],
};

export const MONTHS_LONG: Record<Language, string[]> = {
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  uk: [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
  ],
};

export const WEEKDAYS_SHORT: Record<Language, string[]> = {
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  uk: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
};

/** "12 Mar", or "12 Mar 2027" when it is not this year. */
export function formatDate(iso: string, language: Language, today = todayIso()) {
  const { year, month, day } = parseIso(iso);
  const text = `${day} ${MONTHS_SHORT[language][month - 1]}`;
  return year === parseIso(today).year ? text : `${text} ${year}`;
}

/** A full timestamp (when an order was finished) as a date in the stringer's time zone. */
export function formatTimestamp(value: string, language: Language, timeZone?: string) {
  const date = new Date(value);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return formatDate(toIso(part('year'), part('month'), part('day')), language, todayIso(timeZone));
  } catch {
    return formatDate(toIso(date.getFullYear(), date.getMonth() + 1, date.getDate()), language);
  }
}

/** Work that is late: not finished by the day it was promised. A racket that is ready is done. */
export function isOverdue(order: Pick<Order, 'status' | 'due_date'>, today: string) {
  return (
    order.due_date !== null &&
    (order.status === 'received' || order.status === 'in_progress') &&
    order.due_date < today
  );
}

// --- Text ------------------------------------------------------------------------------------

export const racketName = (racket: { brand: string; model: string }) => `${racket.brand} ${racket.model}`;

export const orderNumber = (number: number) => `#${number}`;
