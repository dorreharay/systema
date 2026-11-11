import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fillMissingEnv } from '../../src/utils/containerEnv.js';

// What /proc/1/environ looks like: NAME=value entries, each ended by a zero byte; a value may hold "=".
const file = join(mkdtempSync(join(tmpdir(), 'environ-')), 'environ');
writeFileSync(file, 'DATABASE_URL=postgres://u:p@host/db?x=1\0PATH=/server/path\0EMPTY=\0=nameless\0');

const env = { PATH: '/mine' };
assert.equal(fillMissingEnv(env, file), 2, 'two were missing: the address and the empty one');
assert.equal(env.DATABASE_URL, 'postgres://u:p@host/db?x=1', 'a value keeps its own "="');
assert.equal(env.PATH, '/mine', 'what is already set is left alone');
assert.equal(env.EMPTY, '', 'an empty value is a value');
assert.equal(Object.keys(env).length, 3, 'an entry without a name is skipped');

assert.equal(fillMissingEnv({}, join(tmpdir(), 'no-such-environ-file')), 0, 'no /proc, no change, no error');

console.log('containerEnv: ok');
