import { services } from '../db/schema.js';

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
