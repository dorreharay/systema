import assert from 'node:assert/strict';
import { HttpError, forbidden, isUuid, notFound } from '../../src/utils/http.js';

assert.ok(isUuid('dc182344-d225-4d4e-a97c-f1b9078e635d'));
assert.ok(isUuid('DC182344-D225-4D4E-A97C-F1B9078E635D'));
for (const bad of ['', 'abc', 123, null, undefined, 'dc182344-d225-4d4e-a97c-f1b9078e635', "x'; DROP TABLE users;--"]) {
  assert.ok(!isUuid(bad), `not a uuid: ${String(bad)}`);
}

const error = new HttpError(409, 'Taken', { code: 'email_taken', fields: { email: 'Taken' } });
assert.equal(error.status, 409);
assert.equal(error.message, 'Taken');
assert.equal(error.code, 'email_taken');
assert.deepEqual(error.fields, { email: 'Taken' });
assert.ok(error instanceof Error);

assert.equal(new HttpError(400, 'x').code, undefined, 'no code unless given');
assert.equal(notFound().status, 404);
assert.equal(forbidden().status, 403);

console.log('http: ok');
