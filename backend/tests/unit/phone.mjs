import assert from 'node:assert/strict';
import { phoneKey } from '../../src/utils/phone.js';

// A Ukrainian number is one number however it was typed.
const same = ['0501112233', '050 111-22-33', '(050) 111 22 33', '+380501112233', '+38 (050) 111-22-33', '380501112233', '80501112233'];
for (const typed of same) assert.equal(phoneKey(typed), '380501112233', `the same number: ${typed}`);

// Another number is another number.
assert.notEqual(phoneKey('0501112233'), phoneKey('0501112234'));
assert.notEqual(phoneKey('+380501112233'), phoneKey('+380671112233'));

// Anywhere else it is the digits it has.
assert.equal(phoneKey('+1 (415) 555-0172'), '14155550172');
assert.equal(phoneKey('020 7946 0958'), '02079460958');

// Nothing to compare when there are no digits.
for (const none of ['', '   ', '—', '+', null, undefined]) assert.equal(phoneKey(none), '', `no digits: ${String(none)}`);

console.log('phone: ok');
