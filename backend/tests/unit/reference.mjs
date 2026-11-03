import assert from 'node:assert/strict';
import { createIndex, nameKey, normalize, rackets, referenceInfo, strings } from '../../src/utils/reference.js';

// --- How a text is read ------------------------------------------------------------------------------
assert.equal(normalize('Hyper-G'), 'hyper g');
assert.equal(normalize('  PURE   Drive '), 'pure drive');
assert.equal(normalize('Völkl'), 'volkl');
assert.equal(normalize('1,25 mm'), '1.25 mm');
assert.equal(normalize('Six.One 95'), 'six one 95');
assert.equal(normalize('EZONE 98+'), 'ezone 98 plus');
assert.equal(normalize('Йонекс'), normalize('ионекс'), 'a spelling with or without the accent is one spelling');
assert.equal(normalize(''), '');

// --- When two names are one racket -------------------------------------------------------------------
assert.equal(nameKey('Wilson', 'Pro Staff 97'), nameKey(' wilson ', 'PRO-STAFF 97'), 'case, spaces and dashes do not matter');
assert.equal(nameKey('Wilson', 'Pro Staff 97'), nameKey('Wilson', 'ProStaff97'), 'nor does a space typed inside a name');
assert.equal(nameKey('Völkl', 'V-Cell 8'), nameKey('Volkl', 'v cell 8'), 'nor an accent');
assert.notEqual(nameKey('Babolat', 'Pure Drive 98'), nameKey('Babolat', 'Pure Drive 98+'), '"+" makes another racket');
assert.notEqual(nameKey('Head', 'Speed MP'), nameKey('Head', 'Speed Pro'), 'a different model is a different racket');
assert.notEqual(nameKey('Wilson', 'Blade'), nameKey('Head', 'Blade'), 'and so is a different brand');

// --- Searching, on a small list whose answers can be told in advance ---------------------------------
const small = createIndex('racket', {
  updated: '2026-01-01',
  brands: [
    {
      brand: 'Acme',
      aliases: ['акме'],
      models: [
        'Rocket 98',
        { model: 'Rocket 98L', aliases: ['r98l', 'v2'] },
        'Rocket 100',
        'Rocket Pro 100',
        'Zoom 100',
        'Zoom 100+',
        'Hyper-G',
      ],
    },
    { brand: 'Other', models: ['Rocket Lite'] },
  ],
});
const names = (options) => small.search(options).items.map((item) => item.model);

assert.deepEqual(
  names({ q: 'rocket' }),
  ['Rocket 98', 'Rocket 98L', 'Rocket 100', 'Rocket Lite', 'Rocket Pro 100'],
  'what fits equally well goes by the length of the model, then by name, the numbers by their value'
);
assert.deepEqual(names({ q: 'rocket 98' }), ['Rocket 98', 'Rocket 98L'], 'the exact name first, then what begins with it');
assert.deepEqual(names({ q: 'ROCKET-98' }), ['Rocket 98', 'Rocket 98L'], 'case and dashes do not matter');
assert.deepEqual(names({ q: 'roc 98 l' }), ['Rocket 98L'], '"98 l" is "98L": the parts of a word are found one by one');
assert.deepEqual(names({ q: 'rocket98' }), ['Rocket 98', 'Rocket 98L'], 'a name typed without its spaces is found');
assert.deepEqual(names({ q: 'r98l' }), ['Rocket 98L'], 'an alias is found');
assert.deepEqual(names({ q: 'rocket 98l v2' }), ['Rocket 98L'], 'and goes with the rest of the name');
assert.deepEqual(names({ q: 'zoom 100+' }), ['Zoom 100+'], '"100+" is not "100"');
assert.deepEqual(names({ q: 'zoom 100' }), ['Zoom 100', 'Zoom 100+'], 'but "100" finds both, the exact one first');
assert.deepEqual(names({ q: 'hyperg' }), ['Hyper-G']);
assert.deepEqual(
  names({ q: 'акме' }),
  ['Hyper-G', 'Zoom 100', 'Rocket 98', 'Rocket 98L', 'Rocket 100', 'Zoom 100+', 'Rocket Pro 100'],
  'the brand by its other spelling'
);
assert.deepEqual(names({ q: 'rocket nothing' }), [], 'every word has to be found');
assert.deepEqual(names({ q: 'x' }), [], 'one letter that begins no word');
assert.ok(!names({ brand: 'ACME', q: 'rocket' }).includes('Rocket Lite'), 'a brand narrows the answer');
assert.deepEqual(names({ brand: 'акме', q: 'zoom' }), ['Zoom 100', 'Zoom 100+']);
assert.equal(small.search({ q: 'rocket', limit: 2 }).items.length, 2);
assert.equal(small.search({ q: 'rocket', limit: 2 }).has_more, true);
assert.equal(small.search({ q: 'rocket', limit: 2, offset: 4 }).has_more, false);
assert.deepEqual(names({ limit: 3 }), ['Hyper-G', 'Rocket 98', 'Rocket 98L'], 'with no words it is the list, by name and number');

// Strings: the type and the gauge can be searched, and the gauge can be typed three ways.
const wires = createIndex('string', {
  updated: '2026-01-01',
  brands: [
    {
      brand: 'Wire',
      models: [
        { model: 'Spin', type: 'polyester', gauges: ['1.20', '1.25'] },
        { model: 'Soft', type: 'multifilament', gauges: ['1.30'] },
        { model: 'Gut Pro', type: 'natural_gut' },
      ],
    },
  ],
});
const wireNames = (options) => wires.search(options).items.map((item) => item.model);
assert.deepEqual(wireNames({ q: 'wire 1.25' }), ['Spin']);
assert.deepEqual(wireNames({ q: 'spin 1,25' }), ['Spin']);
assert.deepEqual(wireNames({ q: 'spin 125' }), ['Spin']);
assert.deepEqual(wireNames({ q: 'poly' }), ['Spin']);
assert.deepEqual(wireNames({ type: 'natural_gut' }), ['Gut Pro']);
assert.deepEqual(wires.search({ q: 'soft' }).items[0], { id: 'wire-soft', brand: 'Wire', model: 'Soft', type: 'multifilament', gauges: ['1.30'] });
assert.deepEqual(wires.search({ q: 'gut' }).items[0].gauges, [], 'no gauges known is an empty list');

// --- A list that is not right does not load ---------------------------------------------------------
const list = (models, extra = {}) => ({ updated: 'x', brands: [{ brand: 'B', models, ...extra }] });
assert.throws(() => createIndex('racket', { brands: [] }), /rackets\.json/);
assert.throws(() => createIndex('racket', list([])), /models is a list/);
assert.throws(() => createIndex('racket', list(['A', 'a'])), /b-a is there twice/);
assert.throws(() => createIndex('racket', list([{ model: 'A', aliases: ['  '] }])), /alias is empty/);
assert.throws(() => createIndex('racket', list([' A'])), /needs a name/);
assert.throws(() => createIndex('string', list([{ model: 'A', type: 'rope' }])), /unknown type rope/);
assert.throws(() => createIndex('string', list([{ model: 'A', type: 'polyester', gauges: ['1.3'] }])), /gauges are like/);
assert.throws(() => createIndex('string', list([{ model: 'A', type: 'polyester', gauges: ['1.30', '1.25'] }])), /gauges are like/);

// --- The real list -----------------------------------------------------------------------------------
assert.ok(rackets.items.length >= 200, `rackets: ${rackets.items.length}`);
assert.ok(strings.items.length >= 100, `strings: ${strings.items.length}`);
const info = referenceInfo();
assert.equal(info.rackets.count, rackets.items.length);
assert.deepEqual(info.strings.brands, strings.brands);
assert.match(info.updated, /^\d{4}-\d{2}-\d{2}$/);

for (const [kind, index] of [['rackets', rackets], ['strings', strings]]) {
  for (const item of index.items) {
    // What is answered is these fields and no others: nothing of how it is searched.
    const keys = kind === 'rackets' ? ['brand', 'id', 'model'] : ['brand', 'gauges', 'id', 'model', 'type'];
    assert.deepEqual(Object.keys(item).sort(), keys, `${kind}: ${item.id}`);
    // Whoever types the whole name gets that one first.
    const found = index.search({ q: `${item.brand} ${item.model}`, limit: 1 }).items[0];
    assert.equal(found?.id, item.id, `${kind}: "${item.brand} ${item.model}" is found first by its name, not ${found?.id}`);
    // And by the model alone, however it is cased.
    const byModel = index.search({ q: item.model.toUpperCase(), limit: 50 }).items;
    assert.ok(byModel.some((other) => other.id === item.id), `${kind}: ${item.id} is found by its model`);
  }
}

const top = (index, q) => index.search({ q, limit: 1 }).items[0]?.id;
assert.equal(top(rackets, 'pure dr'), 'babolat-pure-drive');
assert.equal(top(rackets, 'prostaff 97'), 'wilson-pro-staff-97');
assert.equal(top(rackets, 'ps97'), 'wilson-pro-staff-97');
assert.equal(top(rackets, 'vcore 98'), 'yonex-vcore-98');
assert.equal(top(rackets, 'radical mp'), 'head-radical-mp');
assert.equal(top(strings, 'hyperg'), 'solinco-hyper-g');
assert.equal(top(strings, 'alu power'), 'luxilon-alu-power');
assert.equal(top(strings, 'алю пауер'), 'luxilon-alu-power');
assert.ok(rackets.search({ q: 'бабола' }).items.every((item) => item.brand === 'Babolat'));
assert.ok(strings.search({ q: 'люксілон', limit: 50 }).items.every((item) => item.brand === 'Luxilon'));
assert.ok(strings.search({ type: 'natural_gut', limit: 50 }).items.every((item) => item.type === 'natural_gut'));

console.log('reference: ok');
