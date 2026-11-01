import { formatMoney, formatTensions, formatTimestamp, orderNumber, racketName } from '@/lib/format';
import type { Language, Translate } from '@/lib/i18n';
import type { OrderDetail, Order, Setup, TensionUnit } from '@/lib/types';

/** "Luxilon ALU Power", "Wilson Natural Gut / Luxilon ALU Power", or that the customer brought them. */
export function describeStrings(setup: Setup, t: Translate) {
  if (setup.customer_strings) {
    return setup.main_string_name
      ? t('order_customer_strings_named', { name: setup.main_string_name })
      : t('order_customer_strings');
  }
  if (setup.hybrid) {
    return `${setup.main_string_name ?? '—'} / ${setup.cross_string_name ?? '—'}`;
  }
  return setup.main_string_name ?? t('order_no_string');
}

/** The strings and the tension on one line: "Luxilon ALU Power 1.25 mm · 24 / 23 kg". */
export function describeSetup(setup: Setup, unit: TensionUnit, t: Translate) {
  const strings = describeStrings(setup, t);
  if (setup.main_tension === null && setup.cross_tension === null) return strings;
  return `${strings} · ${formatTensions(setup.main_tension, setup.cross_tension ?? setup.main_tension, unit)}`;
}

type TextContext = {
  t: Translate;
  language: Language;
  unit: TensionUnit;
  currency: string;
  timeZone: string;
};

/** The order as plain text: what "Copy Order Details" puts on the clipboard. */
export function orderAsText(order: OrderDetail, { t, language, unit, currency, timeZone }: TextContext) {
  const lines = [
    `${t('order_title', { number: orderNumber(order.number) })} · ${t(`status_${order.status}`)}`,
    `${t('field_client')}: ${order.client.name}${order.client.phone ? ` (${order.client.phone})` : ''}`,
    `${t('field_racket')}: ${racketName(order.racket)}`,
    `${t('field_strings')}: ${describeStrings(order, t)}`,
  ];
  if (order.main_tension !== null) {
    lines.push(
      `${t('field_tension')}: ${formatTensions(order.main_tension, order.cross_tension ?? order.main_tension, unit)}`
    );
  }
  if (order.knots) lines.push(`${t('field_knots')}: ${order.knots}`);
  if (order.due_date) {
    lines.push(`${t('order_due_date')}: ${formatTimestamp(`${order.due_date}T12:00:00`, language, timeZone)}`);
  }
  if (order.total !== null) {
    lines.push(
      `${t('order_total')}: ${formatMoney(order.total, currency, language)} (${order.is_paid ? t('payment_paid') : t('payment_unpaid')})`
    );
  }
  if (order.stringing_notes) lines.push(`${t('order_stringing_notes')}: ${order.stringing_notes}`);
  if (order.notes) lines.push(`${t('order_notes')}: ${order.notes}`);
  return lines.join('\n');
}

/** A message for the customer when their racket can be picked up. */
export function readyMessage(
  order: Pick<Order, 'client' | 'racket' | 'total' | 'is_paid'>,
  { t, language, currency, workshop }: { t: Translate; language: Language; currency: string; workshop: string | null }
) {
  const name = order.client.name.split(' ')[0];
  const lines = [
    t('ready_message_hello', { name }),
    t('ready_message_body', { racket: racketName(order.racket) }),
  ];
  if (order.total !== null && !order.is_paid) {
    lines.push(t('ready_message_total', { total: formatMoney(order.total, currency, language) }));
  }
  if (workshop) lines.push(`— ${workshop}`);
  return lines.join(' ');
}
