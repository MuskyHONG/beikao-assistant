import type pg from 'pg';
import { HttpError } from './errors.js';

export interface QuestionContent {
  parentId: string; kind: 'choice' | 'judgment' | 'fill' | 'short'; topic: string;
  priority: 'S' | 'A' | 'B'; title: string; prompt: string; max: number;
  sourceType: string; sourceUrl: string; explanation: string;
  multiple: boolean; choices: { id: string; text: string }[]; correctIds: string[];
  correct: string; blanks: { accepted: string[] }[]; referenceAnswer: string; points: string[];
}
export interface QuestionRow extends QuestionContent {
  id: string; version: number; etag: number; publishedVersion: number | null;
  status: 'draft' | 'published' | 'archived'; hasUnpublishedChanges: boolean;
}
const string = (maxLength: number) => ({ type: 'string', maxLength });
const strings = (maxItems: number, maxLength: number) => ({ type: 'array', maxItems, items: string(maxLength) });
export const contentSchema = {
  type: 'object', required: ['kind', 'topic', 'prompt', 'max'], additionalProperties: false,
  properties: {
    parentId: string(80), kind: { type: 'string', enum: ['choice','judgment','fill','short'] },
    topic: { type: 'string', enum: ['organization','collaboration','evaluation'] },
    priority: { type: 'string', enum: ['S','A','B'] }, title: string(200), prompt: string(10000),
    max: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
    sourceType: { type: 'string', enum: ['教学编题','考生回忆','官方材料','AI 新编'] }, sourceUrl: string(2000), explanation: string(10000),
    multiple: { type: 'boolean' }, choices: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['id','text'], properties: { id: string(8), text: string(2000) } } },
    correctIds: strings(8, 8), correct: { type: 'string', enum: ['正确','错误'] },
    blanks: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['accepted'], properties: { accepted: strings(30, 300) } } },
    referenceAnswer: string(20000), points: strings(50, 2000),
  },
};
export function normalizeContent(value: Partial<QuestionContent>): QuestionContent {
  return {
    parentId: value.parentId || '', kind: value.kind!, topic: value.topic!, priority: value.priority || 'A',
    title: value.title?.trim() || value.prompt?.trim().slice(0, 65) || '', prompt: value.prompt?.trim() || '',
    max: value.max!, sourceType: value.sourceType || '教学编题', sourceUrl: value.sourceUrl?.trim() || '',
    explanation: value.explanation?.trim() || '', multiple: value.multiple ?? false, choices: value.choices || [],
    correctIds: value.correctIds || [], correct: value.correct || '错误', blanks: value.blanks || [],
    referenceAnswer: value.referenceAnswer?.trim() || '', points: value.points || [],
  };
}
export function publishingIssues(q: QuestionContent) {
  const issues: string[] = [];
  if (!q.prompt) issues.push('请填写题干。');
  if (!['organization','collaboration','evaluation'].includes(q.topic)) issues.push('请选择有效知识主题。');
  if (!(q.max > 0 && q.max <= 100)) issues.push('请设置有效分值。');
  if (['官方材料','考生回忆'].includes(q.sourceType) && !q.sourceUrl) issues.push('请填写可追溯来源。');
  if (q.sourceUrl) { try { if (!['http:','https:'].includes(new URL(q.sourceUrl).protocol)) throw new Error(); } catch { issues.push('来源链接应为完整 HTTP/HTTPS 地址。'); } }
  if (q.kind === 'choice') {
    if (q.choices.length < 2 || q.choices.length > 8 || q.choices.some(c => !c.text.trim() || !c.id.trim()) || new Set(q.choices.map(c => c.id)).size !== q.choices.length || new Set(q.choices.map(c => c.text.trim())).size !== q.choices.length) issues.push('选项需为 2–8 个，编号及内容不重复。');
    if (!q.correctIds.length || new Set(q.correctIds).size !== q.correctIds.length || (!q.multiple && q.correctIds.length !== 1) || q.correctIds.some(id => !q.choices.some(c => c.id === id))) issues.push('请设置有效正确选项。');
    if (!q.explanation) issues.push('请补充选择题解析。');
  }
  if (q.kind === 'judgment' && (!['正确','错误'].includes(q.correct) || !q.explanation)) issues.push('请设置判断答案及依据。');
  if (q.kind === 'fill') {
    const tokens = [...q.prompt.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
    if (!q.blanks.length || q.blanks.length > 5 || q.blanks.some(b => !b.accepted.length || b.accepted.some(a => !a.trim())) || tokens.length !== q.blanks.length || q.blanks.some((_, i) => tokens.filter(t => t === i + 1).length !== 1)) issues.push('填空标记与逐空答案应一一对应。');
  }
  if (q.kind === 'short' && (!q.referenceAnswer || !q.points.length || q.points.some(p => !p.trim()))) issues.push('请填写简答参考答案和评分要点。');
  return issues;
}
export function learnerQuestion(q: QuestionRow) {
  // Explicit whitelist. Internal keys/reference answers cannot reach pre-answer responses.
  return { id: q.id, parentId: q.parentId, kind: q.kind, type: { choice: '选择', judgment: '判断', fill: '填空', short: '简答' }[q.kind],
    topic: q.topic, priority: q.priority, title: q.title, prompt: q.prompt, max: q.max, sourceType: q.sourceType,
    sourceUrl: q.sourceUrl, version: q.version, status: 'published', multiple: q.multiple,
    choices: q.kind === 'choice' ? q.choices : [], blanks: q.kind === 'fill' ? q.blanks.map(() => ({ accepted: [] })) : [], points: [],
  };
}
export function assess(q: QuestionContent, answer: string) {
  const normalize = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
  if (q.kind === 'fill') {
    let values: string[];
    try { const parsed: unknown = JSON.parse(answer); if (!Array.isArray(parsed) || parsed.some(v => typeof v !== 'string')) throw new Error(); values = parsed; }
    catch { throw new HttpError(400, 'invalid_response'); }
    if (values.length !== q.blanks.length || values.every(v => !v.trim())) throw new HttpError(400, 'empty_response');
    const matches = q.blanks.map((b, i) => b.accepted.some(a => normalize(a) === normalize(values[i]))), hits = matches.filter(Boolean).length;
    return { state: hits === matches.length ? 'correct' : hits ? 'partial' : 'incorrect', matches, hits, total: matches.length, score: Math.round(q.max * hits / matches.length * 100) / 100 };
  }
  if (!answer.trim()) throw new HttpError(400, 'empty_response');
  if (q.kind === 'short') return { state: 'manual' };
  const selected = answer.split(',');
  if (q.kind === 'choice' && (selected.some(id => !q.choices.some(c => c.id === id)) || new Set(selected).size !== selected.length || (!q.multiple && selected.length !== 1))) throw new HttpError(400, 'invalid_response');
  if (q.kind === 'judgment' && !['正确','错误'].includes(answer)) throw new HttpError(400, 'invalid_response');
  const correct = q.kind === 'judgment' ? answer === q.correct : JSON.stringify([...selected].sort()) === JSON.stringify([...q.correctIds].sort());
  return { state: correct ? 'correct' : 'incorrect', score: correct ? q.max : 0 };
}

const adminSelect = `SELECT q.id, q.current_version AS version, q.lock_version AS etag, q.published_version AS "publishedVersion",
  q.archived, r.content FROM questions q JOIN question_revisions r ON r.question_id=q.id AND r.version=q.current_version`;
const publishedSelect = `SELECT q.id, q.published_version AS version, q.lock_version AS etag, q.published_version AS "publishedVersion", q.archived, r.content
  FROM questions q JOIN question_revisions r ON r.question_id=q.id AND r.version=q.published_version
  WHERE NOT q.archived AND (coalesce(r.content->>'parentId','')='' OR EXISTS (
    SELECT 1 FROM questions p JOIN question_revisions pr ON pr.question_id=p.id AND pr.version=p.published_version
    WHERE p.id=r.content->>'parentId' AND NOT p.archived AND coalesce(pr.content->>'parentId','')='' AND pr.content->>'topic'=r.content->>'topic'))`;
type Raw = { id: string; version: number; etag: number; publishedVersion: number | null; archived: boolean; content: QuestionContent };
const mapRow = (r: Raw): QuestionRow => ({ ...r.content, id: r.id, version: r.version, etag: r.etag, publishedVersion: r.publishedVersion,
  status: r.archived ? 'archived' : r.publishedVersion ? 'published' : 'draft', hasUnpublishedChanges: r.publishedVersion !== r.version });
export async function listQuestions(pool: pg.Pool, admin: boolean, cursor = '', limit = 100) {
  const result = await pool.query<Raw>(`${admin ? adminSelect + ' WHERE' : publishedSelect + ' AND'} q.id>$1 ORDER BY q.id LIMIT $2`, [cursor, limit + 1]);
  return { items: result.rows.slice(0, limit).map(mapRow), nextCursor: result.rows.length > limit ? result.rows[limit - 1].id : null };
}
export async function readPublished(pool: pg.Pool, id: string) {
  const result = await pool.query<Raw>(publishedSelect + ' AND q.id=$1', [id]);
  if (!result.rows[0]) throw new HttpError(404, 'not_found');
  return mapRow(result.rows[0]);
}

export async function changeQuestion(pool: pg.Pool, input: { id: string; expectedRevision: number; actorId: string; content?: QuestionContent; action: 'draft' | 'publish' | 'archive' }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(261105, 2)');
    const current = (await client.query<Raw>(adminSelect + ' WHERE q.id=$1', [input.id])).rows[0];
    if ((current?.etag ?? 0) !== input.expectedRevision) throw new HttpError(409, 'version_conflict');
    if (!current && !input.content) throw new HttpError(404, 'not_found');
    const content = input.content ?? current.content;
    const all = (await client.query<Raw>(adminSelect)).rows;
    if (content.parentId) {
      const parent = all.find(q => q.id === content.parentId);
      if (!parent || parent.id === input.id || parent.content.parentId || parent.content.topic !== content.topic || all.some(q => q.content.parentId === input.id)) throw new HttpError(400, 'invalid_parent');
    }
    if (!content.title && !content.prompt) throw new HttpError(400, 'empty_question');
    if (input.action === 'publish') {
      const issues = publishingIssues(content);
      if (issues.length) throw new HttpError(400, 'invalid_question', issues);
      if (content.parentId) {
        const parent = (await client.query<Raw>(publishedSelect + ' AND q.id=$1', [content.parentId])).rows[0];
        if (!parent || parent.content.parentId || parent.content.topic !== content.topic) throw new HttpError(400, 'parent_not_published');
      }
      const children = await client.query<{ content: QuestionContent }>(`SELECT r.content FROM questions q
        JOIN question_revisions r ON r.question_id=q.id AND r.version=q.published_version
        WHERE NOT q.archived AND r.content->>'parentId'=$1`, [input.id]);
      if (children.rows.some(child => content.parentId || child.content.topic !== content.topic)) throw new HttpError(400, 'published_variants_conflict');
    }
    const version = input.content ? (current?.version ?? 0) + 1 : current.version;
    if (!current) await client.query('INSERT INTO questions(id,current_version) VALUES($1,$2)', [input.id, version]);
    if (input.content) await client.query('INSERT INTO question_revisions(question_id,version,content,created_by) VALUES($1,$2,$3,$4)', [input.id, version, content, input.actorId]);
    await client.query(`UPDATE questions SET current_version=$2, lock_version=lock_version+1, updated_at=now(),
      published_version=CASE WHEN $3='publish' THEN $2 ELSE published_version END,
      archived=CASE WHEN $3='archive' THEN true WHEN $3='publish' THEN false ELSE archived END WHERE id=$1`, [input.id, version, input.action]);
    if (input.action === 'publish') await client.query('INSERT INTO question_publications(question_id,version,published_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [input.id, version, input.actorId]);
    await client.query("INSERT INTO audit_events(actor_id,entity_type,entity_id,action,detail) VALUES($1,'question',$2,$3,$4)", [input.actorId, input.id, input.action, { version, previousVersion: current?.version ?? null }]);
    const result = (await client.query<Raw>(adminSelect + ' WHERE q.id=$1', [input.id])).rows[0];
    await client.query('COMMIT');
    return mapRow(result);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
