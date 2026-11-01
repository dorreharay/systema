/**
 * The order form's state, and the rules around it: what a draft starts as, how a previous setup is
 * copied into it, what is required, what it costs, and what is sent to the server.
 *
 * Tension is typed in the unit shown on the form (`unit`); the server only ever gets kilograms.
 * A price that was not typed is `null`, which means "whatever the catalog says": it follows the
 * chosen string and the labor service instead of being a copy that can go stale.
 */
import {
  formatNumber,
  kgToUnit,
  parseDecimal,
  tensionToInput,
  unitToKg,
} from '@/lib/format';
import type { TKey } from '@/lib/i18n';
import type { LocalPhoto } from '@/lib/queries';
import type {
  CatalogString,
  LastSetup,
  OrderDetail,
  OrderInput,
  Racket,
  Service,
  Setup,
  TensionUnit,
} from '@/lib/types';

export type StringChoice = { id: string; name: string };
export type ClientChoice = { id: string; name: string };
export type RacketChoice = Pick<Racket, 'id' | 'brand' | 'model' | 'client_id' | 'client_name' | 'last_setup'>;
export type DraftService = { key: string; serviceId: string | null; name: string; price: string };

export type Draft = {
  client: ClientChoice | null;
  racket: RacketChoice | null;
  customerStrings: boolean;
  customerStringName: string;
  mainString: StringChoice | null;
  hybrid: boolean;
  crossString: StringChoice | null;
  unit: TensionUnit;
  mainTension: string;
  differentCross: boolean;
  crossTension: string;
  knots: 2 | 4;
  stringingNotes: string;
  laborPrice: string | null;
  stringPrice: string | null;
  services: DraftService[];
  receivedDate: string;
  dueDate: string | null;
  dueTime: string | null;
  notes: string;
  photos: LocalPhoto[];
};

export const MIN_TENSION_KG = 10;
export const MAX_TENSION_KG = 40;

export const stringLabel = (string: CatalogString) =>
  [string.brand, string.model, string.gauge].filter(Boolean).join(' ');

export const toStringChoice = (string: CatalogString): StringChoice => ({
  id: string.id,
  name: stringLabel(string),
});

export function emptyDraft(today: string, unit: TensionUnit): Draft {
  return {
    client: null,
    racket: null,
    customerStrings: false,
    customerStringName: '',
    mainString: null,
    hybrid: false,
    crossString: null,
    unit,
    mainTension: '',
    differentCross: false,
    crossTension: '',
    knots: 2,
    stringingNotes: '',
    laborPrice: null,
    stringPrice: null,
    services: [],
    receivedDate: today,
    dueDate: null,
    dueTime: null,
    notes: '',
    photos: [],
  };
}

/** Copies how a racket was strung into the draft. Prices, dates and notes of the order are left out. */
export function applySetup(draft: Draft, setup: Setup): Draft {
  const differentCross =
    setup.cross_tension !== null && setup.cross_tension !== setup.main_tension;
  return {
    ...draft,
    customerStrings: setup.customer_strings,
    customerStringName: setup.customer_strings ? (setup.main_string_name ?? '') : '',
    mainString:
      !setup.customer_strings && setup.main_string_id
        ? { id: setup.main_string_id, name: setup.main_string_name ?? '' }
        : null,
    hybrid: setup.hybrid,
    crossString:
      !setup.customer_strings && setup.hybrid && setup.cross_string_id
        ? { id: setup.cross_string_id, name: setup.cross_string_name ?? '' }
        : null,
    mainTension: tensionToInput(setup.main_tension, draft.unit),
    differentCross,
    crossTension: differentCross ? tensionToInput(setup.cross_tension, draft.unit) : '',
    knots: setup.knots ?? 2,
    stringingNotes: setup.stringing_notes ?? '',
    laborPrice: null,
    stringPrice: null,
  };
}

/** Whether a setup uses anything from the folded "advanced" part of the form. */
export const setupUsesAdvanced = (setup: Setup) =>
  setup.hybrid ||
  (setup.cross_tension !== null && setup.cross_tension !== setup.main_tension) ||
  (setup.knots !== null && setup.knots !== 2) ||
  !!setup.stringing_notes?.trim();

export const usesAdvanced = (draft: Draft) =>
  draft.hybrid || draft.differentCross || draft.knots !== 2 || draft.stringingNotes.trim() !== '';

/**
 * The draft with this racket (and so its owner) chosen. When nothing about the strings has been
 * entered yet, the setup the racket was last strung with is copied in.
 */
export function withRacket(draft: Draft, racket: RacketChoice): Draft {
  const next: Draft = { ...draft, racket, client: { id: racket.client_id, name: racket.client_name } };
  const untouched = !draft.mainString && !draft.customerStrings && draft.mainTension.trim() === '';
  return racket.last_setup && untouched ? applySetup(next, racket.last_setup) : next;
}

/** An order that exists, as a draft to edit. */
export function draftFromOrder(order: OrderDetail, unit: TensionUnit): Draft {
  const base = applySetup(emptyDraft(order.received_date, unit), order);
  return {
    ...base,
    client: { id: order.client.id, name: order.client.name },
    racket: {
      id: order.racket.id,
      brand: order.racket.brand,
      model: order.racket.model,
      client_id: order.client.id,
      client_name: order.client.name,
      last_setup: null,
    },
    // These are the order's own prices, so they stop following the catalog.
    laborPrice: order.labor_price === null ? '' : formatNumber(order.labor_price, 2),
    stringPrice: order.string_price === null ? '' : formatNumber(order.string_price, 2),
    services: order.services.map((line) => ({
      key: line.id,
      serviceId: line.service_id,
      name: line.name,
      price: line.price === null ? '' : formatNumber(line.price, 2),
    })),
    receivedDate: order.received_date,
    dueDate: order.due_date,
    dueTime: order.due_time,
    notes: order.notes ?? '',
  };
}

/** The setup of an order as `LastSetup`: what "Use Previous Setup" offers for a racket. */
export function lastSetupOf(order: OrderDetail): LastSetup {
  return {
    order_id: order.id,
    number: order.number,
    received_date: order.received_date,
    customer_strings: order.customer_strings,
    hybrid: order.hybrid,
    main_string_id: order.main_string_id,
    main_string_name: order.main_string_name,
    cross_string_id: order.cross_string_id,
    cross_string_name: order.cross_string_name,
    main_tension: order.main_tension,
    cross_tension: order.cross_tension,
    knots: order.knots,
    stringing_notes: order.stringing_notes,
    labor_price: order.labor_price,
    string_price: order.string_price,
  };
}

/** The tension fields in another unit; what was typed means the same weight. */
export function changeUnit(draft: Draft, unit: TensionUnit): Draft {
  if (unit === draft.unit) return draft;
  const convert = (text: string) => {
    const value = parseDecimal(text);
    return value === null ? text : formatNumber(kgToUnit(unitToKg(value, draft.unit), unit));
  };
  return {
    ...draft,
    unit,
    mainTension: convert(draft.mainTension),
    crossTension: convert(draft.crossTension),
  };
}

// --- Prices ----------------------------------------------------------------------------------

const round2 = (value: number) => Math.round(value * 100) / 100;

/** What the strings in the draft cost according to the catalog; a hybrid is half of each. */
export function catalogStringPrice(draft: Draft, catalog: CatalogString[]) {
  if (draft.customerStrings) return null;
  const priceOf = (choice: StringChoice | null) =>
    choice ? (catalog.find((string) => string.id === choice.id)?.default_price ?? null) : null;
  const main = priceOf(draft.mainString);
  if (!draft.hybrid) return main;
  const cross = priceOf(draft.crossString);
  if (main !== null && cross !== null) return round2((main + cross) / 2);
  return main ?? cross;
}

export type Pricing = {
  laborText: string;
  stringText: string;
  labor: number | null;
  string: number | null;
  extras: number;
  total: number | null;
};

/** The labor and string prices as the form shows them, and the total they add up to. */
export function pricing(draft: Draft, labor: Service | undefined, catalog: CatalogString[]): Pricing {
  const text = (typed: string | null, fallback: number | null | undefined) =>
    typed ?? (fallback == null ? '' : formatNumber(fallback, 2));
  const laborText = text(draft.laborPrice, labor?.price);
  const stringText = draft.customerStrings ? '' : text(draft.stringPrice, catalogStringPrice(draft, catalog));

  const laborPrice = parseDecimal(laborText);
  const stringPrice = parseDecimal(stringText);
  const extraPrices = draft.services.map((line) => parseDecimal(line.price));
  const extras = extraPrices.reduce<number>((sum, price) => sum + (price ?? 0), 0);

  const priced = [laborPrice, stringPrice, ...extraPrices].filter((price) => price !== null);
  return {
    laborText,
    stringText,
    labor: laborPrice,
    string: stringPrice,
    extras,
    total: priced.length === 0 ? null : round2(priced.reduce((sum, price) => sum + price, 0)),
  };
}

// --- Checking and sending --------------------------------------------------------------------

export type DraftErrors = Partial<
  Record<
    | 'client'
    | 'racket'
    | 'mainString'
    | 'crossString'
    | 'mainTension'
    | 'crossTension'
    | 'laborPrice'
    | 'stringPrice'
    | 'services',
    { key: TKey; params?: Record<string, string | number> }
  >
>;

function checkTension(text: string, unit: TensionUnit) {
  const value = parseDecimal(text);
  if (value === null) return { key: 'order_error_tension' as const };
  const kg = unitToKg(value, unit);
  if (kg < MIN_TENSION_KG || kg > MAX_TENSION_KG) {
    return {
      key: 'order_error_tension_range' as const,
      params: {
        min: formatNumber(kgToUnit(MIN_TENSION_KG, unit), 0),
        max: formatNumber(kgToUnit(MAX_TENSION_KG, unit), 0),
        unit,
      },
    };
  }
  return undefined;
}

/** What is wrong with a draft. Only these are required: customer, racket, strings and tension. */
export function validateDraft(draft: Draft, prices: Pricing): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.client) errors.client = { key: 'order_error_client' };
  if (!draft.racket) errors.racket = { key: 'order_error_racket' };
  if (!draft.customerStrings && !draft.mainString) errors.mainString = { key: 'order_error_string' };
  if (!draft.customerStrings && draft.hybrid && !draft.crossString) {
    errors.crossString = { key: 'order_error_cross_string' };
  }
  errors.mainTension = checkTension(draft.mainTension, draft.unit);
  if (draft.differentCross) errors.crossTension = checkTension(draft.crossTension, draft.unit);

  const bad = (text: string) => text.trim() !== '' && (parseDecimal(text) ?? -1) < 0;
  if (bad(prices.laborText)) errors.laborPrice = { key: 'error_number' };
  if (bad(prices.stringText)) errors.stringPrice = { key: 'error_number' };
  if (draft.services.some((line) => bad(line.price))) errors.services = { key: 'error_number' };

  return Object.fromEntries(Object.entries(errors).filter(([, value]) => value)) as DraftErrors;
}

/** The body of the request. Run `validateDraft` first: this assumes the tension and the people are there. */
export function buildInput(draft: Draft, prices: Pricing): OrderInput {
  const main = parseDecimal(draft.mainTension);
  const cross = draft.differentCross ? parseDecimal(draft.crossTension) : null;
  const customerName = draft.customerStringName.trim();

  return {
    client_id: draft.client?.id,
    racket_id: draft.racket?.id,
    customer_strings: draft.customerStrings,
    hybrid: draft.hybrid,
    main_string_id: draft.customerStrings ? null : (draft.mainString?.id ?? null),
    main_string_name: draft.customerStrings ? customerName || null : (draft.mainString?.name ?? null),
    cross_string_id: draft.hybrid && !draft.customerStrings ? (draft.crossString?.id ?? null) : null,
    cross_string_name: draft.hybrid && !draft.customerStrings ? (draft.crossString?.name ?? null) : null,
    main_tension: main === null ? null : unitToKg(main, draft.unit),
    cross_tension: cross === null ? null : unitToKg(cross, draft.unit),
    knots: draft.knots,
    stringing_notes: draft.stringingNotes.trim() || null,
    labor_price: prices.labor,
    string_price: draft.customerStrings ? null : prices.string,
    services: draft.services.map((line) => ({
      service_id: line.serviceId,
      name: line.name,
      price: parseDecimal(line.price),
    })),
    received_date: draft.receivedDate,
    due_date: draft.dueDate,
    due_time: draft.dueDate ? draft.dueTime : null,
    notes: draft.notes.trim() || null,
  };
}

/** A draft that can be compared with the one it started as, to know whether anything was changed. */
export const draftSnapshot = (draft: Draft) => JSON.stringify({ ...draft, photos: draft.photos.map((p) => p.uri) });
