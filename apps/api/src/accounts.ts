import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { hashPassword } from './passwords.js';
import { HttpError } from './errors.js';

export type Role = 'learner' | 'maintainer' | 'admin';
export interface User { id: string; email: string; displayName: string; role: Role; enabled: boolean }
export const userColumns = 'id, email, display_name AS "displayName", role, enabled';
export async function createUser(pool: pg.Pool, input: { email: string; displayName: string; password: string; role: Role }, actorId?: string) {
  const id = randomUUID(), email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !input.displayName.trim() || input.displayName.length > 80 || input.password.length < 12 || input.password.length > 128 || !['learner', 'maintainer', 'admin'].includes(input.role)) throw new HttpError(400, 'invalid_account');
  const hash = await hashPassword(input.password), client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(261105, 3)');
    if (!actorId && (await client.query('SELECT 1 FROM users LIMIT 1')).rowCount) throw new HttpError(409, 'bootstrap_already_completed');
    const result = await client.query<User>(`INSERT INTO users(id,email,display_name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING ${userColumns}`, [id, email, input.displayName.trim(), hash, input.role]);
    await client.query("INSERT INTO audit_events(actor_id,entity_type,entity_id,action) VALUES($1,'user',$2,'create')", [actorId ?? id, id]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'email_exists');
    throw error;
  } finally { client.release(); }
}
