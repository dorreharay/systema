import { config } from '../config.js';
import { catalogStrings, rackets, services } from '../db/schema.js';
import { STARTER_RACKETS, STARTER_STRINGS } from './starter.js';

/**
 * What a new stringer starts with: the services nearly everyone charges for, without prices (those
 * are theirs to set in Services & Pricing). `executor` is `db` or a transaction.
 */
export function createDefaultServices(executor, userId) {
  return executor.insert(services).values([
    { user_id: userId, name: 'Stringing Labor', kind: 'labor' },
    { user_id: userId, name: 'Grip Replacement' },
    { user_id: userId, name: 'Overgrip Installation' },
  ]);
}

/**
 * And a catalog of the rackets and strings that are in most workshops (see starter.js), every one counted and with
 * none in stock: it is there to be given a count when something comes in, not to be typed in. Off with
 * `STARTER_CATALOG=false`.
 */
export async function createStarterCatalog(executor, userId) {
  if (!config.starterCatalog) return;
  await executor
    .insert(rackets)
    .values(STARTER_RACKETS.map((racket) => ({ ...racket, user_id: userId, track_stock: true, stock: 0 })));
  await executor
    .insert(catalogStrings)
    .values(STARTER_STRINGS.map((string) => ({ ...string, user_id: userId, track_stock: true, stock: '0' })));
}
