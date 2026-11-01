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
  number: number;
  received_date: string;
  labor_price: number | null;
  string_price: number | null;
};

export type Racket = {
  id: string;
  client_id: string;
  client_name: string;
  brand: string;
  model: string;
  notes: string | null;
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
  number: number;
  status: OrderStatus;
  is_paid: boolean;
  paid_at: string | null;
  client: ClientSummary;
  racket: RacketSummary;
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

/** The body of POST and PATCH /api/orders. */
export type OrderInput = Partial<Setup> & {
  client_id?: string;
  racket_id?: string;
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
