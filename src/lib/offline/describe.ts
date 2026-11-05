import { ApiError } from '@/lib/api-error';
import { describeError } from '@/lib/errors';
import { formatNumber, orderNumber } from '@/lib/format';
import type { Translate } from '@/lib/i18n';

import type { Failure, Op, Tables } from './types';

/** What a change in the queue is, in a line: "New order · Ivan Petrenko", "Order #12 · Ready". */
export function describeOp(op: Op, tables: Tables, t: Translate): string {
  const client = (id: string, fallback?: string) => tables.clients[id]?.name ?? fallback ?? '—';
  const racket = (id: string, fallback?: string) => {
    const found = tables.rackets[id];
    return found ? `${found.brand} ${found.model}` : (fallback ?? '—');
  };
  const string = (id: string, fallback?: string) => {
    const found = tables.strings[id];
    return found ? `${found.brand} ${found.model}` : (fallback ?? '—');
  };
  const order = (id: string, fallback?: string) => {
    const found = tables.orders[id];
    return found ? `${orderNumber(found.number)} · ${found.client.name}` : (fallback ?? '—');
  };
  const change = (delta: number) => `${delta < 0 ? '−' : '+'}${formatNumber(Math.abs(delta), 1)}`;

  switch (op.type) {
    case 'client.create':
      return t('op_client_create', { name: op.fields.name });
    case 'client.update':
      return t('op_client_update', { name: client(op.subject, op.patch.name) });
    case 'client.delete':
      return t('op_client_delete', { name: client(op.subject, op.label) });
    case 'racket.create':
      return t('op_racket_create', { name: `${op.fields.brand} ${op.fields.model}` });
    case 'racket.update':
      return t('op_racket_update', { name: racket(op.subject) });
    case 'racket.stock':
      return t('op_stock_change', { name: racket(op.subject), change: change(op.delta) });
    case 'racket.delete':
      return t('op_racket_delete', { name: racket(op.subject, op.label) });
    case 'string.create':
      return t('op_string_create', { name: `${op.fields.brand} ${op.fields.model}` });
    case 'string.update':
      return t('op_string_update', { name: string(op.subject) });
    case 'string.stock':
      return t('op_stock_change', { name: string(op.subject), change: change(op.delta) });
    case 'string.delete':
      return t('op_string_delete', { name: string(op.subject, op.label) });
    case 'service.create':
      return t('op_service_create', { name: op.fields.name });
    case 'service.update':
      return t('op_service_update', { name: tables.services[op.subject]?.name ?? op.patch.name ?? '—' });
    case 'order.create':
      return t('op_order_create', { client: tables.clients[op.input.client_id]?.name ?? op.snapshot.client.name });
    case 'order.update': {
      const label = order(op.subject);
      if (op.patch.status) return t('op_order_status', { order: label, status: t(`status_${op.patch.status}`) });
      if (op.patch.is_paid !== undefined && !op.form) {
        return t(op.patch.is_paid ? 'op_order_paid' : 'op_order_unpaid', { order: label });
      }
      return t('op_order_update', { order: label });
    }
    case 'order.delete':
      return t('op_order_delete', { order: order(op.subject, op.label) });
    case 'photo.delete':
      return t('op_photo_delete', { order: order(op.orderId) });
  }
}

/** Why the server did not take a change, in the words of the screens (never the raw text the server sent). */
export function describeFailure(failure: Failure, op: Op, tables: Tables, t: Translate): string {
  if (failure.code === 'out_of_stock' && (op.type === 'order.create' || op.type === 'order.update')) {
    const order = tables.orders[op.subject];
    const names = Object.keys(failure.fields ?? {}).flatMap((field) => {
      if (!order) return [];
      if (field === 'racket_id') return [`${order.racket.brand} ${order.racket.model}`];
      if (field === 'main_string_id') return order.main_string_name ? [order.main_string_name] : [];
      if (field === 'cross_string_id') return order.cross_string_name ? [order.cross_string_name] : [];
      return [];
    });
    if (names.length > 0) return t('sync_reason_out_of_stock', { items: names.join(', ') });
  }
  const error = new ApiError(failure.status, failure.message, failure.code, failure.fields, failure.data);
  return describeError(error, t);
}
