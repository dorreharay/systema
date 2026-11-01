import {
  boolean,
  customType,
  date,
  index,
  integer,
  numeric,
  pgTable,
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
    password_hash: text('password_hash').notNull(),
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

export const rackets = pgTable(
  'rackets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: owner(),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    notes: text('notes'),
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

    started_at: timestamp('started_at', { withTimezone: true }),
    ready_at: timestamp('ready_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('orders_user_number_idx').on(table.user_id, table.number),
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
