import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const browser=await chromium.launch({executablePath:process.env.BEIKAO_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(5000);
 let accept=true;page.on('dialog',d=>accept?d.accept():d.dismiss());
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const key='beikao-whiteboard-v1';
 const state=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),key);
 const go=async(route:string)=>{await page.evaluate(v=>location.hash=v,route);await page.waitForTimeout(90);};
 const btn=(name:string)=>page.getByRole('button',{name,exact:true});
 await page.goto(pathToFileURL(resolve('../publish-artifacts/备考有方-白板修订原型.html')).href);
 await btn('体验学员 · 学员').click();
 for(const minutes of [20,40,60]){
  await go('/exams');await page.locator(`[name=exam-duration][value="${minutes}"]`).check();await btn('开始新卷').click();
  const a=(await state()).personal.learner.draft;
  for(const [kind,count]of [['choice',minutes/5],['judgment',minutes/10]] as const){
   const rows=a.questions.filter((q:any)=>q.kind===kind);
   assert.equal(rows.filter((q:any)=>q.difficulty!=='challenging').length,Math.floor(count/4));
   assert.equal(rows.filter((q:any)=>q.difficulty==='challenging').length,count-Math.floor(count/4));
   assert(rows.filter((q:any)=>q.difficulty==='challenging').every((q:any)=>q.sourceEvidence.length>=2&&q.confusionExplanation));
  }
 }
 const draft=(await state()).personal.learner.draft;
 await page.locator('[data-answer=exam]').first().check();
 const before=structuredClone((await state()).personal.learner.draft);
 accept=false;await btn('放弃作答，直接查看答案').click();assert.equal((await state()).personal.learner.draft.id,draft.id);assert.equal((await state()).personal.learner.exams.length,0);
 accept=true;await btn('放弃作答，直接查看答案').click();await page.locator('.answer-key-list').waitFor();
 const a=(await state()).personal.learner.exams[0],max=a.questions.reduce((n:number,q:any)=>n+q.max,0);
 assert.equal(a.completionMode,'answer-only');assert.deepEqual(a.answers,before.answers);assert.equal(a.manualScore,null);assert.equal((await state()).personal.learner.draft,null);
 assert.equal(await page.locator('.answer-key-list article').count(),30);assert.equal(await page.locator('[data-grade]').count(),0);
 await go('/wrong');assert.equal(await page.locator('#app article').count(),0);
 await go('/records');let card=page.locator('.record-paper');
 assert.match(await card.innerText(),/已看答案 · 纸笔自核/);assert.equal(await card.locator('.record-mark').count(),0);
 // The input and form are above the stretched card link and do not navigate.
 await card.locator('[name=raw]').fill('0');await card.getByRole('button',{name:'保存得分'}).click();assert.equal(await page.evaluate(()=>location.hash),'#/records');
 assert.equal(await card.locator('.record-mark strong').innerText(),'0');
 await card.locator('[name=raw]').fill(String(max+1));await card.getByRole('button',{name:'保存得分'}).click();assert.equal((await state()).personal.learner.exams[0].manualScore.raw,0);
 await card.locator('[name=raw]').fill(String(max));await card.getByRole('button',{name:'保存得分'}).click();
 assert.equal(await card.locator('.record-mark strong').innerText(),'100');assert.equal(await card.locator('.record-seal').count(),1);
 assert(await card.locator('.record-seal img').evaluate((img:any)=>img.complete&&img.naturalWidth>0));
 assert.notEqual(await card.locator('.record-seal').evaluate(el=>getComputedStyle(el).filter),'none');
 await card.click({position:{x:12,y:84}});await page.locator('.answer-key-list').waitFor();
 assert.equal(await page.locator('[name=raw]').inputValue(),String(max));
 await btn('清除').click();assert.equal((await state()).personal.learner.exams[0].manualScore,null);
 await page.getByRole('link',{name:'打印或下载本卷答案'}).click();await page.locator('.answer-key-paper').waitFor();
 assert.equal(await page.locator('[data-answer-key]').count(),30);
 const downloadEvent=page.waitForEvent('download');await btn('下载 HTML').click();const download=await downloadEvent;
 const output=resolve(process.env.TEMP||'.','beikao-answer-key-test.html');await download.saveAs(output);
 const exported=await browser.newPage();await exported.goto(pathToFileURL(output).href);
 assert.equal(await exported.locator('[data-answer-key]').count(),30);assert.match(await exported.locator('body').innerText(),/参考答案/);await exported.close();
 // Publication changes cannot mutate this paper's answer-key snapshot.
 await page.evaluate(({key,id})=>{const s=JSON.parse(localStorage.getItem(key)!);const q=s.questions[id].published;q.prompt='后来修改的新题干';q.version+=1;localStorage.setItem(key,JSON.stringify(s));},{key,id:a.questions[0].id});
 await page.reload();assert.match(await page.locator('[data-answer-key]').first().innerText(),new RegExp(a.questions[0].prompt.slice(0,8)));
 // Old bundled questions migrate only on exact prior content, preserving a user draft and old paper.
 await page.evaluate(key=>{
  const s=JSON.parse(localStorage.getItem(key)!),rule=(window as any).beikaoData.questionUpdates.find((r:any)=>r.id==='kb-A01-choice-1');
  const previous=structuredClone(rule.previous);
  s.questions[rule.id]={id:rule.id,published:previous,draft:{...previous,version:2,prompt:'维护者保留的草稿'},history:[previous],archived:false};
  localStorage.setItem(key,JSON.stringify(s));
 },key);
 const saved=(await state()).personal.learner.exams;
 await page.reload();const migrated=await state();assert.equal(migrated.questions['kb-A01-choice-1'].published.difficulty,'challenging');assert.equal(migrated.questions['kb-A01-choice-1'].draft.prompt,'维护者保留的草稿');assert.deepEqual(migrated.personal.learner.exams,saved);
 await page.reload();assert.deepEqual(await state(),migrated);
 for(const route of ['/records','/report/'+a.id,'/print/answers/'+a.id]){
  await page.setViewportSize({width:390,height:844});await go(route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390,route);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: difficulty quotas; reasoned distractor evidence; reveal cancellation/confirmation; retained answers; no inferred wrongs; manual zero/range/full/clear; full-card click and protected inputs; 3D asset; standalone answer export; snapshots; safe difficulty migration; mobile.');
}finally{await browser.close();}
