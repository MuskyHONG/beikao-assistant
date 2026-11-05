import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, learnerQuestion, normalizeContent, publishingIssues, type QuestionRow } from '../src/questions.js';
test('server normalizes content and validates each question type before publication',()=>{
  const q=normalizeContent({kind:'choice',topic:'organization',prompt:'选择题',max:2,choices:[{id:'A',text:'甲'},{id:'B',text:'乙'}],correctIds:['B'],explanation:'解释'});
  assert.deepEqual(publishingIssues(q),[]);assert.ok(publishingIssues({...q,correctIds:['Z']}).length);
  assert.equal(assess(q,'B').score,2);assert.equal(assess(q,'A').score,0);assert.throws(()=>assess(q,'A,B'),/invalid_response/);
  const fill=normalizeContent({kind:'fill',topic:'evaluation',prompt:'{{1}}和{{2}}',max:4,blanks:[{accepted:['形成性','形成性评价']},{accepted:['CIPP']}]});
  assert.deepEqual(publishingIssues(fill),[]);assert.equal(assess(fill,'["形成性评价","ｃｉｐｐ"]').score,4);assert.equal(assess(fill,'["形成性","其他"]').score,2);assert.throws(()=>assess(fill,'not JSON'));
  const short=normalizeContent({kind:'short',topic:'collaboration',prompt:'简答',max:5,referenceAnswer:'参考',points:['要点']});assert.deepEqual(assess(short,'有意义的回答'),{state:'manual'});
});
test('pre-answer projection uses a whitelist even when source JSON contains grading keys',()=>{
  const q={...normalizeContent({kind:'fill',topic:'evaluation',prompt:'{{1}}',max:2,blanks:[{accepted:['不能泄露的答案'] }]}),id:'q1',version:1,etag:2,publishedVersion:1,status:'published',hasUnpublishedChanges:false} as QuestionRow;
  const result=learnerQuestion(q);assert.ok(!JSON.stringify(result).includes('不能泄露'));assert.equal(result.blanks.length,1);assert.ok(!('referenceAnswer' in result));
});
