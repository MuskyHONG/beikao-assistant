import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/migrations.js';
import { createUser } from '../src/accounts.js';
import { changeQuestion, normalizeContent } from '../src/questions.js';

test('account study survives sessions and versions without cross-user writes', async t => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'TEST_DATABASE_URL must point to an isolated test database');
  const admin = new pg.Pool({ connectionString }), schema = 'test_' + randomUUID().replaceAll('-', '');
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 6 });
  const origin = 'http://study.test', password = 'Test.Only.Password.143';
  const app = buildApp({ pool, auth: { origin, secureCookies: false, sessionHours: 24 }, ready: async () => {}, version: '0.3.0-alpha.1' });
  const prefix = '/api/v1/me';
  async function login(email: string) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email, password } });
    assert.equal(response.statusCode, 200, response.body);
    return { origin, cookie: (response.headers['set-cookie'] as string).split(';')[0], 'x-csrf-token': response.json().csrfToken as string };
  }
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await migrate(pool);
    const owner = await createUser(pool, { email: 'owner@study.test', displayName: '管理员', password, role: 'admin' });
    const one = await createUser(pool, { email: 'one@study.test', displayName: '学员一', password, role: 'learner' }, owner.id);
    await createUser(pool, { email: 'two@study.test', displayName: '学员二', password, role: 'learner' }, owner.id);
    const first = await login(one.email), second = await login(one.email), other = await login('two@study.test');
    const get = (url: string, headers = first) => app.inject({ url: prefix + url, headers });
    const write = (method: 'PUT' | 'POST', url: string, payload: object, headers = first) => app.inject({ method, url: prefix + url, headers, payload });
    const content = normalizeContent({ kind: 'short', topic: 'organization', prompt: '旧题干', title: '原题', max: 5, points: ['说明责任主体'], referenceAnswer: '先明确职责和协调机制。' });
    const root = await changeQuestion(pool, { id: 'root-study', actorId: owner.id, content, expectedRevision: 0, action: 'publish' });
    await changeQuestion(pool, { id: 'variant-study', actorId: owner.id, content: { ...content, parentId: root.id, title: '关联变式', prompt: '陌生情境' }, expectedRevision: 0, action: 'publish' });
    await changeQuestion(pool, { id: 'evaluation-study', actorId: owner.id, content: { ...content, topic: 'evaluation' }, expectedRevision: 0, action: 'publish' });
    await changeQuestion(pool, { id: 'objective-study', actorId: owner.id, content: normalizeContent({ kind: 'judgment', topic: 'evaluation', prompt: '可核对的判断题', correct: '正确', explanation: '核对依据', max: 2 }), expectedRevision: 0, action: 'publish' });

    await t.test('goal uses account revision and validates calendar dates', async () => {
      assert.equal((await app.inject(prefix + '/study')).statusCode, 401);
      const value = { examDate: '2035-12-17', dailyHours: 1.5, includeExamDay: true, timezone: 'Asia/Shanghai', revision: 0 };
      assert.equal((await write('PUT', '/study-goal', { ...value, examDate: '2035-02-29' })).statusCode, 400);
      assert.equal((await write('PUT', '/study-goal', value, { ...first, 'x-csrf-token': '' })).statusCode, 403);
      assert.equal((await write('PUT', '/study-goal', value)).statusCode, 200);
      assert.equal((await write('PUT', '/study-goal', { ...value, dailyHours: 2 }, second)).statusCode, 409);
      assert.equal((await get('/study', second)).json().goal.dailyHours, 1.5);
      assert.equal((await get('/study', other)).json().goal, null);
    });

    await t.test('drafts use optimistic revisions, including two requests with the same base', async () => {
      const path = '/practice/root-study/draft', input = { version: 1, response: '先写一段', expectedRevision: 0 };
      assert.equal((await write('PUT', path, input)).json().draft.revision, 1);
      const responses = await Promise.all([write('PUT', path, { ...input, response: '设备一', expectedRevision: 1 }), write('PUT', path, { ...input, response: '设备二', expectedRevision: 1 }, second)]);
      assert.deepEqual(responses.map(result => result.statusCode).sort(), [200,409]);
      const winner = responses.find(result => result.statusCode === 200)!.json().draft;
      assert.equal((await get('/practice/root-study', second)).json().drafts[0].response, winner.response);
      assert.equal((await write('PUT', path, { ...input, response: winner.response })).json().draft.revision, 2);
      assert.deepEqual((await get('/practice/root-study', other)).json().drafts, []);
    });

    await t.test('blank rating schedules once; a due review writes an independent attempt', async () => {
      const initial = { submissionId: randomUUID(), version: 1, response: '', rating: 'weak', checked: false, focusPoint: 0 };
      const path = '/practice/root-study/attempts';
      const firstResult = await write('POST', path, initial);
      assert.equal(firstResult.statusCode, 200, firstResult.body);
      assert.equal(firstResult.json().attempt.assessment, null);
      assert.equal((await write('POST', path, initial, second)).json().attempt.id, initial.submissionId);
      assert.equal((await write('POST', path, { ...initial, rating: 'fuzzy' })).statusCode, 409);
      const study = (await get('/study', second)).json(), [review] = study.reviews;
      assert.equal(study.reviews.length, 1);
      const tomorrow = new Date(study.day + 'T00:00:00Z'); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      assert.equal(review.dueOn, tomorrow.toISOString().slice(0,10));
      assert.equal(review.focus, '说明责任主体');
      const completion = { submissionId: randomUUID(), version: 1, response: '明确负责协调的部门。', rating: 'good', checked: false, reviewId: review.id, pointResult: 'included' };
      const variant = '/practice/variant-study';
      assert.equal((await write('POST', variant + '/attempts', completion)).statusCode, 409);
      await pool.query('UPDATE learning_reviews SET due_on=$1::date WHERE user_id=$2 AND id=$3', [study.day, one.id, review.id]);
      assert.equal((await write('POST', variant + '/attempts', completion, other)).statusCode, 409);
      assert.equal((await write('POST', '/practice/evaluation-study/attempts', completion)).statusCode, 409);
      const reviewDraft = { version: 1, response: '复练草稿', expectedRevision: 0, reviewId: review.id };
      assert.equal((await write('PUT', variant + '/draft', reviewDraft, second)).statusCode, 200);
      assert.deepEqual((await get(variant)).json().drafts, []);
      assert.equal((await get(variant + '?reviewId=' + review.id)).json().drafts[0].response, '复练草稿');
      const results = await Promise.all([write('POST', variant + '/attempts', completion), write('POST', variant + '/attempts', { ...completion, submissionId: randomUUID() }, second)]);
      assert.deepEqual(results.map(result => result.statusCode).sort(), [200,409]);
      const winner = results.find(result => result.statusCode === 200)!.json().attempt;
      assert.equal(winner.reviewFocus, '说明责任主体');
      assert.equal(winner.pointResult, 'included');
      assert.deepEqual((await get('/study', second)).json().reviews, []);
      assert.deepEqual((await get('/practice-history', other)).json().items, []);
    });

    await t.test('server scores checked objective answers and preserves historical questions', async () => {
      const attempted = await write('POST', '/practice/objective-study/attempts', { submissionId: randomUUID(), version: 1, response: '正确', rating: 'fuzzy', checked: true });
      assert.equal(attempted.json().attempt.assessment.score, 2);
      assert.equal(attempted.json().attempt.rating, 'fuzzy');
      assert.equal('correct' in attempted.json().attempt.question, false);
      await changeQuestion(pool, { id: root.id, actorId: owner.id, expectedRevision: root.etag, action: 'publish', content: { ...content, prompt: '新版题干' } });
      assert.equal((await write('PUT', '/practice/root-study/draft', { version: 1, response: '旧版输入', expectedRevision: 2 })).statusCode, 409);
      const old = (await get('/practice/root-study', second)).json();
      assert.equal(old.attempts[0].question.prompt, '旧题干');
      assert.equal(old.drafts[0].version, 1);
      const history = (await get('/practice-history', second)).json().items;
      assert.equal(history.length, 3);
      assert(history.some((attempt: { question: { prompt: string } }) => attempt.question.prompt === '旧题干'));
    });
  } finally {
    await app.close(); await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end();
  }
});
