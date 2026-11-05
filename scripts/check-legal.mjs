// Checks the legal pages of the website (site/**/privacy and site/**/terms) in every language of the app:
//
//   node scripts/check-legal.mjs
//
// Every language has both pages; each page says which language it is in, links to the same page in every other language (the
// switch in the header and the hreflang links in the head) and to its own sitemap entry; the text of every translation has the
// very same tags, ids, classes, anchors and links as the English one (only the words differ); every internal link and anchor leads
// somewhere; and there is one operator block per page (see site/README.md). Exits with 1 when something is wrong.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://tryrestring.com';
const PAGES = ['privacy', 'terms'];
// The languages of the app, in the order of its list: the folder of each one in the site (Ukrainian is the root).
const LANGUAGES = [
  ['en', '/en'],
  ['de', '/de'],
  ['fr', '/fr'],
  ['es', '/es'],
  ['it', '/it'],
  ['pt', '/pt'],
  ['ja', '/ja'],
  ['uk', ''],
  ['pl', '/pl'],
];

const problems = [];
const problem = (message) => problems.push(message);

const pathOf = (prefix, page) => `${prefix}/${page}/`;
const fileOf = (path) => join(root, 'site', path.replace(/^\//, ''), path.endsWith('/') ? 'index.html' : '');
const read = (path) => readFileSync(fileOf(path), 'utf8');

const prose = (html) => html.match(/<div class="prose">[\s\S]*<\/div>(?=\s*<\/main>)/)?.[0];
const tokens = (html) => html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) ?? [];

/** A tag in a form that can be compared between languages: its name and attributes, but not the language of its link. */
function normalize(tag) {
  if (tag.startsWith('<!--')) return tag;
  const name = tag.match(/^<\/?([\w-]+)/)?.[1] ?? tag;
  if (tag.startsWith('</')) return `</${name}>`;
  const attributes = [...tag.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].slice(1).map(([, key, value = '']) => {
    if (key === 'aria-label') return 'aria-label=*';
    if (key === 'href' && /^\/(en|de|fr|es|it|pt|ja|pl)?\/?(terms|privacy)\/$/.test(value)) return `href=/LANG/${value.split('/').filter(Boolean).pop()}/`;
    return `${key}=${value}`;
  });
  return `<${name} ${attributes.sort().join(' ')}>`;
}

const english = Object.fromEntries(PAGES.map((page) => [page, tokens(prose(read(pathOf('/en', page))))]));

for (const [code, prefix] of LANGUAGES) {
  for (const page of PAGES) {
    const path = pathOf(prefix, page);
    const where = `${code} ${page}`;
    if (!existsSync(fileOf(path))) {
      problem(`${where}: ${path} does not exist`);
      continue;
    }
    const html = read(path);
    const own = `${SITE}${path}`;

    if (!html.includes(`<html lang="${code}">`)) problem(`${where}: <html lang="${code}"> is missing`);
    if (!html.includes(`<link rel="canonical" href="${own}">`)) problem(`${where}: the canonical link should be ${own}`);
    if (!html.includes(`<meta property="og:url" content="${own}">`)) problem(`${where}: og:url should be ${own}`);

    // The same page in every language, and the English one for everything else.
    const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => `${m[1]} ${m[2]}`);
    const expectedAlternates = [...LANGUAGES.map(([c, p]) => `${c} ${SITE}${pathOf(p, page)}`), `x-default ${SITE}${pathOf('/en', page)}`];
    if (alternates.join('\n') !== expectedAlternates.join('\n')) problem(`${where}: the hreflang links are not the ${LANGUAGES.length} languages and x-default, in order`);

    const nav = html.match(/<nav class="lang" aria-label="[^"]+">(.*?)<\/nav>/s)?.[1] ?? '';
    const links = [...nav.matchAll(/<a href="([^"]+)" hreflang="([^"]+)" lang="([^"]+)"( aria-current="true")?>([^<]+)<\/a>/g)];
    if (links.length !== LANGUAGES.length) problem(`${where}: the language switch has ${links.length} links, not ${LANGUAGES.length}`);
    links.forEach((link, i) => {
      const [c, p] = LANGUAGES[i] ?? [];
      if (link[1] !== pathOf(p, page) || link[2] !== c || link[3] !== c) problem(`${where}: link ${i + 1} of the language switch should lead to ${c}: ${pathOf(p, page)}`);
      if (Boolean(link[4]) !== (c === code)) problem(`${where}: aria-current is on the wrong language (${c})`);
    });

    const og = [...html.matchAll(/<meta property="og:locale(?::alternate)?" content="([^"]+)">/g)].length;
    if (og !== LANGUAGES.length) problem(`${where}: ${og} og:locale lines, not ${LANGUAGES.length}`);

    // One operator block and the comment that says what to do with it.
    if ((html.match(/data-operator/g) ?? []).length !== 1) problem(`${where}: there should be one data-operator block`);
    if (!html.includes('<!-- OPERATOR: replace this block')) problem(`${where}: the OPERATOR comment is missing`);

    // The same text structure as the English page.
    if (code !== 'en') {
      const mine = tokens(prose(html) ?? '');
      const theirs = english[page];
      if (mine.length !== theirs.length) {
        problem(`${where}: ${mine.length} parts of markup and text, English has ${theirs.length}`);
      } else {
        for (let i = 0; i < mine.length; i++) {
          const a = theirs[i];
          const b = mine[i];
          if (a.startsWith('<') !== b.startsWith('<')) {
            problem(`${where}: part ${i} is text in one page and a tag in the other (near: ${mine.slice(Math.max(0, i - 2), i + 1).join('').slice(-120)})`);
            break;
          }
          if (a.startsWith('<') && normalize(a) !== normalize(b)) {
            problem(`${where}: part ${i} differs from English: ${b.slice(0, 120)}`);
            break;
          }
        }
      }
    }

    // Every link and anchor leads somewhere.
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const [, href] of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
      if (href.startsWith('#')) {
        if (!ids.has(href.slice(1))) problem(`${where}: the anchor ${href} has no target`);
      } else if (href.startsWith('/')) {
        if (!existsSync(fileOf(href))) problem(`${where}: the link ${href} leads to no page`);
      }
    }
    for (const [, href] of html.matchAll(/<link rel="(?:icon|apple-touch-icon|stylesheet)"[^>]*href="(\/[^"]+)"/g)) {
      if (!existsSync(fileOf(href))) problem(`${where}: ${href} does not exist`);
    }
    if (!html.includes(`<a href="${pathOf(prefix, 'terms')}">`) || !html.includes(`<a href="${pathOf(prefix, 'privacy')}">`)) {
      problem(`${where}: the footer should link to the terms and the privacy policy of its own language`);
    }
  }
}

// The sitemap lists every page.
const sitemap = readFileSync(join(root, 'site', 'sitemap.xml'), 'utf8');
for (const [, prefix] of LANGUAGES) {
  for (const page of PAGES) {
    if (!sitemap.includes(`<loc>${SITE}${pathOf(prefix, page)}</loc>`)) problem(`sitemap.xml: ${pathOf(prefix, page)} is missing`);
  }
}

if (problems.length) {
  for (const message of problems) console.log(`PROBLEM  ${message}`);
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`The legal pages: ${LANGUAGES.length} languages x ${PAGES.length} pages, all as they should be.`);
