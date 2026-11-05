/**
 * Keys of the changes that are not harmless when they are repeated (adding to or taking from a stock). The phone makes up a key
 * (`op_id`) for each, and the server writes it in the same transaction as the change, so a request that the phone sends again, because
 * it never heard the answer, finds its key and is answered without being applied a second time.
 */
import { lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { appliedOperations } from '../db/schema.js';

/** A phone repeats a request within hours, days at the most; a key older than this can go. */
export const OPERATION_KEEP_DAYS = 90;

/** Writes the key inside the transaction `tx`. True when it is new, and the change is to be made; false when it was made before. */
export async function claimOperation(tx, userId, opId) {
  const claimed = await tx
    .insert(appliedOperations)
    .values({ user_id: userId, op_id: opId })
    .onConflictDoNothing()
    .returning({ op_id: appliedOperations.op_id });
  return claimed.length > 0;
}

/** Deletes the keys older than `days`. Answers with how many there were. */
export async function purgeOperations(days = OPERATION_KEEP_DAYS) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(appliedOperations)
    .where(lt(appliedOperations.created_at, cutoff))
    .returning({ op_id: appliedOperations.op_id });
  return deleted.length;
}
