import test from 'node:test';
import assert from 'node:assert/strict';
import { paper, findQuestion, objectiveScore, questionScore } from '../src/data.js';
test('teaching paper has five question types and exactly thirty points',()=>{
 assert.equal(paper.questions.length,5); assert.equal(paper.questions.reduce((a,q)=>a+q.max,0),30);
 assert.equal(new Set(paper.questions.map(q=>q.type)).size,5);
});
test('objective keys distinguish wrong, empty, and accepted equivalent fill answers',()=>{
 assert.equal(objectiveScore(paper.questions[0],'明确权责并统一协调'),2);
 assert.equal(objectiveScore(paper.questions[0],'增加汇报层级'),0);
 assert.equal(objectiveScore(paper.questions[1],'正确'),0);
 assert.equal(objectiveScore(paper.questions[1],'错误'),2);
 assert.equal(objectiveScore(paper.questions[2],' 形成性评价。 '),2);
 assert.equal(objectiveScore(paper.questions[2],''),0);
});
test('subjective answers cannot receive a score before every rubric point is rated',()=>{
 const q=paper.questions[3],a={answers:{e4:'明确牵头人并统一任务'},ratings:{}};
 assert.equal(questionScore(q,a),null);
 a.ratings.e4=[2,1,null,0]; assert.equal(questionScore(q,a),null);
 a.ratings.e4=[2,1,0,0]; assert.equal(questionScore(q,a),3);
 assert.equal(questionScore(q,{answers:{},ratings:{}}),0);
});
test('variants remain attached to the original group and have their own key',()=>{
 const v=findQuestion('g1v1'); assert.equal(v.group.id,'g1'); assert.equal(v.id,'g1v1');assert.equal(v.isVariant,true);
 assert.equal(findQuestion('nonexistent'),null);
});
