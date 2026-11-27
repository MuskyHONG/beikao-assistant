import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { createUser } from '../src/accounts.js';
import { migrate } from '../src/migrations.js';
import { hashPassword } from '../src/passwords.js';

test('self-registration provisions only learners and keeps existing login credentials valid', async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  assert.ok(testUrl);
  const root = new pg.Pool({ connectionString: testUrl });
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  await root.query(`CREATE SCHEMA "${schema}"`);
  const databaseUrl = new URL(testUrl);
  databaseUrl.searchParams.set('options', '-c search_path=' + schema);
  const pool = new pg.Pool({ connectionString: databaseUrl.href });
  const origin = 'http://127.0.0.1:44328', shareOrigin = 'https://study.example.test';
  const app = buildApp({ pool, auth: { origin, shareOrigin, secureCookies: false, sessionHours: 24 }, ready: async () => {}, version: 'test' });
  const publicHeaders = { host: new URL(shareOrigin).host, origin: shareOrigin };
  const localHeaders = { host: new URL(origin).host, origin };
  const email = 'new@example.test', password = 'Ab1234567';
  const register = (overrides = {}, headers = publicHeaders) => app.inject({
    method: 'POST', url: '/api/v1/auth/register', headers,
    payload: { email, displayName: '新学员', password, ...overrides },
  });

  try {
    await migrate(pool);
    assert.equal((await register()).json().error, 'registration_unavailable');
    const admin = await createUser(pool, { email: 'admin@example.test', displayName: '管理员', password, role: 'admin' });
    assert.equal((await register({}, { ...publicHeaders, origin })).json().error, 'invalid_origin');
    assert.equal((await register({ password: 'abcdef123' })).json().error, 'invalid_password');
    assert.equal((await register({ displayName: '   ' })).json().error, 'invalid_account');
    assert.equal((await register({ email: admin.email })).statusCode, 409);

    const duplicates = await Promise.all([register({ email: 'NEW@example.test', role: 'admin' }), register({ role: 'maintainer' })]);
    assert.deepEqual(duplicates.map(result => result.statusCode).sort(), [201, 409]);
    const created = duplicates.find(result => result.statusCode === 201)!;
    assert.deepEqual(created.json(), { email });
    assert.equal(created.headers['set-cookie'], undefined);
    const rows = await pool.query("SELECT u.role, a.action FROM users u JOIN audit_events a ON a.actor_id=u.id WHERE u.email=$1", [email]);
    assert.deepEqual(rows.rows, [{ role: 'learner', action: 'register' }]);

    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: publicHeaders, payload: { email, password } });
    assert.equal(login.statusCode, 200, login.body);
    const loginCookie = login.headers['set-cookie'] as string;
    assert.match(loginCookie, /; Secure/i);
    assert.equal((await app.inject({ url: '/api/v1/admin/users',
      headers: { ...publicHeaders, cookie: loginCookie.split(';')[0] },
    })).statusCode, 403);

    const legacy = { email: 'legacy@example.test', password: 'olderpassword' };
    await pool.query("INSERT INTO users(id,email,display_name,password_hash,role) VALUES($1,$2,'旧学员',$3,'learner')",
      [randomUUID(), legacy.email, await hashPassword(legacy.password)]);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: localHeaders, payload: legacy })).statusCode, 200);

    const local = await register({ email: 'local@example.test' }, localHeaders);
    assert.equal(local.statusCode, 201, local.body);
  } finally {
    await app.close();
    await pool.end();
    await root.query(`DROP SCHEMA "${schema}" CASCADE`);
    await root.end();
  }
});
