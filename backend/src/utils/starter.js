/**
 * The catalog a new stringer starts with: the rackets and strings that are in nearly every workshop's lists, so that
 * what comes in is a matter of setting a count and not of typing a name. It is a list of names (data/starter-catalog.json),
 * each of them a racket or a string of the reference list, and is written down here in the reference list's own spelling.
 * A name that the reference list does not have, or a string size that it does not know, stops the server from starting.
 *
 * A racket is `[brand, model]`; a string is `[brand, model, size in mm]`, or without a size when none is known. A string
 * is in the catalog once for each size, as the stringer's own are.
 */
import { readFileSync } from 'node:fs';
import { normalize, rackets as referenceRackets, strings as referenceStrings } from './reference.js';

const data = JSON.parse(readFileSync(new URL('../data/starter-catalog.json', import.meta.url), 'utf8'));

const nameKey = (brand, model) => normalize(`${brand} ${model}`).replace(/ /g, '');
const byName = (index) => new Map(index.items.map((item) => [nameKey(item.brand, item.model), item]));

function fail(message) {
  throw new Error(`data/starter-catalog.json: ${message}`);
}

function resolve(entries, kind, index, describe) {
  const known = byName(index);
  const seen = new Set();
  return entries.map(([brand, model, gauge]) => {
    const item = known.get(nameKey(brand, model));
    if (!item) fail(`${brand} ${model} is not in the reference list of ${kind}`);
    const row = describe(item, gauge);
    const id = `${item.id}|${gauge ?? ''}`;
    if (seen.has(id)) fail(`${item.brand} ${item.model}${gauge ? ` ${gauge}` : ''} is there twice`);
    seen.add(id);
    return row;
  });
}

export const STARTER_RACKETS = resolve(data.rackets, 'rackets', referenceRackets, (item) => ({
  brand: item.brand,
  model: item.model,
}));

export const STARTER_STRINGS = resolve(data.strings, 'strings', referenceStrings, (item, gauge) => {
  if (gauge !== undefined && !item.gauges.includes(gauge)) {
    fail(`${item.brand} ${item.model} has no size ${gauge} in the reference list`);
  }
  return { brand: item.brand, model: item.model, gauge: gauge ? `${gauge} mm` : null, type: item.type };
});
