import { readFile } from 'node:fs/promises';
import { readConfig } from './config.js';
import { createDatabase } from './database.js';
import { HttpError } from './errors.js';
import { changeQuestion, normalizeContent, type QuestionContent } from './questions.js';

const pool = createDatabase(readConfig(process.env).databaseUrl);
try {
  const questions = JSON.parse(await readFile(new URL('../seed/trial-questions.json', import.meta.url), 'utf8')) as
    (QuestionContent & { id: string })[];
  const admin = (await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE enabled AND role='admin' ORDER BY created_at,id LIMIT 1",
  )).rows[0];
  if (!admin) throw new Error('administrator required');
  let imported = 0, unchanged = 0, conflicts = 0;
  for (const question of questions) {
    const { id, ...values } = question;
    const content = normalizeContent(values);
    try {
      await changeQuestion(pool, { id, content, action: 'publish', expectedRevision: 0, actorId: admin.id });
      imported++;
    } catch (error) {
      if (!(error instanceof HttpError && error.code === 'version_conflict')) throw error;
      const result = await pool.query(
        'SELECT 1 FROM question_revisions WHERE question_id=$1 AND version=1 AND content=$2::jsonb', [id, content],
      );
      if (result.rowCount) unchanged++;
      else {
        conflicts++;
        console.error(`Existing question has a different initial revision: ${id}`);
      }
    }
  }
  console.log(`Trial teaching samples: ${imported} imported, ${unchanged} already imported, ${conflicts} conflicts.`);
  if (conflicts) process.exitCode = 1;
} catch {
  console.error('Trial sample import stopped. Check the migrations and enabled administrator before retrying.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
