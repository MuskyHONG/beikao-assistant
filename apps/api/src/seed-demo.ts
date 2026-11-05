import { readFile } from 'node:fs/promises';
import { readConfig } from './config.js';
import { createDatabase } from './database.js';
import { normalizeContent, publishingIssues, type QuestionContent } from './questions.js';
const pool = createDatabase(readConfig(process.env).databaseUrl);
try {
  const values = JSON.parse(await readFile(new URL('../seed/questions.json',import.meta.url),'utf8')) as (QuestionContent & { id: string })[];
  if(new Set(values.map(q=>q.id)).size!==values.length || values.some(q=>!/^\w[\w-]{0,79}$/.test(q.id)||publishingIssues(normalizeContent(q)).length))throw new Error();
  const client=await pool.connect();
  try{
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(261105,2)');
    if((await client.query('SELECT 1 FROM questions LIMIT 1')).rowCount)throw new Error();
    const actor=(await client.query("SELECT id FROM users WHERE role='admin' AND enabled ORDER BY created_at LIMIT 1")).rows[0];if(!actor)throw new Error();
    for(const q of values){
      const content=normalizeContent(q);
      if(content.parentId){const parent=values.find(p=>p.id===content.parentId);if(!parent||parent.parentId||parent.topic!==content.topic)throw new Error();}
      await client.query('INSERT INTO questions(id,current_version,published_version) VALUES($1,1,1)',[q.id]);
      await client.query('INSERT INTO question_revisions(question_id,version,content,created_by) VALUES($1,1,$2,$3)',[q.id,content,actor.id]);
      await client.query('INSERT INTO question_publications(question_id,version,published_by) VALUES($1,1,$2)',[q.id,actor.id]);
    }
    await client.query("INSERT INTO audit_events(actor_id,entity_type,entity_id,action,detail) VALUES($1,'bank','teaching-samples','seed',$2)",[actor.id,{count:values.length,via:'server_cli'}]);
    await client.query('COMMIT');console.log(`Imported ${values.length} teaching samples. They are not official examination questions.`);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}catch{console.error('Demo import failed. Requires an initialized administrator and an empty bank; existing questions are never overwritten.');process.exitCode=1;}finally{await pool.end();}
