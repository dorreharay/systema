import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Always stored trimmed and in lower case, so the unique constraint means what it says.
    email: text('email').notNull().unique(),
    full_name: text('full_name'),
    password_hash: text('password_hash').notNull(),
    role: text('role').notNull().default('user'), // user, admin
    is_active: boolean('is_active').notNull().default(true),
    // A password reset link carries a random token. Only its SHA-256 is stored, so a copy of the
    // database cannot be used to reset anyone's password.
    reset_token_hash: text('reset_token_hash'),
    reset_token_expires: timestamp('reset_token_expires', { withTimezone: true }),
    // Sessions issued before this moment are no longer accepted (set when the password changes).
    password_changed_at: timestamp('password_changed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('users_reset_token_hash_idx').on(table.reset_token_hash)]
);
