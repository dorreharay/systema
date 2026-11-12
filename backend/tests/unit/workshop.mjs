import assert from 'node:assert/strict';
import { formatCode, hashCode, newInviteCode, normalizeCode } from '../../src/utils/workshop.js';

// An invitation code is read out over the phone and typed, so it has none of the letters and digits that look alike.
for (let i = 0; i < 200; i += 1) {
  const code = newInviteCode();
  assert.match(code, /^[A-HJKMNP-Z2-9]{10}$/, `a code is ten symbols without 0, O, 1, I, L: ${code}`);
}
assert.equal(new Set(Array.from({ length: 200 }, newInviteCode)).size, 200, 'no two alike');

// It is typed any way: in any case, with spaces or dashes, between spaces.
assert.equal(formatCode('ABCDEFGHJK'), 'ABCDE-FGHJK', 'shown in two groups');
assert.equal(normalizeCode(' abcde-fghjk '), 'ABCDEFGHJK');
assert.equal(normalizeCode('abcde fghjk'), 'ABCDEFGHJK');
assert.equal(normalizeCode(undefined), '');
assert.equal(hashCode('ABCDE-FGHJK'), hashCode('abcdefghjk'), 'the same code, the same hash');
assert.notEqual(hashCode('ABCDE-FGHJK'), hashCode('ABCDE-FGHJL'));
assert.match(hashCode('ABCDEFGHJK'), /^[0-9a-f]{64}$/, 'a SHA-256, never the code');

console.log('workshop: ok');
