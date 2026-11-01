/**
 * Creates the first admin from SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (backend/.env) if the
 * database has no users yet. Safe to run more than once. The server does the same on start.
 *
 *   npm run db:seed
 */
import { bootstrapAdmin } from '../bootstrap.js';
import { config } from '../config.js';
import { pool } from '../db/index.js';

try {
  if (!config.seedAdmin.email || !config.seedAdmin.password) {
    console.log('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in backend/.env first.');
  } else {
    console.log('Seeding database...');
    await bootstrapAdmin();
    console.log('Done.');
  }
} catch (err) {
  console.error('Seed failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
