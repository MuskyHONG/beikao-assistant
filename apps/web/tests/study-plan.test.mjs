import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget, recommendPlan, localDateKey } from '../src/studyPlan.js';
const today = '2026-11-04';
test('time budget counts today and exam day and can exclude the exam day',()=>{
 const a=calculateBudget({examDate:'2026-11-14',dailyHours:2},today);
 assert.equal(a.daysUntil,10);assert.equal(a.studyDays,11);assert.equal(a.totalHours,22);
 const b=calculateBudget({examDate:'2026-11-14',dailyHours:2,includeExamDay:false},today);
 assert.equal(b.studyDays,10);assert.equal(b.totalHours,20);
});
test('today, past dates, invalid dates, and missing goals never produce misleading hours',()=>{
 assert.equal(calculateBudget(null,today).status,'unset');
 const current=calculateBudget({examDate:today,dailyHours:1},today);
 assert.equal(current.status,'today');assert.equal(current.totalHours,1);
 const excluded=calculateBudget({examDate:today,dailyHours:1,includeExamDay:false},today);
 assert.equal(excluded.totalHours,0);assert.equal(recommendPlan(excluded),null);
 const past=calculateBudget({examDate:'2026-11-03',dailyHours:2},today);
 assert.equal(past.status,'past');assert.equal(past.totalHours,0);assert.equal(recommendPlan(past),null);
 for(const examDate of ['2026-02-30','bad','2026-13-04'])assert.equal(calculateBudget({examDate,dailyHours:1},today).status,'invalid');
 for(const dailyHours of [0,-1,25,NaN,Infinity])assert.equal(calculateBudget({examDate:today,dailyHours},today).status,'invalid');
});
test('calendar changes, leap days and year boundaries are exact',()=>{
 assert.equal(calculateBudget({examDate:'2028-03-01',dailyHours:.5},'2028-02-28').totalHours,1.5);
 assert.equal(calculateBudget({examDate:'2027-01-01',dailyHours:1},'2026-12-31').studyDays,2);
 assert.equal(localDateKey(new Date(2026,10,4,23,59)),'2026-11-04');
});
test('intensity thresholds are transparent and minutes never exceed the daily budget',()=>{
 const make=h=>recommendPlan({status:'upcoming',studyDays:20,daysUntil:19,totalHours:h,dailyMinutes:60});
 assert.equal(make(19.5).tier,'compact');assert.equal(make(20).tier,'balanced');assert.equal(make(59.5).tier,'balanced');assert.equal(make(60).tier,'systematic');
 for(const dailyHours of [.5,1,1.5,2,3,4]){
  const b=calculateBudget({examDate:'2026-12-04',dailyHours},today),p=recommendPlan(b);
  assert.equal(p.tasks.reduce((a,t)=>a+t.minutes,0),dailyHours*60);
  assert.ok(p.tasks.every(t=>t.minutes>=0));
 }
 const b=calculateBudget({examDate:'2026-11-10',dailyHours:4},today);assert.equal(recommendPlan(b).examSoon,true);
});
