import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { HttpError } from './errors.js';
import { csrfFor, digest, dummyPasswordHash, hashPassword, newToken, verifyPassword } from './passwords.js';
import { createUser, type Role, type User, userColumns } from './accounts.js';

interface Context { user: User; token: string }
export interface AuthOptions { origin: string; secureCookies: boolean; sessionHours: number }
const cookieName = 'beikao_session';
export async function installAuth(app: FastifyInstance, pool: pg.Pool, options: AuthOptions) {
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  const contexts = new WeakMap<FastifyRequest, Context>();
  function requireOrigin(request: FastifyRequest) {
    if (request.headers.origin !== options.origin || request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'invalid_origin');
  }
  async function authenticate(request: FastifyRequest): Promise<Context> {
    const cached = contexts.get(request);
    if (cached) return cached;
    const token = request.cookies[cookieName];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, 'unauthenticated');
    const result = await pool.query<User>(`SELECT u.id, u.email, u.display_name AS "displayName", u.role, u.enabled
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.enabled`, [digest(token)]);
    if (!result.rows[0]) throw new HttpError(401, 'unauthenticated');
    const value = { user: result.rows[0], token };
    contexts.set(request, value);
    return value;
  }
  async function guard(request: FastifyRequest, roles?: Role[]) {
    const context = await authenticate(request);
    if (roles && !roles.includes(context.user.role)) throw new HttpError(403, 'forbidden');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      requireOrigin(request);
      if (request.headers['x-csrf-token'] !== csrfFor(context.token)) throw new HttpError(403, 'invalid_csrf');
    }
    return context.user;
  }
  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: options.secureCookies, maxAge: options.sessionHours * 3600 };
  app.post<{ Body: { email: string; password: string } }>('/api/v1/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    schema: { body: { type: 'object', required: ['email', 'password'], additionalProperties: false,
      properties: { email: { type: 'string', minLength: 3, maxLength: 254 }, password: { type: 'string', minLength: 1, maxLength: 128 } } } },
  }, async (request, reply) => {
    requireOrigin(request);
    const result = await pool.query<User & { password_hash: string }>(`SELECT ${userColumns}, password_hash FROM users WHERE email=$1`, [request.body.email.trim().toLowerCase()]);
    const row = result.rows[0];
    if (!await verifyPassword(request.body.password, row?.password_hash ?? dummyPasswordHash) || !row?.enabled) throw new HttpError(401, 'invalid_credentials');
    const token = newToken();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM sessions WHERE expires_at<=now()');
      // Rotate the browser's previous session rather than retaining an old credential.
      const previous = request.cookies[cookieName];
      if (previous) await client.query('DELETE FROM sessions WHERE token_hash=$1', [digest(previous)]);
      await client.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+$3*interval '1 hour')", [digest(token), row.id, options.sessionHours]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    reply.setCookie(cookieName, token, cookieOptions);
    const { password_hash: _hash, ...user } = row;
    return { user, csrfToken: csrfFor(token) };
  });
  app.get('/api/v1/auth/me', async request => {
    const { user, token } = await authenticate(request);
    return { user, csrfToken: csrfFor(token) };
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    await guard(request);
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [digest((await authenticate(request)).token)]);
    reply.clearCookie(cookieName, { path: '/', secure: options.secureCookies, httpOnly: true, sameSite: 'lax' });
    return { ok: true };
  });
  app.post<{ Body: { currentPassword: string; newPassword: string } }>('/api/v1/auth/password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    schema: { body: { type: 'object', required: ['currentPassword','newPassword'], additionalProperties: false, properties: {
      currentPassword: { type: 'string', minLength: 1, maxLength: 128 }, newPassword: { type: 'string', minLength: 12, maxLength: 128 },
    } } },
  }, async (request, reply) => {
    const actor = await guard(request);
    const original = (await pool.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1', [actor.id])).rows[0].password_hash;
    if (!await verifyPassword(request.body.currentPassword, original)) throw new HttpError(401, 'invalid_credentials');
    const hash = await hashPassword(request.body.newPassword), client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Optimistic predicate prevents two simultaneous password changes from overwriting each other.
      const changed = await client.query('UPDATE users SET password_hash=$1 WHERE id=$2 AND password_hash=$3', [hash,actor.id,original]);
      if (!changed.rowCount) throw new HttpError(409, 'password_changed');
      await client.query('DELETE FROM sessions WHERE user_id=$1', [actor.id]);
      await client.query("INSERT INTO audit_events(actor_id,entity_type,entity_id,action) VALUES($1,'user',$1,'change_password')", [actor.id]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    reply.clearCookie(cookieName, { path: '/', secure: options.secureCookies, httpOnly: true, sameSite: 'lax' });
    return { ok: true };
  });
  app.get('/api/v1/admin/users', async request => {
    await guard(request, ['admin']);
    return { items: (await pool.query<User>(`SELECT ${userColumns} FROM users ORDER BY created_at DESC LIMIT 200`)).rows };
  });
  app.post<{ Body: { email: string; displayName: string; password: string; role: Role } }>('/api/v1/admin/users', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['email','displayName','password','role'], properties: {
      email: { type: 'string', maxLength: 254 }, displayName: { type: 'string', minLength: 1, maxLength: 80 },
      password: { type: 'string', minLength: 12, maxLength: 128 }, role: { type: 'string', enum: ['learner','maintainer','admin'] },
    } } },
  }, async (request, reply) => {
    const actor = await guard(request, ['admin']);
    return reply.code(201).send({ user: await createUser(pool, request.body, actor.id) });
  });
  app.patch<{ Params: { id: string }; Body: { enabled: boolean } }>('/api/v1/admin/users/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', required: ['enabled'], additionalProperties: false, properties: { enabled: { type: 'boolean' } } } },
  }, async request => {
    const actor = await guard(request, ['admin']);
    if (actor.id === request.params.id) throw new HttpError(400, 'cannot_disable_self');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('UPDATE users SET enabled=$1 WHERE id=$2 RETURNING id', [request.body.enabled, request.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'not_found');
      if (!request.body.enabled) await client.query('DELETE FROM sessions WHERE user_id=$1', [request.params.id]);
      await client.query("INSERT INTO audit_events(actor_id,entity_type,entity_id,action,detail) VALUES($1,'user',$2,'set_enabled',$3)", [actor.id, request.params.id, { enabled: request.body.enabled }]);
      await client.query('COMMIT');
      return { ok: true };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  return { guard };
}
