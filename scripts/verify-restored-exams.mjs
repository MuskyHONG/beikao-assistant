import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [source, restored] = process.argv.slice(2);
const version = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim();

async function readSnapshot(origin) {
  async function request(path, options) {
    const response = await fetch(origin + '/api/v1' + path, { ...options, signal: AbortSignal.timeout(10000) });
    assert.ok(response.ok, `${path} returned HTTP ${response.status}`);
    return response;
  }
  async function session(email, password) {
    const login = await request('/auth/login', {
      method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(cookie, 'Synthetic account could not start a session');
    return async path => (await request(path, { headers: { cookie } })).json();
  }

  assert.equal((await (await request('/version')).json()).version, version);
  const exams = await session('exam-ui@e2e.test', 'E2E.Only.Password.123');
  const learning = await session('learner@e2e.test', 'New.E2E.Password.456');
  const [history, availability, { reviews }, { goal }, practice] = await Promise.all([
    exams('/me/exams'), exams('/me/exams/availability'), exams('/me/study'),
    learning('/me/study'), learning('/me/practice-history'),
  ]);
  const online = history.items.find(item => item.state === 'submitted');
  const paper = history.items.find(item => item.state === 'answer_only');
  assert.equal(online?.totalScore, 3);
  assert.equal(paper?.totalScore, 56);
  assert.equal(paper.isPerfect, true);
  assert.ok(availability.draft, 'Expected a resumable draft after restore');
  assert.ok(goal?.examDate, 'Expected the saved exam goal');
  assert.ok(practice.items.length > 0, 'Expected the single-question history');

  const [onlineResult, paperResult, active] = await Promise.all([
    exams('/me/exams/' + online.id + '/report'), exams('/me/exams/' + paper.id + '/report'),
    exams('/me/exams/' + availability.draft.id),
  ]);
  assert.ok(reviews.some(review => review.sourceExamId === online.id), 'Expected the scheduled exam review');
  assert.ok(onlineResult.report.items.some(item => item.response === 'PDF_STUDENT_SENTINEL' &&
    item.reference.referenceAnswer.includes('PDF_ANSWER_SENTINEL')), 'Expected the original response and frozen reference answer');
  assert.equal(active.attempt.items.length, 30);
  const { serverNow: _serverNow, ...draft } = active.attempt;
  return { history, onlineResult, paperResult, draft, reviews, goal, practice };
}

assert.ok(source && restored && source !== restored, 'Provide separate source and restored test origins');
const original = await readSnapshot(source);
assert.deepEqual(await readSnapshot(restored), original);
console.log('Backup restore verified: accounts, goal, practice, exam drafts, grades, frozen answers and reviews match.');
