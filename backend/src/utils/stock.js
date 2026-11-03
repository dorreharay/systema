/**
 * The stock of the catalog: what an order takes out of it, and how that is given back.
 *
 * Only an item with `track_stock` on is counted; the others are always available and nothing is taken from them. An
 * order takes one racket (a catalog racket, one with no owner) and one set of its string, or half a set of each string
 * of a hybrid; strings the customer brings take nothing. What was taken is kept on the order (`stock_used`), so that
 * deleting or changing it gives back exactly that, and an order made before the stock was counted gives back nothing.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { catalogStrings, rackets } from '../db/schema.js';
import { HttpError } from './http.js';

const tableOf = (kind) => (kind === 'racket' ? rackets : catalogStrings);

/**
 * What an order wants from the stock: `[{ kind, id, qty, field }]`, one entry for each item (`field` is the field of
 * the order that points at it). `catalogRacketId` is the racket when it is a catalog racket, and null when it is a
 * client's.
 */
export function stockWanted({ catalogRacketId, customer_strings, hybrid, main_string_id, cross_string_id }) {
  const wanted = new Map();
  const want = (kind, id, qty, field) => {
    if (!id) return;
    const key = `${kind}:${id}`;
    const entry = wanted.get(key);
    wanted.set(key, { kind, id, field: entry?.field ?? field, qty: (entry?.qty ?? 0) + qty });
  };

  want('racket', catalogRacketId, 1, 'racket_id');
  if (!customer_strings) {
    want('string', main_string_id, hybrid ? 0.5 : 1, 'main_string_id');
    if (hybrid) want('string', cross_string_id, 0.5, 'cross_string_id');
  }
  // The same order of items everywhere: two orders that take the same things never wait for each other in a circle.
  return [...wanted.values()].sort((a, b) => (`${a.kind}:${a.id}` < `${b.kind}:${b.id}` ? -1 : 1));
}

const outOfStock = (field, name) =>
  new HttpError(409, `Not enough in stock: ${name}`, { code: 'out_of_stock', fields: { [field]: 'Not enough in stock' } });

/**
 * Takes what an order wants out of the stock, inside the transaction `tx`, and answers with what was taken: only the
 * items that are counted. A counted item that has too little makes the whole order fail, and with it everything taken.
 */
export async function takeStock(tx, userId, wanted) {
  const taken = [];
  for (const { kind, id, qty, field } of wanted) {
    const table = tableOf(kind);
    // One statement checks and takes, so two orders at once cannot both take the last one.
    const [row] = await tx
      .update(table)
      .set({ stock: sql`${table.stock} - ${qty}` })
      .where(and(eq(table.id, id), eq(table.user_id, userId), eq(table.track_stock, true), gte(table.stock, qty)))
      .returning({ id: table.id });
    if (row) {
      taken.push({ kind, id, qty });
      continue;
    }

    const [item] = await tx
      .select({ track_stock: table.track_stock, brand: table.brand, model: table.model })
      .from(table)
      .where(and(eq(table.id, id), eq(table.user_id, userId)))
      .limit(1);
    // Not counted: there is nothing to take. Counted, and not enough: the order cannot be made.
    if (item?.track_stock) throw outOfStock(field, `${item.brand} ${item.model}`);
  }
  return taken;
}

/** Puts back what an order took (`stock_used`), even into an item that is no longer counted or has been removed. */
export async function giveBackStock(tx, userId, used) {
  for (const { kind, id, qty } of used ?? []) {
    const table = tableOf(kind);
    await tx
      .update(table)
      .set({ stock: sql`${table.stock} + ${qty}` })
      .where(and(eq(table.id, id), eq(table.user_id, userId)));
  }
}
