import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, newToken, csrfFor, digest } from '../src/passwords.js';
test('scrypt salts are random; password checks and session/CSRF digests are separate',async()=>{
  const password='Synthetic.Test.Password.123',a=await hashPassword(password),b=await hashPassword(password);
  assert.notEqual(a,b);assert.ok(!a.includes(password));assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('wrong',a),false);assert.equal(await verifyPassword(password,'malformed'),false);
  const token=newToken();assert.equal(token.length,64);assert.notEqual(csrfFor(token),digest(token));assert.notEqual(digest(token),token);
});
