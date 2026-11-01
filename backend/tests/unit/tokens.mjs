import assert from 'node:assert/strict';
import { createToken, hashToken } from '../../src/utils/tokens.js';

const { token, hash } = createToken();
assert.match(token, /^[\w-]{43}$/, 'a URL-safe token of 32 random bytes');
assert.equal(hash, hashToken(token), 'the hash is of the token');
assert.match(hash, /^[0-9a-f]{64}$/, 'SHA-256 in hex');
assert.notEqual(hash, token);
assert.notEqual(createToken().token, token, 'every token is new');
assert.notEqual(hashToken('a'), hashToken('b'));

console.log('tokens: ok');
