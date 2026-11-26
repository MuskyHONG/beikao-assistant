import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { User } from './accounts.js';
import { HttpError } from './errors.js';
import { studyDay, withLearningTransaction } from './learning-store.js';
import { assess, readPublished } from './questions.js';

type Guard = (request: FastifyRequest) => Promise<User>;
type Rating = 'weak' | 'fuzzy' | 'good';
type Goal = { examDate: string; dailyHours: number; includeExamDay: boolean; timezone: string; revision: number };
type DraftInput = { version: number; response: string; expectedRevision: number; reviewId?: string };
type Task = { id: string; topic: string; due: string; focus: string | null };
type AttemptInput = { submissionId: string; version: number; response: string; rating: Rating; checked: boolean; reviewId?: string; focusPoint?: number; pointResult?: 'included' | 'missed' };
const goalColumns = `exam_date::text AS "examDate", daily_hours::float8 AS "dailyHours", include_exam_day AS "includeExamDay", timezone, revision`;
const draftColumns = `question_version AS version, response, revision, updated_at AS "updatedAt"`;
const attemptRead = `SELECT a.id, a.question_id AS "questionId", a.question_version AS version, a.response, a.rating,
  a.checked, a.assessment, a.review_id AS "reviewId", a.focus_point AS "focusPoint", a.point_result AS "pointResult", v.focus_text AS "reviewFocus",
  a.submitted_at AS "submittedAt", jsonb_build_object('title',r.content->>'title', 'prompt',r.content->>'prompt',
    'kind',r.content->>'kind', 'max',r.content->'max', 'choices',r.content->'choices') AS question
  FROM learning_attempts a JOIN question_revisions r ON r.question_id=a.question_id AND r.version=a.question_version
  LEFT JOIN learning_reviews v ON v.user_id=a.user_id AND v.id=a.review_id`;
const questionId = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$' };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const version = { type: 'integer', minimum: 1, maximum: 2147483647 };
const revision = { type: 'integer', minimum: 0, maximum: 2147483647 };
const response = { type: 'string', maxLength: 20000, pattern: '^[^\\x00]*$' };
const params = { type: 'object', required: ['id'], properties: { id: questionId } };
const shape = (required: string[], properties: object) => ({ type: 'object', required, additionalProperties: false, properties });

function validGoal(goal: Goal) {
  const date = new Date(`${goal.examDate}T00:00:00Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== goal.examDate || date.getUTCFullYear() < 1000 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(goal.timezone)) {
    throw new HttpError(400, 'invalid_goal');
  }
  try { return new Intl.DateTimeFormat('en', { timeZone: goal.timezone }).resolvedOptions().timeZone; }
  catch { throw new HttpError(400, 'invalid_goal'); }
}

async function savedAttempt(db: pg.PoolClient, actorId: string, submissionId: string) {
  return (await db.query(`${attemptRead} WHERE a.user_id=$1 AND a.id=$2`, [actorId, submissionId])).rows[0];
}

async function openReview(db: pg.PoolClient, actorId: string, id: string | undefined, topic: string, day: string) {
  if (!id) return null;
  const task = (await db.query<Task>(`SELECT id, topic, due_on::text AS due, focus_text AS focus FROM learning_reviews
    WHERE user_id=$1 AND id=$2 AND completed_attempt_id IS NULL`, [actorId, id])).rows[0];
  if (!task || task.topic !== topic || task.due > day) throw new HttpError(409, 'review_unavailable');
  return task;
}

async function submitAttempt(pool: pg.Pool, actorId: string, questionId: string, input: AttemptInput) {
  return withLearningTransaction(pool, actorId, async db => {
    const previous = await savedAttempt(db, actorId, input.submissionId);
    if (previous) {
      if (previous.questionId !== questionId || previous.version !== input.version || previous.response !== input.response ||
          previous.rating !== input.rating || previous.checked !== input.checked || previous.reviewId !== (input.reviewId ?? null) ||
          previous.focusPoint !== (input.focusPoint ?? null) || previous.pointResult !== (input.pointResult ?? null)) {
        throw new HttpError(409, 'practice_submission_conflict');
      }
      return previous;
    }
    const question = await readPublished(db, questionId);
    if (question.version !== input.version) throw new HttpError(409, 'question_updated');
    const { day } = await studyDay(db, actorId);
    const review = await openReview(db, actorId, input.reviewId, question.topic, day);
    const selectedPoint = input.focusPoint == null ? undefined : question.points[input.focusPoint];
    if ((input.focusPoint != null && (question.kind !== 'short' || !selectedPoint || input.rating === 'good')) ||
        (input.pointResult && (question.kind !== 'short' || !review?.focus || !input.response.trim()))) {
      throw new HttpError(400, 'invalid_review_focus');
    }
    let checkedResult = null;
    if (input.checked || input.response.trim()) {
      try {
        const result = assess(question, input.response);
        if (input.checked) checkedResult = result;
      } catch (error) {
        if (!(error instanceof HttpError && error.code === 'empty_response' && !input.checked)) throw error;
      }
    }
    await db.query(`INSERT INTO learning_attempts(user_id,id,question_id,question_version,response,rating,checked,assessment,review_id,focus_point,point_result)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [actorId, input.submissionId, question.id, input.version, input.response,
      input.rating, input.checked, checkedResult, review?.id ?? null, input.focusPoint ?? null, input.pointResult ?? null]);
    if (review) {
      await db.query('UPDATE learning_reviews SET completed_attempt_id=$3 WHERE user_id=$1 AND id=$2', [actorId, review.id, input.submissionId]);
    }
    if (input.rating !== 'good' || input.pointResult === 'missed') {
      const days = input.rating === 'weak' ? 1 : 3;
      await db.query(`INSERT INTO learning_reviews(user_id,id,topic,source_attempt_id,due_on,focus_text)
        VALUES($1,$2,$3,$4,$5::date+$6::integer,$7)
        ON CONFLICT (user_id, topic) WHERE completed_attempt_id IS NULL DO NOTHING`, [actorId, randomUUID(), question.topic,
        input.submissionId, day, days, selectedPoint ?? (input.pointResult === 'included' ? null : review?.focus ?? null)]);
    }
    return savedAttempt(db, actorId, input.submissionId);
  });
}

export function installLearningRoutes(app: FastifyInstance, pool: pg.Pool, guard: Guard) {
  app.get('/api/v1/me/study', async request => {
    const actor = await guard(request);
    const [{ rows: [goal] }, { rows: mastery }, { rows: reviews }] = await Promise.all([
      pool.query<Goal>(`SELECT ${goalColumns} FROM learning_goals WHERE user_id=$1`, [actor.id]),
      pool.query(`SELECT DISTINCT ON (question_id) question_id AS "questionId", question_version AS "questionVersion", status, "updatedAt"
        FROM (SELECT question_id, question_version, rating AS status, submitted_at AS "updatedAt", id::text AS tie
          FROM learning_attempts WHERE user_id=$1
          UNION ALL SELECT question_id, question_version, 'pending', updated_at, id::text FROM learning_drafts WHERE user_id=$1) events
        ORDER BY question_id, question_version DESC, (status='pending'), "updatedAt" DESC, tie DESC`, [actor.id]),
      pool.query(`SELECT v.id, v.topic, v.due_on::text AS "dueOn", v.focus_text AS focus,
        coalesce(a.question_id,e.question_id) AS "sourceQuestionId", r.content->>'parentId' AS "parentId", r.content->>'kind' AS kind,
        v.source_exam_id AS "sourceExamId", v.source_exam_item_no AS "sourceExamItemNo"
        FROM learning_reviews v LEFT JOIN learning_attempts a ON a.user_id=v.user_id AND a.id=v.source_attempt_id
        LEFT JOIN exam_items e ON (e.user_id,e.attempt_id,e.item_no)=(v.user_id,v.source_exam_id,v.source_exam_item_no)
        JOIN question_revisions r ON (r.question_id,r.version)=(coalesce(a.question_id,e.question_id),coalesce(a.question_version,e.question_version))
        WHERE v.user_id=$1 AND v.completed_attempt_id IS NULL ORDER BY v.due_on, v.id`, [actor.id]),
    ]);
    const day = await studyDay(pool, actor.id);
    const { rows: completedReviews } = await pool.query(`SELECT v.id, v.topic, a.question_id AS "questionId" FROM learning_reviews v
      JOIN learning_attempts a ON a.user_id=v.user_id AND a.id=v.completed_attempt_id WHERE v.user_id=$1
      AND timezone($2,a.submitted_at)::date=$3::date ORDER BY a.submitted_at, v.id`, [actor.id, day.timezone, day.day]);
    return { goal: goal ?? null, mastery, reviews, completedToday: completedReviews.length, completedReviews, ...day };
  });

  app.put<{ Body: Goal }>('/api/v1/me/study-goal', { schema: { body: shape(['examDate', 'dailyHours', 'includeExamDay', 'timezone', 'revision'], {
    examDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, dailyHours: { type: 'number', enum: [0.5, 1, 1.5, 2, 3, 4] },
    includeExamDay: { type: 'boolean' }, timezone: { type: 'string', minLength: 1, maxLength: 80 }, revision,
  }) } }, async request => {
    const actor = await guard(request), value = request.body, timezone = validGoal(value);
    return withLearningTransaction(pool, actor.id, async db => {
      const current = (await db.query<Goal>(`SELECT ${goalColumns} FROM learning_goals WHERE user_id=$1`, [actor.id])).rows[0];
      if ((current?.revision ?? 0) !== value.revision) throw new HttpError(409, 'study_goal_conflict');
      const [{ day }] = (await db.query<{ day: string }>('SELECT timezone($1, statement_timestamp())::date::text AS day', [timezone])).rows;
      if (value.examDate < day) throw new HttpError(400, 'invalid_goal');
      const result = await db.query<Goal>(`INSERT INTO learning_goals(user_id,exam_date,daily_hours,include_exam_day,timezone)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET exam_date=excluded.exam_date, daily_hours=excluded.daily_hours,
        include_exam_day=excluded.include_exam_day, timezone=excluded.timezone, revision=learning_goals.revision+1 RETURNING ${goalColumns}`,
      [actor.id, value.examDate, value.dailyHours, value.includeExamDay, timezone]);
      return { goal: result.rows[0] };
    });
  });

  app.get<{ Params: { id: string }; Querystring: { reviewId?: string } }>('/api/v1/me/practice/:id', { schema: { params, querystring: shape([], { reviewId: uuid }) } }, async request => {
    const actor = await guard(request);
    const [drafts, attempts] = await Promise.all([
      pool.query(`SELECT ${draftColumns} FROM learning_drafts WHERE user_id=$1 AND question_id=$2 AND review_id IS NOT DISTINCT FROM $3::uuid
        ORDER BY question_version DESC LIMIT 10`, [actor.id, request.params.id, request.query.reviewId ?? null]),
      pool.query(`${attemptRead} WHERE a.user_id=$1 AND a.question_id=$2 ORDER BY a.submitted_at DESC, a.id DESC LIMIT 30`, [actor.id, request.params.id]),
    ]);
    return { drafts: drafts.rows, attempts: attempts.rows };
  });

  app.put<{ Params: { id: string }; Body: DraftInput }>('/api/v1/me/practice/:id/draft', {
    schema: { params, body: shape(['version', 'response', 'expectedRevision'], { version, response, expectedRevision: revision, reviewId: uuid }) },
  }, async request => {
    const actor = await guard(request), { id } = request.params, input = request.body;
    return withLearningTransaction(pool, actor.id, async db => {
      const question = await readPublished(db, id);
      if (question.version !== input.version) throw new HttpError(409, 'question_updated');
      const key = [actor.id, id, input.version, input.reviewId ?? null];
      if (input.reviewId) await openReview(db, actor.id, input.reviewId, question.topic, (await studyDay(db, actor.id)).day);
      const current = (await db.query(`SELECT ${draftColumns} FROM learning_drafts
        WHERE user_id=$1 AND question_id=$2 AND question_version=$3 AND review_id IS NOT DISTINCT FROM $4::uuid`, key)).rows[0];
      if (current?.response === input.response) return { draft: current };
      if ((current?.revision ?? 0) !== input.expectedRevision) throw new HttpError(409, 'study_draft_conflict');
      const result = await db.query(`INSERT INTO learning_drafts(user_id,question_id,question_version,review_id,response) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT (user_id,question_id,question_version,review_id) DO UPDATE SET response=excluded.response, revision=learning_drafts.revision+1,
        updated_at=clock_timestamp() RETURNING ${draftColumns}`, [...key, input.response]);
      return { draft: result.rows[0] };
    });
  });

  app.post<{ Params: { id: string }; Body: AttemptInput }>('/api/v1/me/practice/:id/attempts', {
    schema: { params, body: shape(['submissionId', 'version', 'response', 'rating', 'checked'], {
      submissionId: uuid, version, response, rating: { type: 'string', enum: ['weak', 'fuzzy', 'good'] }, checked: { type: 'boolean' },
      reviewId: uuid, focusPoint: { type: 'integer', minimum: 0, maximum: 49 }, pointResult: { type: 'string', enum: ['included', 'missed'] },
    }) },
  }, async request => {
    const actor = await guard(request);
    return { attempt: await submitAttempt(pool, actor.id, request.params.id, request.body) };
  });

  app.post<{ Params: { id: string }; Body: { version: number } }>('/api/v1/me/practice/:id/hint', {
    schema: { params, body: shape(['version'], { version }) },
  }, async request => {
    await guard(request);
    const question = await readPublished(pool, request.params.id);
    if (question.version !== request.body.version) throw new HttpError(409, 'question_updated');
    if (question.kind !== 'short') throw new HttpError(400, 'invalid_request');
    return { question };
  });

  app.get<{ Querystring: { source?: 'practice' | 'exam'; state?: 'todo' | 'done'; offset?: number } }>('/api/v1/me/wrong-questions', {
    schema: { querystring: shape([], {
      source: { type: 'string', enum: ['practice', 'exam'] }, state: { type: 'string', enum: ['todo', 'done'] },
      offset: { type: 'integer', minimum: 0 },
    }) },
  }, async request => {
    const actor = await guard(request), { source, state, offset = 0 } = request.query;
    const result = await pool.query(`WITH events AS (
      SELECT 'practice' AS source, a.id, a.question_id AS "questionId", a.question_version AS version,
        r.content->>'topic' AS topic, r.content->>'kind' AS kind, r.content->>'prompt' AS prompt,
        a.submitted_at AS "occurredAt", a.rating, (a.assessment->>'score')::float8 AS score,
        (r.content->>'max')::float8 AS max, NULL::integer AS "itemNo",
        EXISTS(SELECT FROM learning_reviews v WHERE v.user_id=$1 AND v.source_attempt_id=a.id AND v.completed_attempt_id IS NOT NULL) AS done
      FROM learning_attempts a JOIN question_revisions r ON (r.question_id,r.version)=(a.question_id,a.question_version)
      WHERE a.user_id=$1 AND (a.rating IN ('weak','fuzzy') OR (a.assessment->>'score')::numeric < (r.content->>'max')::numeric)
        AND ($2::text IS NULL OR $2='practice')
      UNION ALL
      SELECT 'exam', a.id, i.question_id, i.question_version, i.topic_id, i.public_snapshot->>'kind', i.public_snapshot->>'prompt',
        a.ended_at, NULL::text, coalesce(g.score,r.objective_score)::float8, (i.public_snapshot->>'max')::float8, i.item_no,
        EXISTS(SELECT FROM learning_reviews v WHERE v.user_id=$1 AND (v.source_exam_id,v.source_exam_item_no)=(a.id,i.item_no)
          AND v.completed_attempt_id IS NOT NULL)
      FROM exam_attempts a JOIN exam_items i ON (i.user_id,i.attempt_id)=(a.user_id,a.id)
      JOIN exam_answers r ON (r.user_id,r.attempt_id,r.item_no)=(i.user_id,i.attempt_id,i.item_no)
      LEFT JOIN LATERAL (SELECT score FROM exam_grade_events g
        WHERE (g.user_id,g.attempt_id,g.item_no)=(i.user_id,i.attempt_id,i.item_no) ORDER BY revision DESC LIMIT 1) g ON true
      WHERE a.user_id=$1 AND a.state='submitted' AND r.response IS NOT NULL
        AND coalesce(g.score,r.objective_score) < (i.public_snapshot->>'max')::numeric AND ($2::text IS NULL OR $2='exam')
    ), latest AS (
      SELECT DISTINCT ON (source,"questionId") *, count(*) OVER (PARTITION BY source,"questionId")::integer AS attempts
      FROM events ORDER BY source,"questionId","occurredAt" DESC,id DESC,"itemNo" DESC
    ) SELECT * FROM latest WHERE $3::boolean IS NULL OR done=$3
      ORDER BY "occurredAt" DESC,source,"questionId" LIMIT 31 OFFSET $4`, [actor.id, source ?? null, state ? state === 'done' : null, offset]);
    return { items: result.rows.slice(0, 30), next: result.rows.length > 30 ? offset + 30 : null };
  });

  app.get<{ Querystring: { before?: string } }>('/api/v1/me/practice-history', { schema: { querystring: shape([], { before: uuid }) } }, async request => {
    const actor = await guard(request);
    const result = await pool.query(`${attemptRead} WHERE a.user_id=$1 AND ($2::uuid IS NULL OR (a.submitted_at,a.id)<(
        SELECT submitted_at,id FROM learning_attempts WHERE user_id=$1 AND id=$2))
        ORDER BY a.submitted_at DESC,a.id DESC LIMIT 31`, [actor.id, request.query.before ?? null]);
    const items = result.rows.slice(0, 30);
    return { items, next: result.rows.length > 30 ? items.at(-1).id : null };
  });
}
