import { readConfig } from './config.js';
import { createDatabase } from './database.js';
import { migrate } from './migrations.js';

const pool = createDatabase(readConfig(process.env).databaseUrl);
try {
  const applied = await migrate(pool);
  console.log(JSON.stringify({ event: 'migrations_complete', applied }));
} catch {
  console.error('Database migration failed. Check connectivity and migration checksums; no secrets are logged.');
  process.exitCode = 1;
} finally { await pool.end(); }
