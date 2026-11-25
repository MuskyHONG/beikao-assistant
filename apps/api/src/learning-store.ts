import type pg from 'pg';

export async function withLearningTransaction<T>(pool: pg.Pool, actorId: string, work: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Only this user's learning mutations are serialized. Public question revisions remain independently immutable.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['learning:' + actorId]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function studyDay(db: pg.Pool | pg.PoolClient, actorId: string) {
  const result = await db.query<{ day: string; timezone: string }>(`SELECT timezone(t.name, statement_timestamp())::date::text AS day, t.name AS timezone
    FROM (SELECT coalesce((SELECT timezone FROM learning_goals WHERE user_id=$1), 'Asia/Shanghai') AS name) t`, [actorId]);
  return result.rows[0];
}
