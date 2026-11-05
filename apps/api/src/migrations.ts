import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';

export async function migrate(pool: pg.Pool, directory = new URL('../migrations/', import.meta.url)) {
  const files = (await readdir(directory)).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
  if (!files.length) throw new Error('No database migrations found');
  const client = await pool.connect();
  const applied: string[] = [];
  let locked = false;
  try {
    // Serialise concurrent deployments; transactions are per immutable migration.
    await client.query('SELECT pg_advisory_lock(261105, 1)');
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const existing = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations');
    const known = new Map(existing.rows.map(row => [row.name, row.checksum]));
    for (const name of known.keys()) if (!files.includes(name)) throw new Error('Applied migration file is missing');
    for (const name of files) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (known.has(name)) {
        if (known.get(name) !== checksum) throw new Error('Applied migration was modified');
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
    return applied;
  } finally {
    try { if (locked) await client.query('SELECT pg_advisory_unlock(261105, 1)'); }
    finally { client.release(); }
  }
}
