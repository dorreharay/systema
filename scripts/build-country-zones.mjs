// Builds src/lib/country-zones.ts, the time zones of every country, from the tz database (zone.tab):
//
//   node scripts/build-country-zones.mjs                       reads /usr/share/zoneinfo (macOS, most Linux)
//   node scripts/build-country-zones.mjs path/to/zoneinfo      reads another copy of the database
//
// Run it again when the tz database gets a country or a zone the app should know. Antarctica is left out: nobody strings rackets
// there. The choices made by hand (which zones a country with several offers, which one is its main) are in src/lib/countries.ts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = process.argv[2] ?? '/usr/share/zoneinfo';
const table = `${source}/zone.tab`;
if (!existsSync(table)) {
  console.error(`No zone.tab in ${source}`);
  process.exit(1);
}

const version = existsSync(`${source}/+VERSION`) ? readFileSync(`${source}/+VERSION`, 'utf8').trim() : 'unknown';
const SKIP = new Set(['AQ']);

const zones = new Map();
for (const line of readFileSync(table, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [country, , zone] = line.split('\t');
  if (SKIP.has(country)) continue;
  zones.set(country, [...(zones.get(country) ?? []), zone]);
}

const rows = [...zones]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([country, list]) => `  ${country}: [${list.map((zone) => `'${zone}'`).join(', ')}],`);

const output = `// Made by scripts/build-country-zones.mjs from zone.tab of the tz database (version ${version}). Do not edit by hand.

/** Every time zone of a country (ISO 3166-1 alpha-2), in the order of zone.tab. */
export const COUNTRY_ZONES: Record<string, readonly string[]> = {
${rows.join('\n')}
};
`;

writeFileSync(`${root}src/lib/country-zones.ts`, output);
console.log(`${zones.size} countries, ${[...zones.values()].flat().length} zones, tz database ${version}`);
