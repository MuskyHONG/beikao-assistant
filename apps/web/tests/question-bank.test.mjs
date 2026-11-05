import test from 'node:test';
import assert from 'node:assert/strict';
import { assessQuestion, defaultBank, flattenBank, masteryStatus, publishedBank, questionSnapshot, resolveQuestion, upsertQuestion, updateStatus, validateQuestion } from '../src/questionBank.js';
test('all seeded questions and variants have valid type-specific publishing fields',()=>{
 for(const q of flattenBank(defaultBank))assert.deepEqual(validateQuestion(q,defaultBank),[],q.id);
 assert.equal(new Set(defaultBank.map(q=>q.kind)).size,4);
});
test('objective results follow stored answers and never assess subjective language',()=>{
 const q=defaultBank.find(q=>q.id==='g7');
 assert.equal(assessQuestion(q,'B').state,'correct');assert.equal(assessQuestion(q,'A').score,0);
 assert.equal(assessQuestion({...q,multiple:true,correctIds:['A','C']},'C,A').state,'correct');
 assert.equal(assessQuestion({...q,multiple:true,correctIds:['A','C']},'A,B,C').state,'incorrect');
 assert.equal(assessQuestion(defaultBank.find(q=>q.id==='g8'),'错误').score,2);
 assert.equal(assessQuestion(defaultBank[0],'只是泛泛地说加强管理').state,'manual');
});
test('fill questions support accepted aliases and partial credit across blanks',()=>{
 const q={kind:'fill',max:4,blanks:[{accepted:['形成性','形成性评价']},{accepted:['CIPP']}]};
 assert.equal(assessQuestion(q,JSON.stringify(['形成性评价','ｃｉｐｐ'])).score,4);
 const partial=assessQuestion(q,JSON.stringify(['形成性','错误']));assert.equal(partial.score,2);assert.equal(partial.state,'partial');
 assert.equal(assessQuestion(q,JSON.stringify(['',''])).state,'empty');
});
test('malformed templates and ambiguous choice keys cannot be published',()=>{
 const q=defaultBank.find(q=>q.id==='g7');assert.ok(validateQuestion({...q,correctIds:['Z']}).length);
 assert.ok(validateQuestion({...q,multiple:false,correctIds:['A','B']}).length);
 assert.ok(validateQuestion({...q,choices:[q.choices[0],q.choices[0]]}).length);
 const fill=defaultBank.find(q=>q.id==='g9');assert.ok(validateQuestion({...fill,prompt:'没有空号的题干'}).length);
 assert.ok(validateQuestion({...fill,prompt:'{{1}}与{{1}}'}).length);
});
test('content edits increment versions while answer snapshots and records remain unchanged',()=>{
 const q=defaultBank[0],snapshot=questionSnapshot(q),record={status:'good',questionVersion:1};
 const next=upsertQuestion(defaultBank,{...q,parentId:'',prompt:'修改后的题干'}),updated=next.find(v=>v.id===q.id);
 assert.equal(updated.version,2);assert.equal(snapshot.version,1);assert.equal(snapshot.prompt,q.prompt);
 assert.equal(masteryStatus(record,updated),'pending');assert.equal(record.status,'good');
 const hidden=publishedBank(updateStatus(next,q.id,'archived'));assert.equal(resolveQuestion(hidden,q.id),null);assert.equal(resolveQuestion(hidden,'g1v1'),null);
});
test('variants keep an explicit parent and cannot be linked to a different topic',()=>{
 const q={...defaultBank[0].variants[0],id:'new-variant',parentId:'g2',variants:[]};
 const next=upsertQuestion(defaultBank,q);assert.equal(resolveQuestion(next,'new-variant').group.id,'g2');
 assert.ok(validateQuestion({...q,parentId:'g3'},defaultBank).some(x=>x.includes('同一知识主题')));
 assert.ok(validateQuestion({...defaultBank[0],topic:'evaluation'},defaultBank).some(x=>x.includes('变式归属')));
});
