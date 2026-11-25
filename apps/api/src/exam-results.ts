import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { HttpError } from './errors.js';
import { attemptColumns, readAttempt, type ExamAttempt, type ExamDatabase } from './exam-attempt.js';
import type { examQuestionSnapshot } from './exam-bank.js';
import { studyDay } from './learning-store.js';
import { assess } from './questions.js';

type Snapshot = ReturnType<typeof examQuestionSnapshot>;
type Assessment = ReturnType<typeof assess> | { state: 'unanswered' };
type Grade = { expectedRevision: number; score?: number | null; pointScores?: (number | null)[] };
type GradeKind = 'rubric' | 'objective_override' | 'paper';
type Item = {
  itemNo: number; question: Snapshot['publicSnapshot']; reference: Snapshot['gradingSnapshot'];
  response: string | null; assessment: Assessment | null; objectiveScore: number | null;
  recordedScore: number | null; pointScores: (number | null)[] | null; reviewId: string | null; dueOn: string | null;
};
const finished = "('submitted','answer_only')";
const itemGrades = `LEFT JOIN LATERAL (
  SELECT score, point_scores FROM exam_grade_events g
  WHERE (g.user_id,g.attempt_id,g.item_no)=(i.user_id,i.attempt_id,i.item_no) ORDER BY revision DESC LIMIT 1
) g ON true`;
const cents = (score: number) => Math.round(score * 100);

function summary(a: ExamAttempt) {
  const max = cents(a.maxScore), score = a.totalScore === null ? null : cents(a.totalScore);
  return {
    id: a.id, state: a.state, revision: a.revision, title: a.title, tierMinutes: a.tierMinutes, estimatedMinutes: a.estimatedMinutes,
    startedAt: a.startedAt, endedAt: a.endedAt,
    durationSeconds: a.endedAt === null ? null : Math.max(0, Math.round((+a.endedAt - +a.startedAt) / 1000)),
    maxScore: a.maxScore, totalScore: a.totalScore,
    scoreState: score !== null ? 'scored' : a.state === 'answer_only' ? 'paper_unscored' : 'pending_review',
    percent: score === null ? null : Math.floor((score * 200 + max) / (2 * max)),
    isPerfect: score === max,
  };
}

export async function examHistory(db: ExamDatabase, userId: string, limit: number, before: string | null) {
  const result = await db.query<ExamAttempt>(`SELECT ${attemptColumns} FROM exam_attempts a
    WHERE a.user_id=$1 AND a.state IN ${finished} AND ($2::uuid IS NULL OR (a.ended_at,a.id) <
      (SELECT ended_at,id FROM exam_attempts WHERE user_id=$1 AND id=$2 AND state IN ${finished}))
    ORDER BY a.ended_at DESC,a.id DESC LIMIT $3`, [userId, before, limit + 1]);
  const items = result.rows.slice(0, limit).map(summary);
  return { items, nextCursor: result.rows.length > limit ? items.at(-1)!.id : null };
}

function effectiveScore(item: Item) {
  return item.recordedScore ?? item.objectiveScore;
}

function canSchedule(item: Item, state: ExamAttempt['state']) {
  const score = effectiveScore(item);
  return state === 'answer_only' || (state === 'submitted' && item.response !== null && score !== null && score < item.question.max);
}

export async function examReport(db: ExamDatabase, userId: string, id: string) {
  // One statement keeps the total, current grade events and returned revision in the same snapshot.
  const result = await db.query<ExamAttempt & Item>(`SELECT ${attemptColumns}, i.item_no AS "itemNo",
    i.public_snapshot AS question,i.grading_snapshot AS reference,r.response,r.assessment,r.objective_score::float8 AS "objectiveScore",
    g.score::float8 AS "recordedScore",g.point_scores AS "pointScores",v.id AS "reviewId",v.due_on::text AS "dueOn"
    FROM exam_attempts a LEFT JOIN exam_items i ON (i.user_id,i.attempt_id)=(a.user_id,a.id) AND a.state IN ${finished}
    LEFT JOIN exam_answers r ON (r.user_id,r.attempt_id,r.item_no)=(i.user_id,i.attempt_id,i.item_no)
    ${itemGrades}
    LEFT JOIN learning_reviews v ON v.user_id=i.user_id AND v.topic=i.topic_id AND v.completed_attempt_id IS NULL
    WHERE a.user_id=$1 AND a.id=$2 ORDER BY i.item_no`, [userId, id]);
  const attempt = result.rows[0];
  if (!attempt) throw new HttpError(404, 'not_found');
  if (attempt.state !== 'submitted' && attempt.state !== 'answer_only') throw new HttpError(409, 'exam_report_unavailable');
  const paper = attempt.state === 'answer_only';
  const items = result.rows.map(item => ({
    ...item.question, itemNo: item.itemNo, response: item.response, reference: item.reference,
    assessment: paper ? null : item.assessment,
    objectiveScore: paper || item.question.kind === 'short' ? null : item.objectiveScore,
    score: paper ? null : effectiveScore(item),
    scoreSource: paper ? null : item.question.kind === 'short' ?
      item.response === null ? 'unanswered' : 'rubric' :
      item.response === null ? 'unanswered' : item.recordedScore === null ? 'objective' : 'objective_override',
    pointScores: paper ? null : item.pointScores,
    canScheduleReview: canSchedule(item, attempt.state),
    review: item.reviewId ? { id: item.reviewId, dueOn: item.dueOn } : null,
  }));
  const objectiveItems = items.filter(item => item.kind !== 'short');
  return { report: { ...summary(attempt),
    answeredCount: items.filter(item => item.response !== null).length,
    objectiveScore: paper ? null : objectiveItems.reduce((sum, item) => sum + cents(item.score ?? 0), 0) / 100,
    objectiveMaxScore: objectiveItems.reduce((sum, item) => sum + cents(item.max), 0) / 100,
    items } };
}

async function ownedAttempt(db: pg.PoolClient, userId: string, id: string) {
  const attempt = await readAttempt(db, userId, id);
  if (!attempt) throw new HttpError(404, 'not_found');
  return attempt;
}

function expectRevision(attempt: ExamAttempt, revision: number) {
  if (attempt.revision !== revision) throw new HttpError(409, 'exam_revision_conflict', undefined, attempt.revision);
}

async function storeObjectiveResults(db: pg.PoolClient, userId: string, id: string) {
  const items = (await db.query<Pick<Item, 'itemNo' | 'question' | 'reference' | 'response'>>(`
    SELECT i.item_no AS "itemNo",i.public_snapshot AS question,i.grading_snapshot AS reference,r.response
    FROM exam_items i LEFT JOIN exam_answers r USING(user_id,attempt_id,item_no) WHERE i.user_id=$1 AND i.attempt_id=$2`, [userId, id])).rows;
  if (!items.some(item => item.response !== null)) throw new HttpError(422, 'exam_no_answers');
  let total = 0, pending = false;
  for (const { itemNo, question, reference, response } of items) {
    const result = response === null ? { state: 'unanswered' as const, score: 0 } :
      assess({ ...question, ...reference, correct: reference.correct ?? '' }, response);
    const score = result.score ?? null;
    if (score === null) pending = true;
    else total += cents(score);
    await db.query(`INSERT INTO exam_answers(user_id,attempt_id,item_no,response,assessment,objective_score)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,attempt_id,item_no) DO UPDATE
      SET assessment=excluded.assessment,objective_score=excluded.objective_score`, [userId, id, itemNo, response, result, score]);
  }
  return pending ? null : total / 100;
}

export async function finishExam(db: pg.PoolClient, userId: string, id: string, revision: number, state: 'submitted' | 'answer_only') {
  const a = await ownedAttempt(db, userId, id);
  if (a.state === state) return examReport(db, userId, id);
  if (a.state !== 'draft') throw new HttpError(409, 'exam_state_conflict', undefined, a.revision);
  expectRevision(a, revision);
  const total = state === 'submitted' ? await storeObjectiveResults(db, userId, id) : null;
  await db.query(`UPDATE exam_attempts SET state=$3, total_score=$4, ended_at=clock_timestamp(), revision=revision+1
    WHERE user_id=$1 AND id=$2`, [userId, id, state, total]);
  return examReport(db, userId, id);
}

async function itemForReview(db: pg.PoolClient, userId: string, id: string, itemNo: number) {
  const item = (await db.query<Item>(`SELECT i.item_no AS "itemNo",i.public_snapshot AS question,i.grading_snapshot AS reference,
    r.response,r.objective_score::float8 AS "objectiveScore",g.score::float8 AS "recordedScore",g.point_scores AS "pointScores"
    FROM exam_items i LEFT JOIN exam_answers r USING(user_id,attempt_id,item_no) ${itemGrades}
    WHERE i.user_id=$1 AND i.attempt_id=$2 AND i.item_no=$3`, [userId, id, itemNo])).rows[0];
  if (!item) throw new HttpError(404, 'not_found');
  return item;
}

function checkedScore(score: number | null, max: number) {
  if (score !== null && (!Number.isFinite(score) || score < 0 || cents(score) / 100 !== score || score > max)) {
    throw new HttpError(400, 'exam_invalid_score');
  }
  return score;
}

async function insertGrade(db: pg.PoolClient, userId: string, a: ExamAttempt, itemNo: number | null, kind: GradeKind,
  score: number | null, pointScores: (number | null)[] | null = null) {
  await db.query(`INSERT INTO exam_grade_events(user_id,attempt_id,revision,item_no,kind,score,point_scores)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [userId, a.id, a.revision + 1, itemNo, kind, score, pointScores && JSON.stringify(pointScores)]);
}

export async function gradeExamItem(db: pg.PoolClient, userId: string, id: string, itemNo: number, value: Grade) {
  const a = await ownedAttempt(db, userId, id);
  if (a.state !== 'submitted') throw new HttpError(409, 'exam_state_conflict', undefined, a.revision);
  const item = await itemForReview(db, userId, id, itemNo);
  if (item.response === null) throw new HttpError(400, 'exam_item_unanswered');
  if (item.question.kind === 'short') {
    const rubric = item.reference.rubric;
    if (!value.pointScores || value.score !== undefined || value.pointScores.length !== rubric.length) throw new HttpError(400, 'exam_invalid_score');
    const scores = value.pointScores.map((score, i) => checkedScore(score, rubric[i].max));
    const previous = item.pointScores ?? rubric.map(() => null);
    if (scores.every((score, i) => score === previous[i])) return examReport(db, userId, id);
    expectRevision(a, value.expectedRevision);
    const sum = scores.every(score => score !== null) ? scores.reduce((total, score) => total + cents(score), 0) / 100 : null;
    await insertGrade(db, userId, a, itemNo, 'rubric', sum, scores);
  } else {
    if (value.score === undefined || value.pointScores !== undefined) throw new HttpError(400, 'exam_invalid_score');
    const score = checkedScore(value.score, item.question.max);
    if (score === item.recordedScore) return examReport(db, userId, id);
    expectRevision(a, value.expectedRevision);
    await insertGrade(db, userId, a, itemNo, 'objective_override', score);
  }
  const [{ total }] = (await db.query<{ total: string | null }>(`
    SELECT CASE WHEN count(*)=count(coalesce(g.score,r.objective_score)) THEN sum(coalesce(g.score,r.objective_score)) END AS total
    FROM exam_items i JOIN exam_answers r USING(user_id,attempt_id,item_no) ${itemGrades} WHERE i.user_id=$1 AND i.attempt_id=$2`, [userId, id])).rows;
  await db.query('UPDATE exam_attempts SET total_score=$3,revision=revision+1 WHERE user_id=$1 AND id=$2', [userId, id, total]);
  return examReport(db, userId, id);
}

export async function scorePaperExam(db: pg.PoolClient, userId: string, id: string, revision: number, score: number | null) {
  const a = await ownedAttempt(db, userId, id);
  if (a.state !== 'answer_only') throw new HttpError(409, 'exam_state_conflict', undefined, a.revision);
  checkedScore(score, a.maxScore);
  if (score === a.totalScore) return examReport(db, userId, id);
  expectRevision(a, revision);
  await insertGrade(db, userId, a, null, 'paper', score);
  await db.query('UPDATE exam_attempts SET total_score=$3,revision=revision+1 WHERE user_id=$1 AND id=$2', [userId, id, score]);
  return examReport(db, userId, id);
}

export async function scheduleExamReview(db: pg.PoolClient, userId: string, id: string, itemNo: number) {
  const a = await ownedAttempt(db, userId, id);
  if (a.state !== 'submitted' && a.state !== 'answer_only') throw new HttpError(409, 'exam_report_unavailable');
  const item = await itemForReview(db, userId, id, itemNo);
  if (!canSchedule(item, a.state)) throw new HttpError(400, 'exam_review_ineligible');
  const topic = item.question.topic;
  const columns = 'id,topic,due_on::text AS "dueOn"';
  const existing = (await db.query(`SELECT ${columns} FROM learning_reviews
    WHERE user_id=$1 AND topic=$2 AND completed_attempt_id IS NULL`, [userId, topic])).rows[0];
  if (existing) return { review: existing, existing: true };
  const point = a.state === 'submitted' && item.pointScores ?
    item.reference.rubric.find((entry, i) => (item.pointScores![i] ?? entry.max) < entry.max)?.text : null;
  const { day } = await studyDay(db, userId);
  const result = await db.query(`INSERT INTO learning_reviews(user_id,id,topic,source_exam_id,source_exam_item_no,due_on,focus_text)
    VALUES($1,$2,$3,$4,$5,$6::date+1,$7) RETURNING ${columns}`, [userId, randomUUID(), topic, id, itemNo, day, point ?? null]);
  return { review: result.rows[0], existing: false };
}
