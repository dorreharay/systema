/**
 * The reference catalog: the rackets and the strings that exist, so that one for the stringer's own catalog
 * can be found by a part of its name instead of being typed in full.
 *
 * It is a fixed list (data/rackets.json, data/strings.json) read once when the server starts and searched in
 * memory: no table, no query, nothing to run for a request. It holds names and a few facts, never photos.
 *
 * A search forgives how a name is typed. Case, accents, spaces and dashes do not matter ("hyperg", "hyper g" and
 * "Hyper-G" are the same), "98+" is not "98", the gauge can be typed "1,25", "1.25" or "125", and the brands
 * answer to their Ukrainian spelling ("бабола").
 */
import { readFileSync } from 'node:fs';
import { STRING_TYPES } from '../db/schema.js';

const readData = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

/**
 * A text as it is searched: lower case, without accents, only words of letters and digits. A dot stays inside a
 * number ("1.25"), a comma there is a dot ("1,25"), and "+" is a word of its own.
 */
export function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/(?<=\d),(?=\d)/g, '.')
    .replace(/\+/g, ' plus ')
    .replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * A racket's name as it is compared with another: "Pro Staff 97", "pro-staff 97" and "PROSTAFF97" are one racket, and
 * "Pure Drive 98+" is not "Pure Drive 98".
 */
export const nameKey = (brand, model) => normalize(`${brand} ${model}`).replace(/ /g, '');

const wordsOf = (text) => normalize(text).split(' ').filter(Boolean);
const compact = (text) => normalize(text).replace(/ /g, '');
const slug = (text) => normalize(text).replace(/ /g, '-');

/** "97l" is also "97" and "l"; "16x19" is "16", "x" and "19": a space typed inside a name does not hide it. */
const partsOf = (word) => word.split(/(?<=\d)(?=[^\d.])|(?<=[^\d.])(?=\d)/u);

// What each type of string is called, so that "multifilament", "poly" or "поліестер" lists the strings of that kind.
const TYPE_WORDS = {
  polyester: ['polyester', 'poly', 'поліестер', 'полі'],
  multifilament: ['multifilament', 'multi', 'мультифіламент', 'мульти'],
  synthetic_gut: ['synthetic gut', 'synthetic', 'синтетика', 'синтетична жила'],
  natural_gut: ['natural gut', 'gut', 'натуральна жила', 'жила'],
  other: [],
};

const GAUGE = /^\d\.\d{2}$/;

function check(condition, file, message) {
  if (!condition) throw new Error(`data/${file}.json: ${message}`);
}

/** One racket or string of the list, with what a search looks at kept apart from what is answered. */
function entryOf(kind, file, brand, brandWords, raw) {
  const { model, aliases = [], type, gauges = [] } = typeof raw === 'string' ? { model: raw } : raw;
  const label = `${brand} ${model}`;
  check(typeof model === 'string' && model.trim() === model && model, file, `${brand}: a model needs a name`);
  check(aliases.every((alias) => typeof alias === 'string' && normalize(alias)), file, `${label}: an alias is empty`);

  const item = { id: slug(label), brand, model };
  const extra = [];
  if (kind === 'string') {
    check(STRING_TYPES.includes(type), file, `${label}: unknown type ${type}`);
    check(
      gauges.every((gauge, i) => GAUGE.test(gauge) && (i === 0 || gauge > gauges[i - 1])),
      file,
      `${label}: gauges are like "1.25", from the thinnest, once each`
    );
    item.type = type;
    item.gauges = gauges;
    // "1.25" can be typed "125" as well.
    extra.push(...TYPE_WORDS[type], ...gauges, ...gauges.map((gauge) => gauge.replace('.', '')));
  }

  // The words of the name come first in a ranking; the others (initials, versions, Ukrainian spellings, the
  // parts of "97l") only have to be found.
  const primary = new Set(wordsOf(label));
  const secondary = new Set();
  const add = (word) => {
    if (!primary.has(word)) secondary.add(word);
  };
  for (const word of primary) partsOf(word).forEach(add);
  for (const word of [...brandWords, ...aliases.flatMap(wordsOf), ...extra.flatMap(wordsOf)]) {
    add(word);
    partsOf(word).forEach(add);
  }

  return {
    item,
    name: normalize(label),
    modelName: normalize(model),
    primary,
    secondary,
    // A name typed without its spaces ("hyperg", "puredrive") is found in these.
    joined: [compact(label), compact(model), ...aliases.map(compact)],
  };
}

/** How well a search fits an entry, or 0 when a word of it is nowhere in the entry. */
function score(entry, tokens, query) {
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const word of entry.primary) {
      if (word === token) best = Math.max(best, 7);
      else if (word.startsWith(token)) best = Math.max(best, 5);
    }
    for (const word of entry.secondary) {
      if (word === token) best = Math.max(best, 6);
      else if (word.startsWith(token)) best = Math.max(best, 4);
    }
    if (best === 0 && token.length >= 3 && /\p{L}/u.test(token) && entry.joined.some((text) => text.includes(token))) {
      best = 2;
    }
    if (best === 0) return 0;
    total += best;
  }
  // What was typed is the whole name, or how it begins.
  if (entry.name === query || entry.modelName === query) total += 30;
  else if (entry.name.startsWith(query) || entry.modelName.startsWith(query)) total += 15;
  return total;
}

/**
 * The list of a kind (`racket` or `string`) from its parsed file. Anything that is not right in the file stops
 * the server from starting, with what and where, instead of showing up as a strange answer later.
 */
export function createIndex(kind, data) {
  const file = kind === 'racket' ? 'rackets' : 'strings';
  check(Array.isArray(data?.brands) && data.brands.length > 0, file, 'brands is a list');

  const entries = [];
  const brands = [];
  const seen = new Set();
  for (const group of data.brands) {
    check(typeof group.brand === 'string' && group.brand, file, 'a brand needs a name');
    check(Array.isArray(group.models) && group.models.length > 0, file, `${group.brand}: models is a list`);
    const aliases = group.aliases ?? [];
    // What a search can call this brand: its name and its other spellings.
    const names = new Set([normalize(group.brand), ...aliases.map(normalize)]);
    brands.push(group.brand);
    for (const raw of group.models) {
      const entry = entryOf(kind, file, group.brand, aliases.flatMap(wordsOf), raw);
      check(!seen.has(entry.item.id), file, `${entry.item.id} is there twice`);
      seen.add(entry.item.id);
      entries.push({ ...entry, brandNames: names });
    }
  }
  // Searching keeps this order for what scores the same: by name, with numbers by their value (95, 98, 100).
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

  /**
   * `q` is the words to find (all of them, each as the start of a word or inside the name); `brand` and, for
   * strings, `type` narrow the list. With no `q` it is the list itself, by brand and model.
   */
  function search({ q = '', brand, type, limit = 20, offset = 0 } = {}) {
    const query = normalize(q);
    const tokens = query ? query.split(' ') : [];
    const brandName = brand ? normalize(brand) : null;

    const found = [];
    for (const entry of entries) {
      if (brandName && !entry.brandNames.has(brandName)) continue;
      if (type && entry.item.type !== type) continue;
      const fit = tokens.length ? score(entry, tokens, query) : 1;
      if (fit > 0) found.push({ item: entry.item, fit, size: entry.modelName.length });
    }
    // What fits equally well goes by the length of the model, so that "Pure Drive" comes before "Pure Drive Lite"
    // and the few that a screen shows are the base models; then by name (the sort is stable). With no words it is
    // the plain list.
    found.sort((a, b) => b.fit - a.fit || (tokens.length ? a.size - b.size : 0));
    return {
      items: found.slice(offset, offset + limit).map(({ item }) => item),
      has_more: found.length > offset + limit,
    };
  }

  return {
    search,
    items: entries.map(({ item }) => item),
    brands: brands.sort((a, b) => a.localeCompare(b)),
    updated: data.updated,
  };
}

export const rackets = createIndex('racket', readData('rackets'));
export const strings = createIndex('string', readData('strings'));

/** What the list holds, so that an app can tell when it has changed and what to offer to filter by. */
export const referenceInfo = () => ({
  updated: [rackets.updated, strings.updated].sort().at(-1),
  rackets: { count: rackets.items.length, brands: rackets.brands },
  strings: { count: strings.items.length, brands: strings.brands },
});
