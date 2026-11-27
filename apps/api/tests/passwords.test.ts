import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, isNewPassword, verifyPassword, newToken, csrfFor, digest } from '../src/passwords.js';

test('a new password needs at least nine characters, uppercase, lowercase and a digit', () => {
  for (const password of ['Aa1234567', 'Aa1!23456', 'Ab1' + 'x'.repeat(125)]) assert.equal(isNewPassword(password), true);
  for (const password of ['Aa123456', 'AA1234567', 'aa1234567', 'Abcdefghi', 'Ab1' + 'x'.repeat(126)]) {
    assert.equal(isNewPassword(password), false);
  }
});
test('scrypt salts are random; password checks and session/CSRF digests are separate',async()=>{
  const password='Synthetic.Test.Password.123',a=await hashPassword(password),b=await hashPassword(password);
  assert.notEqual(a,b);assert.ok(!a.includes(password));assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('wrong',a),false);assert.equal(await verifyPassword(password,'malformed'),false);
  const token=newToken();assert.equal(token.length,64);assert.notEqual(csrfFor(token),digest(token));assert.notEqual(digest(token),token);
});
