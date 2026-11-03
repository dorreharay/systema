import type { CatalogString, ReferenceRacket, ReferenceString } from '@/lib/types';

// What the reference list offers while a racket or a string is typed, less what the stringer's catalog already has.

/**
 * A name as it is compared: no case, accents, spaces or marks ("Völkl V-Cell 8" is "volklvcell8"), but a "+" counts
 * ("Pure Drive 98+" is not "Pure Drive 98"). The server compares the names of rackets the same way.
 */
export const nameKey = (brand: string, model: string) =>
  `${brand} ${model}`
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** The rackets of the reference list that the catalog does not have. */
export function withoutOwnedRackets(items: ReferenceRacket[], owned: { brand: string; model: string }[]) {
  const keys = new Set(owned.map((racket) => nameKey(racket.brand, racket.model)));
  return items.filter((item) => !keys.has(nameKey(item.brand, item.model)));
}

/** The size written in a gauge ("1.25 mm", "1,3"), as the reference writes it ("1.25", "1.30"); null when there is none. */
export function gaugeKey(gauge: string | null) {
  const found = gauge?.match(/\d+(?:[.,]\d+)?/);
  return found ? Number(found[0].replace(',', '.')).toFixed(2) : null;
}

/**
 * The strings of the reference list that the catalog does not have in full. A string is in the catalog once for each
 * size, so one that the catalog has in some sizes is still offered, with the sizes that are left.
 */
export function withoutOwnedStrings(
  items: ReferenceString[],
  owned: Pick<CatalogString, 'brand' | 'model' | 'gauge'>[]
) {
  const sizes = new Map<string, Set<string | null>>();
  for (const string of owned) {
    const key = nameKey(string.brand, string.model);
    sizes.set(key, (sizes.get(key) ?? new Set()).add(gaugeKey(string.gauge)));
  }

  return items.flatMap((item) => {
    const have = sizes.get(nameKey(item.brand, item.model));
    if (!have) return [item];
    // No sizes to tell one from another: it is there.
    if (item.gauges.length === 0) return [];
    const left = item.gauges.filter((gauge) => !have.has(gauge));
    return left.length > 0 ? [{ ...item, gauges: left }] : [];
  });
}
