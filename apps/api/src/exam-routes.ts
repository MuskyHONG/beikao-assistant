import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { User } from './accounts.js';
import { HttpError } from './errors.js';
import { readAttempt, type ExamDatabase as Db } from './exam-attempt.js';
import { drawExam, examPool, examQuestionSnapshot, examTiers, planExam, type ExamTier } from './exam-bank.js';
import { examHistory, examReport, finishExam, gradeExamItem, scheduleExamReview, scorePaperExam } from './exam-results.js';
import { studyDay, withLearningTransaction } from './learning-store.js';
import { listSimulationQuestions } from './questions.js';

type PublicQuestion = ReturnType<typeof examQuestionSnapshot>['publicSnapshot'];
type OpenExam = { attemptId: string; tierMinutes: ExamTier; replaceDraft?: { id: string; revision: number } };
type EditDraft = { expectedRevision: number; currentItemNo?: number; answer?: { itemNo: number; response: string | null } };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const revision = { type: 'integer', minimum: 1, maximum: 2147483647 };
const itemNo = { type: 'integer', minimum: 1, maximum: 30 };
const shape = (required: string[], properties: object) => ({ type: 'object', required, additionalProperties: false, properties });
const params = shape(['id'], { id: uuid });
const itemParams = shape(['id', 'itemNo'], { id: uuid, itemNo });
const revisionBody = shape(['expectedRevision'], { expectedRevision: revision });
const optionalScore = { type: ['number', 'null'], minimum: 0, maximum: 3000 };

async function currentDraft(db: Db, userId: string) {
  return (await db.query<{ id: string; revision: number; tierMinutes: ExamTier; title: string }>(
    `SELECT id, revision, tier_minutes AS "tierMinutes", title FROM exam_attempts WHERE user_id=$1 AND state='draft'`, [userId],
  )).rows[0];
}

async function presentAttempt(db: Db, userId: string, id: string) {
  const result = await db.query(`SELECT jsonb_build_object('id', a.id, 'state', a.state, 'revision', a.revision,
    'tierMinutes', a.tier_minutes, 'estimatedMinutes', a.estimated_minutes, 'title', a.title, 'maxScore', a.max_score,
    'currentItemNo', a.current_item_no, 'startedAt', a.started_at, 'serverNow', statement_timestamp(),
    'items', jsonb_agg(i.public_snapshot || jsonb_build_object('itemNo', i.item_no, 'response', r.response) ORDER BY i.item_no)) AS attempt
    FROM exam_attempts a JOIN exam_items i ON (i.user_id,i.attempt_id)=(a.user_id,a.id)
    LEFT JOIN exam_answers r ON (r.user_id,r.attempt_id,r.item_no)=(i.user_id,i.attempt_id,i.item_no)
    WHERE a.user_id=$1 AND a.id=$2 GROUP BY a.user_id,a.id`, [userId, id]);
  if (!result.rows[0]) throw new HttpError(404, 'not_found');
  return { attempt: result.rows[0].attempt };
}

async function openExam(db: pg.PoolClient, userId: string, input: OpenExam) {
  const existing = await readAttempt(db, userId, input.attemptId);
  if (existing) {
    if (existing.tierMinutes !== input.tierMinutes || existing.replaceDraftId !== (input.replaceDraft?.id ?? null) ||
        existing.replaceDraftRevision !== (input.replaceDraft?.revision ?? null)) throw new HttpError(409, 'exam_state_conflict');
    return presentAttempt(db, userId, existing.id);
  }

  const draft = await currentDraft(db, userId);
  if (draft?.id !== input.replaceDraft?.id || draft?.revision !== input.replaceDraft?.revision) {
    throw new HttpError(409, 'exam_state_conflict', undefined, draft?.revision);
  }
  const pool = examPool(await listSimulationQuestions(db));
  const plan = planExam(pool, input.tierMinutes);
  if (!plan.actual) throw new HttpError(409, 'exam_pool_empty');
  const last = (await db.query<{ id: string }>(
    'SELECT id FROM exam_attempts WHERE user_id=$1 ORDER BY started_at DESC,id DESC LIMIT 1', [userId],
  )).rows[0];
  const usage = (await db.query<{ question_id: string; count: number; previous: boolean }>(`SELECT i.question_id,
    count(*) FILTER (WHERE a.state IN ('submitted','answer_only'))::int AS count,
    bool_or(a.id=$2::uuid) AS previous FROM exam_items i
    JOIN exam_attempts a ON (a.user_id,a.id)=(i.user_id,i.attempt_id)
    WHERE a.user_id=$1 GROUP BY i.question_id`, [userId, last?.id ?? null])).rows;
  const { day } = await studyDay(db, userId);
  const due = (await db.query<{ topic: string }>(`SELECT topic FROM learning_reviews
    WHERE user_id=$1 AND completed_attempt_id IS NULL AND due_on<=$2`, [userId, day])).rows;
  const questions = drawExam(pool, plan, new Set(usage.filter(row => row.previous).map(row => row.question_id)),
    new Map(usage.map(row => [row.question_id, row.count])), new Set(due.map(row => row.topic)));
  const max = questions.reduce((total, q) => total + Math.round(q.max * 100), 0) / 100;

  if (draft) await db.query(`UPDATE exam_attempts SET state='replaced', ended_at=clock_timestamp(), revision=revision+1
    WHERE user_id=$1 AND id=$2`, [userId, draft.id]);
  await db.query(`INSERT INTO exam_attempts(user_id,id,tier_minutes,estimated_minutes,rule_version,title,max_score,replace_draft_id,replace_draft_revision)
    VALUES($1,$2,$3,$4,1,$5,$6,$7,$8)`, [userId, input.attemptId, input.tierMinutes, plan.estimatedMinutes,
    `教育管理限时练习卷 · ${input.tierMinutes} 分钟档`, max, draft?.id ?? null, draft?.revision ?? null]);
  for (const [index, q] of questions.entries()) {
    const { publicSnapshot, gradingSnapshot } = examQuestionSnapshot(q);
    await db.query(`INSERT INTO exam_items(user_id,attempt_id,item_no,question_id,question_version,topic_id,kind,difficulty,max_score,public_snapshot,grading_snapshot)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [userId, input.attemptId, index + 1, q.id, q.version, q.topic,
      q.kind, q.difficulty ?? null, q.max, publicSnapshot, gradingSnapshot]);
  }
  return presentAttempt(db, userId, input.attemptId);
}

function draftResponse(question: PublicQuestion, response: string | null) {
  if (response === null || response.trim() === '') return null;
  if (question.kind === 'short') return response;
  if (question.kind === 'judgment' && ['正确', '错误'].includes(response)) return response;
  if (question.kind === 'choice') {
    const ids = response.split(',');
    if ((question.multiple || ids.length === 1) && new Set(ids).size === ids.length &&
        ids.every(id => question.choices.some(option => option.id === id))) return ids.sort().join(',');
  }
  if (question.kind === 'fill') {
    let answers: unknown;
    try { answers = JSON.parse(response); } catch { throw new HttpError(400, 'invalid_response'); }
    if (Array.isArray(answers) && answers.length === question.blankCount && answers.every(a => typeof a === 'string' && !a.includes('\0'))) {
      return answers.some(a => a.trim()) ? JSON.stringify(answers) : null;
    }
  }
  throw new HttpError(400, 'invalid_response');
}

async function editDraft(db: pg.PoolClient, userId: string, id: string, input: EditDraft) {
  const attempt = await readAttempt(db, userId, id);
  if (!attempt) throw new HttpError(404, 'not_found');
  if (attempt.state !== 'draft') throw new HttpError(409, 'exam_state_conflict', undefined, attempt.revision);
  const position = input.currentItemNo ?? attempt.currentItemNo;
  const rows = (await db.query<{ item_no: number; public_snapshot: PublicQuestion; response: string | null }>(
    `SELECT i.item_no, i.public_snapshot, r.response FROM exam_items i LEFT JOIN exam_answers r USING(user_id,attempt_id,item_no)
    WHERE i.user_id=$1 AND i.attempt_id=$2 AND i.item_no=ANY($3::int[])`, [userId, id, [position, input.answer?.itemNo ?? position]],
  )).rows;
  if (!rows.some(row => row.item_no === position)) throw new HttpError(400, 'invalid_exam_item');
  const answer = rows.find(row => row.item_no === input.answer?.itemNo);
  if (input.answer && !answer) throw new HttpError(400, 'invalid_exam_item');
  const next = input.answer && answer ? draftResponse(answer.public_snapshot, input.answer.response) : null;
  const answerChanged = answer && answer.response !== next;
  if (!answerChanged && position === attempt.currentItemNo) return presentAttempt(db, userId, id);
  if (input.expectedRevision !== attempt.revision) throw new HttpError(409, 'exam_revision_conflict', undefined, attempt.revision);
  if (answerChanged) {
    if (next === null) await db.query('DELETE FROM exam_answers WHERE user_id=$1 AND attempt_id=$2 AND item_no=$3', [userId, id, answer.item_no]);
    else await db.query(`INSERT INTO exam_answers(user_id,attempt_id,item_no,response) VALUES($1,$2,$3,$4)
      ON CONFLICT (user_id,attempt_id,item_no) DO UPDATE SET response=excluded.response`, [userId, id, answer.item_no, next]);
  }
  await db.query('UPDATE exam_attempts SET current_item_no=$3, revision=revision+1 WHERE user_id=$1 AND id=$2', [userId, id, position]);
  return presentAttempt(db, userId, id);
}

export function installExamRoutes(app: FastifyInstance, pool: pg.Pool, guard: (request: FastifyRequest) => Promise<User>) {
  const prefix = '/api/v1/me/exams';
  app.get(prefix + '/availability', async request => {
    const actor = await guard(request);
    const [questions, draft, goal] = await Promise.all([listSimulationQuestions(pool), currentDraft(pool, actor.id),
      pool.query<{ hours: number }>('SELECT daily_hours::float8 AS hours FROM learning_goals WHERE user_id=$1', [actor.id])]);
    const hours = goal.rows[0]?.hours ?? 0;
    const candidates = examPool(questions);
    return { recommendedTier: hours >= 3 ? 60 : hours >= 2 ? 40 : 20,
      draft: draft ?? null, tiers: examTiers.map(tier => planExam(candidates, tier)) };
  });
  app.post<{ Body: OpenExam }>(prefix, { schema: { body: shape(['attemptId', 'tierMinutes'], {
    attemptId: uuid, tierMinutes: { type: 'integer', enum: examTiers },
    replaceDraft: shape(['id', 'revision'], { id: uuid, revision }),
  }) } }, async request => {
    const actor = await guard(request);
    return withLearningTransaction(pool, actor.id, db => openExam(db, actor.id, request.body));
  });
  app.get<{ Params: { id: string } }>(prefix + '/:id', { schema: { params } }, async request => {
    const actor = await guard(request);
    return presentAttempt(pool, actor.id, request.params.id);
  });
  app.patch<{ Params: { id: string }; Body: EditDraft }>(prefix + '/:id/draft', { schema: { params, body: {
    ...shape(['expectedRevision'], {
      expectedRevision: revision, currentItemNo: itemNo,
      answer: shape(['itemNo', 'response'], { itemNo, response: { anyOf: [
        { type: 'null' }, { type: 'string', maxLength: 20000, pattern: '^[^\\x00]*$' },
      ] } }),
    }), minProperties: 2,
  } } }, async request => {
    const actor = await guard(request);
    return withLearningTransaction(pool, actor.id, db => editDraft(db, actor.id, request.params.id, request.body));
  });
  app.get<{ Querystring: { before?: string; limit?: number } }>(prefix, { schema: {
    querystring: shape([], { before: uuid, limit: { type: 'integer', minimum: 1, maximum: 50 } }),
  } }, async request => {
    const actor = await guard(request);
    return examHistory(pool, actor.id, request.query.limit ?? 20, request.query.before ?? null);
  });
  app.get<{ Params: { id: string } }>(prefix + '/:id/report', { schema: { params } }, async request => {
    const actor = await guard(request);
    return examReport(pool, actor.id, request.params.id);
  });
  for (const [action, state] of [['submit', 'submitted'], ['reveal', 'answer_only']] as const) {
    app.post<{ Params: { id: string }; Body: { expectedRevision: number } }>(prefix + '/:id/' + action, {
      schema: { params, body: revisionBody },
    }, async request => {
      const actor = await guard(request);
      return withLearningTransaction(pool, actor.id, db => finishExam(db, actor.id, request.params.id, request.body.expectedRevision, state));
    });
  }
  app.put<{ Params: { id: string; itemNo: number }; Body: Parameters<typeof gradeExamItem>[4] }>(prefix + '/:id/items/:itemNo/grade', {
    schema: { params: itemParams, body: {
      ...shape(['expectedRevision'], {
        expectedRevision: revision, score: optionalScore,
        pointScores: { type: 'array', minItems: 1, maxItems: 50, items: optionalScore },
      }),
      oneOf: [{ required: ['score'] }, { required: ['pointScores'] }],
    } },
  }, async request => {
    const actor = await guard(request);
    return withLearningTransaction(pool, actor.id, db => gradeExamItem(db, actor.id, request.params.id, request.params.itemNo, request.body));
  });
  app.put<{ Params: { id: string }; Body: { expectedRevision: number; score: number | null } }>(prefix + '/:id/paper-score', {
    schema: { params, body: shape(['expectedRevision', 'score'], { expectedRevision: revision, score: optionalScore }) },
  }, async request => {
    const actor = await guard(request);
    return withLearningTransaction(pool, actor.id, db => scorePaperExam(db, actor.id, request.params.id, request.body.expectedRevision, request.body.score));
  });
  app.post<{ Params: { id: string; itemNo: number } }>(prefix + '/:id/items/:itemNo/review', {
    schema: { params: itemParams },
  }, async request => {
    const actor = await guard(request);
    return withLearningTransaction(pool, actor.id, db => scheduleExamReview(db, actor.id, request.params.id, request.params.itemNo));
  });
}
