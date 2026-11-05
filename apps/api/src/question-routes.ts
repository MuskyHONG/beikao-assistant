import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Role, User } from './accounts.js';
import { HttpError } from './errors.js';
import { assess, changeQuestion, contentSchema, learnerQuestion, listQuestions, normalizeContent, readPublished, type QuestionContent } from './questions.js';

type Guard = (request: FastifyRequest, roles?: Role[]) => Promise<User>;
const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$' };
const params = { type: 'object', required: ['id'], properties: { id } };
const pagination = { type: 'object', additionalProperties: false, properties: { cursor: { type: 'string', maxLength: 80 }, limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 } } };

export function installQuestionRoutes(app: FastifyInstance, pool: pg.Pool, guard: Guard) {
  app.get<{ Querystring: { cursor?: string; limit?: number } }>('/api/v1/questions', { schema: { querystring: pagination } }, async request => {
    await guard(request);
    const page = await listQuestions(pool, false, request.query.cursor, request.query.limit);
    return { ...page, items: page.items.map(learnerQuestion) };
  });
  app.get<{ Params: { id: string } }>('/api/v1/questions/:id', { schema: { params } }, async request => {
    await guard(request);
    return { question: learnerQuestion(await readPublished(pool, request.params.id)) };
  });
  app.post<{ Params: { id: string }; Body: { version: number; response: string } }>('/api/v1/questions/:id/check', {
    schema: { params, body: { type: 'object', additionalProperties: false, required: ['version','response'], properties: { version: { type: 'integer', minimum: 1 }, response: { type: 'string', maxLength: 20000 } } } },
  }, async request => {
    await guard(request);
    const q = await readPublished(pool, request.params.id);
    if (q.version !== request.body.version) throw new HttpError(409, 'question_updated');
    return { question: q, assessment: assess(q, request.body.response) };
  });
  app.get<{ Querystring: { cursor?: string; limit?: number } }>('/api/v1/admin/questions', { schema: { querystring: pagination } }, async request => {
    await guard(request, ['maintainer','admin']);
    return listQuestions(pool, true, request.query.cursor, request.query.limit);
  });
  app.put<{ Params: { id: string }; Body: { content: QuestionContent; expectedRevision: number; action: 'draft' | 'publish' } }>('/api/v1/admin/questions/:id', {
    schema: { params, body: { type: 'object', additionalProperties: false, required: ['content','expectedRevision','action'], properties: {
      content: contentSchema, expectedRevision: { type: 'integer', minimum: 0 }, action: { type: 'string', enum: ['draft','publish'] },
    } } },
  }, async request => {
    const actor = await guard(request, ['maintainer','admin']);
    return { question: await changeQuestion(pool, { id: request.params.id, actorId: actor.id, content: normalizeContent(request.body.content), expectedRevision: request.body.expectedRevision, action: request.body.action }) };
  });
  app.post<{ Params: { id: string }; Body: { action: 'publish' | 'archive'; expectedRevision: number } }>('/api/v1/admin/questions/:id/status', {
    schema: { params, body: { type: 'object', required: ['action','expectedRevision'], additionalProperties: false, properties: {
      action: { type: 'string', enum: ['publish','archive'] }, expectedRevision: { type: 'integer', minimum: 1 },
    } } },
  }, async request => {
    const actor = await guard(request, ['maintainer','admin']);
    return { question: await changeQuestion(pool, { id: request.params.id, actorId: actor.id, expectedRevision: request.body.expectedRevision, action: request.body.action }) };
  });
  app.get<{ Params: { id: string } }>('/api/v1/admin/questions/:id/history', { schema: { params } }, async request => {
    await guard(request, ['maintainer','admin']);
    const items = await pool.query(`SELECT version, content, created_at AS "createdAt", created_by AS "createdBy",
      EXISTS(SELECT 1 FROM question_publications p WHERE p.question_id=r.question_id AND p.version=r.version) AS published
      FROM question_revisions r WHERE question_id=$1 ORDER BY version DESC`, [request.params.id]);
    return { items: items.rows };
  });
}
