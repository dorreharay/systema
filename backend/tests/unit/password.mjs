import assert from 'node:assert/strict';

// The real cost makes every hash take a quarter of a second.
process.env.BCRYPT_ROUNDS = '4';
const { MIN_PASSWORD_LENGTH, hashPassword, newPasswordSchema, verifyAgainstDecoy, verifyPassword } =
  await import('../../src/utils/password.js');

assert.equal(MIN_PASSWORD_LENGTH, 8, 'the same minimum as the app');
assert.ok(newPasswordSchema.safeParse('12345678').success);
assert.ok(!newPasswordSchema.safeParse('1234567').success, 'too short');
assert.ok(!newPasswordSchema.safeParse(undefined).success, 'missing');
assert.ok(newPasswordSchema.safeParse('a'.repeat(72)).success);
assert.ok(!newPasswordSchema.safeParse('a'.repeat(73)).success, 'bcrypt would cut it');
assert.ok(!newPasswordSchema.safeParse('я'.repeat(37)).success, 'counted in bytes, not characters');

const hash = await hashPassword('correct-horse-1');
assert.notEqual(hash, 'correct-horse-1');
assert.ok(await verifyPassword('correct-horse-1', hash));
assert.ok(!(await verifyPassword('wrong', hash)));
assert.notEqual(await hashPassword('correct-horse-1'), hash, 'salted');

await verifyAgainstDecoy('anything'); // does not throw

console.log('password: ok');
