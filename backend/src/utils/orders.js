/**
 * How an order is read and shown by the API. The orders, clients and rackets routers all list
 * orders, and they must answer in the same shape.
 */
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { clients, orders, rackets, users } from '../db/schema.js';

/** A numeric column comes from the driver as text. */
export const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

// The two people of an order: who took it in and who strings it (see the columns of `orders`).
const assignee = alias(users, 'assignee');
const acceptedBy = alias(users, 'accepted_by');
const personColumns = (table) => ({ id: table.id, full_name: table.full_name, email: table.email });

/** The columns and joins every order query uses. */
export const orderColumns = {
  order: orders,
  client: { id: clients.id, name: clients.name, phone: clients.phone, email: clients.email },
  // `client_id` is empty for a catalog racket: one the stringer keeps in stock, which goes with any client.
  racket: { id: rackets.id, brand: rackets.brand, model: rackets.model, client_id: rackets.client_id },
  assignee: personColumns(assignee),
  accepted_by: personColumns(acceptedBy),
};

export const withOrderJoins = (query) =>
  query
    .innerJoin(clients, eq(orders.client_id, clients.id))
    .innerJoin(rackets, eq(orders.racket_id, rackets.id))
    .leftJoin(assignee, eq(orders.assignee_id, assignee.id))
    .leftJoin(acceptedBy, eq(orders.accepted_by_id, acceptedBy.id));

/** A person of an order as the API shows them: an id and a name, never an address. Nobody: null. */
const person = (row) => (row?.id ? { id: row.id, name: row.full_name?.trim() || row.email.split('@')[0] } : null);

/** What describes how a racket was strung: copied into a new order by "Repeat last setup". */
export function setupOf(order) {
  return {
    customer_strings: order.customer_strings,
    hybrid: order.hybrid,
    main_string_id: order.main_string_id,
    main_string_name: order.main_string_name,
    cross_string_id: order.cross_string_id,
    cross_string_name: order.cross_string_name,
    main_tension: toNumber(order.main_tension),
    cross_tension: toNumber(order.cross_tension),
    knots: order.knots,
    stringing_notes: order.stringing_notes,
  };
}

/** A row of `orderColumns` as the API shows an order in a list. */
export function serializeOrder({ order, client, racket, assignee: performer, accepted_by: acceptedBy }) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    is_paid: order.is_paid,
    paid_at: order.paid_at,
    client,
    racket,
    received_date: order.received_date,
    due_date: order.due_date,
    due_time: order.due_time,
    ...setupOf(order),
    notes: order.notes,
    labor_price: toNumber(order.labor_price),
    string_price: toNumber(order.string_price),
    total: toNumber(order.total),
    started_at: order.started_at,
    ready_at: order.ready_at,
    completed_at: order.completed_at,
    // Who took it in and who strings it (null: nobody has it yet: it is in the queue). Only a workshop with a team has the second.
    accepted_by: person(acceptedBy),
    assignee: person(performer),
    assigned_at: order.assigned_at,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

/** The previous order of a racket, reduced to what a new order can be prefilled with. */
export function serializeLastSetup(order) {
  if (!order) return null;
  return {
    order_id: order.id,
    number: order.number,
    received_date: order.received_date,
    ...setupOf(order),
    labor_price: toNumber(order.labor_price),
    string_price: toNumber(order.string_price),
  };
}

/** Labor + strings + services. Null while nothing has a price, so "free" and "not decided" differ. */
export function orderTotal({ labor_price, string_price, services = [] }) {
  const amounts = [labor_price, string_price, ...services.map((service) => service.price)].filter(
    (amount) => amount !== null && amount !== undefined
  );
  if (amounts.length === 0) return null;
  return Math.round(amounts.reduce((sum, amount) => sum + Number(amount), 0) * 100) / 100;
}
