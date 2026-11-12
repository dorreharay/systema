import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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
    // Empty for an account that was made by signing in with Google or Apple and has not set a password since.
    password_hash: text('password_hash'),
    // Google's id of the person (the "sub" of their ID token), once they have signed in with Google. It stays the same when
    // they change their address, so it, and not the email, says whose account this is.
    google_sub: text('google_sub').unique(),
    // The same for Apple (the "sub" of the identity token). The address of a person who hides it is one Apple made up for
    // this app, so here too the id, and not the email, says whose account this is.
    apple_sub: text('apple_sub').unique(),
    // What Apple answered when the server traded the authorization code of a sign-in for a token. It is kept for one thing,
    // to revoke the link between the person and the app at Apple when the account is deleted. Empty when the server has no
    // key to ask Apple with, or Apple did not answer.
    apple_refresh_token: text('apple_refresh_token'),
    // Which of the server's Apple identifiers that token was issued to: the app's bundle ID, or the Services ID of the web
    // sign-in. Apple wants a token revoked by the one it was issued to, so it is kept with the token. Empty for a token kept
    // before the web sign-in existed, which was always the app's (the first of APPLE_CLIENT_IDS).
    apple_client_id: text('apple_client_id'),
    role: text('role').notNull().default('user'), // user, admin
    is_active: boolean('is_active').notNull().default(true),
    // A password reset link carries a random token. Only its SHA-256 is stored, so a copy of the
    // database cannot be used to reset anyone's password.
    reset_token_hash: text('reset_token_hash'),
    reset_token_expires: timestamp('reset_token_expires', { withTimezone: true }),
    // Sessions issued before this moment are no longer accepted (set when the password changes).
    password_changed_at: timestamp('password_changed_at', { withTimezone: true }),
    // The stringer's workshop and preferences. They apply to new orders and are shown in Settings.
    workshop_name: text('workshop_name'),
    currency: text('currency').notNull().default('USD'), // ISO 4217 code
    tension_unit: text('tension_unit').notNull().default('kg'), // kg, lbs: only how tension is shown
    timezone: text('timezone').notNull().default('UTC'), // IANA name
    language: text('language').notNull().default('en'),
    notifications_enabled: boolean('notifications_enabled').notNull().default(true),
    // Set when the person has been through the first-run setup.
    setup_completed_at: timestamp('setup_completed_at', { withTimezone: true }),
    // The last order number handed out; orders are numbered 1, 2, 3... for each stringer.
    order_counter: integer('order_counter').notNull().default(0),
    // The plan the stringer pays for (see utils/plans.js). `plan` is what the store last said they hold, and it holds until
    // `plan_expires_at` (no date: for good, a plan given by hand). Past that, and a few days of grace, the account is on Free again;
    // the columns keep what it was, so that the app can say that it ran out. `plan_trial` is the first free days Apple gives, and
    // `plan_renews` is false once the person turned the renewal off (the plan then holds to the end of what was paid for).
    plan: text('plan').notNull().default('free'), // free, pro, studio
    plan_period: text('plan_period'), // month, year
    plan_expires_at: timestamp('plan_expires_at', { withTimezone: true }),
    plan_trial: boolean('plan_trial').notNull().default(false),
    plan_renews: boolean('plan_renews').notNull().default(false),
    // When the person asked to be told once the Studio plan (several stringers in one workshop) exists; empty if they did not, or took it
    // back. Nothing sends the news by itself: whoever launches Studio reads the list by hand,
    // `SELECT email FROM users WHERE studio_waitlist_at IS NOT NULL ORDER BY studio_waitlist_at`.
    studio_waitlist_at: timestamp('studio_waitlist_at', { withTimezone: true }),
    // When the person showed that the address is theirs: by typing the code that was sent to it (see utils/emailVerification.js), by
    // signing in with Google or Apple, which say that the address is verified, or by opening a password reset link that was sent to it.
    // Empty until then. Where confirming is not required (a local server) nothing is written here: the API says the address is confirmed.
    // The accounts that existed when this was added were given the date they were made (migration 0009).
    email_verified_at: timestamp('email_verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('users_reset_token_hash_idx').on(table.reset_token_hash)]
);

const owner = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

// Clients, rackets and strings are never really deleted: an old order still points at them. A
// deleted one only disappears from lists and pickers.
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: owner(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    notes: text('notes'),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('clients_user_idx').on(table.user_id, table.deleted_at)]
);

// A racket either belongs to a client (the one they bring to be strung) or, with no `client_id`, is an item of the
// stringer's catalog: a racket they keep in stock.
export const rackets = pgTable(
  'rackets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: owner(),
    client_id: uuid('client_id').references(() => clients.id),
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    notes: text('notes'),
    // Only a catalog racket has a stock. While `track_stock` is off the racket is always available and `stock` means
    // nothing; with it on, an order takes one out of `stock` and cannot be made once it is 0.
    track_stock: boolean('track_stock').notNull().default(false),
    stock: integer('stock').notNull().default(0),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('rackets_user_idx').on(table.user_id, table.deleted_at),
    index('rackets_client_idx').on(table.client_id),
  ]
);

export const STRING_TYPES = ['polyester', 'multifilament', 'synthetic_gut', 'natural_gut', 'other'];

// The stringer's own catalog of strings they sell or use.
export const catalogStrings = pgTable(
  'strings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: owner(),
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    gauge: text('gauge'), // "1.25 mm", "16L": written the way the string is sold
    type: text('type').notNull().default('other'), // one of STRING_TYPES
    default_price: numeric('default_price', { precision: 10, scale: 2 }),
    // How many sets are in stock, counted only while `track_stock` is on (see rackets). A hybrid takes half a set of
    // each of its two strings, so halves are kept.
    track_stock: boolean('track_stock').notNull().default(false),
    stock: numeric('stock', { precision: 8, scale: 1 }).notNull().default('0'),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('strings_user_idx').on(table.user_id, table.deleted_at)]
);

// What the stringer charges for: the stringing itself and extras such as a new grip. An archived
// service is `active = false`: it is no longer offered on new orders.
export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: owner(),
    name: text('name').notNull(),
    price: numeric('price', { precision: 10, scale: 2 }),
    kind: text('kind').notNull().default('extra'), // labor: the stringing itself; extra
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (table) => [index('services_user_idx').on(table.user_id)]
);

export const ORDER_STATUSES = ['received', 'in_progress', 'ready', 'completed'];

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: owner(),
    number: integer('number').notNull(),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    racket_id: uuid('racket_id')
      .notNull()
      .references(() => rackets.id),
    status: text('status').notNull().default('received'), // one of ORDER_STATUSES
    // Payment does not depend on the status: a racket can be paid for before it is strung.
    is_paid: boolean('is_paid').notNull().default(false),
    paid_at: timestamp('paid_at', { withTimezone: true }),

    // Calendar dates, as the stringer writes them: no time zone to convert.
    received_date: date('received_date', { mode: 'string' }).notNull(),
    due_date: date('due_date', { mode: 'string' }),
    due_time: text('due_time'), // "HH:MM"

    // The setup is copied into the order. Editing a string in the catalog later does not change what
    // an old order says was used.
    customer_strings: boolean('customer_strings').notNull().default(false),
    hybrid: boolean('hybrid').notNull().default(false),
    main_string_id: uuid('main_string_id').references(() => catalogStrings.id, { onDelete: 'set null' }),
    main_string_name: text('main_string_name'),
    cross_string_id: uuid('cross_string_id').references(() => catalogStrings.id, { onDelete: 'set null' }),
    cross_string_name: text('cross_string_name'),
    // Tension is always kept in kilograms. kg or lbs in Settings only changes how it is shown, so a
    // change of unit never rewrites an old order.
    main_tension: numeric('main_tension', { precision: 7, scale: 4 }),
    cross_tension: numeric('cross_tension', { precision: 7, scale: 4 }), // only when it differs
    knots: smallint('knots'), // 2 or 4
    stringing_notes: text('stringing_notes'),
    notes: text('notes'),

    labor_price: numeric('labor_price', { precision: 10, scale: 2 }),
    string_price: numeric('string_price', { precision: 10, scale: 2 }),
    // Labor + strings + extra services, worked out on every save. Null while no price is known.
    total: numeric('total', { precision: 10, scale: 2 }),

    // What this order took out of the stock, `[{ kind: 'racket' | 'string', id, qty }]`, so that deleting or changing
    // the order gives back exactly that. Orders made before the stock was counted took nothing.
    stock_used: jsonb('stock_used').notNull().default([]),

    started_at: timestamp('started_at', { withTimezone: true }),
    ready_at: timestamp('ready_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),

    // Who in the workshop takes the order in (accepted_by) and who strings it (assignee, from assigned_at). In a workshop of one person
    // the first is that person and the second is never set. They are people, not the workshop: a person who leaves keeps
    // their name on the old orders (the report is built from them), and the row is only emptied when the account itself is deleted.
    accepted_by_id: uuid('accepted_by_id').references(() => users.id, { onDelete: 'set null' }),
    assignee_id: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    assigned_at: timestamp('assigned_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('orders_user_number_idx').on(table.user_id, table.number),
    index('orders_user_assignee_idx').on(table.user_id, table.assignee_id),
    index('orders_user_status_due_idx').on(table.user_id, table.status, table.due_date),
    index('orders_client_idx').on(table.client_id),
    index('orders_racket_idx').on(table.racket_id),
  ]
);

export const orderServices = pgTable(
  'order_services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    order_id: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    service_id: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    name: text('name').notNull(), // copied, like the setup
    price: numeric('price', { precision: 10, scale: 2 }),
  },
  (table) => [index('order_services_order_idx').on(table.order_id)]
);

const bytea = customType({
  dataType: () => 'bytea',
  toDriver: (value) => value,
  fromDriver: (value) => value,
});

export const orderPhotos = pgTable(
  'order_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: owner(),
    order_id: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    content_type: text('content_type').notNull(),
    size: integer('size').notNull(),
    data: bytea('data').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('order_photos_order_idx').on(table.order_id)]
);

// The requests that are not harmless when repeated (a change of the stock by an amount) carry an `op_id` that the phone made up. It is
// written here in the same transaction as the change, so a request the phone sends again, because it never heard the answer, is
// answered and not applied twice. Old keys are deleted (see utils/operations.js).
export const appliedOperations = pgTable(
  'applied_operations',
  {
    user_id: owner(),
    op_id: uuid('op_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.op_id] }),
    index('applied_operations_created_idx').on(table.created_at),
  ]
);

// The codes that were sent to an account to confirm its email address (see utils/emailVerification.js). Only a keyed hash of a code is
// kept, so a copy of the database does not give the codes away. A row is one code that was sent: the newest of an account is the one
// that counts, the older ones are never looked at again (they stay a day, to count how many were sent in an hour), and all of them go when
// the address is confirmed.
export const emailCodes = pgTable(
  'email_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: owner(),
    code_hash: text('code_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    // How many wrong codes were tried against this one.
    attempts: integer('attempts').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('email_codes_user_idx').on(table.user_id, table.created_at)]
);

// The roles of the people who work in a workshop that is not their own. The owner is not a row here: the owner is the account whose
// data it is (every table above is scoped by `user_id`, which for a member is the owner's id: see utils/workshop.js).
export const WORKSHOP_ROLES = ['owner', 'master', 'receptionist'];
export const MEMBER_ROLES = ['master', 'receptionist'];

// A person in someone else's workshop. `user_id` is unique: a person works in at most one workshop of another at a time, and that one is
// the data they see while they are in it (their own stays in their account, untouched, for when they leave).
export const workshopMembers = pgTable(
  'workshop_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Whose workshop it is: the account that holds the data and pays for Studio.
    owner_id: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // one of MEMBER_ROLES
    ...timestamps,
  },
  (table) => [uniqueIndex('workshop_members_user_idx').on(table.user_id), index('workshop_members_owner_idx').on(table.owner_id)]
);

// An invitation to a workshop. Only a hash of its code is kept (the code is shown to the owner once, when it is made), and the row is
// deleted when the code is used or taken back; one that has run out stays until the owner opens the team, and takes no seat.
export const workshopInvites = pgTable(
  'workshop_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    owner_id: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // one of MEMBER_ROLES
    code_hash: text('code_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('workshop_invites_code_idx').on(table.code_hash), index('workshop_invites_owner_idx').on(table.owner_id)]
);

// Someone who asked, on the website, to be told when Studio is ready (routes/studio.js). It is not an account: a visitor may have none,
// so it is a table of its own, one row per address (lower case). Read by hand:
//   SELECT * FROM studio_interest ORDER BY created_at;
export const studioInterest = pgTable(
  'studio_interest',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    role: text('role'), // who the person is: one of STUDIO_ROLES (routes/studio.js)
    team_size: text('team_size'), // how many people work there: one of STUDIO_TEAM_SIZES
    note: text('note'), // what matters most to them, in their own words
    language: text('language'), // 'uk' or 'en': the page the form was on
    wants_call: boolean('wants_call').notNull().default(false), // ticked "ready for a short conversation"
    ...timestamps,
  },
  (table) => [uniqueIndex('studio_interest_email_idx').on(table.email)]
);
