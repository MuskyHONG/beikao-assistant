import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrations.js';
import { checkDatabase } from '../src/database.js';

// Explicitly requires an isolated test database. Uses and removes a unique schema only.
test('PostgreSQL migrations are repeatable, immutable and transactional', async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'TEST_DATABASE_URL must point to an isolated test database');
  const admin = new pg.Pool({ connectionString });
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const directory = await mkdtemp(join(tmpdir(), 'beikao-migrations-'));
  let pool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({ connectionString, max: 2, options: `-c search_path=${schema}` });
    const sql = await readFile(new URL('../migrations/001_foundation.sql', import.meta.url), 'utf8');
    await writeFile(join(directory, '001_foundation.sql'), sql);
    const url = pathToFileURL(directory + '/');
    assert.deepEqual(await migrate(pool, url), ['001_foundation.sql']);
    assert.deepEqual(await migrate(pool, url), []);
    await checkDatabase(pool);
    await writeFile(join(directory, '001_foundation.sql'), sql + '\n-- changed');
    await assert.rejects(migrate(pool, url), /modified/);
    await writeFile(join(directory, '001_foundation.sql'), sql);
    await writeFile(join(directory, '002_broken.sql'), 'CREATE TABLE should_rollback (id int); SELECT * FROM nonexistent_table;');
    await assert.rejects(migrate(pool, url));
    assert.equal((await pool.query("SELECT to_regclass('should_rollback') AS value")).rows[0].value, null);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 1);
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});
