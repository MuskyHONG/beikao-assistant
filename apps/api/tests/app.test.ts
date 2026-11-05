import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

test('liveness does not depend on a healthy database; readiness does', async () => {
  const app = buildApp({ version: '0.2.0-alpha.1', ready: async () => { throw new Error('postgres://secret@private-host'); } });
  try {
    const live = await app.inject('/api/v1/health/live');
    assert.equal(live.statusCode, 200);
    const ready = await app.inject('/api/v1/health/ready');
    assert.equal(ready.statusCode, 503);
    assert.equal(ready.headers['cache-control'], 'no-store');
    assert.ok(!ready.body.includes('secret'));
    assert.ok(!ready.body.includes('private-host'));
  } finally { await app.close(); }
});

test('readiness and explicit capability/version metadata describe this milestone', async () => {
  const app = buildApp({ version: '0.2.0-alpha.1', ready: async () => {} });
  try {
    assert.equal((await app.inject('/api/v1/health/ready')).statusCode, 200);
    const body = (await app.inject('/api/v1/version')).json();
    assert.equal(body.version, '0.2.0-alpha.1');
    assert.equal(body.capabilities.sharedQuestionBank, false);
    assert.equal((await app.inject('/api/v1/questions')).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/questions', payload: {} })).statusCode, 404);
  } finally { await app.close(); }
});
