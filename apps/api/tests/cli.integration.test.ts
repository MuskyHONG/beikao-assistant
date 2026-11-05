import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrations.js';
import { verifyPassword } from '../src/passwords.js';

test('server CLI bootstraps once, imports teaching samples atomically and revokes reset sessions',async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;assert.ok(connectionString);
  const root=new pg.Pool({connectionString}),schema='test_'+randomUUID().replaceAll('-','');
  await root.query(`CREATE SCHEMA "${schema}"`);
  const url=new URL(connectionString);url.searchParams.set('options',`-c search_path=${schema}`);
  const pool=new pg.Pool({connectionString:url.href});
  const run=(file:string,input:unknown={})=>spawnSync(process.execPath,['--import','tsx','src/'+file+'.ts'],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),input:JSON.stringify(input),encoding:'utf8',timeout:20000,
    env:{...process.env,DATABASE_URL:url.href,NODE_ENV:'test'},
  });
  try{
    await migrate(pool);
    const account={email:'cli@example.test',displayName:'CLI管理员',password:'CLI.Only.Password.123'};
    let result=run('bootstrap',account);assert.equal(result.status,0,result.stderr);
    assert.equal(run('bootstrap',account).status,1);
    result=run('seed-demo');assert.equal(result.status,0,result.stderr);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM questions')).rows[0].n,11);
    assert.equal(run('seed-demo').status,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM question_revisions')).rows[0].n,11);
    const id=(await pool.query('SELECT id FROM users')).rows[0].id;
    await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('test-token-digest',$1,now()+interval '1 day')",[id]);
    result=run('reset-password',{email:account.email,password:'New.CLI.Password.456'});assert.equal(result.status,0,result.stderr);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n,0);
    assert.equal(await verifyPassword('New.CLI.Password.456',(await pool.query('SELECT password_hash FROM users')).rows[0].password_hash),true);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='server_password_reset'")).rows[0].n,1);
  }finally{await pool.end();await root.query(`DROP SCHEMA "${schema}" CASCADE`);await root.end();}
});
