// What the backend sends. Dates are calendar dates (`YYYY-MM-DD`); money is a number in the user's
// currency; tension is always in kilograms, whatever unit is shown.

export const ORDER_STATUSES = ['received', 'in_progress', 'ready', 'completed'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STRING_TYPES = [
  'polyester',
  'multifilament',
  'synthetic_gut',
  'natural_gut',
  'other',
] as const;
export type StringType = (typeof STRING_TYPES)[number];

export type TensionUnit = 'kg' | 'lbs';

export type ClientSummary = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export type Client = ClientSummary & {
  notes: string | null;
  rackets_count: number;
  orders_count: number;
  last_order_date: string | null;
};

export type RacketSummary = { id: string; brand: string; model: string };

/** The racket of an order: `client_id` is empty for a catalog racket, one the stringer keeps in stock. */
export type OrderRacket = RacketSummary & { client_id: string | null };

/** How a racket was strung: what "Use Previous Setup" copies into a new order. */
export type Setup = {
  customer_strings: boolean;
  hybrid: boolean;
  main_string_id: string | null;
  main_string_name: string | null;
  cross_string_id: string | null;
  cross_string_name: string | null;
  main_tension: number | null;
  cross_tension: number | null;
  knots: 2 | 4 | null;
  stringing_notes: string | null;
};

export type LastSetup = Setup & {
  order_id: string;
  // Empty for an order that has not reached the server yet: the server gives the numbers (see `Order.number`).
  number: number | null;
  received_date: string;
  labor_price: number | null;
  string_price: number | null;
};

export type Racket = {
  id: string;
  // The owner. A catalog racket, one the stringer keeps in stock, has none.
  client_id: string | null;
  client_name: string | null;
  brand: string;
  model: string;
  notes: string | null;
  // The stock of a catalog racket: counted only while `track_stock` is on. `available` says whether an order can use it.
  track_stock: boolean;
  stock: number;
  available: boolean;
  orders_count: number;
  last_setup: LastSetup | null;
};

export type RacketDetail = Racket & { orders: Order[] };

export type ClientRacket = RacketSummary & { notes: string | null; orders_count: number };

export type ClientDetail = Client & { rackets: ClientRacket[]; orders: Order[] };

export type CatalogString = {
  id: string;
  brand: string;
  model: string;
  gauge: string | null;
  type: StringType;
  default_price: number | null;
  // How many sets are in stock, counted only while `track_stock` is on; halves, as a hybrid takes half a set of each string.
  track_stock: boolean;
  stock: number;
  available: boolean;
};

// The reference list of rackets and strings that exist (names, no photos): what a new racket or string of the
// stringer's own catalog can be filled in from.
export type ReferenceRacket = {
  id: string;
  brand: string;
  model: string;
};

export type ReferenceString = ReferenceRacket & {
  type: StringType;
  // The sizes in mm, from the thinnest, like "1.25"; empty when they are not known.
  gauges: string[];
};

export type Service = {
  id: string;
  name: string;
  price: number | null;
  kind: 'labor' | 'extra';
  active: boolean;
};

export type Order = Setup & {
  id: string;
  // The server numbers the orders 1, 2, 3... for each stringer. An order made without a connection has none until it has
  // been sent: nothing that leaves the phone (a message, a reminder) may name a number that is not there.
  number: number | null;
  status: OrderStatus;
  is_paid: boolean;
  paid_at: string | null;
  client: ClientSummary;
  racket: OrderRacket;
  received_date: string;
  due_date: string | null;
  due_time: string | null;
  notes: string | null;
  labor_price: number | null;
  string_price: number | null;
  total: number | null;
  started_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderService = { id: string; service_id: string | null; name: string; price: number | null };
export type OrderPhoto = { id: string; content_type: string; size: number; created_at: string };
export type OrderDetail = Order & { services: OrderService[]; photos: OrderPhoto[] };

export type Dashboard = {
  active_orders: number;
  ready_for_pickup: number;
  completed_this_month: number;
  active: Order[];
};

/** A client with what their orders add up to (what they owe, or what they have paid). */
export type ClientTotal = {
  client: { id: string; name: string };
  total: number;
  orders: number;
};

/** GET /api/insights: what the home screen shows besides the numbers. `today` and the days are the stringer's. */
export type Insights = {
  today: string;
  revenue: {
    total: number;
    // The same days of the month before, so that the two can be compared at any point in the month.
    previous_total: number;
    // Every day of this month, with what was paid on it.
    days: { date: string; total: number }[];
  };
  workload: {
    overdue: number;
    // Today and the six days after it, with the work still to do for each.
    days: { date: string; count: number }[];
  };
  receivables: {
    unpaid_total: number;
    unpaid_orders: number;
    debtors: ClientTotal[];
    top_clients: ClientTotal[];
  };
};

/** The body of POST and PATCH /api/orders. */
export type OrderInput = Partial<Setup> & {
  client_id?: string;
  racket_id?: string;
  // Instead of `racket_id`: a racket of the client that they may not have yet. The server makes it together with the
  // order (and not if the order is not made), or uses the one of that name that the client has. The `id` is the one the
  // racket is made with, so that what is done to it before the order has been sent can name it.
  new_racket?: { id?: string; brand: string; model: string };
  received_date?: string;
  due_date?: string | null;
  due_time?: string | null;
  notes?: string | null;
  labor_price?: number | null;
  string_price?: number | null;
  services?: { service_id: string | null; name: string; price: number | null }[];
  status?: OrderStatus;
  is_paid?: boolean;
};
