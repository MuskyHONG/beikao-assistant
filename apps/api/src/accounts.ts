import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { hashPassword, isNewPassword } from './passwords.js';
import { HttpError } from './errors.js';

export type Role = 'learner' | 'maintainer' | 'admin';
export interface User { id: string; email: string; displayName: string; role: Role; enabled: boolean }
export const userColumns = 'id, email, display_name AS "displayName", role, enabled';
type AccountInput = { email: string; displayName: string; password: string };
type AccountCreator = { kind: 'admin'; actorId: string } | { kind: 'bootstrap' } | { kind: 'registration' };

export function createUser(pool: pg.Pool, input: AccountInput & { role: Role }, actorId?: string) {
  return createAccount(pool, input, actorId ? { kind: 'admin', actorId } : { kind: 'bootstrap' });
}

export function registerLearner(pool: pg.Pool, input: AccountInput) {
  return createAccount(pool, { ...input, role: 'learner' }, { kind: 'registration' });
}

async function createAccount(pool: pg.Pool, input: AccountInput & { role: Role }, creator: AccountCreator) {
  const id = randomUUID(), email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !input.displayName.trim() || input.displayName.length > 80 || !['learner', 'maintainer', 'admin'].includes(input.role)) throw new HttpError(400, 'invalid_account');
  if (!isNewPassword(input.password)) throw new HttpError(400, 'invalid_password');
  const hash = await hashPassword(input.password), client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(261105, 3)');
    if (creator.kind === 'bootstrap' && (await client.query('SELECT 1 FROM users LIMIT 1')).rowCount) throw new HttpError(409, 'bootstrap_already_completed');
    if (creator.kind === 'registration' && !(await client.query("SELECT 1 FROM users WHERE role='admin' LIMIT 1")).rowCount) {
      throw new HttpError(503, 'registration_unavailable');
    }
    const result = await client.query<User>(`INSERT INTO users(id,email,display_name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING ${userColumns}`, [id, email, input.displayName.trim(), hash, input.role]);
    await client.query("INSERT INTO audit_events(actor_id,entity_type,entity_id,action) VALUES($1,'user',$2,$3)", [
      creator.kind === 'admin' ? creator.actorId : id, id, creator.kind === 'registration' ? 'register' : 'create',
    ]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'email_exists');
    throw error;
  } finally { client.release(); }
}
