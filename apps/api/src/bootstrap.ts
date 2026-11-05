import { readConfig } from './config.js';
import { createDatabase } from './database.js';
import { createUser } from './accounts.js';

// One-line JSON on stdin avoids putting passwords in command arguments/history.
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (input.length > 8192) throw new Error('Input too large'); }
const pool = createDatabase(readConfig(process.env).databaseUrl);
try {
  const value = JSON.parse(input) as { email: string; displayName: string; password: string };
  if (typeof value.email !== 'string' || typeof value.displayName !== 'string' || typeof value.password !== 'string') throw new Error();
  await createUser(pool, { ...value, role: 'admin' });
  console.log('First administrator created. Sign in using the configured site origin.');
} catch { console.error('Administrator bootstrap failed. Check input, migrations and whether bootstrap was already completed.'); process.exitCode = 1; }
finally { input = ''; await pool.end(); }
