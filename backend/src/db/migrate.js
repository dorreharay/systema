/**
 * Applies the migrations in backend/drizzle to the database in DATABASE_URL.
 *
 *   npm run db:migrate
 *
 * The container runs it before the server starts (see Dockerfile).
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, pool } from './index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

try {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
