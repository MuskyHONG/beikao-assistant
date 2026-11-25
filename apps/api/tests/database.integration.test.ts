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
import { changeQuestion, normalizeContent } from '../src/questions.js';

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
    await writeFile(join(directory, '002_accounts_and_questions.sql'), await readFile(new URL('../migrations/002_accounts_and_questions.sql', import.meta.url), 'utf8'));
    const url = pathToFileURL(directory + '/');
    assert.deepEqual(await migrate(pool, url), ['001_foundation.sql','002_accounts_and_questions.sql']);
    const userId = randomUUID();
    await pool.query(`INSERT INTO users(id,email,display_name,password_hash,role) VALUES($1,'migration@exam.test','Upgrade','unused','learner')`, [userId]);
    await assert.rejects(checkDatabase(pool), /learning_goals/);
    await writeFile(join(directory, '003_personal_learning.sql'), await readFile(new URL('../migrations/003_personal_learning.sql', import.meta.url), 'utf8'));
    assert.deepEqual(await migrate(pool, url), ['003_personal_learning.sql']);
    await pool.query("INSERT INTO learning_goals VALUES($1,'2035-11-25',2,true,'Asia/Shanghai',1)", [userId]);
    await assert.rejects(checkDatabase(pool), /knowledge_topics/);
    const trialMigrations = ['004_exam_drafts.sql', '005_initial_knowledge.sql'];
    for (const name of trialMigrations) {
      await writeFile(join(directory, name), await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8'));
    }
    assert.deepEqual(await migrate(pool, url), trialMigrations);
    const { id: questionId } = await changeQuestion(pool, { id: 'upgrade-exam', actorId: userId, expectedRevision: 0,
      action: 'publish', content: normalizeContent({ topic: 'organization', kind: 'judgment', prompt: '保留历史题干', max: 2,
        correct: '正确', explanation: '历史依据' }) });
    const oldAttempt = randomUUID(), oldReview = randomUUID(), oldExam = randomUUID();
    await pool.query(`INSERT INTO learning_attempts(user_id,id,question_id,question_version,response,rating,checked)
      VALUES($1,$2,$3,1,'错误','weak',true)`, [userId, oldAttempt, questionId]);
    await pool.query(`INSERT INTO learning_reviews(user_id,id,topic,source_attempt_id,due_on)
      VALUES($1,$2,'organization',$3,'2035-11-25')`, [userId, oldReview, oldAttempt]);
    await pool.query(`INSERT INTO exam_attempts(user_id,id,tier_minutes,estimated_minutes,rule_version,title,max_score)
      VALUES($1,$2,20,1,1,'已有草稿',2)`, [userId, oldExam]);
    await pool.query(`INSERT INTO exam_items(user_id,attempt_id,item_no,question_id,question_version,topic_id,kind,max_score,public_snapshot,grading_snapshot)
      VALUES($1,$2,1,$3,1,'organization','judgment',2,'{}','{}')`, [userId, oldExam, questionId]);
    await pool.query("INSERT INTO exam_answers(user_id,attempt_id,item_no,response) VALUES($1,$2,1,'正确')", [userId, oldExam]);
    await assert.rejects(checkDatabase(pool), /exam_grade_events/);
    const gradeMigration = '006_exam_results.sql';
    await writeFile(join(directory, gradeMigration), await readFile(new URL('../migrations/' + gradeMigration, import.meta.url), 'utf8'));
    assert.deepEqual(await migrate(pool, url), [gradeMigration]);
    assert.deepEqual(await migrate(pool, url), []);
    await checkDatabase(pool);
    assert.equal((await pool.query('SELECT response FROM exam_answers WHERE user_id=$1 AND attempt_id=$2', [userId, oldExam])).rows[0].response, '正确');
    assert.equal((await pool.query('SELECT source_attempt_id FROM learning_reviews WHERE user_id=$1 AND id=$2', [userId, oldReview])).rows[0].source_attempt_id, oldAttempt);
    assert.equal((await pool.query('SELECT daily_hours::int AS hours FROM learning_goals WHERE user_id=$1', [userId])).rows[0].hours, 2);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM knowledge_card_revisions')).rows[0].count, 23);
    await writeFile(join(directory, '001_foundation.sql'), sql + '\n-- changed');
    await assert.rejects(migrate(pool, url), /modified/);
    await writeFile(join(directory, '001_foundation.sql'), sql);
    await writeFile(join(directory, '007_broken.sql'), 'CREATE TABLE should_rollback (id int); SELECT * FROM nonexistent_table;');
    await assert.rejects(migrate(pool, url));
    assert.equal((await pool.query("SELECT to_regclass('should_rollback') AS value")).rows[0].value, null);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 6);
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});
