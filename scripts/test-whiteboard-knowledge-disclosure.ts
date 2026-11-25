import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.BEIKAO_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(5000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const go=async(route:string)=>{await page.evaluate(v=>location.hash=v,route);await page.waitForTimeout(80);};
 await page.goto(pathToFileURL(resolve('../publish-artifacts/备考有方-白板修订原型.html')).href);
 await page.getByRole('button',{name:'体验学员 · 学员'}).click();await go('/knowledge/S');
 const expected=await page.evaluate(()=>Object.values((window as any).beikaoData.topics).filter((t:any)=>t.tier==='S').length);
 assert.equal(await page.locator('.topic-group').count(),expected);
 const fixtures=[['A03','weak','rgb(251, 232, 223)'],['A13','fuzzy','rgb(252, 242, 205)'],['A21','good','rgb(227, 239, 223)'],['A04','pending','rgb(237, 242, 250)'],['A05','new','rgb(255, 254, 250)']];
 await page.evaluate(fixtures=>{
  const key='beikao-whiteboard-v1',s=JSON.parse(localStorage.getItem(key)!);
  s.personal.learner ||= {goal:null,plan:null,practice:{},exams:[],draft:null,reviewed:{}};
  for(const [topic,status]of fixtures){if(status==='new')continue;
   const q=Object.values(s.questions).map((r:any)=>r.published).find((q:any)=>q?.topic===topic&&!q.parentId&&!q.examOnly) as any;
   s.personal.learner.practice[q.id]={version:q.version,status,draft:'',attempts:[],oldDrafts:[]};
  }
  localStorage.setItem(key,JSON.stringify(s));
 },fixtures);await page.reload();
 for(const [id,status,color]of fixtures){
  const row=page.locator(`[data-group="${id}"]`),summary=row.locator(':scope > summary');
  assert.equal(await row.getAttribute('data-mastery'),status);
  assert.equal(await row.evaluate(el=>getComputedStyle(el).backgroundColor),color);
  assert.equal(await summary.locator('.tag').count(),1);assert(await summary.locator('.tag').isVisible());
  assert.equal(await row.locator('.knowledge-card-header .tag').count(),0);
  assert.equal(await row.evaluate((el:any)=>el.open),false);
 }
 const row=page.locator('[data-group="A03"]'),summary=row.locator(':scope > summary');
 const height=async()=>await row.evaluate(el=>el.getBoundingClientRect().height);
 const closed=await height();await summary.click();await page.waitForTimeout(65);const middle=await height();await page.waitForTimeout(280);const opened=await height();
 assert(middle>closed&&middle<opened,'Opening animates between actual heights');
 assert.equal(await summary.getAttribute('aria-expanded'),'true');
 await row.locator('.recall-point').first().click();assert(await row.locator('.recall-detail').isVisible());
 await summary.click();await page.waitForTimeout(65);assert((await height())>closed);await page.waitForTimeout(280);
 assert.equal(await row.evaluate((el:any)=>el.open),false);assert.equal(await summary.getAttribute('aria-expanded'),'false');
 // Rapid direction changes finish in the last requested state, without clipped content.
 for(let i=0;i<3;i++){await summary.evaluate((el:any)=>el.click());await page.waitForTimeout(35);}
 await page.waitForTimeout(300);assert.equal(await row.evaluate((el:any)=>el.open),true);assert.equal(await row.evaluate(el=>(el as HTMLElement).style.overflow),'');
 await summary.focus();await page.keyboard.press('Enter');await page.waitForTimeout(300);assert.equal(await row.evaluate((el:any)=>el.open),false);
 await page.keyboard.press('Space');await page.waitForTimeout(300);assert.equal(await row.evaluate((el:any)=>el.open),true);
 await row.getByRole('link',{name:'开始主题自测'}).click();await page.waitForTimeout(100);assert.equal(await page.locator('[name=topic]').inputValue(),'A03');
 await page.getByRole('link',{name:'返回主题组'}).click();await page.waitForTimeout(100);assert.equal(await row.evaluate((el:any)=>el.open),true);assert(await row.locator('.recall-detail').isVisible());
 // A two-topic source group keeps two independent visible mastery headers.
 const structure=page.locator('[data-group=A04]'),flat=page.locator('[data-group=A05]');
 assert.notEqual(await structure.getAttribute('data-mastery'),await flat.getAttribute('data-mastery'));
 await structure.locator(':scope > summary').click();await page.waitForTimeout(280);assert.equal(await flat.evaluate((el:any)=>el.open),false);
 await page.emulateMedia({reducedMotion:'reduce'});await summary.click();assert.equal(await row.evaluate((el:any)=>el.open),false);assert.equal(await row.evaluate(el=>el.getAnimations().length),0);
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  for(const id of ['A03','A21','A04','A05']){
   const s=page.locator(`[data-group="${id}"] > summary`),r=await s.boundingBox(),b=await s.locator('.tag').boundingBox();
   assert(r&&b&&b.x>=r.x&&b.x+b.width<=r.x+r.width&&b.y>=r.y&&b.y+b.height<=r.y+r.height,'Status remains inside the title row');
  }
 }
 await page.getByRole('button',{name:'切换账号'}).click();await page.getByRole('button',{name:'体验维护者 · 维护者'}).click();await go('/knowledge/S');
 assert.equal(await page.locator('.topic-group[open]').count(),0);assert.equal(await page.locator('.topic-group[data-mastery=new]').count(),expected);
 assert.deepEqual(errors,[]);
 console.log('PASS: visible closed-state badges; 5 mastery surfaces; independent paired topics; real open/close animation and rapid reversal; keyboard; nested controls; return state; reduced motion; 320/390 layouts; account isolation.');
}finally{await browser.close();}
