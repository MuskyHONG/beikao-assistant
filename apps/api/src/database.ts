import pg from 'pg';

export function createDatabase(connectionString: string) {
  return new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    statement_timeout: 10000, query_timeout: 12000 });
}

export async function checkDatabase(pool: pg.Pool) {
  // A live database without the initial migration is deliberately not ready.
  const result = await pool.query("SELECT value FROM app_metadata WHERE key = 'schema_stage'");
  if (result.rows[0]?.value !== 'engineering-foundation') throw new Error('Schema not ready');
  await pool.query('SELECT id FROM users LIMIT 0');
  await pool.query('SELECT id FROM questions LIMIT 0');
  await pool.query('SELECT user_id FROM learning_goals LIMIT 0');
  await pool.query('SELECT id FROM learning_attempts LIMIT 0');
  await pool.query('SELECT user_id FROM learning_drafts LIMIT 0');
  await pool.query('SELECT id FROM learning_reviews LIMIT 0');
  await pool.query('SELECT id FROM knowledge_topics LIMIT 0');
  await pool.query('SELECT card_id FROM knowledge_card_revisions LIMIT 0');
  await pool.query('SELECT id FROM exam_attempts LIMIT 0');
  await pool.query('SELECT item_no FROM exam_items LIMIT 0');
  await pool.query('SELECT item_no FROM exam_answers LIMIT 0');
  await pool.query('SELECT revision FROM exam_grade_events LIMIT 0');
  await pool.query('SELECT source_exam_id FROM learning_reviews LIMIT 0');
}
