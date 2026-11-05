/**
 * Pieces of zod schemas that several routers share.
 *
 * An optional text field is trimmed and an empty one becomes null, so "clear this field" and
 * "there was never anything here" are the same thing in the database. `undefined` stays `undefined`,
 * which is what lets a PATCH leave a field alone.
 */
import { and, sql } from 'drizzle-orm';
import { z } from 'zod';

export const requiredText = (max, message = 'This field is required') =>
  z.string({ error: message }).trim().min(1, message).max(max, `At most ${max} characters`);

export const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .nullish()
    .transform((value) => (value === undefined ? undefined : value || null));

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .nullish()
  .refine((value) => !value || z.email().safeParse(value).success, 'Invalid email')
  .transform((value) => (value === undefined ? undefined : value || null));

export const uuid = z.uuid('Invalid id');

/** An amount of money: at most 2 decimals are kept. */
export const money = z
  .number('Enter a number')
  .min(0, 'Cannot be negative')
  .max(1_000_000, 'Too large')
  .transform((value) => Math.round(value * 100) / 100)
  .nullable();

/** The key of a change that is not harmless when repeated: the phone makes it up, and the server writes it with the change (see utils/operations.js). */
export const opId = z.uuid({ error: 'Send an op_id: a UUID that makes a repeat of this request harmless' });

/** The most a stock can hold: what a change by an amount stops at, as setting it outright does. */
export const MAX_STOCK = 100_000;

/** By how much a stock changes: more, or (negative) less. Zero is allowed and changes nothing. */
export const stockDelta = z.number('Enter a number').min(-MAX_STOCK, 'Too large').max(MAX_STOCK, 'Too large');

/** How many sets of a string are in stock: whole or half, since a hybrid takes half a set of each of its two strings. */
export const setsInStock = z
  .number('Enter a number')
  .min(0, 'Cannot be negative')
  .max(MAX_STOCK, 'Too large')
  .refine((value) => Number.isInteger(value * 2), 'Use whole or half sets');

/** How many rackets of a model are in stock. */
export const racketsInStock = z
  .number('Enter a number')
  .int('Use a whole number')
  .min(0, 'Cannot be negative')
  .max(MAX_STOCK, 'Too large');

/** A flag of a list route, `?name=1` or `?name=true`. */
export const flagQuery = z.enum(['1', 'true']).optional();

/** `?in_stock=1` of a list route: only what is available. */
export const inStockQuery = flagQuery;

/** The moment something happened on the phone, which may be a while before the request: ISO 8601, with a `Z` or an offset. */
export const momentAt = z.iso.datetime({ offset: true, error: 'Invalid date and time' }).optional();

/** A calendar date, YYYY-MM-DD. */
export const isoDate = z.iso.date('Invalid date');

/** A time of day, HH:MM. */
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time');

/** Tension in kilograms, which is how it is stored. */
export const tensionKg = z
  .number('Enter a number')
  .min(5, 'Tension is too low')
  .max(60, 'Tension is too high')
  .transform((value) => Math.round(value * 10000) / 10000)
  .nullable();

/** A comma-free search text, trimmed. */
export const searchText = z.string().trim().max(100).optional();

/** Turns a user's search text into a pattern for ILIKE that matches it literally. */
export const likePattern = (text) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

/**
 * "wil pro" finds "Wilson Pro Staff": every word of the search has to appear somewhere in the
 * text, in any order. `haystack` is an SQL expression for the text to look in.
 */
export function matchesWords(haystack, text) {
  const words = text.split(/\s+/).filter(Boolean);
  return and(...words.map((word) => sql`${haystack} ilike ${likePattern(word)}`));
}

/** `?q=` of a list route. */
export const searchQuery = z.object({ q: searchText });
