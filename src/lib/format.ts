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

// How each language writes numbers and money (Portuguese is the Brazilian one, as the texts are).
const LOCALES: Record<Language, string> = {
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-BR',
  ja: 'ja-JP',
  uk: 'uk-UA',
  pl: 'pl-PL',
};

export function formatMoney(amount: number | null, currency: string, language: Language) {
  if (amount === null) return '—';
  try {
    return new Intl.NumberFormat(LOCALES[language], { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** A total without the cents, for the big numbers: "$1,040". */
export function formatMoneyWhole(amount: number, currency: string, language: Language) {
  try {
    return new Intl.NumberFormat(LOCALES[language], {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
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

// The names are written out, not asked of Intl: Hermes on iOS does not always know them, and the calendar needs the same names
// everywhere. Japanese names a month by its number.
const JA_MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

export const MONTHS_SHORT: Record<Language, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
  pt: ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'],
  ja: JA_MONTHS,
  uk: ['січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.'],
  pl: ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'],
};

export const MONTHS_LONG: Record<Language, string[]> = {
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  de: [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ],
  fr: [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ],
  es: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ],
  it: [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
  ],
  pt: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ],
  ja: JA_MONTHS,
  uk: [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
  ],
  pl: [
    'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
  ],
};

// The week starts on Monday.
export const WEEKDAYS_SHORT: Record<Language, string[]> = {
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  fr: ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'],
  es: ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'],
  it: ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'],
  pt: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
  ja: ['月', '火', '水', '木', '金', '土', '日'],
  uk: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
  pl: ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'],
};

/**
 * "12 Mar", or "12 Mar 2027" when it is not this year: in the order and with the marks of the language ("12. Nov.", and in
 * Japanese "11月12日", "2027年11月12日").
 */
export function formatDate(iso: string, language: Language, today = todayIso()) {
  const { year, month, day } = parseIso(iso);
  const thisYear = year === parseIso(today).year;
  const name = MONTHS_SHORT[language][month - 1];
  if (language === 'ja') return `${thisYear ? '' : `${year}年`}${name}${day}日`;
  const text = language === 'de' ? `${day}. ${name}` : `${day} ${name}`;
  return thisYear ? text : `${text} ${year}`;
}

/** "November 2026", and in Japanese "2026年11月". `month` is 1 to 12. */
export const formatMonthYear = (month: number, year: number, language: Language) =>
  language === 'ja' ? `${year}年${month}月` : `${MONTHS_LONG[language][month - 1]} ${year}`;

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

/** A moment as the time of day when it was today ("14:05"), and with its date otherwise ("12 Nov, 14:05"), in the stringer's time zone. */
export function formatMoment(value: string, language: Language, timeZone?: string) {
  const date = new Date(value);
  let time: string;
  try {
    time = new Intl.DateTimeFormat(LOCALES[language], { hour: '2-digit', minute: '2-digit', timeZone }).format(date);
  } catch {
    time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const day = formatTimestamp(value, language, timeZone);
  const today = todayIso(timeZone);
  return day === formatDate(today, language, today) ? time : `${day}, ${time}`;
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

/** "#12", or "#—" for an order that has no number yet: the server gives the numbers, once the order has been sent. */
export const orderNumber = (number: number | null) => (number === null ? '#—' : `#${number}`);

/**
 * What was typed into a search for a client, as the start of a new one: digits with only what goes with them in a phone
 * number (a plus, spaces, brackets, dashes) are a phone, anything with a letter in it (and digits with the letters) is a
 * name, and a few symbols alone are neither.
 */
export function clientFromSearch(search: string | undefined): { name?: string; phone?: string } {
  const text = search?.trim();
  if (!text) return {};
  if (/\p{L}/u.test(text)) return { name: text };
  return /\d/.test(text) ? { phone: text } : {};
}
