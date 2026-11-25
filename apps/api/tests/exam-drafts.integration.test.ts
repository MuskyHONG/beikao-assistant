import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { createUser } from '../src/accounts.js';
import { migrate } from '../src/migrations.js';
import { changeQuestion, normalizeContent, type QuestionContent } from '../src/questions.js';

test('trial exams preserve published versions and drafts across sessions', async t => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'Use an isolated test database');
  const admin = new pg.Pool({ connectionString });
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 6 });
  const origin = 'http://exam.test', password = 'Test.Only.Exam.Password.143';
  const app = buildApp({ pool, auth: { origin, secureCookies: false, sessionHours: 24 },
    ready: async () => {}, version: 'test' });
  const base = '/api/v1/me/exams';
  const attemptId = randomUUID();
  const seed = JSON.parse(await readFile(new URL('../seed/trial-questions.json', import.meta.url), 'utf8')) as
    (QuestionContent & { id: string })[];
  const login = async (email: string) => {
    const result = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email, password } });
    assert.equal(result.statusCode, 200, result.body);
    return { origin, cookie: (result.headers['set-cookie'] as string).split(';')[0],
      'x-csrf-token': result.json().csrfToken as string };
  };
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await migrate(pool);
    const owner = await createUser(pool, { email: 'owner@exam.test', displayName: '管理员', password, role: 'admin' });
    await createUser(pool, { email: 'one@exam.test', displayName: '学员一', password, role: 'learner' }, owner.id);
    await createUser(pool, { email: 'two@exam.test', displayName: '学员二', password, role: 'learner' }, owner.id);
    const a = await login('one@exam.test'), b = await login('one@exam.test'), other = await login('two@exam.test'), staff = await login(owner.email);
    const read = (url: string, headers = a) => app.inject({ url, headers });
    const open = (payload: object, headers = a) => app.inject({ method: 'POST', url: base, payload, headers });
    const edit = (payload: object, headers = a) => app.inject({ method: 'PATCH', url: base + '/' + attemptId + '/draft', payload, headers });

    await t.test('knowledge cards use stable IDs and maintenance validates pool metadata', async () => {
      assert.equal((await app.inject('/api/v1/topics')).statusCode, 401);
      const topic = (await read('/api/v1/topics')).json().items.find((item: { id: string }) => item.id === 'A03');
      assert.equal(topic.card.id, 'KP-A03-01');
      assert.deepEqual(topic.card.points.map((point: { cue: string }) => point.cue), ['保','报','联','稳','复']);
      assert.equal((await open({ attemptId, tierMinutes: 20 })).json().error, 'exam_pool_empty');
      const { id, ...values } = seed[0];
      const payload = { content: { ...values, difficulty: null }, expectedRevision: 0, action: 'publish' };
      const request = { method: 'PUT' as const, url: '/api/v1/admin/questions/' + id, payload };
      assert.equal((await app.inject({ ...request, headers: a })).statusCode, 403);
      assert.equal((await app.inject({ ...request, headers: staff })).json().error, 'invalid_question');
      const published = await app.inject({ ...request, headers: staff, payload: { ...payload, content: values } });
      assert.equal(published.statusCode, 200, published.body);
      for (const row of seed.slice(1)) {
        await changeQuestion(pool, { id: row.id, actorId: owner.id, content: normalizeContent(row), expectedRevision: 0, action: 'publish' });
      }
      await changeQuestion(pool, { id: 'duplicate', actorId: owner.id, content: normalizeContent({ ...values, prompt: values.prompt + ' ' }),
        expectedRevision: 0, action: 'publish' });
      await changeQuestion(pool, { id: 'not-published', actorId: owner.id, content: normalizeContent({ ...values, prompt: '未发布内容' }),
        expectedRevision: 0, action: 'draft' });
      const { tiers } = (await read(base + '/availability')).json();
      assert.deepEqual(tiers.map((tier: { requested: number; actual: number; estimatedMinutes: number }) => [tier.requested,tier.actual,tier.estimatedMinutes]),
        [[10,10,20],[20,10,20],[30,10,20]]);
      assert.deepEqual(tiers[0].breakdown.map((section: { actual: number }) => section.actual), [4,2,3,1]);
      assert.equal(tiers[2].breakdown[0].difficulty.challengingShortfall, 6);
    });

    await t.test('opening is idempotent and the draft projection excludes keys', async () => {
      const payload = { attemptId, tierMinutes: 60 };
      const results = await Promise.all([open(payload), open(payload, b)]);
      for (const result of results) assert.equal(result.statusCode, 200, result.body);
      const { attempt } = results[0].json();
      assert.deepEqual(attempt.items, results[1].json().attempt.items);
      assert.equal(attempt.state, 'draft');
      assert.equal(attempt.items.length, 10);
      assert.equal(attempt.estimatedMinutes, 20);
      assert.doesNotMatch(results[0].body, /"correctIds"|"correct"|"referenceAnswer"|"rubric"|"explanation"|"accepted"/);
      assert.equal((await read(base + '/' + attemptId, other)).statusCode, 404);
      assert.equal((await open({ ...payload, tierMinutes: 40 })).statusCode, 409);
      assert.equal((await open({ ...payload, attemptId: randomUUID() }, { ...a, 'x-csrf-token': '' })).statusCode, 403);
    });

    await t.test('a second session resumes the same position and cannot overwrite newer work', async () => {
      const change = { expectedRevision: 1, currentItemNo: 2, answer: { itemNo: 1, response: 'A' } };
      const first = await edit(change);
      assert.equal(first.statusCode, 200, first.body);
      const second = (await read(base + '/' + attemptId, b)).json().attempt;
      assert.equal(second.currentItemNo, 2);
      assert.equal(second.items[0].response, 'A');
      assert.equal((await edit(change, b)).json().attempt.revision, 2);
      const conflict = await edit({ ...change, answer: { itemNo: 1, response: 'B' } }, b);
      assert.equal(conflict.statusCode, 409);
      assert.equal(conflict.json().currentRevision, 2);
      assert.equal((await edit({ expectedRevision: 2, answer: { itemNo: 7, response: '[]' } })).statusCode, 400);
      assert.equal((await edit({ expectedRevision: 2, answer: { itemNo: 1, response: null } }, other)).statusCode, 404);
      const clear = await edit({ expectedRevision: 2, answer: { itemNo: 1, response: null } }, b);
      assert.equal(clear.json().attempt.items[0].response, null);
      assert.equal(clear.json().attempt.revision, 3);
    });

    await t.test('version changes and failed replacements leave the original paper intact', async () => {
      const [item] = (await read(base + '/' + attemptId)).json().attempt.items;
      const row = seed.find(q => q.id === item.questionId) ?? seed[0];
      await changeQuestion(pool, { id: item.questionId, actorId: owner.id, content: normalizeContent({ ...row, prompt: '试用新版', simulation: false }),
        expectedRevision: 2, action: 'publish' });
      const after = (await read(base + '/' + attemptId, b)).json().attempt;
      assert.equal(after.items[0].prompt, item.prompt);
      assert.equal(after.items[0].questionVersion, 1);
      const input = { attemptId: randomUUID(), tierMinutes: 20, replaceDraft: { id: attemptId, revision: 2 } };
      assert.equal((await open(input)).json().error, 'exam_state_conflict');
      for (const id of new Set([...seed.map(q => q.id), 'duplicate'])) {
        await changeQuestion(pool, { id, actorId: owner.id, expectedRevision: id === item.questionId ? 3 : 2, action: 'archive' });
      }
      const replacement = await open({ ...input, replaceDraft: { id: attemptId, revision: 3 } });
      assert.equal(replacement.json().error, 'exam_pool_empty');
      assert.equal((await read(base + '/availability', b)).json().draft.id, attemptId);
    });

    await t.test('a full pool draws each target and a confirmed replacement preserves one active draft', async () => {
      for (const [index, row] of seed.entries()) {
        for (let copy = 0; copy < 3; copy++) {
          const content = normalizeContent({ ...row, prompt: `${row.prompt}（测试样本 ${copy}）`,
            difficulty: row.kind === 'judgment' && index === 4 && copy === 0 ? 'basic' : row.difficulty });
          await changeQuestion(pool, { id: `test-pool-${index}-${copy}`, actorId: owner.id, content, expectedRevision: 0, action: 'publish' });
        }
      }
      const { tiers } = (await read(base + '/availability')).json();
      assert.deepEqual(tiers.map((tier: { actual: number }) => tier.actual), [10,20,30]);
      const payload = { attemptId: randomUUID(), tierMinutes: 60, replaceDraft: { id: attemptId, revision: 3 } };
      const newDraft = await open(payload, b);
      assert.equal(newDraft.statusCode, 200, newDraft.body);
      assert.deepEqual(newDraft.json().attempt.items.map((item: { kind: string }) => item.kind),
        ['choice','judgment','fill','short'].flatMap((kind, i) => Array([12,6,9,3][i]).fill(kind)));
      assert.equal((await read(base + '/' + attemptId)).json().attempt.state, 'replaced');
      assert.equal((await edit({ expectedRevision: 3, currentItemNo: 1 })).json().error, 'exam_state_conflict');
      assert.equal((await open(payload)).json().attempt.id, payload.attemptId);
    });
  } finally {
    await app.close();
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
