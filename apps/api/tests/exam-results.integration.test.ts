import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { createUser } from '../src/accounts.js';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/migrations.js';
import { changeQuestion, normalizeContent, type QuestionContent } from '../src/questions.js';

test('exam results preserve score provenance and schedule same-account review', async t => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'Use an isolated test database');
  const admin = new pg.Pool({ connectionString });
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 6 });
  const origin = 'http://exam-results.test', password = 'Test.Only.Exam.Results.143';
  const app = buildApp({ pool, auth: { origin, secureCookies: false, sessionHours: 24 }, ready: async () => {}, version: 'test' });
  const prefix = '/api/v1/me/exams', onlineId = randomUUID(), paperId = randomUUID(), racingId = randomUUID();
  const login = async (email: string) => {
    const result = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email, password } });
    assert.equal(result.statusCode, 200, result.body);
    return { origin, cookie: (result.headers['set-cookie'] as string).split(';')[0],
      'x-csrf-token': result.json().csrfToken as string };
  };
  let choiceNo: number, judgmentNo: number, fillNo: number, shortNo: number;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await migrate(pool);
    const owner = await createUser(pool, { email: 'owner@results.test', displayName: '管理员', password, role: 'admin' });
    const learner = await createUser(pool, { email: 'one@results.test', displayName: '学员一', password, role: 'learner' }, owner.id);
    await createUser(pool, { email: 'two@results.test', displayName: '学员二', password, role: 'learner' }, owner.id);
    const a = await login(learner.email), b = await login(learner.email), other = await login('two@results.test');
    const fetch = (url: string, headers = a) => app.inject({ url: prefix + url, headers });
    const send = (method: 'POST' | 'PATCH' | 'PUT', url: string, payload?: object, headers = a) =>
      app.inject({ method, url: prefix + url, headers, payload });
    const publish = (id: string, content: Partial<QuestionContent>, expectedRevision = 0) =>
      changeQuestion(pool, { id, expectedRevision, actorId: owner.id, action: 'publish',
        content: normalizeContent({ topic: 'organization', simulation: true, prompt: id, max: 2, ...content }) });
    const choice: Partial<QuestionContent> = { kind: 'choice', difficulty: 'basic', explanation: '原题依据',
      choices: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }], correctIds: ['A'] };
    await publish('result-choice', choice);
    await publish('result-judgment', { kind: 'judgment', difficulty: 'challenging', topic: 'evaluation', explanation: '判断依据', correct: '正确' });
    await publish('result-fill', { kind: 'fill', topic: 'collaboration', prompt: '答案为{{1}}、{{2}}', max: 3,
      blanks: [{ accepted: ['甲', 'Ａ'] }, { accepted: ['乙'] }] });
    await publish('result-short', { kind: 'short', max: 6, referenceAnswer: '参考答案', points: ['明确责任', '解释依据'], rubricMaxes: [3.25, 2.75] });

    await t.test('submit is atomic, grades against the frozen keys, and does not expose a draft', async () => {
      assert.equal((await fetch('')).json().items.length, 0);
      const opened = await send('POST', '', { attemptId: onlineId, tierMinutes: 20 });
      assert.equal(opened.statusCode, 200, opened.body);
      const attempt = opened.json().attempt;
      [choiceNo, judgmentNo, fillNo, shortNo] = attempt.items.map((item: { itemNo: number }) => item.itemNo);
      assert.equal((await fetch('/' + onlineId + '/report')).json().error, 'exam_report_unavailable');
      assert.equal((await fetch('/' + onlineId + '/report', other)).statusCode, 404);
      assert.equal((await send('POST', '/' + onlineId + '/submit', { expectedRevision: 1 })).statusCode, 422);
      for (const [index, [itemNo, response]] of [[choiceNo, 'B'], [fillNo, '[" a ",""]'], [shortNo, '我的回答']].entries()) {
        const edited = await send('PATCH', '/' + onlineId + '/draft', { expectedRevision: index + 1, answer: { itemNo, response } });
        assert.equal(edited.statusCode, 200, edited.body);
      }
      await publish('result-choice', { ...choice, correctIds: ['B'], explanation: '新版依据' }, 2);
      assert.equal((await send('POST', '/' + onlineId + '/submit', { expectedRevision: 3 }, b)).json().error, 'exam_revision_conflict');
      const submitted = await send('POST', '/' + onlineId + '/submit', { expectedRevision: 4 }, b);
      assert.equal(submitted.statusCode, 200, submitted.body);
      const { report } = submitted.json();
      assert.equal(report.totalScore, null);
      assert.equal(report.scoreState, 'pending_review');
      assert.equal(report.answeredCount, 3);
      assert.equal(report.objectiveScore, 1.5);
      assert.equal(report.objectiveMaxScore, 7);
      assert.equal(report.items[0].objectiveScore, 0);
      assert.deepEqual(report.items[0].reference.correctIds, ['A']);
      assert.equal(report.items[0].reference.explanation, '原题依据');
      assert.equal(report.items[1].scoreSource, 'unanswered');
      assert.equal(report.items[2].score, 1.5);
      assert.equal(report.items[3].score, null);
      assert.equal((await send('POST', '/' + onlineId + '/submit', { expectedRevision: 4 })).json().report.revision, 5);
      assert.equal((await send('POST', '/' + onlineId + '/reveal', { expectedRevision: 5 })).json().error, 'exam_state_conflict');
      assert.equal((await send('PATCH', '/' + onlineId + '/draft', { expectedRevision: 5, currentItemNo: 2 })).statusCode, 409);
      await assert.rejects(pool.query('UPDATE exam_answers SET response=$3 WHERE user_id=$1 AND attempt_id=$2', [learner.id, onlineId, '改写']),
        /closed exam/);
    });

    await t.test('rubric stays pending until complete and manual changes preserve objective grade and history', async () => {
      const grade = (itemNo: number, value: object, headers = a) =>
        send('PUT', '/' + onlineId + '/items/' + itemNo + '/grade', value, headers);
      assert.equal((await grade(judgmentNo, { expectedRevision: 5, score: 1 })).json().error, 'exam_item_unanswered');
      assert.equal((await grade(shortNo, { expectedRevision: 5, pointScores: [4, null] })).json().error, 'exam_invalid_score');
      assert.equal((await grade(shortNo, { expectedRevision: 5, pointScores: [3.25, null] }, other)).statusCode, 404);
      const partial = await grade(shortNo, { expectedRevision: 5, pointScores: [3.25, null] });
      assert.equal(partial.statusCode, 200, partial.body);
      assert.equal(partial.json().report.totalScore, null);
      assert.deepEqual(partial.json().report.items.at(-1).pointScores, [3.25, null]);
      const complete = await grade(shortNo, { expectedRevision: 6, pointScores: [3.25, 1] }, b);
      assert.equal(complete.statusCode, 200, complete.body);
      assert.equal(complete.json().report.totalScore, 5.75);
      assert.equal((await grade(shortNo, { expectedRevision: 6, pointScores: [3.25, 1] })).json().report.revision, 7);
      assert.equal((await grade(shortNo, { expectedRevision: 6, pointScores: [3.25, 2] })).statusCode, 409);
      const adjusted = (await grade(choiceNo, { expectedRevision: 7, score: 1 })).json().report;
      assert.equal(adjusted.totalScore, 6.75);
      assert.equal(adjusted.objectiveScore, 2.5);
      assert.equal(adjusted.items[0].objectiveScore, 0);
      assert.equal(adjusted.items[0].scoreSource, 'objective_override');
      assert.equal((await grade(choiceNo, { expectedRevision: 8, score: null })).json().report.totalScore, 5.75);
      assert.equal((await fetch('', b)).json().items[0].totalScore, 5.75);
      assert.equal((await fetch('', other)).json().items.length, 0);
    });

    await t.test('review schedules once per topic and integrates with an existing single-question review', async () => {
      const route = '/' + onlineId + '/items/' + shortNo + '/review';
      assert.equal((await send('POST', '/' + onlineId + '/items/' + judgmentNo + '/review')).json().error, 'exam_review_ineligible');
      const [first, second] = await Promise.all([send('POST', route), send('POST', route, b)]);
      assert.equal(first.statusCode, 200, first.body);
      assert.equal(second.statusCode, 200, second.body);
      const review = first.json().review;
      assert.equal(second.json().review.id, review.id);
      const study = await app.inject({ url: '/api/v1/me/study', headers: b });
      assert.equal(study.json().reviews[0].sourceExamId, onlineId);
      assert.equal(study.json().reviews[0].focus, '解释依据');
      const tomorrow = new Date(study.json().day + 'T00:00:00Z'); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      assert.equal(review.dueOn, tomorrow.toISOString().slice(0, 10));
      await pool.query('UPDATE learning_reviews SET due_on=CURRENT_DATE-1 WHERE user_id=$1 AND id=$2', [learner.id, review.id]);
      const submissionId = randomUUID();
      const practiced = await app.inject({ method: 'POST', url: '/api/v1/me/practice/result-short/attempts', headers: b,
        payload: { submissionId, version: 1, response: '复练作答', rating: 'good', checked: false, reviewId: review.id, pointResult: 'included' } });
      assert.equal(practiced.statusCode, 200, practiced.body);
      assert.equal((await pool.query('SELECT completed_attempt_id FROM learning_reviews WHERE user_id=$1 AND id=$2',
        [learner.id, review.id])).rows[0].completed_attempt_id, submissionId);
    });

    await t.test('paper self-check separates missing score and zero, keeps exact perfect mark and pages history', async () => {
      assert.equal((await send('POST', '', { attemptId: paperId, tierMinutes: 40 })).statusCode, 200);
      const revealed = await send('POST', '/' + paperId + '/reveal', { expectedRevision: 1 });
      assert.equal(revealed.statusCode, 200, revealed.body);
      assert.equal(revealed.json().report.scoreState, 'paper_unscored');
      assert.ok(revealed.json().report.items.every((item: { score: number | null }) => item.score === null));
      const score = (revision: number, value: number | null) =>
        send('PUT', '/' + paperId + '/paper-score', { expectedRevision: revision, score: value });
      assert.equal((await score(2, 13.1)).json().error, 'exam_invalid_score');
      assert.equal((await score(2, 1.123)).json().error, 'exam_invalid_score');
      assert.equal((await score(2, 0)).json().report.totalScore, 0);
      assert.equal((await score(3, 12.94)).json().report.percent, 100);
      assert.equal((await fetch('/' + paperId + '/report', b)).json().report.isPerfect, false);
      assert.equal((await score(4, 13)).json().report.isPerfect, true);
      assert.equal((await score(5, null)).json().report.totalScore, null);
      assert.equal((await send('POST', '/' + paperId + '/reveal', { expectedRevision: 1 }, b)).json().report.revision, 6);
      assert.equal((await send('POST', '/' + paperId + '/items/' + judgmentNo + '/review')).statusCode, 200);
      const page = (await fetch('?limit=1')).json();
      assert.equal(page.items[0].id, paperId);
      assert.equal((await fetch('?limit=1&before=' + page.nextCursor)).json().items[0].id, onlineId);
    });

    await t.test('simultaneous submit and reveal produce one finished record', async () => {
      const draft = await send('POST', '', { attemptId: racingId, tierMinutes: 60 });
      assert.equal(draft.statusCode, 200, draft.body);
      assert.equal((await send('PATCH', '/' + racingId + '/draft', { expectedRevision: 1, answer: { itemNo: choiceNo, response: 'B' } })).statusCode, 200);
      const responses = await Promise.all([send('POST', '/' + racingId + '/submit', { expectedRevision: 2 }),
        send('POST', '/' + racingId + '/reveal', { expectedRevision: 2 }, b)]);
      assert.deepEqual(responses.map(response => response.statusCode).sort(), [200, 409], responses.map(response => response.body).join('\n'));
      const history = (await fetch('')).json();
      assert.equal(history.items.filter((row: { id: string }) => row.id === racingId).length, 1);
    });
  } finally {
    await app.close();
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
