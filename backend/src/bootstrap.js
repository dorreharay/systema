/**
 * Startup bootstrap: makes sure there is a first admin, so a fresh database is usable.
 *
 * When the users table is EMPTY and SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are both set, this
 * creates that admin. It is idempotent: once any user exists it does nothing, so it never overwrites
 * a changed password or creates duplicates on a redeploy. Without the two variables it does nothing
 * at all: there are no default credentials.
 */
import { config } from './config.js';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { hashPassword } from './utils/password.js';

export async function bootstrapAdmin() {
  const { email, password, name } = config.seedAdmin;
  if (!email || !password) return;

  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  await db.insert(users).values({
    email,
    full_name: name,
    password_hash: await hashPassword(password),
    role: 'admin',
  });
  console.log(`[bootstrap] Created the first admin: ${email}`);
}
