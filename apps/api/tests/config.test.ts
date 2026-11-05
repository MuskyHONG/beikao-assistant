import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';

test('invalid connection or port fails before a listener starts without echoing secrets', () => {
  assert.throws(() => readConfig({}), /DATABASE_URL/);
  assert.throws(() => readConfig({ DATABASE_URL: 'https://private:secret@host/db' }), /^Error: DATABASE_URL must be a PostgreSQL URL$/);
  assert.throws(() => readConfig({ DATABASE_URL: 'postgres://host/db', PORT: '0' }), /Invalid PORT/);
  assert.throws(() => readConfig({ DATABASE_URL: 'postgres://host/db', PORT: '3.5' }), /Invalid PORT/);
  assert.equal(readConfig({ DATABASE_URL: 'postgres://host/db' }).host, '127.0.0.1');
  assert.throws(()=>readConfig({DATABASE_URL:'postgres://host/db',NODE_ENV:'production',APP_ORIGIN:'http://example.test'}),/requires HTTPS/);
  assert.throws(()=>readConfig({DATABASE_URL:'postgres://host/db',APP_ORIGIN:'https://example.test/'}),/exact HTTP/);
  assert.equal(readConfig({DATABASE_URL:'postgres://host/db',NODE_ENV:'production',APP_ORIGIN:'https://example.test'}).auth.secureCookies,true);
});
