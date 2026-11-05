/**
 * What the offline layer keeps on the phone.
 *
 * The phone holds a copy of the stringer's data in the shapes the server sends it in (`Tables`), and a queue of the changes
 * the stringer made that the server has not seen yet (`Op`s, the outbox). What the screens show is always the copy with the
 * queue played on top of it, so the queue is the only thing that has to be kept safe, and taking an operation out of it puts
 * everything back as it was. When the server has taken an operation, it moves into the copy.
 */
import type {
  CatalogString,
  Client,
  ClientSummary,
  Insights,
  OrderDetail,
  OrderInput,
  OrderRacket,
  Racket,
  Service,
  StringType,
} from '../types';

export type Tables = {
  clients: Record<string, Client>;
  rackets: Record<string, Racket>;
  strings: Record<string, CatalogString>;
  services: Record<string, Service>;
  // With their service lines and photos: the page of an order and its form need both.
  orders: Record<string, OrderDetail>;
};

export const emptyTables = (): Tables => ({ clients: {}, rackets: {}, strings: {}, services: {}, orders: {} });

/** Why the server refused an operation, kept with it so that the stringer can be told. */
export type Failure = {
  status: number;
  code?: string;
  message: string;
  fields?: Record<string, string>;
  // What more the server said: the client who already has the phone number.
  data?: { client?: { id: string; name: string } };
  at: string;
};

export type ClientFields = { name: string; phone: string; email: string | null; notes: string | null };

export type RacketFields = {
  // Empty for a racket of the catalog, one the stringer keeps in stock.
  client_id: string | null;
  brand: string;
  model: string;
  notes: string | null;
  track_stock: boolean;
  stock: number;
};

export type StringFields = {
  brand: string;
  model: string;
  gauge: string | null;
  type: StringType;
  default_price: number | null;
  track_stock: boolean;
  stock: number;
};

export type ServiceFields = { name: string; price: number | null; kind: 'labor' | 'extra'; active: boolean };

/** A new order: a client and a racket (pointed at, or named, with the id it is made with) and whatever else the form had. */
export type OrderCreateInput = OrderInput & { client_id: string };

/**
 * Who the order is for and what it is strung on, as the form showed them when the order was made. The copy is played
 * from them when the client or the racket is not there (it was removed meanwhile): the order still has to be drawn.
 */
export type OrderSnapshot = { client: ClientSummary; racket: OrderRacket };

type Base = {
  // Also the key the server knows a stock operation by, so that one that is sent twice is applied once.
  id: string;
  // When it was done, by the phone's clock: the server dates the status and the payment of an order by it.
  at: string;
  // Set when the server refused it; it waits for the stringer to retry, correct or discard it.
  failure?: Failure;
  // How many times the server could not be asked (it was down), in a row.
  tries?: number;
  // Set when the request was made and its answer never came (the connection was cut, the server was slow): the server may have done
  // the work. Such an operation is not changed any more: what is edited after that is an operation of its own (merged into a create
  // that the server already has, the edit would be lost when the server answers "already made"), and an order that is deleted is
  // deleted at the server too, not just forgotten.
  sent?: boolean;
};

export type Op = Base &
  (
    | { type: 'client.create'; subject: string; fields: ClientFields }
    | { type: 'client.update'; subject: string; patch: Partial<ClientFields>; form?: boolean }
    // A delete keeps the name of what it removes, to be told in the queue after the thing itself is gone from the screens.
    | { type: 'client.delete'; subject: string; label?: string }
    | { type: 'racket.create'; subject: string; fields: RacketFields }
    | { type: 'racket.update'; subject: string; patch: Partial<Omit<RacketFields, 'stock'>>; form?: boolean }
    | { type: 'racket.stock'; subject: string; delta: number }
    | { type: 'racket.delete'; subject: string; label?: string }
    | { type: 'string.create'; subject: string; fields: StringFields }
    | { type: 'string.update'; subject: string; patch: Partial<Omit<StringFields, 'stock'>>; form?: boolean }
    | { type: 'string.stock'; subject: string; delta: number }
    | { type: 'string.delete'; subject: string; label?: string }
    | { type: 'service.create'; subject: string; fields: ServiceFields }
    | { type: 'service.update'; subject: string; patch: Partial<ServiceFields>; form?: boolean }
    | { type: 'order.create'; subject: string; input: OrderCreateInput; snapshot: OrderSnapshot }
    // `form` marks a change made with the whole order form (it holds every field): a later one of those replaces it.
    | { type: 'order.update'; subject: string; patch: OrderInput; form?: boolean; snapshot?: OrderSnapshot }
    | { type: 'order.delete'; subject: string; label?: string }
    | { type: 'photo.delete'; subject: string; orderId: string }
  );

export type OpType = Op['type'];
export type OpOf<T extends OpType> = Extract<Op, { type: T }>;

/** What is kept between launches: the server's last state, and a few things about it. */
export type Meta = {
  v: 1;
  userId: string;
  // When the copy was last made from the server's answer; null before the first time.
  pulledAt: string | null;
  // The charts of the home screen, as the server last drew them: they are not worked out here.
  insights: { data: Insights; at: string } | null;
  // The operations the copy already includes, so that one that is still in the saved queue after a crash is not played twice.
  applied: string[];
  // Whether the server had more orders than the phone takes (see MAX_ORDERS).
  truncated: boolean;
};

export type BaseFile = { meta: Meta; tables: Tables };
export type OutboxFile = { v: 1; userId: string; ops: Op[] };

/** The state of the queue as a screen needs it. */
export type Mark = 'pending' | 'failed' | 'blocked';
