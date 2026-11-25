import type pg from 'pg';
import type { ExamTier } from './exam-bank.js';

export type ExamDatabase = pg.Pool | pg.PoolClient;
export type ExamState = 'draft' | 'submitted' | 'answer_only' | 'replaced';
export type ExamAttempt = {
  id: string; revision: number; state: ExamState; tierMinutes: ExamTier; estimatedMinutes: number;
  title: string; maxScore: number; totalScore: number | null; currentItemNo: number;
  startedAt: Date; endedAt: Date | null; replaceDraftId: string | null; replaceDraftRevision: number | null;
};
export const attemptColumns = `a.id, a.revision, a.state, a.tier_minutes AS "tierMinutes", a.estimated_minutes AS "estimatedMinutes", a.title,
  a.max_score::float8 AS "maxScore", a.total_score::float8 AS "totalScore", a.current_item_no AS "currentItemNo",
  a.started_at AS "startedAt", a.ended_at AS "endedAt",
  a.replace_draft_id AS "replaceDraftId", a.replace_draft_revision AS "replaceDraftRevision"`;

export async function readAttempt(db: ExamDatabase, userId: string, attemptId: string) {
  return (await db.query<ExamAttempt>(`SELECT ${attemptColumns} FROM exam_attempts a WHERE a.user_id=$1 AND a.id=$2`, [userId, attemptId])).rows[0];
}
