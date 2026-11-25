import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.BEIKAO_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1100}});p.setDefaultTimeout(5000);
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 const go=async(route:string)=>{await p.evaluate(v=>location.hash=v,route);await p.waitForTimeout(80);};
 const btn=(name:string)=>p.getByRole('button',{name,exact:true});
 const record=async(id:string)=>p.evaluate(id=>JSON.parse(localStorage.getItem('beikao-whiteboard-v1')!).personal.learner.practice[id],id);
 await p.goto(pathToFileURL(resolve('../publish-artifacts/备考有方-白板修订原型.html')).href);await btn('体验学员 · 学员').click();await go('/question/A03-q1');
 assert.equal(await p.locator('[data-action=rate]').count(),3);assert.equal(await p.locator('#check-result .rating-row').count(),0);
 assert.equal(await p.locator('[data-action=check]').count(),0);assert.equal(await p.locator('#check-result').count(),0);assert.equal(await p.locator('.lesson-dock').count(),0);
 await btn('能独立回忆').click();let r=await record('A03-q1');
 assert.equal(r.status,'good');assert.equal(r.attempts.length,1);assert.equal(r.attempts[0].answer,'');assert.equal(r.attempts[0].score,null);assert.equal(r.attempts[0].evaluationMode,'self-only');
 await btn('有点模糊').click();assert.equal((await record('A03-q1')).attempts.length,1);
 await btn('想不起来').click();r=await record('A03-q1');assert.equal(r.attempts.length,1);assert.equal(r.attempts[0].status,'weak');
 await go('/knowledge/S');assert.equal(await p.locator('[data-group=A03]').getAttribute('data-mastery'),'weak');
 await go('/question/A03-q1');await btn('记不住？查看提示').click();await btn('查看下一层提示').click();await btn('查看下一层提示').click();
 assert.equal(await p.locator('.reference-panel').count(),0);assert.equal(await p.locator('.coaching-hint input').count(),0);
 const content=await p.locator('.coaching-hint').innerText();
 const points=await p.evaluate(()=>(window as any).beikaoData.bank.find((q:any)=>q.id==='A03-q1').points);
 for(const text of points)assert.equal(content.split(text).length-1,1,'Reference point appears once');
 await btn('收起提示').click();assert.equal(await p.locator('.coaching-hint').count(),0);
 await p.locator('[data-answer=practice]').fill('我先保护学生，报告并联动资源。');await btn('有点模糊').click();
 r=await record('A03-q1');assert.equal(r.attempts.length,2);assert.equal(r.attempts.at(-1).score,null);assert.equal(r.attempts.at(-1).evaluationMode,'self-only');
 await p.locator('[data-answer=practice]').fill('修改后的独立作答');assert.equal(await p.locator('.reference-panel').count(),0);assert.equal(await p.locator('[data-action=rate][aria-pressed=true]').count(),0);
 // All objective kinds allow blank direct self-assessment without inventing an objective score.
 for(const id of ['g7','g8','g9']){
  await go('/question/'+id);await btn('能独立回忆').click();const row=await record(id);assert.equal(row.attempts.at(-1).score,null);assert.equal(row.attempts.at(-1).evaluationMode,'self-only');
  await btn('核对答案').click();assert(!/参考得分 0/.test(await p.locator('.reference-panel').innerText()));
 }
 await go('/wrong');assert.equal(await p.locator('#app article').filter({hasText:'参考分未满'}).count(),0);
 // Objective checks remain real and separate from the chosen mastery color.
 await go('/question/g7');const question=await p.evaluate(()=>(window as any).beikaoData.bank.find((q:any)=>q.id==='g7'));
 const wrong=question.choices.find((c:any)=>!question.correctIds.includes(c.id)).id;
 await p.locator(`[data-answer=practice][value="${wrong}"]`).check();await btn('核对答案').click();await btn('能独立回忆').click();
 r=await record('g7');assert.equal(r.status,'good');assert.equal(r.attempts.at(-1).score,0);assert.equal(r.attempts.at(-1).evaluationMode,'checked-self');
 await p.locator(`[data-answer=practice][value="${question.correctIds[0]}"]`).check();await btn('有点模糊').click();r=await record('g7');const length=r.attempts.length;assert.equal(r.attempts.at(-1).score,null);
 await btn('核对答案').click();r=await record('g7');assert.equal(r.attempts.length,length);assert.equal(r.attempts.at(-1).score,question.max);
 await btn('想不起来').click();assert.equal((await record('g7')).attempts.length,length);
 await btn('收起答案').click();await btn('核对答案').click();assert.equal((await record('g7')).attempts.length,length);
 // Historical point-check data is retained, although no longer edited or rendered.
 await p.evaluate(()=>{const key='beikao-whiteboard-v1',s=JSON.parse(localStorage.getItem(key)!);s.personal.learner.practice['A03-q1'].attempts[0].checks=[0,2];localStorage.setItem(key,JSON.stringify(s));});
 await p.reload();assert.deepEqual((await record('A03-q1')).attempts[0].checks,[0,2]);
 await go('/question/A03-q1');
 for(const width of [1440,390,320]){
  await p.setViewportSize({width,height:1000});
  assert(await btn('记不住？查看提示').isVisible());assert.equal(await p.locator('[data-action=check]').count(),0);
  const ratings=await p.locator('[data-action=rate]').all();for(const rating of ratings)assert(await rating.isVisible());
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);
 }
 await btn('记不住？查看提示').click();assert(await btn('收起提示').isVisible());assert.equal(await p.locator('.reference-panel').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: short practice uses hints only, with no duplicate reference or button; always-visible blank self-rating; independent objective checks; P05 linkage; no invented wrong scores; historical checks preserved; mobile.');
}finally{await browser.close();}
