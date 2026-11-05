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
}
