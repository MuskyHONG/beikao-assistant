import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { createUser } from '../src/accounts.js';
import { checkDatabase } from '../src/database.js';

test('real PostgreSQL: accounts, CSRF, roles, immutable publishing and learner checks', async t => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'Set TEST_DATABASE_URL to an isolated test database');
  const admin = new pg.Pool({ connectionString }), schema = 'test_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 6 });
  const app = buildApp({ pool, auth: { origin: 'http://test.local', secureCookies: false, sessionHours: 24 }, ready: () => checkDatabase(pool), version: '0.2.0-alpha.1' });
  const password = 'Test.Only.Password.123';
  const origin = 'http://test.local';
  type Session = { cookie: string; csrf: string; user: { id: string } };
  async function login(email: string, remoteAddress = '127.0.0.1'): Promise<Session> {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email, password }, remoteAddress });
    assert.equal(response.statusCode, 200, response.body);
    const cookies = response.headers['set-cookie'];
    assert.equal(typeof cookies, 'string');
    assert.match(cookies as string, /HttpOnly/i); assert.match(cookies as string, /SameSite=Lax/i);
    return { cookie: (cookies as string).split(';')[0], csrf: response.json().csrfToken, user: response.json().user };
  }
  function headers(session: Session) { return { cookie: session.cookie, origin, 'x-csrf-token': session.csrf }; }
  const base = { kind: 'choice', topic: 'organization', prompt: '初版题干', max: 2, choices: [{ id: 'A', text: '错误选项' },{ id: 'B', text: '正确选项' }], correctIds: ['B'], explanation: '用于测试的解析' };
  let adminSession: Session, learner: Session, maintainer: Session;
  try {
    await migrate(pool);
    await createUser(pool, { email: 'Admin@Example.test', displayName: '管理员', password, role: 'admin' });
    await assert.rejects(createUser(pool, { email: 'other@example.test', displayName: '第二次初始化', password, role: 'admin' }), /bootstrap_already_completed/);
    await t.test('anonymous, origin, cookies and account privileges', async () => {
      assert.equal((await app.inject('/api/v1/questions')).statusCode, 401);
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://evil.example' }, payload: { email: 'admin@example.test', password } })).statusCode, 403);
      adminSession = await login('admin@example.test');
      assert.ok(!JSON.stringify((await app.inject({ url: '/api/v1/auth/me', headers: headers(adminSession) })).json()).includes('password_hash'));
      const create = (role: string) => app.inject({ method: 'POST', url: '/api/v1/admin/users', headers: headers(adminSession), payload: { email: role + '@example.test', displayName: role, password, role } });
      assert.equal((await create('learner')).statusCode, 201);
      assert.equal((await create('maintainer')).statusCode, 201);
      learner = await login('learner@example.test'); maintainer = await login('maintainer@example.test');
      assert.equal((await app.inject({ url: '/api/v1/admin/users', headers: headers(maintainer) })).statusCode, 403);
      assert.equal((await app.inject({ url: '/api/v1/admin/questions', headers: headers(learner) })).statusCode, 403);
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: learner.cookie, origin } })).statusCode, 403);
    });
    let current: any;
    const save = (session: Session, id: string, content: unknown, expectedRevision: number, action = 'publish') => app.inject({ method: 'PUT', url: '/api/v1/admin/questions/' + id, headers: headers(session), payload: { content, expectedRevision, action } });
    const status = (id: string, expectedRevision: number, action: string) => app.inject({ method: 'POST', url: `/api/v1/admin/questions/${id}/status`, headers: headers(maintainer), payload: { expectedRevision, action } });
    const question = (id: string) => app.inject({ url: '/api/v1/questions/' + id, headers: headers(learner) });
    await t.test('question publishing validates on the server; responses hide answer keys', async () => {
      assert.equal((await save(learner, 'q1', base, 0)).statusCode, 403);
      assert.equal((await save(maintainer, 'bad', { ...base, correctIds: ['Z'] }, 0)).statusCode, 400);
      const noCsrf = await app.inject({ method: 'PUT', url: '/api/v1/admin/questions/q1', headers: { cookie: maintainer.cookie, origin }, payload: { content: base, expectedRevision: 0, action: 'publish' } });
      assert.equal(noCsrf.statusCode, 403);
      const created = await save(maintainer, 'q1', base, 0); assert.equal(created.statusCode, 200, created.body); current = created.json().question;
      const published = (await question('q1')).json().question;
      for (const key of ['correctIds','correct','referenceAnswer','explanation']) assert.ok(!(key in published), key);
      assert.equal(published.prompt, '初版题干');
      const check = await app.inject({ method: 'POST', url: '/api/v1/questions/q1/check', headers: headers(learner), payload: { version: 1, response: 'B', score: 100 } });
      assert.equal(check.statusCode, 200, check.body); assert.equal(check.json().assessment.score, 2);
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/questions/q1/check', headers: headers(learner), payload: { version: 1, response: '' } })).statusCode, 400);
    });
    await t.test('drafts do not replace published content; stale editors cannot overwrite', async () => {
      const stale = current.etag;
      const draft = await save(maintainer, 'q1', { ...base, prompt: '修订版题干', correctIds: ['A'] }, stale, 'draft');
      assert.equal(draft.statusCode, 200, draft.body); current = draft.json().question;
      assert.equal(current.version, 2); assert.equal(current.publishedVersion, 1);
      assert.equal((await question('q1')).json().question.prompt, '初版题干');
      assert.equal((await save(maintainer, 'q1', base, stale)).statusCode, 409);
      const published = await status('q1', current.etag, 'publish'); assert.equal(published.statusCode, 200, published.body); current = published.json().question;
      assert.equal((await question('q1')).json().question.prompt, '修订版题干');
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/questions/q1/check', headers: headers(learner), payload: { version: 1, response: 'B' } })).statusCode, 409);
      const history = await app.inject({ url: '/api/v1/admin/questions/q1/history', headers: headers(maintainer) });
      assert.equal(history.json().items.length, 2); assert.equal(history.json().items[1].content.prompt, '初版题干');
      await assert.rejects(pool.query("UPDATE question_revisions SET content='{}' WHERE question_id='q1' AND version=1"), /append-only/);
      const changes = await Promise.all([save(maintainer,'q1',{...base,prompt:'并发编辑甲'},current.etag,'draft'), save(maintainer,'q1',{...base,prompt:'并发编辑乙'},current.etag,'draft')]);
      assert.deepEqual(changes.map(r => r.statusCode).sort(), [200,409]);
      current = changes.find(r => r.statusCode === 200)!.json().question;
    });
    await t.test('variants remain subordinate; archiving the parent hides the whole group', async () => {
      assert.equal((await save(maintainer, 'bad-child', { ...base, parentId: 'missing' }, 0)).statusCode, 400);
      assert.equal((await save(maintainer, 'v1', { ...base, parentId: 'q1', prompt: '关联变式' }, 0)).statusCode, 200);
      assert.equal((await question('v1')).statusCode, 200);
      assert.equal((await status('q1', current.etag, 'archive')).statusCode, 200);
      assert.equal((await question('q1')).statusCode, 404); assert.equal((await question('v1')).statusCode, 404);
      assert.equal((await app.inject({ url: '/api/v1/questions?limit=1', headers: headers(learner) })).json().items.length, 0);
    });
    await t.test('all four types and pagination use the same server validation and grading', async () => {
      const judgment = await save(maintainer,'judgment',{kind:'judgment',topic:'evaluation',prompt:'判断题',max:2,correct:'正确',explanation:'判断依据'},0); assert.equal(judgment.statusCode,200,judgment.body);
      const fill = { kind:'fill',topic:'evaluation',prompt:'第一空{{1}}，第二空{{2}}',max:4,blanks:[{accepted:['形成性评价','形成性']},{accepted:['CIPP']}] };
      assert.equal((await save(maintainer,'fill',fill,0)).statusCode,200);
      assert.equal((await save(maintainer,'bad-fill',{...fill,prompt:'缺少空号'},0)).statusCode,400);
      assert.equal((await save(maintainer,'short',{kind:'short',topic:'collaboration',prompt:'简答题',max:5,referenceAnswer:'参考答案',points:['评分要点']},0)).statusCode,200);
      for (const [id,response,state,score] of [['judgment','正确','correct',2],['fill','["形成性","wrong"]','partial',2],['short','自己的表述','manual',undefined]] as const) {
        const checked=await app.inject({method:'POST',url:`/api/v1/questions/${id}/check`,headers:headers(learner),payload:{version:1,response}});
        assert.equal(checked.statusCode,200,checked.body);assert.equal(checked.json().assessment.state,state);assert.equal(checked.json().assessment.score,score);
      }
      const first=(await app.inject({url:'/api/v1/questions?limit=1',headers:headers(learner)})).json();
      assert.equal(first.items.length,1);assert.ok(first.nextCursor);
      const second=(await app.inject({url:'/api/v1/questions?limit=1&cursor='+first.nextCursor,headers:headers(learner)})).json();assert.notEqual(first.items[0].id,second.items[0].id);
    });
    await t.test('revocation, disabled users, expiry and logout are enforced by the database', async () => {
      const disabled=await app.inject({method:'PATCH',url:'/api/v1/admin/users/'+learner.user.id,headers:headers(adminSession),payload:{enabled:false}});assert.equal(disabled.statusCode,200);
      assert.equal((await question('short')).statusCode,401);
      assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin},payload:{email:'learner@example.test',password}})).statusCode,401);
      assert.equal((await app.inject({method:'PATCH',url:'/api/v1/admin/users/'+adminSession.user.id,headers:headers(adminSession),payload:{enabled:false}})).statusCode,400);
      assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:headers(maintainer)})).statusCode,200);
      assert.equal((await app.inject({url:'/api/v1/auth/me',headers:headers(maintainer)})).statusCode,401);
      await pool.query("UPDATE sessions SET expires_at=now()-interval '1 hour'");
      assert.equal((await app.inject({url:'/api/v1/auth/me',headers:headers(adminSession)})).statusCode,401);
    });
    await t.test('login attempts are rate limited and use generic credential failures', async () => {
      for(let n=0;n<10;n++)assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',remoteAddress:'127.0.0.9',headers:{origin},payload:{email:'nonexistent@example.test',password:'bad'}})).statusCode,401);
      assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',remoteAddress:'127.0.0.9',headers:{origin},payload:{email:'nonexistent@example.test',password:'bad'}})).statusCode,429);
    });
  } finally {
    await app.close(); await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  }
});
