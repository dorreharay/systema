// Checks the dictionaries of the app against the English one, and the texts of the server against theirs:
//
//   node scripts/check-i18n.mjs            every language
//   node scripts/check-i18n.mjs de pl      only these
//
// A dictionary has every key of src/lib/i18n/en.ts (the plural forms excepted: see PLURAL_FORMS), the same {placeholders} in
// each text, and no empty text. Exits with 1 when something is wrong. Texts that are the same as the English are only listed:
// a name, a unit or a loan word can be the same in another language.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { en } = await import(pathToFileURL(`${root}src/lib/i18n/en.ts`).href);
const { default: enMessages } = await import(pathToFileURL(`${root}backend/src/utils/messages/en.js`).href);

const LANGUAGES = ['de', 'fr', 'es', 'it', 'pt', 'ja', 'uk', 'pl'];

// The messages that have a form for each number (`<group>_one`...), and the forms each language has beside the plain key, which
// is the form for every other number. (Plural categories of the CLDR: one is 1 in German, Spanish and Italian, 0 and 1 in French
// and Portuguese; Japanese has none; Ukrainian and Polish have one, few and many.)
const PLURAL_GROUPS = ['date_in_days', 'insights_unpaid_orders', 'insights_week_due', 'orders_count', 'rackets_count'];
const PLURAL_FORMS = {
  de: ['one'],
  fr: ['one'],
  es: ['one'],
  it: ['one'],
  pt: ['one'],
  ja: [],
  uk: ['one', 'few', 'many'],
  pl: ['one', 'few', 'many'],
};

const FORM = new RegExp(`^(${PLURAL_GROUPS.join('|')})_(one|few|many|other)$`);
const placeholders = (text) => [...new Set(String(text).match(/\{\w+\}/g) ?? [])].sort().join(' ');

const baseKeys = Object.keys(en).filter((key) => !FORM.test(key));
const problems = [];
const same = [];

function expectedKeys(code) {
  const keys = new Set(baseKeys);
  for (const group of PLURAL_GROUPS) for (const form of PLURAL_FORMS[code]) keys.add(`${group}_${form}`);
  return keys;
}

function checkDictionary(code, dictionary) {
  const expected = expectedKeys(code);
  const actual = new Set(Object.keys(dictionary));
  for (const key of expected) if (!actual.has(key)) problems.push(`${code}: missing key ${key}`);
  for (const key of actual) if (!expected.has(key)) problems.push(`${code}: unexpected key ${key}`);

  for (const [key, text] of Object.entries(dictionary)) {
    if (typeof text !== 'string' || text.trim() === '') {
      problems.push(`${code}: ${key} is empty`);
      continue;
    }
    if (text !== text.trim()) problems.push(`${code}: ${key} has a space at an end`);
    // A form of a plural has the placeholders of the plain English key; every other key those of its own.
    const form = FORM.exec(key);
    const source = form ? en[form[1]] : en[key];
    if (source === undefined) continue;
    if (placeholders(text) !== placeholders(source)) {
      problems.push(`${code}: ${key} has {${placeholders(text)}} where English has {${placeholders(source)}}`);
    }
    if (!form && text === source && source.split(/\s+/).length > 2) same.push(`${code}: ${key} = ${JSON.stringify(text)}`);
  }
}

function checkMessages(code, messages) {
  for (const part of Object.keys(enMessages)) {
    for (const key of Object.keys(enMessages[part])) {
      const text = messages?.[part]?.[key];
      if (typeof text !== 'string' || text.trim() === '') {
        problems.push(`${code} (server): ${part}.${key} is missing or empty`);
      } else if (placeholders(text) !== placeholders(enMessages[part][key])) {
        problems.push(`${code} (server): ${part}.${key} has {${placeholders(text)}} where English has {${placeholders(enMessages[part][key])}}`);
      }
    }
    for (const key of Object.keys(messages?.[part] ?? {})) {
      if (!(key in enMessages[part])) problems.push(`${code} (server): unexpected ${part}.${key}`);
    }
  }
}

const wanted = process.argv.slice(2);
const codes = wanted.length ? wanted : LANGUAGES;
for (const code of codes) {
  if (!LANGUAGES.includes(code)) {
    problems.push(`${code}: not one of ${LANGUAGES.join(', ')}`);
    continue;
  }
  const file = `${root}src/lib/i18n/${code}.ts`;
  if (!existsSync(file)) {
    problems.push(`${code}: src/lib/i18n/${code}.ts does not exist`);
  } else {
    const module = await import(pathToFileURL(file).href);
    checkDictionary(code, module[code] ?? {});
  }
  const serverFile = `${root}backend/src/utils/messages/${code}.js`;
  if (!existsSync(serverFile)) {
    problems.push(`${code} (server): backend/src/utils/messages/${code}.js does not exist`);
  } else {
    checkMessages(code, (await import(pathToFileURL(serverFile).href)).default);
  }
}

if (same.length) console.log(`The same as the English (look at them, they may be right):\n  ${same.join('\n  ')}\n`);
if (problems.length) {
  console.log(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`${codes.join(', ')}: all keys, placeholders and plural forms are in place.`);
