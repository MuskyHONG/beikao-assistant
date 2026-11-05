import { readConfig } from './config.js';
import { createDatabase } from './database.js';
import { hashPassword } from './passwords.js';
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (input.length > 4096) throw new Error('Input too large'); }
const pool = createDatabase(readConfig(process.env).databaseUrl);
try {
  const value = JSON.parse(input) as { email: string; password: string };
  if (typeof value.email !== 'string' || typeof value.password !== 'string' || value.password.length < 12 || value.password.length > 128) throw new Error();
  const hash = await hashPassword(value.password), client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actor = (await client.query("SELECT id FROM users WHERE role='admin' AND enabled ORDER BY created_at LIMIT 1")).rows[0];
    if (!actor) throw new Error();
    const user = (await client.query('UPDATE users SET password_hash=$1 WHERE email=$2 RETURNING id', [hash,value.email.trim().toLowerCase()])).rows[0];
    if (!user) throw new Error();
    await client.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
    await client.query("INSERT INTO audit_events(actor_id,entity_type,entity_id,action,detail) VALUES($1,'user',$2,'server_password_reset',$3)", [actor.id,user.id,{via:'server_cli'}]);
    await client.query('COMMIT');
    console.log('Password reset; all previous sessions revoked.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
} catch { console.error('Password reset failed. Check the account, input and database.');process.exitCode=1; }
finally { input='';await pool.end(); }
