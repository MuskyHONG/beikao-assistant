
'use strict';
const {groups,topics:topicIndex,knowledgeCards,materials,contentMigrations,questionUpdates=[],casePrompt,caseSteps,bank} = window.beikaoData;
const topics=Object.fromEntries(Object.values(topicIndex).map(topic=>{
  const knowledge=knowledgeCards[topic.knowledgeId];
  return [topic.id,{
    ...topic,knowledge,title:knowledge.title,essence:knowledge.overview,
    memory:knowledge.points.map(point=>point.cue).filter(Boolean).join('—'),
  }];
}));
const key = 'beikao-whiteboard-v1';
const users = [
  {id:'learner',name:'体验学员',email:'learner@example.test',role:'学员',enabled:true},
  {id:'maintainer',name:'体验维护者',email:'editor@example.test',role:'维护者',enabled:true},
  {id:'admin',name:'体验管理员',email:'admin@example.test',role:'管理员',enabled:true},
];
const empty = () => ({goal:null,plan:null,practice:{},exams:[],draft:null,reviewed:{}});
const app = document.querySelector('#app');
const states = {new:'未接触',pending:'待自评',weak:'想不起来',fuzzy:'有点模糊',good:'能独立回忆'};
const kinds = {choice:'选择',judgment:'判断',fill:'填空',short:'简答'};
const difficulties={basic:'基础',challenging:'辨析'};
const questionDifficulty=q=>q.difficulty==='challenging'?'challenging':'basic';
const answerOnly=a=>a.completionMode==='answer-only';
const questionTypeName=q=>q.kind==='choice'?(q.multiple?'多选题':'单选题'):q.kind==='short'&&q.label==='论述'?'论述题':kinds[q.kind]+'题';
const tiers = {S:'核心必学',A:'重点拓展',B:'有余力再补'};
let store;
try { store = JSON.parse(localStorage.getItem(key)); } catch {}
store ||= {users, user:null, personal:{}, questions:Object.fromEntries(bank.map(q=>[q.id,{id:q.id, published:q, draft:null, archived:false, history:[q]}])), policies:[]};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,9);
const current = () => store.users.find(u=>u.id===store.user && u.enabled);
const data = () => store.personal[store.user] ||= empty();
const esc = (v='') => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const path = () => location.hash.slice(1) || '/home';
const go = p => { if(path()===p) render(); else location.hash=p; };
const link = (p,label,primary=false) => `<a class="button ${primary?'':'secondary'}" href="#${esc(p)}">${esc(label)}</a>`;
const button = (action,label,value='',primary=false) => `<button type="button" data-action="${action}" data-value="${esc(value)}" class="button ${primary?'':'secondary'}">${esc(label)}</button>`;
const badge = s => `<span class="tag ${s}">${states[s]}</span>`;
const tag = label => `<span class="tag">${esc(label)}</span>`;
const title = (name,details='',action='')=>`<div class="page-heading"><div><h1>${esc(name)}</h1>${details?`<p>${esc(details)}</p>`:''}</div>${action}</div>`;
const options = (entries,selected) => entries.map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(selected)?'selected':''}>${esc(label)}</option>`).join('');
const topicOptions = Object.values(topics).map(t=>[t.id,t.id+' · '+t.title]);
const fmt = ts => new Date(ts).toLocaleString('zh-CN',{hour12:false});
const today = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const normalize = v => String(v??'').normalize('NFKC').toLowerCase().replace(/\s/g,'');
const validURL = url => { try { return ['https:','http:'].includes(new URL(url).protocol); } catch { return false; } };
let noticeTimer, practiceQuery={topic:'',kind:'',tier:'',status:'',search:''}, wrongQuery={source:'',status:''};
let questionUi={key:'',hint:0,showHint:false,result:false,rated:false,ratedAttemptId:null,checkedAnswer:null};
const expandedGroup = new Set();
const knowledgeDisclosures = new WeakMap();
const expandedKnowledge = new Map();
let knowledgePrint={filters:{search:'',group:'',tier:'',status:'',order:'group'},selected:new Set()};
let examMinutesOverride=null;
let editorDraft=null, reportOpen=null, paperMode='online', activePage='';
function tell(message) {
  document.querySelector('#notice').textContent=message;
  clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>document.querySelector('#notice').textContent='',3500);
}
function save() {
  try { localStorage.setItem(key,JSON.stringify(store)); return true; }
  catch { tell('浏览器存储空间不足，当前修改可能无法保存。请减少或缩小图片。'); return false; }
}
function published() {
  return Object.values(store.questions).filter(r=>{
    if(r.archived||!isQuestionContent(r.published))return false;
    if(!r.published.parentId)return true;
    const parent=store.questions[r.published.parentId];
    return parent&&!parent.archived&&isQuestionContent(parent.published)&&!parent.published.parentId&&parent.published.topic===r.published.topic;
  }).map(r=>r.published);
}
function isQuestionContent(content) {
  return !!content&&(!content.contentType||content.contentType==='question')&&
    (!content.questionRole||content.questionRole===(content.parentId?'variant':'original'));
}
function appendBundledKnowledgeQuestions() {
  let changed=false;
  for(const q of bank){
    if(q.origin!=='knowledge-derived-v1'||store.questions[q.id])continue;
    const published=structuredClone(q);
    store.questions[q.id]={id:q.id,published,draft:null,archived:false,history:[published]};
    changed=true;
  }
  for(const rule of questionUpdates){
    const row=store.questions[rule.id], canonical=bank.find(q=>q.id===rule.id);
    if(!row||!canonical)continue;
    for(const slot of ['published','draft']){
      const old=row[slot];
      if(!old||!Object.entries(rule.previous).every(([key,value])=>JSON.stringify(old[key])===JSON.stringify(value)))continue;
      const next={...structuredClone(canonical),version:Math.max(canonical.version,...row.history.map(q=>q.version+1)),revision:'difficulty-upgrade',updated:Date.now()};
      row.history.push(next);row[slot]=next;changed=true;
    }
  }
  if(changed)save();
}
function migrateContentClassification() {
  let changed=false;
  for(const rule of contentMigrations){
    const row=store.questions[rule.id];
    if(!row)continue;
    for(const slot of ['published','draft']){
      const previous=row[slot];
      if(!previous||previous.version!==rule.previousVersion||previous.prompt!==rule.previousPrompt)continue;
      const material=materials[rule.materialId];
      const canonical=bank.find(q=>q.id===rule.id);
      const next=material?{...previous,contentType:material.contentType,materialId:material.id}:{...canonical};
      if(material){delete next.questionRole;delete next.parentId;next.knowledgeId=material.knowledgeId;}
      next.version=Math.max(...row.history.map(q=>q.version),previous.version)+1;
      next.revision='classification';next.updated=Date.now();
      row.history.push(next);row[slot]=next;
      if(material&&slot==='published')row.archived=true;
      changed=true;
    }
  }
  for(const row of Object.values(store.questions)){
    for(const slot of ['published','draft']){
      const q=row[slot];
      if(!q||!isQuestionContent(q)||q.contentType&&q.questionRole&&q.knowledgeId)continue;
      const next={...q,contentType:'question',questionRole:q.parentId?'variant':'original',knowledgeId:topics[q.topic]?.knowledgeId};
      row[slot]=next;changed=true;
    }
  }
  if(store.contentSchemaVersion!==2){store.contentSchemaVersion=2;changed=true;}
  if(changed)save();
}
function explanationText(q) {
  if(q.explanationSnapshot!=null)return q.explanationSnapshot;
  return [q.explanation,...(q.explanationRefs||[]).map(id=>materials[id]).filter(m=>m?.contentType==='knowledge_explanation').map(m=>m.text)].filter(Boolean).join('\n\n');
}
function questionSnapshot(q) {return {...structuredClone(q),explanationSnapshot:explanationText(q)};}
const practiceBank = () => published().filter(q=>!q.examOnly);
const findQ = id => published().find(q=>q.id===id);
const displayPrompt = q => q.prompt.replace(/\{\{(\d+)\}\}/g,'____（第 $1 空）');
const record = q => data().practice[q.id];
const mastery = q => record(q)?.version===q.version?record(q).status:record(q)?'pending':'new';
const topicStatus = id => {
  const statuses=practiceBank().filter(q=>q.topic===id).map(mastery);
  return ['weak','fuzzy','good','pending'].find(s=>statuses.includes(s)) || 'new';
};
const completed = status => ['weak','fuzzy','good'].includes(status);
const reviews = () => data().reviews ||= [];
const reviewDue = days => {
  const date=new Date();
  date.setDate(date.getDate()+days);
  return today(date);
};
const reviewDate = due => due===today()?'今天':due===reviewDue(1)?'明天':due.replaceAll('-',' / ');
const activeReview = topic => reviews().find(item=>item.topic===topic&&!item.completedAt);
const reviewPoint = item => topics[item.topic]?.knowledge.points.find(point=>point.id===item.pointId);
function reviewQuestion(item, pool=practiceBank()) {
  const source=pool.find(q=>q.id===item.questionId);
  const candidates=pool.filter(q=>q.topic===item.topic&&q.id!==item.questionId);
  const samePoint=candidates.find(q=>q.kind===item.kind&&q.sourcePointIds?.includes(item.pointId));
  const sameGroup=candidates.find(q=>q.kind===item.kind&&(q.parentId===item.questionId||source?.parentId&&q.parentId===source.parentId));
  return samePoint||sameGroup||candidates.find(q=>q.kind===item.kind)||source||candidates[0];
}
function scheduleReview(q, source, days, pointId) {
  const existing=activeReview(q.topic);
  if(existing&&existing.source!==source)return existing;
  const item=existing||{id:uid(),topic:q.topic,questionId:q.id,kind:q.kind,source};
  if(!reviewQuestion(item))return null;
  item.due=reviewDue(days);
  if(pointId)item.pointId=pointId;
  if(!existing)reviews().push(item);
  return item;
}
function reviewLink(item,q) {
  return '/question/'+encodeURIComponent(q.id)+'?from=home&review='+encodeURIComponent(item.id);
}
function reviewForQuestion(q,query) {
  const item=reviews().find(row=>row.id===query.get('review')&&row.topic===q.topic);
  if(!item||item.due>today())return null;
  return (item.completedAt?item.completedQuestionId:reviewQuestion(item)?.id)===q.id?item:null;
}
function lessonRecord(q, task) {
  const r=record(q);
  return task?{...r,get draft(){return task.draftVersion===q.version?task.draft||'':'';},set draft(value){task.draft=value;task.draftVersion=q.version;}}:r;
}
const studyTiers=[
  {id:'S',limit:20,name:'精简备考',focus:'优先复习 S 级'},
  {id:'A',limit:60,name:'均衡备考',focus:'覆盖 S / A 级'},
  {id:'B',limit:Infinity,name:'系统备考',focus:'覆盖 S / A / B 级'},
];
function budget() {
  const goal=data().goal;
  if(!goal) return {days:null,study:0,hours:0,tier:'S'};
  const days=Math.round((Date.parse(goal.date)-Date.parse(today()))/86400000);
  const study=Math.max(0,days+Number(goal.include));
  const hours=study*goal.hours;
  return {days,study,hours,tier:studyTiers.find(t=>hours<t.limit).id};
}
function updatePlan() {
  const d=data(), b=budget(), goal=d.goal;
  if(!goal||!b.study) return [];
  const signature=today()+JSON.stringify(goal);
  const available=practiceBank().filter(q=>!q.parentId && 'SAB'.indexOf(q.priority)<='SAB'.indexOf(b.tier));
  if(d.plan?.signature===signature && d.plan.items.every(i=>available.some(q=>q.id===i.id))) return d.plan.items;
  const rank=['weak','fuzzy','pending','new','good'];
  available.sort((a,b)=>rank.indexOf(topicStatus(a.topic))-rank.indexOf(topicStatus(b.topic)) || 'SAB'.indexOf(a.priority)-'SAB'.indexOf(b.priority));
  const unique=available.filter((q,i)=>available.findIndex(a=>a.topic===q.topic)===i);
  const minutes=goal.hours*60;
  const items=unique.slice(0,Math.floor(minutes/30)).map(q=>({id:q.id,topic:q.topic,minutes:30}));
  d.plan={signature,items};
  save();
  return items;
}
function home(edit=false) {
  const goal=data().goal, b=budget();
  const day=today(), pool=practiceBank();
  const reviewRows=reviews().map(review=>({review,q:review.completedAt?pool.find(q=>q.id===review.completedQuestionId):reviewQuestion(review,pool)})).filter(row=>row.q);
  const reviewItems=reviewRows.filter(({review})=>review.completedDay===day||!review.completedAt&&review.due<=day)
    .sort((a,b)=>a.review.due.localeCompare(b.review.due));
  const upcoming=reviewRows.filter(({review})=>!review.completedAt&&review.due>day).sort((a,b)=>a.review.due.localeCompare(b.review.due))[0];
  let minutes=b.study?goal.hours*60:0;
  const plan=reviewItems.map(({review,q})=>({id:q.id,topic:review.topic,minutes:8,review,done:review.completedDay===day}))
    .filter(item=>{if(!item.done&&minutes<item.minutes)return false;minutes-=item.minutes;return true;});
  const regular=updatePlan().map(item=>({...item,done:!!data().practice[item.id]?.attempts.some(a=>a.day===day&&a.question.version===pool.find(q=>q.id===item.id)?.version&&a.status)}));
  for(const item of regular.filter(item=>item.done)) {
    if(plan.some(row=>row.topic===item.topic))continue;
    plan.push(item);minutes-=item.minutes;
  }
  for(const item of regular.filter(item=>!item.done)) {
    if(minutes<10)break;
    if(plan.some(row=>row.topic===item.topic))continue;
    const duration=Math.min(minutes,item.minutes);
    plan.push({...item,minutes:duration});minutes-=duration;
  }
  const form=`<form data-form="goal" class="panel goal-form">
    <h2>${goal?'调整备考目标':'设置备考目标'}</h2>
    <div class="goal-date-field">
      <label for="exam-date-picker" id="exam-date-label">考试日期</label>
      <input name="date" type="hidden" value="${esc(goal?.date||'')}">
      <button type="button" class="exam-date-picker" id="exam-date-picker" data-action="open-calendar" aria-haspopup="dialog" aria-controls="exam-calendar" aria-labelledby="exam-date-label exam-date-value">
        <span id="exam-date-value">${goal?esc(goal.date.replaceAll('-',' / ')):'选择考试日期'}</span><span class="calendar-icon" aria-hidden="true"></span>
      </button>
      <dialog id="exam-calendar" aria-labelledby="calendar-title">
        <header class="calendar-cover"><h2 id="calendar-title">选择考试日期</h2><button type="button" data-action="close-calendar" aria-label="关闭日历">×</button></header>
        <div class="calendar-navigation">
          <button type="button" data-action="calendar-month" data-value="-1" aria-label="上个月">‹</button>
          <strong data-calendar-caption aria-live="polite"></strong>
          <button type="button" data-action="calendar-month" data-value="1" aria-label="下个月">›</button>
        </div>
        <div class="calendar-weekdays" aria-hidden="true">${[...'一二三四五六日'].map(day=>`<span>${day}</span>`).join('')}</div>
        <div class="calendar-days"></div>
        <footer class="calendar-footer"><button type="button" data-action="calendar-today">回到本月</button></footer>
      </dialog>
    </div>
    <label>每天可用于复习<select name="hours">${options([.5,1,1.5,2,3,4].map(h=>[h,(h===.5?'30 分钟':h+' 小时')+' / 天']),goal?.hours||1)}</select></label>
    <label class="check-line"><input type="checkbox" name="include" ${goal?.include!==false?'checked':''}> 计入考试当天的复习时间</label>
    <button class="button">${goal?'更新备考计划':'保存目标'}</button>
    ${goal?link('/home','取消调整'):'<p class="small-copy muted">目标会保存在当前浏览器，可随时调整。</p>'}
  </form>`;
  const overview=`<section class="home-budget" aria-label="备考时间">
    <div class="panel budget-hero${goal&&b.days>=0&&b.days<=7?' budget-soon':''}">
      <div class="exam-countdown">
        <h2>距离考试</h2>
        <div class="exam-alarm">
          <i class="alarm-bells" aria-hidden="true"></i><i class="alarm-feet" aria-hidden="true"></i>
          <p class="alarm-face">${!goal?'—':b.days<0?'已过期':b.days===0?'考试今天':`<b>${b.days}</b><small>天</small>`}</p>
        </div>
      </div>
      <div class="budget-info">
        <dl>
          <div><dt>目标考试日</dt><dd>${goal?`<time datetime="${esc(goal.date)}">${esc(goal.date.replaceAll('-',' / '))}</time>`:'待设置'}</dd></div>
          <div><dt>每日复习时间</dt><dd>${goal?(goal.hours===.5?'30 分钟':goal.hours+' 小时'):'—'}</dd></div>
        </dl>
        ${goal&&!edit?link('/home/edit','调整目标'):''}
      </div>
    </div>
  </section>`;
  const setup=edit||!goal?form:'';
  const doneCount=plan.filter(item=>item.done).length;
  const task=`<div class="home-study-grid"><section class="panel home-today">
    <header class="task-meter"><h2>今日任务</h2>
    ${plan.length?`<div class="task-completion">
      <progress aria-label="今日任务完成度" max="${plan.length}" value="${doneCount}"></progress>
      <span>${doneCount} / ${plan.length} 项已练</span>
    </div>`:''}</header>
    ${plan.length?`<ul class="home-task-list">${plan.map(item=>{
      const title=esc(topics[item.topic].title);
      const review=item.review, point=review&&reviewPoint(review);
      const reviewReasons={exam:'来自答卷复盘',paper:'来自纸笔自核'};
      const reason=review?(item.done?'今天已复练':point?'待补 · '+point.summary:reviewReasons[review.source.split(':')[0]]||'上次回忆需要巩固'):'建议练习';
      const target=review&&!item.done?reviewLink(review,{id:item.id}):'/question/'+encodeURIComponent(item.id)+'?from=home';
      return `<li><a class="home-task-link${item.done?' is-done':''}" href="#${esc(target)}"><div><strong>${title}</strong><small>${esc(reason)}${item.done&&!review?' · 今天已自评':''}</small></div><span>${review&&!item.done?'到期复练 · ':''}${item.minutes} 分钟</span></a></li>`;
    }).join('')}</ul>`:`<p>${!goal?'设置备考目标后生成任务。':b.days<0?'考试日期已过，请调整目标。':b.study?'暂无可安排题目。':'当前没有可用的备考时间。'}</p>`}
    ${!b.study&&reviewItems.some(({review})=>!review.completedAt)?'<p class="small-copy muted home-next-review">已有到期复练，设置有效目标后即可排入今日任务。</p>':''}
    ${upcoming?`<p class="small-copy muted home-next-review">下次复练 ${reviewDate(upcoming.review.due)} · ${esc(topics[upcoming.review.topic].title)}</p>`:''}
  </section>
  <section class="panel home-plan"><header><h2>整体备考节奏</h2>
    <p class="small-copy muted">${goal?`预计可复习 ${b.hours} 小时`:'设置目标后显示推荐档位'}</p></header>
    <ol class="study-tiers">${studyTiers.map((tier,index)=>{
      const active=b.study>0&&b.tier===tier.id;
      const lower=studyTiers[index-1]?.limit;
      const range=!lower?`少于 ${tier.limit} 小时`:Number.isFinite(tier.limit)?`${lower} 至不足 ${tier.limit} 小时`:`${lower} 小时及以上`;
      return `<li${active?' aria-current="true"':''}><div><strong>${tier.name}</strong><p>${range} · ${tier.focus}</p></div>${active?'<span class="tier-tag">当前推荐</span>':''}</li>`;
    }).join('')}</ol>
    ${b.study&&b.days<=7?'<p class="small-copy muted">临近考试，优先复练和输出。</p>':''}
    <details class="study-scope"><summary>适用范围与推荐依据</summary><p>当前内容用于教育管理案例备考。S / A / B 来自现有教学整理，结合可用时长推荐学习范围。具体招考地区、考纲覆盖和核验日期待确认。</p></details>
  </section></div>`;
  return `<div class="home-heading"><div><p class="home-date">${new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</p>
    ${title('备考概览',goal?'看清备考节奏，从今天的任务开始。':'用考试日期和每天可用时间，安排第一天学什么、练什么。')}</div><div class="home-art" aria-hidden="true">${mascot('octopus')}</div></div>`+overview+setup+task+`<section class="home-explore"><h2>按需学习</h2><div class="home-links">
    <a class="panel" href="#/framework"><h3>陌生案例入门</h3><p>读题、搭框架、写具体行动</p></a>
    <a class="panel" href="#/exams"><h3>模拟考试</h3><p>整套作答并复盘</p></a>
  </div></section>`;
}
const mascotImages={
  capybara:'mascots/capybara.webp', hare:'mascots/hare.webp',
  badger:'mascots/badger.webp', beaver:'mascots/beaver.webp',
  octopus:'mascots/octopus.webp',
};
function mascot(animal) {
  return `<img class="mascot mascot-${animal}" src="${mascotImages[animal]}" width="520" height="520" alt="">`;
}
function renderCalendar(dialog,month) {
  const first=new Date(month.getFullYear(),month.getMonth(),1,12);
  const min=today();
  const selected=dialog.closest('form').elements.date.value;
  const offset=(first.getDay()+6)%7;
  const count=new Date(first.getFullYear(),first.getMonth()+1,0,12).getDate();
  dialog.dataset.month=today(first);
  dialog.querySelector('[data-calendar-caption]').textContent=`${first.getFullYear()} 年 ${first.getMonth()+1} 月`;
  dialog.querySelector('[data-value="-1"]').disabled=dialog.dataset.month.slice(0,7)<=min.slice(0,7);
  dialog.querySelector('.calendar-days').innerHTML=Array.from({length:42},(_,index)=>{
    const day=index-offset+1;
    if(day<1||day>count) return '<span aria-hidden="true"></span>';
    const date=`${dialog.dataset.month.slice(0,-2)}${String(day).padStart(2,'0')}`;
    const label=`${first.getFullYear()}年${first.getMonth()+1}月${day}日`;
    return `<button type="button" data-action="pick-exam-date" data-value="${date}" aria-label="${label}${date===min?'，今天':''}"
      aria-pressed="${date===selected}" ${date===min?'aria-current="date"':''} ${date<min?'disabled':''}>${day}</button>`;
  }).join('');
}
function openCalendar(form) {
  const dialog=form.querySelector('#exam-calendar');
  const date=form.elements.date.value;
  const initial=date>=today()?new Date(date+'T12:00:00'):new Date();
  renderCalendar(dialog,initial);
  dialog.showModal();
  const selected=dialog.querySelector('.calendar-days [aria-pressed="true"]:enabled');
  (selected||dialog.querySelector('.calendar-days button:enabled'))?.focus();
}
function framework(query) {
  const back=query.get('return');
  return title('陌生案例入门','读题 → 搭框架 → 写具体行动')+`<section class="panel"><h2>先读题，再动笔</h2><ol><li>圈出题目动词、对象与矛盾。</li><li>列出对应题目要求的 4 至 6 个小标题。</li><li>每条写动作、责任人、流程或资源。</li></ol></section><section class="panel"><h2>扁平化改革案例</h2><p>${esc(casePrompt)}</p><small>同事体验版教学示例，基于考生回忆，未获官方核验。</small><details><summary>展开完整七步示范</summary><ol>${caseSteps.map(([name,guide,example])=>`<li><strong>${esc(name)}</strong><p>${esc(guide)} ${esc(example)}</p></li>`).join('')}</ol></details></section><div class="actions">${link(back?.startsWith('/question/')?back:'/home',back?'返回作答':'返回首页')} ${link('/practice?topic=A05','练习相关主题')}</div>`;
}
function visiblePolicies(topic,id) {
  return store.policies.filter(p=>p.status==='published'&&p.topic===topic&&(!p.question||p.question===id||!id)&&(!p.question||findQ(p.question)?.version===p.version));
}
function policyCards(rows) {
  return rows.map(p=>`<article class="panel policy-insertion"><h3>${esc(p.title)}</h3><p class="preserve">${esc(p.addition)}</p><p>${esc(p.agency)} · ${esc(p.date)} · ${esc(p.scope)}</p><blockquote>${esc(p.excerpt)}</blockquote><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">查看来源</a></article>`).join('');
}

function knowledge(tier) {
  if(tier==='policy'){
    const cards=policyCards(Object.keys(topics).flatMap(t=>visiblePolicies(t)));
    return title('已审核时政','按主题查看已核验的材料和答题增补。',link('/knowledge','返回知识地图'))+
      (cards?`<div class="stack">${cards}</div>`:emptyPage('暂无已审核并适用的材料','维护端核验发布后会在这里显示。','/knowledge','返回知识地图'));
  }
  const selected=Object.values(topics).filter(t=>!tier||t.tier===tier);
  const count=selected.filter(t=>completed(topicStatus(t.id))).length;
  if(tiers[tier]){
    const sections=groups.filter(g=>g.tier===tier).flatMap(g=>g.ids.map(id=>{
        const t=topics[id];
        const k=t.knowledge;
        const status=topicStatus(id),open=expandedGroup.has(id);
        const selected=k.points.find(point=>point.id===expandedKnowledge.get(k.id));
        const panelId='knowledge-detail-'+k.id;
        return `<details class="panel topic-group" data-group="${esc(id)}" data-mastery="${status}" ${open?'open':''}>
        <summary aria-expanded="${open}" aria-controls="topic-body-${esc(id)}"><span class="topic-heading">${esc(k.title)}</span>${badge(status)}<span class="topic-chevron" aria-hidden="true"></span></summary>
        <div class="topic-group-content" id="topic-body-${esc(id)}"><p class="muted small-copy topic-note">${g.ids.length>1?'主题组 · '+esc(g.title)+' · ':''}${esc(g.note)}</p>
        <article class="topic-summary" data-knowledge="${esc(k.id)}">
        <header class="knowledge-card-header"><span class="knowledge-topic-id">${esc(id)}</span></header>
        <div class="recall-summary" role="group" aria-label="速记提纲，点击查看解释">
          ${k.points.map(point=>`<button type="button" class="recall-point" data-action="recall-point" data-value="${esc(point.id)}"
            aria-expanded="${point.id===selected?.id}" aria-controls="${esc(panelId)}">
            ${point.cue?`<strong>${esc(point.cue)}</strong>`:''}<span>${esc(point.summary)}</span>
          </button>`).join('')}
        </div>
        <section class="recall-detail" id="${esc(panelId)}" aria-live="polite" ${selected?'':'hidden'}>
          ${selected?knowledgePointDetail(selected):''}
        </section>
        <details class="knowledge-overview"><summary>展开理解</summary><p>${esc(k.overview)}</p>
          ${k.explanationRefs?.length?`<div class="knowledge-supplements"><h4>补充讲解</h4>${k.explanationRefs.map(id=>`<p>${esc(materials[id].text)}</p>`).join('')}</div>`:''}
        </details>
        <footer class="knowledge-card-footer"><p class="muted small-copy">来源 · ${esc(k.source)}</p>
          ${link('/practice?topic='+id,'开始主题自测',true)}</footer>${policyCards(visiblePolicies(id))}</article></div></details>`;
      })).join('');
    return `<header class="knowledge-level-header"><h1>${esc(tier+' 级 · '+tiers[tier])}</h1>
      <div class="knowledge-level-progress"><p>已自评主题 <strong>${count}<span> / ${selected.length}</span></strong></p><progress aria-label="本级主题进度" max="${selected.length}" value="${count}"></progress></div>
      <div class="actions">${link('/knowledge','返回知识地图')}</div></header><div class="stack compact">${sections}</div>`;
  }
  const colors=['#fff','#e4edf5','#f7c9c1','#f4df9c','#badbc2'];
  let sum=0;
  const segments=Object.keys(states).map((s,i)=>{
    const n=selected.filter(t=>topicStatus(t.id)===s).length, a=sum;
    sum+=100*n/selected.length;
    return {s,n,css:`${colors[i]} ${a}% ${sum}%`};
  });
  return title('知识地图','依据《考试必过版本1》A版 V3.1，共 23 个主题、19 个主题组。先选优先级，再展开知识主题。')+
    `<div class="overview-grid">${Object.entries(tiers).map(([id,name])=>{
      const list=selected.filter(t=>t.tier===id), done=list.filter(t=>completed(topicStatus(t.id))).length;
      return `<a class="panel tier-card card-motion" href="#/knowledge/${id}" aria-labelledby="tier-title-${id}">
        <h2 id="tier-title-${id}">${id} 级 · ${name}</h2>
        <p>${list.length} 个主题 · ${groups.filter(g=>g.tier===id).length} 个主题组</p>
        <div class="tier-meter"><p class="small-copy muted">${done} / ${list.length} 个主题已自评</p>
          <progress aria-label="${id} 级主题自评进度" max="${list.length}" value="${done}"></progress>
        </div></a>`;
    }).join('')}</div><section class="panel knowledge-progress"><div class="pie" role="img" aria-label="主题掌握分布" style="background:conic-gradient(${segments.map(x=>x.css).join(',')})"></div>
      <div><h2>主题完成度 · ${count} / ${selected.length}</h2><div class="legend">${segments.map(x=>`<span><span class="swatch ${x.s}"></span>${states[x.s]} ${x.n}</span>`).join('')}</div></div>
    </section><div class="button-row">${link('/knowledge/policy','查看已审核时政')} ${link('/print/knowledge','打印或下载知识提纲')}</div>`;
}
function knowledgePointDetail(point) {
  return `<h4>${point.cue?esc(point.cue)+' · ':''}${esc(point.summary)}</h4><p>${esc(point.detail)}</p>`;
}
function toggleKnowledgeDisclosure(details) {
  const running=knowledgeDisclosures.get(details);
  const opening=!(running?.opening??details.open);
  const from=details.getBoundingClientRect().height;
  const summary=details.querySelector(':scope > summary');
  const content=details.querySelector(':scope > .topic-group-content');
  const opacity=running?getComputedStyle(content).opacity:opening?0:1;
  const transform=running?getComputedStyle(content).transform:opening?'translateY(-5px)':'translateY(0)';
  running?.animation.cancel();running?.contentAnimation?.cancel();
  const update=()=>{
    summary.setAttribute('aria-expanded',String(opening));
    if(opening)expandedGroup.add(details.dataset.group);else expandedGroup.delete(details.dataset.group);
  };
  update();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!details.animate){
    knowledgeDisclosures.delete(details);details.open=opening;details.style.overflow='';return;
  }
  details.open=true;
  const box=getComputedStyle(details);
  const collapsed=summary.getBoundingClientRect().height+parseFloat(box.paddingTop)+parseFloat(box.paddingBottom)+parseFloat(box.borderTopWidth)+parseFloat(box.borderBottomWidth);
  const to=opening?details.getBoundingClientRect().height:collapsed;
  details.style.overflow='clip';
  const animation=details.animate([{height:from+'px'},{height:to+'px'}],{duration:240,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
  const contentAnimation=content.animate([{opacity,transform},{opacity:opening?1:0,transform:opening?'translateY(0)':'translateY(-3px)'}],{duration:opening?200:150,fill:'both'});
  knowledgeDisclosures.set(details,{animation,contentAnimation,opening});
  animation.onfinish=()=>{
    if(knowledgeDisclosures.get(details)?.animation!==animation)return;
    details.open=opening;details.style.overflow='';knowledgeDisclosures.delete(details);
    animation.cancel();contentAnimation.cancel();update();
  };
}


function practice() {
  const f=practiceQuery;
  const qs=practiceBank();
  const matched=q=>(!f.topic||f.topic===q.topic)&&(!f.kind||f.kind===q.kind)&&(!f.tier||f.tier===q.priority)&&(!f.status||(f.status==='weak-all'?['weak','fuzzy'].includes(mastery(q)):f.status===mastery(q)))&&(!f.search||displayPrompt(q).includes(f.search)||q.title.includes(f.search));
  const items=qs.filter(q=>!q.parentId).map(q=>[q,qs.filter(v=>v.parentId===q.id)]).filter(([q,vs])=>matched(q)||vs.some(matched));
  const cards=items.map(([q,vs])=>`<article class="question-card card-motion ${mastery(q)}">
    <div class="card-meta"><span>${esc(topics[q.topic]?.title)} · ${q.priority} 级 · ${kinds[q.kind]}${['choice','judgment'].includes(q.kind)?' · '+difficulties[questionDifficulty(q)]:''}</span>${badge(mastery(q))}</div>
    <h2><a class="question-card-link" href="#/question/${esc(q.id)}">${esc(displayPrompt(q))}</a></h2>
    <p class="card-bottom"><span>${vs.length} 道变式</span><span>${record(q)?.attempts?.length?'最近 '+fmt(record(q).attempts.at(-1).at):''}</span></p>
    ${vs.map(v=>`<a class="variant-list ${mastery(v)}" href="#/question/${v.id}"><span>变式 · ${esc(v.title)}</span>${badge(mastery(v))}</a>`).join('')}
  </article>`).join('');
  const side=f.topic?link('/knowledge/'+topics[f.topic]?.tier,'返回主题组'):link('/wrong','错题集');
  return title('题目练习',f.topic?topics[f.topic]?.title:'按题干、题型和掌握情况选题。',side)+
  `<form class="panel list-controls" data-form="filter"><div class="search-row">
    <label class="search">搜索题干<input name="search" type="search" value="${esc(f.search)}"></label>
    <label>主题<select name="topic">${options([['','全部主题'],...topicOptions],f.topic)}</select></label>
    <label>题型<select name="kind">${options([['','全部题型'],...Object.entries(kinds)],f.kind)}</select></label>
    <label>优先级<select name="tier">${options([['','全部优先级'],...Object.entries(tiers)],f.tier)}</select></label>
    <label>状态<select name="status">${options([['','全部状态'],['weak-all','仅看薄弱'],...Object.entries(states)],f.status)}</select></label>
  </div><div class="button-row"><button class="button">筛选</button>${button('clear-filter','清除筛选')}</div></form>
  ${items.length?`<div class="question-grid">${cards}</div>`:emptyPage('没有符合条件的题目','调整筛选条件后再试。','/practice','返回全部题目')}`;
}
function fields(q,value='',context='practice') {
  const attr=`data-answer="${context}"`;
  if(q.kind==='choice'||q.kind==='judgment'){
    const items=q.kind==='choice'?(q.choices||[]):[{id:'正确',text:'正确'},{id:'错误',text:'错误'}];
    return `<div class="options">${items.map(c=>{
      const checked=value.split(',').includes(c.id);
      return `<label class="option${checked?' checked':''}"><input ${attr} name="response-${context}" type="${q.multiple?'checkbox':'radio'}" value="${esc(c.id)}" ${checked?'checked':''}> <span>${esc(q.kind==='choice'?c.id+'. '+c.text:c.text)}</span></label>`;
    }).join('')}</div>`;
  }
  if(q.kind==='fill'){
    const values=fillValues(value);
    return (q.blanks||[]).map((_,i)=>`<label class="answer-label">第 ${i+1} 空<input ${attr} type="text" value="${esc(values[i]||'')}"></label>`).join('');
  }
  return `<label class="answer-label">先写下你记得的要点<textarea ${attr} placeholder="写下你的回答">${esc(value)}</textarea></label>`;
}

function fillValues(v) { try { const values=JSON.parse(v);return Array.isArray(values)?values:[]; } catch { return []; } }
function hasAnswer(q,v) { return q.kind==='fill'?fillValues(v).some(x=>x.trim()):!!v?.trim(); }
function answerText(q,v) {
  if(!hasAnswer(q,v)) return '未录入文字';
  if(q.kind==='fill') return fillValues(v).map((s,i)=>`第 ${i+1} 空：${s||'未填写'}`).join('；');
  if(q.kind==='choice') return v.split(',').map(id=>q.choices.find(c=>c.id===id)?.text||id).join('；');
  return v;
}
function score(q,v) {
  if(!hasAnswer(q,v)) return 0;
  if(q.kind==='short') return null;
  if(q.kind==='fill') return Math.round(100*q.max*q.blanks.filter((b,i)=>b.accepted.some(a=>normalize(a)===normalize(fillValues(v)[i]))).length/q.blanks.length)/100;
  if(q.kind==='judgment') return v===q.correct?q.max:0;
  return v.split(',').sort().join(',')===q.correctIds.slice().sort().join(',')?q.max:0;
}
function reference(q) {
  if(q.kind==='short') return q.referenceAnswer;
  if(q.kind==='fill') return q.blanks.map((b,i)=>`第 ${i+1} 空：${b.accepted.join(' / ')}`).join('\n');
  return q.kind==='choice'?answerText(q,q.correctIds.join(',')):q.correct;
}
function openRecord(q) {
  const old=record(q);
  if(old?.version===q.version) return old;
  const next={version:q.version,status:'pending',draft:'',attempts:old?.attempts||[],oldDrafts:old?.oldDrafts||[]};
  if(old?.draft) next.oldDrafts=[...next.oldDrafts,{version:old.version,text:old.draft,at:Date.now()}];
  data().practice[q.id]=next;
  save();
  return next;
}

function question(id,query) {
  const q=practiceBank().find(row=>row.id===id);
  if(!q){
    const material=Object.values(materials).find(m=>m.legacyQuestionId===id);
    if(material){
      const label=material.contentType==='policy_basis'?'政策依据':'知识讲解';
      const message=material.contentType==='policy_basis'?'该材料已移入维护端待核验资料，核验发布后可作为学习参考。':'这段内容已归入知识卡的补充讲解。';
      return title('内容已归类为'+label,message)+link('/knowledge/'+topics[material.topicId].tier,'查看对应知识主题')+link('/practice','返回题目列表');
    }
  }
  if(!q) return title('题目已下架或不可用', '',link('/practice','返回题目列表'));
  openRecord(q);
  const task=reviewForQuestion(q,query);
  const r=lessonRecord(q,task), topic=topics[q.topic], root=q.parentId||q.id;
  const group=practiceBank().filter(v=>v.id===root||v.parentId===root);
  const index=group.findIndex(v=>v.id===id), next=group[index+1];
  const from=query.get('from'), suffix=from?'?from='+encodeURIComponent(from):'';
  const previous=from==='home'?'/home':from?.startsWith('report-')?'/report/'+from.slice(7):from==='wrong'?'/wrong':'/practice';
  const lessonKey=[id,q.version,query.get('review')].join('|');
  if(questionUi.key!==lessonKey) questionUi={key:lessonKey,hint:0,showHint:false,result:false,rated:false,ratedAttemptId:null,checkedAnswer:null};
  const hints=[topic.essence,topic.memory,q.points?.join('\n')||reference(q)];
  const banner=lessonFeedback(q,r);
  const focus=task&&reviewPoint(task), attempt=r.attempts.at(-1);
  const progress=Math.round((index+1)/group.length*100);
  return `<div class="lesson">
    <div class="lesson-track">
      ${link(previous,'返回来源')}
      <div class="lesson-position"><progress value="${progress}" max="100" aria-label="当前题组位置"></progress><span>${index+1} / ${group.length}</span></div>
      <div class="lesson-nav">${index>0?link('/question/'+group[index-1].id+suffix,'上一题'):''}${next?link('/question/'+next.id+suffix,'下一题'):''}</div>
    </div>
    <section class="lesson-question">
      <div class="lesson-meta"><span>${esc(topic.title)}</span>${tag((q.parentId?'关联变式':'原题提取')+' · '+kinds[q.kind])}${['choice','judgment'].includes(q.kind)?tag(difficulties[questionDifficulty(q)]):''}${badge(r.status)}</div>
      ${task?`<p class="review-context">到期复练 · ${task.questionId===q.id?'重做本题':'换一道题练习同主题'}。先独立回忆，答后再看提示。</p>`:''}
      <h1 class="question-title">${esc(displayPrompt(q))}</h1>
      ${fields(q,r.draft)}
      <div class="lesson-answer-actions${q.kind==='short'?' hint-only':''}"><div class="lesson-help actions">
        ${q.kind==='short'?button('hint',questionUi.showHint?'收起提示':'记不住？查看提示'):''}
        <a class="text-link" href="#/framework?return=${encodeURIComponent(path())}">陌生案例怎么答</a>
      </div>${q.kind!=='short'?`<button class="button" type="button" data-action="check" data-value="${esc(q.id)}" aria-expanded="${questionUi.result}" aria-controls="check-result">${questionUi.result?'收起答案':'核对答案'}</button>`:''}</div>
      <section class="lesson-self-assessment" aria-label="本次回忆掌握程度">
        <h2 class="sr-only">按本次回忆选择掌握程度</h2>
        <div class="rating-row">${['weak','fuzzy','good'].map(s=>`<button type="button" class="rating ${s}" data-action="rate" data-value="${esc(q.id+'|'+s)}" aria-pressed="${questionUi.rated&&r.status===s}">${states[s]}</button>`).join('')}</div>
        <div class="lesson-inline-feedback ${banner.tone}" id="lesson-feedback"><div class="lesson-feedback" role="status"><strong id="lesson-status">${banner.title}</strong><p id="lesson-status-detail">${banner.detail}</p></div><div class="lesson-followup">${questionUi.rated?link(next?'/question/'+next.id+suffix:previous,next?'继续下一题':'完成并返回',true):''}</div></div>
        <div class="lesson-review-focus">${questionUi.rated&&['weak','fuzzy'].includes(r.status)&&q.kind==='short'&&activeReview(q.topic)?`<form class="review-select" data-form="practice-review-point"><label>最想补的一个要点（选填）<select name="point">${options([['','暂不指定'],...topic.knowledge.points.map(p=>[p.id,p.summary])],activeReview(q.topic).pointId||'')}</select></label><button class="button secondary small">保存要点</button></form>`:''}
        ${questionUi.rated&&focus&&q.kind==='short'&&task.kind==='short'&&attempt?.reviewId===task.id&&hasAnswer(q,attempt.answer)?`<form class="review-select" data-form="review-outcome"><label>这次写出了「${esc(focus.summary)}」吗？（选填）<select name="outcome">${options([['','暂不记录'],['included','独立写出'],['missed','仍有遗漏']],attempt.pointOutcome||'')}</select></label><button class="button secondary small">保存复练结果</button></form>`:''}</div>
      </section>
    </section>
    ${q.kind==='short'&&questionUi.showHint?`<section class="panel coaching-hint lesson-enter"><h2>分步提示</h2>${hints.slice(0,questionUi.hint).map((h,i)=>`<p class="preserve"><strong>${['理解本质','记忆提示','拆分要点'][i]}</strong> ${esc(h)}</p>`).join('')}${questionUi.hint<3?button('next-hint','查看下一层提示'):`${explanationText(q)&&normalize(explanationText(q))!==normalize(hints[2])&&normalize(explanationText(q))!==normalize(reference(q))?`<div class="hint-supplement"><h3>补充解析</h3><p class="preserve">${esc(explanationText(q))}</p></div>`:''}${policyCards(visiblePolicies(q.topic,q.id))}`}</section>`:''}
    ${q.kind!=='short'?`<div id="check-result">${questionUi.result?resultHtml(q,r):''}</div>`:''}
    <div class="lesson-extras">
      <details><summary>内容依据与适用范围</summary><p>教育管理案例备考 · ${esc(q.sourceType||'来源类型待核验')} · 题目 v${q.version}</p><p>知识卡依据 · ${esc(topic.knowledge.source||'待核验')}</p>${validURL(q.sourceUrl)?`<p><a class="text-link" href="${esc(q.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看题目来源</a></p>`:''}<p>适用具体考纲与核验日期待确认。题目为教学练习。</p></details>
      <details><summary>同组原题与变式 · ${group.length}</summary>${group.map(v=>`<p>${v.id===id?'当前 · ':''}${link('/question/'+v.id+suffix,v.title)} ${badge(mastery(v))}</p>`).join('')}</details>
      <details><summary>练习历史 · ${r.attempts.filter(a=>a.status).length}</summary>${r.attempts.filter(a=>a.status).slice().reverse().map(a=>`<article><strong>${fmt(a.at)} · v${a.question.version} · ${states[a.status]}${a.evaluationMode==='self-only'?' · 直接自评':''}</strong><p>${esc(displayPrompt(a.question))}</p><p class="preserve">${hasAnswer(a.question,a.answer)?'原答 '+esc(answerText(a.question,a.answer)):'未录入作答，仅记录回忆自评'}</p>${a.pointOutcome?`<p>要点自查 · ${esc(a.pointSummary)} · ${a.pointOutcome==='included'?'独立写出':'仍有遗漏'}</p>`:''}<p class="preserve">参考 ${esc(reference(a.question))}</p></article>`).join('')}${r.oldDrafts.map(a=>`<p class="preserve">旧版草稿 v${a.version} · ${esc(a.text)}</p>`).join('')}</details>
      <a class="text-link" href="#/knowledge/${topic.tier}">查看主题组</a>
    </div>
  </div>`;
}
function lessonFeedback(q,r) {
  if(questionUi.rated){
    const task=activeReview(q.topic), point=task&&reviewPoint(task);
    const next=task?`${reviewDate(task.due)}${task.due<=today()?'已有':'安排'}复练${point?' · '+esc(point.summary):''}。`:'';
    return {tone:'saved',title:'自评已保存',detail:'本次回忆为「'+states[r.status]+'」。'+next};
  }
  if(!questionUi.result) return {tone:'ready',title:'按本次回忆选择掌握程度',detail:q.kind==='short'?'需要时可展开提示，无需填写答案也能自评。':'可以直接自评，也可以核对答案后再选。'};
  if(!hasAnswer(q,r.draft))return {tone:'manual',title:'参考答案已展开',detail:'按这次口头回忆或纸笔作答的情况自评。'};
  const n=score(q,r.draft);
  if(n===null) return {tone:'manual',title:'请对照参考要点',detail:'根据回忆完整程度，选择想不起来、有点模糊或能独立回忆。'};
  return n===q.max?{tone:'correct',title:'答对了',detail:`参考得分 ${n} / ${q.max}`}:
    n>0?{tone:'partial',title:'部分正确',detail:`参考得分 ${n} / ${q.max}`}:
    {tone:'incorrect',title:'这题可以再巩固',detail:`参考得分 ${n} / ${q.max}`};
}


function resultHtml(q,r) {
  const n=hasAnswer(q,r.draft)?score(q,r.draft):null, additions=visiblePolicies(q.topic,q.id);
  const exact=additions.filter(p=>p.question===q.id);
  const lines=String(reference(q)||'').split('\n');
  return `<section class="panel reference-panel lesson-enter" tabindex="-1"><h2>参考答案与解析</h2>${n===null?'':`<p>参考得分 ${n} / ${q.max}</p>`}
  ${lines.map((s,i)=>`<p class="preserve">${esc(s)}</p>${policyCards(exact.filter(p=>Number(p.anchor)===i))}`).join('')}${policyCards(exact.filter(p=>Number(p.anchor)>=lines.length))}${policyCards(additions.filter(p=>!p.question))}
  <p class="preserve">${esc(explanationText(q))}</p>
  </section>`;
}


function examScore(a,q) {
  if(answerOnly(a))return null;
  if(!hasAnswer(q,a.answers[q.id])&&!a.photos[q.id]) return 0;
  if(q.kind!=='short') return a.overrides[q.id]??(hasAnswer(q,a.answers[q.id])?score(q,a.answers[q.id]):null);
  const rubric=rubricFor(q), ratings=a.ratings[q.id]||[];
  return rubric.every((_,i)=>ratings[i]!=null)?ratings.reduce((n,x)=>n+x,0):null;
}
function rubricFor(q) {
  if(q.rubric) return q.rubric;
  const max=Math.floor(q.max*100/q.points.length)/100;
  return q.points.map((text,i)=>({text,max:i===q.points.length-1?Math.round((q.max-max*i)*100)/100:max}));
}
const answered = (a,q)=>hasAnswer(q,a.answers[q.id])||!!a.photos[q.id];
const attemptScore = a => {
  if(answerOnly(a))return a.manualScore?.raw??null;
  const scores=a.questions.map(q=>examScore(a,q));
  return scores.includes(null)?null:Math.round(100*scores.reduce((n,x)=>n+x,0))/100;
};
function wrongItems() {
  const rows=[];
  for(const [id,r] of Object.entries(data().practice)){
    const events=r.attempts.filter(a=>['weak','fuzzy'].includes(a.status)||(a.score!=null&&a.score<a.question.max));
    if(events.length) rows.push({id,key:'practice-'+id,source:'practice',events:events.map(a=>({...a,at:a.checkedAt||a.at})),question:events.at(-1).question});
  }
  const examRows=new Map();
  for(const a of data().exams.filter(a=>!answerOnly(a))) for(const q of a.questions){
    const n=examScore(a,q);
    if(n==null||n>=q.max) continue;
    if(!examRows.has(q.id)) examRows.set(q.id,{id:q.id,key:'exam-'+q.id,source:'exam',events:[],question:q});
    const row=examRows.get(q.id);
    row.events.push({at:a.reviewTimes?.[q.id]||a.submitted,answer:a.answers[q.id],score:n,question:q,exam:a.id});
    row.question=q;
  }
  return [...rows,...examRows.values()].map(row=>{
    row.events.sort((a,b)=>b.at-a.at);
    row.at=row.events[0].at;
    row.done=(data().reviewed[row.key]||0)>=row.at;
    return row;
  }).sort((a,b)=>b.at-a.at);
}
function relatedQuestion(q) {
  return practiceBank().find(x=>x.id===q.id)||practiceBank().find(x=>x.topic===q.topic&&!x.parentId);
}
function wrong() {
  const rows=wrongItems().filter(r=>(!wrongQuery.source||wrongQuery.source===r.source)&&(!wrongQuery.status||(wrongQuery.status==='done')===r.done));
  return title('错题集')+`<form class="panel actions" data-form="wrong-filter"><label class="inline">来源 <select name="source">${options([['','全部'],['practice','练习'],['exam','模拟']],wrongQuery.source)}</select></label><label class="inline">复练 <select name="status">${options([['','全部'],['todo','待复练'],['done','已复练']],wrongQuery.status)}</select></label><button class="button">筛选</button> ${link('/practice','返回题目练习')}</form>${rows.map(r=>{
    const q=relatedQuestion(r.question);
    return `<article class="panel"><h2>${esc(displayPrompt(r.question))}</h2><p>${r.source==='practice'?'练习':'模拟'} · ${kinds[r.question.kind]} · ${r.done?'已复练':'待复练'} · ${fmt(r.at)}</p><p>${r.events[0].score!=null&&r.events[0].score<r.question.max?'参考分未满':states[r.events[0].status]}</p><div class="actions">${q?link('/question/'+q.id+'?from=wrong',q.id===r.id?'复练原题':'练习同主题'):''} ${button('mark-wrong',r.done?'标回待复练':'标记已复练',r.key)}</div><details><summary>历史 · ${r.events.length} 次</summary>${r.events.map(e=>`<p>${fmt(e.at)} · ${esc(answerText(e.question,e.answer))} ${e.score==null?'':e.score+' / '+e.question.max} ${e.exam?link('/report/'+e.exam,'查看原答卷'):''}</p>`).join('')}</details></article>`;
  }).join('')||'<section class="panel empty">当前筛选下没有错题记录。</section>'}`;
}
const examKinds=['choice','judgment','fill','short'];
const examBaseCounts={choice:4,judgment:2,fill:3,short:1};
const examItemMinutes={choice:1,judgment:1,fill:2,short:8};
const recommendedExamMinutes=()=>data().goal?.hours>=3?60:data().goal?.hours>=2?40:20;
const selectedExamMinutes=()=>examMinutesOverride||recommendedExamMinutes();
function examPool() {
  const seen=new Set();
  return published().filter(q=>{
    const identity=q.kind+'|'+normalize(q.prompt);
    if(!q.simulation||seen.has(identity))return false;
    seen.add(identity);return true;
  });
}
function examPlan(minutes=selectedExamMinutes()) {
  const pool=examPool(), factor=minutes/20;
  const breakdown=examKinds.map(kind=>{
    const target=examBaseCounts[kind]*factor, available=pool.filter(q=>q.kind===kind).length;
    const actual=Math.min(target,available),rated=['choice','judgment'].includes(kind);
    const basicTarget=rated?Math.floor(target/4):null,challengingTarget=rated?target-basicTarget:null;
    const challengingAvailable=pool.filter(q=>q.kind===kind&&questionDifficulty(q)==='challenging').length;
    return {kind,target,actual,basicTarget,challengingTarget,challengingAvailable};
  });
  return {minutes,breakdown,requested:10*factor,
    actual:breakdown.reduce((n,r)=>n+r.actual,0),
    estimatedMinutes:breakdown.reduce((n,r)=>n+r.actual*examItemMinutes[r.kind],0)};
}
function pickPaper() {
  const plan=examPlan(), pool=examPool(), d=data();
  const previous=d.examDraws?.at(-1)||d.draft?.questions.map(q=>q.id)||d.exams.at(-1)?.questions.map(q=>q.id)||[];
  const old=d.exams.flatMap(a=>a.questions.map(q=>q.id));
  const weak=new Set(wrongItems().filter(r=>!r.done).map(r=>r.id));
  const questions=plan.breakdown.flatMap(({kind,actual,basicTarget,challengingTarget})=>{
    const ranked=pool.filter(q=>q.kind===kind).map(q=>({q,previous:Number(previous.includes(q.id)),used:old.filter(id=>id===q.id).length,weak:Number(weak.has(q.id)),random:Math.random()}))
      .sort((a,b)=>a.previous-b.previous||a.used-b.used||b.weak-a.weak||a.random-b.random).map(row=>row.q);
    if(basicTarget==null)return ranked.slice(0,actual);
    const selected=[...ranked.filter(q=>questionDifficulty(q)==='basic').slice(0,basicTarget),...ranked.filter(q=>questionDifficulty(q)==='challenging').slice(0,challengingTarget)];
    selected.push(...ranked.filter(q=>!selected.some(p=>p.id===q.id)).slice(0,actual-selected.length));
    return selected.map(q=>({q,random:Math.random()})).sort((a,b)=>a.random-b.random).map(row=>row.q);
  });
  return {...plan,questions};
}
const paperMinutes=a=>a.estimatedMinutes??a.durationMinutes??a.questions.length*6;
const paperMax=questions=>Math.round(questions.reduce((n,q)=>n+q.max,0)*100)/100;
const paperName=a=>a.title||'教育管理模拟卷';
function picture(url) {
  return /^data:image\/(?:jpeg|png|webp);base64,/.test(url||'')?`<p><img src="${esc(url)}" alt="纸笔答题照片"></p>`:'';
}

function exams() {
  const plan=examPlan(), draft=data().draft, recommended=recommendedExamMinutes();
  const goal=data().goal;
  return title('模拟考试','选择一套限时练习，交卷后再评阅与复盘。',link('/records','答题记录 · '+data().exams.length))+`<section class="panel paper-card">
    <h2>选择模拟时长</h2>
    <p>${goal?`每天可复习 ${goal.hours} 小时，推荐 ${recommended} 分钟档。`:'先从 20 分钟档开始，可随时手动切换。'}</p>
    <p class="small-copy muted">按教学题池组卷，时长为建议。仿真卷的题型、分值与用时需按目标考试核验后单独提供。</p>
    <div class="exam-duration-options">${[20,40,60].map(minutes=>`<label class="exam-duration">
      <input type="radio" name="exam-duration" value="${minutes}" ${plan.minutes===minutes?'checked':''}>
      <strong>${minutes} 分钟</strong><span>目标 ${minutes/2} 题</span>${recommended===minutes?tag('推荐'):''}
    </label>`).join('')}</div>
    <table class="exam-blueprint"><thead><tr><th>题型</th><th>目标题量</th><th>本次可组</th></tr></thead>
      <tbody>${plan.breakdown.map(r=>`<tr><th>${kinds[r.kind]}</th><td>${r.target} 题</td><td>${r.actual} 题</td></tr>`).join('')}</tbody>
    </table>
    <p class="exam-plan-summary">本次可组 <strong>${plan.actual} 题</strong> · 预计 <strong>${plan.estimatedMinutes} 分钟</strong></p>
    ${plan.actual<plan.requested?'<p class="small-copy muted">部分题型题池不足，按实际可用题量组卷。补充题库后自动按目标配比抽满。</p>':''}
    <p class="small-copy muted">选择与判断以辨析题为主，保留约四分之一基础题。每次随机抽题，优先避开上一套；题目与分值生成后固定。</p>
    <p class="small-copy muted">${plan.breakdown.filter(r=>r.basicTarget!=null).map(r=>`${kinds[r.kind]}：基础 ${r.basicTarget} 题 + 辨析 ${r.challengingTarget} 题`).join('；')}。${plan.breakdown.some(r=>r.challengingTarget>r.challengingAvailable)?'辨析题池不足时按实际题池补足，并以实际抽题结果为准。':''}</p>
    ${draft?`<p class="small-copy muted">上次答卷 · ${esc(paperName(draft))} · 已答 ${draft.questions.filter(q=>answered(draft,q)).length} / ${draft.questions.length} 题。</p>`:''}
    <div class="actions">${draft?link('/exam','继续上次答卷',true):''} ${plan.actual?button('new-exam','开始新卷','',!draft):''}</div>
  </section><section class="panel soft"><h3>成绩与复盘在哪里？</h3><p>交卷或选择纸笔自核后，答卷会出现在「模拟考试 / 答题记录」中。正常交卷逐题评阅，纸笔自核可导出答案并手填总分。</p></section>`;
}

function exam() {
  const a=data().draft;
  if(!a) return emptyPage('没有进行中的答卷','从试卷库开始作答。','/exams','返回试卷库');
  const i=a.index,q=a.questions[i], filled=a.questions.filter(q=>answered(a,q)).length;
  return title(paperName(a),'建议 '+paperMinutes(a)+' 分钟 · 答卷自动保存，可在答题卡中自由选题',link('/exams','保存并返回试卷库'))+
  `<div class="two-col"><section class="panel">
    <div class="section-caption">${tag('第 '+(i+1)+' / '+a.questions.length+' 题')} ${tag(questionTypeName(q)+' · '+q.max+' 分')}${['choice','judgment'].includes(q.kind)?tag(difficulties[questionDifficulty(q)]):''}</div>
    <h2 class="question-title">${esc(displayPrompt(q))}</h2>
    ${fields(q,a.answers[q.id]||'','exam')}
    ${paperMode==='paper'?`<div class="paper-upload"><label class="answer-label">上传本题照片 <small class="muted">PNG、JPEG、WebP，最大 1 MB</small><input data-photo type="file" accept="image/png,image/jpeg,image/webp"></label>${picture(a.photos[q.id])}${a.photos[q.id]?button('remove-photo','删除照片'):''}<p class="small-copy muted">可以在上方补录答案。</p></div>`:''}
    <div class="answer-footer"><span id="answer-saved">${answered(a,q)?'本题作答已保存':'本题尚未作答'}</span><span>作答中不显示参考答案</span></div>
    <div class="button-row">${i>0?button('exam-index','上一题',i-1):'<button class="button secondary" type="button" disabled>上一题</button>'} ${i+1<a.questions.length?button('exam-index','下一题',i+1,true):link('/confirm','检查并交卷',true)}</div>
  </section><aside class="stack">
    <section class="panel"><h2>本套答题卡</h2><p id="answered">已答 ${filled} / ${a.questions.length} 题</p>
    <progress class="exam-progress" aria-label="本套答题完成度" max="${a.questions.length}" value="${filled}"></progress>
    ${examAnswerSheet(a,i)}
    <p class="small-copy muted">绿色表示有作答，边框表示当前题目。</p>${link('/confirm','查看交卷清单',true)}</section>
    <section class="panel soft"><h3>记录属于这次考试</h3><p>每道题的回答和整套用时保存在同一份答卷里。交卷以后才能进入本次评分与复盘。</p><p class="small-copy muted">已用时 <span class="timer" data-start="${a.started}"></span></p></section>
    <details class="panel paper-tools" ${paperMode==='paper'?'open':''}><summary>纸笔作答与打印</summary><div class="button-row">${link('/print/paper','打印或下载空白卷')} ${button('paper-mode',paperMode==='paper'?'切换在线作答':'切换纸笔录入')}</div></details>
    <section class="panel answer-reveal-tool">${button('reveal-exam','放弃作答，直接查看答案')}<p class="small-copy muted">适合打印后手写核对。结束本次在线作答，记录标为「已看答案 · 纸笔自核」，可导出答案并手填得分。</p></section>
  </aside></div>`;
}
function examAnswerSheet(a,index) {
  const groups=new Map();
  a.questions.forEach((q,i)=>{
    const label=questionTypeName(q);
    if(!groups.has(label))groups.set(label,[]);
    groups.get(label).push({q,i});
  });
  return `<div class="answer-sheet-groups">${[...groups].map(([label,rows])=>`<section class="answer-sheet-group"><h3>${esc(label)}<span>${rows.length} 道</span></h3>
    <div class="answer-sheet">${rows.map(({q,i})=>`<button type="button" data-action="exam-index" data-value="${i}" class="${answered(a,q)?'answered ':''}${i===index?'current':''}" ${i===index?'aria-current="step"':''} aria-label="第 ${i+1} 题，${esc(label)}，${answered(a,q)?'已答':'未答'}">${i+1}</button>`).join('')}</div></section>`).join('')}</div>`;
}
function confirmExam() {
  const a=data().draft;
  if(!a) return emptyPage('没有待交卷的答卷','从试卷库开始作答。','/exams','返回试卷库');
  const count=a.questions.filter(q=>answered(a,q)).length;
  return title('检查本套答卷，再交卷',paperName(a)+` · 已作答 ${count} / ${a.questions.length} 题`,link('/exam','返回作答'))+
  `<form class="panel" data-form="submit-exam">
    ${a.questions.map((q,i)=>`<div class="submission-item"><div>${tag((i+1)+'. '+(questionTypeName(q)))}<strong>${esc(displayPrompt(q))}</strong></div><p class="preserve">${esc(answered(a,q)?answerText(q,a.answers[q.id]):'未作答，交卷后本题按 0 分计。')}</p>${picture(a.photos[q.id])}</div>`).join('')}
    <label class="check-line"><input type="checkbox" name="confirmed" required><span>确认交卷并保留本次答题记录。${count<a.questions.length?'未作答题目按 0 分计。':''}</span></label>
    ${count?'':'<p class="warning-copy">至少完成一道题或添加一张答题照片。</p>'}
    <button class="button" disabled>确认交卷</button>
  </form>`;
}
function emptyPage(name,details,p,label) {
  return `<section class="panel empty"><h2>${esc(name)}</h2><p>${esc(details)}</p>${link(p,label,true)}</section>`;
}
function manualScoreForm(a,compact=false) {
  const max=paperMax(a.questions);
  return `<form data-form="manual-score" data-exam="${esc(a.id)}" class="manual-score-form${compact?' compact':''}"><label>手填本次原卷得分<input name="raw" type="number" min="0" max="${max}" step="0.01" required value="${a.manualScore?.raw??''}" placeholder="0–${max}" aria-label="手填本次原卷得分"></label><span class="manual-score-max">/ ${max} 分</span><button type="submit" class="button secondary small">保存得分</button>${a.manualScore?button('clear-manual-score','清除',a.id):''}</form>`;
}
function records() {
  const rows=data().exams.slice().reverse();
  const cards=rows.map(a=>{
    const total=attemptScore(a), max=paperMax(a.questions);
    const percent=total==null||max<=0?null:Math.round(total/max*100);
    const perfect=total!=null&&max>0&&Math.round(total*100)===Math.round(max*100);
    const external=answerOnly(a),status=external?'已看答案 · 纸笔自核':percent==null?'待评阅':'已评阅';
    return `<article class="record-paper card-motion${perfect?' is-perfect':''}${external?' is-answer-only':''}" aria-label="${esc(paperName(a))}，${status}，${percent==null?'未评分':`百分制 ${percent} 分，原卷 ${total} / ${max} 分`}">
      <div class="record-paper-heading"><span>备考有方 · 模拟答卷</span><span class="record-mode">${status}</span></div>
      <div class="record-paper-title"><h2><a href="#/report/${esc(a.id)}" class="record-report-link">${esc(paperName(a))}<span class="sr-only">，${external?'查看本卷答案与纸笔核对':'查看这次答卷与复盘'}</span></a></h2>${percent==null?`<span class="record-ungraded">${external?'待手填成绩':'待评阅'}</span>`:`<div class="record-mark" aria-label="${external?'手填成绩，':''}折合百分制 ${percent} 分"><strong>${percent}</strong><span>${external?'手填折合百分制':'折合百分制'}</span></div>`}</div>
      <p class="record-meta"><time datetime="${new Date(a.submitted).toISOString()}">${esc(fmt(a.submitted))}</time><br>${external?'纸笔自行核对 · 未录入逐题成绩':`作答 ${a.questions.filter(q=>answered(a,q)).length} / ${a.questions.length} 题`} · 用时 ${Math.max(1,Math.ceil(a.seconds/60))} 分钟</p>
      <div class="record-paper-lines" aria-label="本卷题型数量">${examKinds.filter(kind=>a.questions.some(q=>q.kind===kind)).map((kind,i)=>`<div><span>${'一二三四'[i]}、${kinds[kind]}题</span><span>${a.questions.filter(q=>q.kind===kind).length} 道</span></div>`).join('')}</div>
      <footer class="record-paper-footer"><p>${percent==null?external?'可手填纸笔核对的原卷得分':'完成逐题评阅后显示分数':`${external?'手填原卷':'原卷'} <b>${total} / ${max}</b> 分`}</p>${external?manualScoreForm(a,true):''}</footer>
      ${perfect?`<div class="record-seal" role="img" aria-label="${external?'纸笔手填':'原卷'}满分纪念章"><img src="full-marks-seal-v2.png" alt="" aria-hidden="true"></div>`:''}
    </article>`;
  }).join('');
  return title('答题记录','已交卷与纸笔自核分别标记，点击整张试卷查看记录。',link('/exams','返回试卷库'))+
  (rows.length?`<p class="record-score-note">分数按原卷得分 ÷ 原卷满分 × 100 换算，四舍五入取整数；原卷分数保留。主观题按要点自评，照片题人工核分。</p><div class="record-paper-grid">${cards}</div>`:emptyPage('你还没有提交过模拟答卷','完成一套试卷并交卷后，这里才会出现作答、得分和复盘。','/exams','选择试卷开始作答'));
}

function grading(a,q) {
  if(!answered(a,q)) return '<p>本题未作答，计 0 分。</p>';
  if(q.kind==='short') return rubricFor(q).map((r,i)=>`<label class="rubric-row"><span>${esc(r.text)}（满分 ${r.max}）</span><input type="number" min="0" max="${r.max}" step="0.01" value="${a.ratings[q.id]?.[i]??''}" data-grade="${q.id}" data-point-index="${i}" placeholder="待评"></label>`).join('');
  return `<label class="rubric-row"><span>人工核对参考分（0–${q.max}）</span><input type="number" min="0" max="${q.max}" step="0.01" value="${examScore(a,q)??''}" data-grade="${q.id}" placeholder="待评"></label>`;
}

function report(id) {
  const a=data().exams.find(x=>x.id===id);
  if(!a) return emptyPage('答卷不存在或尚未交卷','已交卷的答卷可以从答题记录查看。','/records','返回答题记录');
  if(answerOnly(a))return answerOnlyReport(a);
  const total=attemptScore(a), max=a.questions.reduce((n,q)=>n+q.max,0);
  const objective=a.questions.filter(q=>q.kind!=='short');
  const objectiveScores=objective.map(q=>examScore(a,q));
  const objectiveText=objectiveScores.includes(null)?'待核对':objectiveScores.reduce((n,s)=>n+s,0)+' / '+objective.reduce((n,q)=>n+q.max,0);
  const pool=practiceBank();
  const candidates=a.questions.map((q,i)=>({q,i,n:examScore(a,q)})).filter(({q,n})=>
    answered(a,q)&&n!=null&&n<q.max&&reviewQuestion({topic:q.topic,questionId:q.id,kind:q.kind},pool));
  const focus=candidates.filter((row,i)=>candidates.findIndex(({q})=>q.topic===row.q.topic)===i).slice(0,2);
  return title('本次答卷与复盘',paperName(a)+' · '+fmt(a.submitted)+' 交卷 · 用时 '+Math.max(1,Math.ceil(a.seconds/60))+' 分钟',link('/records','返回答题记录'))+
  `<div class="score-strip">
    <section class="panel"><span class="muted">本次参考总分</span><strong class="score">${total==null?'待评阅':total+` <small>/ ${max}</small>`}</strong><span>${total==null?'完成逐题评阅后显示总分':'客观题核对与主观题逐点自评 · 分数仅用于本卷'}</span></section>
    <section class="panel"><span class="muted">客观题参考得分</span><strong class="score">${objectiveText}</strong><span>按教学参考答案核对</span></section>
    <section class="panel"><span class="muted">作答记录</span><strong class="score">${a.questions.filter(q=>answered(a,q)).length}<small> / ${a.questions.length} 题</small></strong><span>逐题展开原答与评分依据</span></section>
  </div>
  ${focus.length?`<section class="panel review-summary"><h2>下次可以补练</h2><p>从已有作答和评分的失分题中选出。对照原答确认后，可排进首页。</p>${focus.map(({q,i,n})=>{
    const task=activeReview(q.topic);
    return `<div class="review-suggestion"><div><strong>${esc(topics[q.topic]?.title||q.title)}</strong><p>第 ${i+1} 题 · 参考 ${n} / ${q.max} 分</p></div>${task?`<span>${reviewDate(task.due)}已安排</span>`:button('schedule-exam-review','安排复练',q.id)}</div>`;
  }).join('')}</section>`:''}
  ${total==null?'<section class="panel soft"><h3>先完成待评阅的题目</h3><p>展开题目，对照原答与参考依据逐点评分。纸笔照片由你查看并核分。</p></section>':''}
  <section class="panel"><h2>逐题作答与参考得分</h2>
    <div class="report-row table-head"><span>题号与题型</span><span>题目</span><span>参考得分</span><span>作答与依据</span></div>
    ${a.questions.map((q,i)=>{
      const n=examScore(a,q), related=relatedQuestion(q);
      const open=reportOpen===q.id;
      return `<div class="report-row"><span>${i+1} · ${esc(questionTypeName(q))}</span><span>${esc(displayPrompt(q))}</span><strong>${n===null?'待评阅':n+' / '+q.max}</strong><button class="button secondary small" type="button" data-action="report-toggle" data-value="${q.id}" aria-expanded="${open}">${open?'收起':'展开本题'}</button></div>
      ${open?`<div class="review-detail" data-report="${q.id}"><h3>你这次的原始作答</h3><p class="original-answer preserve">${esc(answerText(q,a.answers[q.id]))}</p>${picture(a.photos[q.id])}<h3>参考答案与评分依据</h3><p class="preserve">${esc(reference(q))}</p><p class="preserve">${esc(explanationText(q))}</p>${grading(a,q)}${related?link('/question/'+related.id+'?from=report-'+id,related.id===q.id?'复练原题':'练习同主题'):''}</div>`:''}`;
    }).join('')}
    <div class="button-row">${link('/print/report/'+id,'打印或下载复盘')} ${link('/wrong','查看错题集')}</div>
  </section>`;
}

function answerOnlyReport(a) {
  return title('本卷答案与纸笔核对',paperName(a)+' · 已放弃在线作答，答案已查看',link('/records','返回答题记录'))+
    `<section class="panel answer-only-note"><h2>已看答案 · 纸笔自核</h2><p>原来的在线回答仍保留在这份记录中。未录入的纸笔答案不按 0 分计，也不自动加入错题集。下面的答案、分值与解析沿用本卷快照。</p>${manualScoreForm(a)}<p class="small-copy muted">填写原卷得分，系统会按满分 ${paperMax(a.questions)} 分折算为百分制整数。手填总分不代表已完成逐题评阅。</p><div class="actions">${link('/print/answers/'+a.id,'打印或下载本卷答案',true)}</div></section>
    <section class="panel review-summary"><h2>手动安排复练</h2><p>纸笔核对后，可以从本卷挑一个想再练的主题。</p><form class="review-select" data-form="paper-review" data-exam="${esc(a.id)}"><label>本卷题目<select name="question" required>${options([['','请选择一道题'],...a.questions.map((q,i)=>[q.id,`第 ${i+1} 题 · ${topics[q.topic]?.title||q.title}`])],'')}</select></label><button class="button secondary small">安排纸笔复练</button></form></section>
    <section class="panel answer-key-list"><h2>本卷参考答案</h2>${a.questions.map((q,i)=>`<article><h3>${i+1}. ${esc(displayPrompt(q))}</h3><p class="small-copy muted">${esc(questionTypeName(q))} · ${q.max} 分</p>${printChoices(q)}<p class="preserve"><strong>参考答案：</strong>${esc(printableReference(q))}</p><p class="preserve answer-explanation">${esc(explanationText(q))}</p>${q.kind==='short'?`<p class="small-copy">评分要点：${rubricFor(q).map(r=>esc(r.text)+'（'+r.max+'分）').join('；')}</p>`:''}${answered(a,q)?`<details><summary>查看放弃前保留的原作答</summary><p class="preserve">${esc(answerText(q,a.answers[q.id]))}</p>${picture(a.photos[q.id])}</details>`:''}</article>`).join('')}</section>`;
}
function printableReference(q) {
  return q.kind==='choice'?q.correctIds.join('、')+' · '+reference(q):reference(q);
}

function printPage(type,id) {
  if(type==='knowledge')return knowledgePrintPage();
  const a=type==='paper'?data().draft:data().exams.find(x=>x.id===id);
  if(!a) return title('暂无可打印内容')+link('/exams','返回试卷库');
  if(type==='answers')return `<div class="actions no-print">${link('/report/'+a.id,'返回')} ${button('print','打印 / 保存 PDF','',true)} ${button('download','下载 HTML',paperName(a)+' · 参考答案')}</div><div class="print-page exam-paper answer-key-paper">${examPaperStyle()}<style>.answer-key-paper article{break-inside:avoid-page;border-bottom:1px solid #c8cebf;padding:8px 0;margin-bottom:9px}.answer-key-paper article h2{font-size:14px;margin:0 0 4px}.answer-key-paper p{font-size:12px;line-height:1.7;margin:4px 0}.answer-key-paper h1{font-size:21px;text-align:center}.answer-key-paper .answer-key-context{text-align:center;margin-bottom:16px}.answer-key-paper .preserve{white-space:pre-wrap}</style><h1>${esc(paperName(a))} · 参考答案</h1><p class="answer-key-context">共 ${a.questions.length} 题 · 原卷满分 ${paperMax(a.questions)} 分 · 供纸笔核对</p>${a.questions.map((q,i)=>`<article data-answer-key="${esc(q.id)}"><h2>${i+1}. ${esc(displayPrompt(q))}（${q.max} 分）</h2>${printChoices(q)}<p class="preserve"><b>参考答案：</b>${esc(printableReference(q))}</p><p class="preserve">${esc(explanationText(q))}</p>${q.kind==='short'?`<p>评分要点：${rubricFor(q).map(r=>esc(r.text)+'（'+r.max+'分）').join('；')}</p>`:''}</article>`).join('')}</div>`;
  const name=paperName(a)+(type==='report'?' · 复盘':' · 空白卷'), back=type==='paper'?'/exam':'/report/'+id;
  if(type==='paper')return `<div class="actions no-print">${link(back,'返回')} ${button('print','打印 / 保存 PDF','',true)} ${button('download','下载 HTML',name)}</div>
    <div class="print-page exam-paper">${examPaperStyle()}${blankExamPaper(a)}</div>`;
  const html=a.questions.map((q,i)=>`<article><h2>${i+1}. ${esc(displayPrompt(q))}</h2><p>${questionTypeName(q)} · ${q.max} 分</p>${printChoices(q)}${type==='report'?`<p class="preserve">原答 ${esc(answerText(q,a.answers[q.id]))}</p>${picture(a.photos[q.id])}<p>参考得分 ${examScore(a,q)??'待评阅'}</p><p class="preserve">${esc(reference(q))}</p>`:'<div class="write-space"></div>'}</article>`).join('');
  return `<div class="actions no-print">${link(back,'返回')} ${button('print','打印 / 保存 PDF','',true)} ${button('download','下载 HTML',name)}</div><div class="print-page">${title(name)}${html}</div>`;
}

function blankExamPaper(a) {
  const sections=examKinds.map(kind=>({kind,rows:a.questions.map((q,index)=>({q,index})).filter(row=>row.q.kind===kind)})).filter(section=>section.rows.length);
  const total=paperMax(a.questions);
  const instructions={choice:'将正确选项填入括号，多选题已单独标注。',judgment:'请在题目后的括号内填写“√”或“×”。',fill:'请将答案填写在题干横线上。',short:'请在题后空白处作答，条理清楚、要点完整。'};
  return `<header class="exam-paper-header">
    <h1>${esc(paperName(a))}</h1>
    <p>建议用时 ${paperMinutes(a)} 分钟　共 ${a.questions.length} 题　满分 ${total} 分</p>
    <div class="exam-identification"><span>姓名：____________</span><span>日期：____________</span><span>得分：____________</span></div>
    <table class="exam-score-table"><thead><tr><th>题型</th>${sections.map(s=>`<th>${kinds[s.kind]}题</th>`).join('')}<th>合计</th></tr></thead>
      <tbody><tr><th>满分</th>${sections.map(s=>`<td>${paperMax(s.rows.map(r=>r.q))}</td>`).join('')}<td>${total}</td></tr>
        <tr><th>得分</th>${sections.map(()=>'<td>　</td>').join('')}<td>　</td></tr></tbody></table>
  </header>
  ${sections.map((s,i)=>`<section class="exam-paper-section" data-paper-kind="${s.kind}">
    <h2>${'一二三四'[i]}、${kinds[s.kind]}题<span>（共 ${s.rows.length} 题，${paperMax(s.rows.map(r=>r.q))} 分）</span></h2>
    <p class="exam-section-note">${instructions[s.kind]}</p>
    ${s.rows.map(({q,index})=>{
      const prompt=esc(q.prompt).replace(/\{\{(\d+)\}\}/g,'<span class="exam-fill-blank">________</span>');
      const answerMark=q.kind==='choice'||q.kind==='judgment'?' （　　）':'';
      const label=q.kind==='choice'&&q.multiple?'【多选】':q.kind==='short'&&q.label&&q.label!=='简答'?'【'+esc(q.label)+'】':'';
      const lines=q.max>=10?9:6;
      return `<article class="exam-paper-question" data-paper-question="${esc(q.id)}">
        <h3><b>${index+1}.</b> ${label}${prompt}${answerMark}<small>（${q.max} 分）</small></h3>
        ${q.kind==='choice'?`<div class="exam-paper-choices ${q.choices.some(c=>c.text.length>35)?'long-options':''}">${q.choices.map(c=>`<p>${esc(c.id)}. ${esc(c.text)}</p>`).join('')}</div>`:''}
        ${q.kind==='short'?`<div class="exam-writing-lines" aria-label="答题留白">${'<div></div>'.repeat(lines)}</div>`:''}
      </article>`;
    }).join('')}
  </section>`).join('')}`;
}
function examPaperStyle() {
  return `<style>
    .print-page.exam-paper { width: 210mm; max-width: 100%; margin: 18px auto 0; padding: 15mm; box-sizing: border-box; background: white; color: #17251c; font: 14px/1.65 system-ui,sans-serif; }
    .exam-paper-header { text-align: center; break-inside: avoid-page; }
    .exam-paper-header h1 { font-size: 22px; margin: 0 0 6px; }
    .exam-paper-header > p { font-size: 13px; margin: 0 0 14px; }
    .exam-identification { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 9px; margin-bottom: 14px; font-size: 13px; text-align: left; }
    .exam-score-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
    .exam-score-table th,.exam-score-table td { border: 1px solid #526358; padding: 4px; text-align: center; font-weight: 400; }
    .exam-paper-section > h2 { font-size: 16px; margin: 17px 0 2px; break-after: avoid-page; }
    .exam-paper-section > h2 span { font-size: 13px; font-weight: 400; }
    .exam-section-note { font-size: 12px; margin: 0 0 8px; break-after: avoid-page; }
    .exam-paper .exam-paper-question { break-inside: avoid-page; border: 0; margin: 0 0 12px; padding: 0; }
    .exam-paper-question h3 { font-size: 14px; font-weight: 400; line-height: 1.7; margin: 0 0 5px; }
    .exam-paper-question h3 small { font-size: 12px; white-space: nowrap; }
    .exam-paper-choices { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 3px 20px; padding-left: 18px; }
    .exam-paper-choices.long-options { grid-template-columns: 1fr; }
    .exam-paper-choices p { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
    .exam-fill-blank { white-space: nowrap; }
    .exam-writing-lines { margin: 6px 0 8px 18px; }
    .exam-writing-lines > div { height: 8mm; border-bottom: 1px solid #aeb9b0; }
    @media print {
      @page { size: A4; margin: 15mm; }
      body { margin: 0; padding: 0; max-width: none; }
      .print-page.exam-paper { width: auto; max-width: none; margin: 0; padding: 0; border-radius: 0; }
    }
    @media screen and (max-width:600px) {
      .print-page.exam-paper { padding: 18px; }
      .exam-paper-choices { gap: 3px 10px; padding-left: 4px; }
    }
  </style>`;
}

function printableTopics() {
  const f=knowledgePrint.filters;
  const list=Object.values(topics).filter(t=>{
    const group=groups.find(g=>g.ids.includes(t.id));
    const text=[t.title,t.essence,...t.knowledge.points.flatMap(p=>[p.cue,p.summary,p.detail])].join(' ');
    return (!f.tier||t.tier===f.tier)&&(!f.group||group.ids[0]===f.group)&&
      (!f.status||(f.status==='weak-all'?['weak','fuzzy'].includes(topicStatus(t.id)):topicStatus(t.id)===f.status))&&
      (!f.search||normalize(text).includes(normalize(f.search)));
  });
  return list;
}
function selectedKnowledge() {
  const selected=Object.values(topics).filter(t=>knowledgePrint.selected.has(t.id));
  const f=knowledgePrint.filters;
  const rank=['weak','fuzzy','pending','new','good'];
  selected.sort((a,b)=>{
    if(f.order==='title')return a.title.localeCompare(b.title,'zh-CN');
    if(f.order==='weak')return rank.indexOf(topicStatus(a.id))-rank.indexOf(topicStatus(b.id))||a.id.localeCompare(b.id);
    if(f.order==='tier')return 'SAB'.indexOf(a.tier)-'SAB'.indexOf(b.tier)||a.id.localeCompare(b.id);
    return groups.findIndex(g=>g.ids.includes(a.id))-groups.findIndex(g=>g.ids.includes(b.id));
  });
  return selected;
}
function knowledgePrintPage() {
  const f=knowledgePrint.filters, candidates=printableTopics(), selected=selectedKnowledge();
  const controls=`<section class="panel knowledge-print-controls no-print">
    <h1>整理知识提纲</h1>
    <form data-form="knowledge-print-filter" class="knowledge-print-filter">
      <label>搜索知识点<input name="search" value="${esc(f.search)}" placeholder="主题、速记字或正文关键词"></label>
      <label>主题分类<select name="group">${options([['','全部分类'],...groups.map(g=>[g.ids[0],g.title])],f.group)}</select></label>
      <label>优先级<select name="tier">${options([['','全部级别'],...Object.entries(tiers).map(([id,name])=>[id,id+' · '+name])],f.tier)}</select></label>
      <label>掌握程度<select name="status">${options([['','全部状态'],['weak-all','仅看薄弱'],...Object.entries(states)],f.status)}</select></label>
      <label>打印顺序<select name="order">${options([['group','按主题分类'],['tier','优先级 S → A → B'],['weak','薄弱优先'],['title','按标题排序']],f.order)}</select></label>
      <div class="print-selection-actions">
        <button class="button">应用筛选</button>${button('print-clear-selection','清空已选')}
        <span role="status">已选 ${selected.length} 个知识点</span>
      </div>
    </form>
    <p class="small-copy muted">应用筛选后自动全选结果，可取消不需要的知识点。</p>
    <div class="knowledge-print-candidates" aria-label="选择要打印的知识点">
      ${groups.map(group=>{
        const list=candidates.filter(t=>group.ids.includes(t.id));
        if(!list.length)return '';
        return `<section class="print-candidate-group">${group.ids.length>1?`<h2>${esc(group.title)}</h2>`:''}${list.map(t=>
          `<label class="print-topic-choice"><input type="checkbox" data-print-topic="${esc(t.id)}" ${knowledgePrint.selected.has(t.id)?'checked':''}>
            <span>${esc(t.tier)} · ${esc(t.title)}</span>${badge(topicStatus(t.id))}</label>`
        ).join('')}</section>`;
      }).join('')||'<p>没有符合条件的知识点。可以修改筛选条件，或先在题目练习中自评掌握情况。</p>'}
    </div>
  </section>`;
  const actions=`<div class="actions no-print">${link('/knowledge','返回')}
    <button type="button" class="button" data-action="print" ${selected.length?'':'disabled'}>打印 / 保存 PDF</button>
    <button type="button" class="button secondary" data-action="download" data-value="备考有方知识提纲" ${selected.length?'':'disabled'}>下载 HTML</button></div>`;
  const content=selected.map(t=>{
    return `<article data-printed-topic="${esc(t.id)}">
      <h3>${esc(t.tier)} · ${esc(t.id)} · ${esc(t.title)}</h3>
      <p class="printed-content">${t.knowledge.points.map(p=>{
        const detail=p.cue&&p.detail.startsWith(p.cue)?p.detail.slice(p.cue.length):p.detail;
        return `<span class="printed-point">${p.cue?`<b>${esc(p.cue)}</b>${p.detail.startsWith(p.cue)?'':'：'}`:''}${esc(detail)}</span>`;
      }).join(' ')}</p>
      ${policyCards(visiblePolicies(t.id))}
    </article>`;
  }).join('');
  return actions+controls+(selected.length?`<div class="print-page knowledge-print">${knowledgePrintStyle()}
    <h1>备考有方知识提纲</h1><p class="print-document-count">${selected.length} 个知识点</p>${content}</div>`:
    '<section class="panel print-empty no-print"><h2>选择要背的知识点</h2><p>应用筛选或勾选知识点后显示打印预览。</p></section>');
}
function knowledgePrintStyle() {
  return `<style>
    .knowledge-print { color: #26342a; background: white; font-family: system-ui, sans-serif; line-height: 1.7; }
    .knowledge-print > h1 { font-size: 24px; margin: 0 0 4px; }
    .knowledge-print .print-document-count { font-size: 12px; margin: 0 0 10px; color: #52645b; }
    .knowledge-print article { break-inside: avoid-page; border-bottom: 1px solid #bdc9ba; padding: 10px 0; }
    .knowledge-print article > h3 { font-size: 16px; margin: 0 0 4px; break-after: avoid-page; }
    .knowledge-print .printed-content { font-size: 13px; margin: 0; line-height: 1.9; overflow-wrap: anywhere; orphans: 3; widows: 3; }
    .knowledge-print .printed-point { margin-right: .6em; }
    .knowledge-print .printed-point b { font-size: 19px; font-weight: 800; line-height: 1; }
    @media print { @page { size: A4; margin: 16mm; } .knowledge-print { color: #18281c; } }
  </style>`;
}
function refreshKnowledgeSelection(input) {
  const list=app.querySelector('.knowledge-print-candidates'), top=list?.scrollTop||0;
  const focus=input?.dataset.printTopic||'';
  render();
  app.querySelector('.knowledge-print-candidates').scrollTop=top;
  if(focus)app.querySelector(`[data-print-topic="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
}

function login() {
  return `<div class="login-stage">
    <div class="login-art" aria-hidden="true">${mascot('capybara')}${mascot('hare')}${mascot('badger')}${mascot('beaver')}</div>
    <section class="panel login-card">
      <p class="login-brand">备考有方</p>
      <h1>开始备考</h1>
      <p class="muted">选择体验身份，进入你的学习空间。</p>
      <div class="login-roles">${store.users.filter(u=>u.enabled).map(u=>button('login',u.name+' · '+u.role,u.id,u.role==='学员')).join('')||'暂无可用账号'}</div>
      <p class="small-copy muted">原型数据保存在当前浏览器。</p>
    </section>
  </div>`;
}
function accounts() {
  if(current().role!=='管理员') return title('仅管理员可管理账号')+link('/maintain','返回题库');
  return title('账号管理')+`<section class="panel"><h2>开通体验账号</h2><form data-form="account">
  <label>姓名 <input name="name" required></label><label>邮箱 <input name="email" type="email" required></label>
  <label>角色 <select name="role">${options(['学员','维护者','管理员'].map(r=>[r,r]))}</select></label><button class="button">开通账号</button></form></section>
  ${store.users.map(u=>`<article class="panel"><strong>${esc(u.name)}</strong><p>${esc(u.email)} · ${u.role} · ${u.enabled?'启用':'停用'}</p>${u.id!==current().id?button('toggle-account',u.enabled?'停用':'启用',u.id):'当前账号'}</article>`).join('')}`;
}
let adminQuery={search:'',status:''};
const bankStatus = row => row.archived?'archived':row.published?'published':'draft';
const bankLabels = {published:'已发布',draft:'草稿',archived:'已下架'};

function bankAdmin() {
  const all=Object.values(store.questions).filter(row=>isQuestionContent(row.draft||row.published));
  const rows=all.filter(r=>{
    const q=r.draft||r.published;
    return (!adminQuery.search||(q.title+' '+q.prompt).includes(adminQuery.search))&&(!adminQuery.status||bankStatus(r)===adminQuery.status);
  });
  const counts=Object.entries(bankLabels).map(([id,label])=>`<span>${label}<strong>${all.filter(r=>bankStatus(r)===id).length}</strong></span>`).join('');
  return title('题库管理','按题型和知识主题维护原题与变式。',link('/maintain/new','新增题目',true))+
    `<div class="summary-strip">${counts}</div><section class="panel">
    <form class="maintenance-filters" data-form="bank-filter">
      <label>搜索题目<input name="search" value="${esc(adminQuery.search)}"></label>
      <label>发布状态<select name="status">${options([['','全部'],...Object.entries(bankLabels)],adminQuery.status)}</select></label>
      <div class="actions"><button class="button">筛选</button></div>
    </form><div class="bank-table">
      <div class="bank-row table-head"><span>题目与主题</span><span>题型</span><span>状态</span><span>操作</span></div>
      ${rows.map(r=>{
        const q=r.draft||r.published;
        return `<div class="bank-row"><div><strong>${esc(q.title||q.prompt)}</strong><p class="small-copy muted">${esc(topics[q.topic]?.title)} · v${q.version}${r.published&&r.draft?' · 有未发布修订':''}${q.simulation?' · 模拟池':''}</p></div><span>${kinds[q.kind]} · ${q.parentId?'变式':'原题'}</span>
        ${tag(bankLabels[bankStatus(r)])}<div class="row-actions"><a class="text-link" href="#/maintain/edit/${q.id}">编辑</a><a class="text-link" href="#/maintain/history/${q.id}">版本历史</a>
        ${r.published&&!r.archived?`<button type="button" class="text-button" data-action="archive" data-value="${q.id}">下架</button>`:''}</div></div>`;
      }).join('')||'<p>没有匹配题目。</p>'}
    </div></section>`;
}

const blankQuestion = () => ({id:'q-'+uid(),contentType:'question',questionRole:'original',kind:'short',topic:'A03',knowledgeId:topics.A03.knowledgeId,priority:'S',title:'',prompt:'',max:5,parentId:'',sourceType:'教学编题',sourceUrl:'',explanation:'',simulation:false});
const lines = v => String(v||'').split('\n').map(s=>s.trim()).filter(Boolean);
function editor(id,preview=false) {
  const row=store.questions[id];
  if(id&&!row) return title('题目不存在')+link('/maintain','返回题库');
  if(editorDraft?.route!==id) editorDraft={route:id,q:structuredClone(row?.draft||row?.published||blankQuestion()),preview:false};
  const q=editorDraft.q;
  const parents=Object.values(store.questions).map(r=>r.draft||r.published).filter(p=>isQuestionContent(p)&&!p.parentId&&p.id!==q.id&&p.topic===q.topic);
  const choiceFields=`<label><input name="multiple" type="checkbox" ${q.multiple?'checked':''}> 多选</label><label>选项（每行一个，自动按 A、B、C 编号）<textarea name="choices">${esc(q.choices?.map(c=>c.text).join('\n'))}</textarea></label><label>正确选项编号（多项用逗号分开）<input name="correctIds" value="${esc(q.correctIds?.join(','))}"></label>`;
  const answerFields={
    choice:choiceFields,
    judgment:`<label>判断答案 <select name="correct">${options([['正确','正确'],['错误','错误']],q.correct)}</select></label>`,
    fill:`<label>逐空答案（每行一空，同一空的可接受答案用 | 分隔）<textarea name="blanks">${esc(q.blanks?.map(b=>b.accepted.join(' | ')).join('\n'))}</textarea></label><p>题干使用 {{1}}、{{2}} 等连续编号。</p>`,
    short:`<label>参考答案<textarea name="referenceAnswer">${esc(q.referenceAnswer)}</textarea></label><label>评分要点（每行一点）<textarea name="points">${esc(q.points?.join('\n'))}</textarea></label>`
  };
  const issues=questionIssues(q);
  return title(id?'编辑题目':'新增题目','',link('/maintain','返回题库'))+`<div class="admin-editor-grid"><section class="panel editor-form"><form data-form="question">
  <div class="grid"><label>题型 <select name="kind">${options(Object.entries(kinds),q.kind)}</select></label><label>主题 <select name="topic">${options(topicOptions,q.topic)}</select></label>
  <label>优先级 <select name="priority">${options(Object.entries(tiers),q.priority)}</select></label><label>所属原题 <select name="parentId">${options([['','本题是原题'],...parents.map(p=>[p.id,p.title||p.prompt])],q.parentId)}</select></label>
  <label>难度 <select name="difficulty">${options(Object.entries(difficulties),questionDifficulty(q))}</select></label>
  <label>分值 <input name="max" type="number" min="0.01" max="100" step="0.01" value="${q.max}"></label>
  <label>资料性质 <select name="sourceType">${options(['教学编题','考生回忆','官方材料','AI 新编'].map(s=>[s,s]),q.sourceType)}</select></label>
  <label>内容标签<input value="${q.parentId?'题目 / 变式':'题目 / 原题'}" readonly></label></div>
  <label>标题 <input name="title" value="${esc(q.title)}"></label>
  <label>题干<textarea name="prompt">${esc(q.prompt)}</textarea></label>
  <label>来源链接 <input name="sourceUrl" type="url" value="${esc(q.sourceUrl)}"></label>
  ${answerFields[q.kind]}
  <label>解析<textarea name="explanation">${esc(q.explanation)}</textarea></label>
  ${q.sourceEvidence?.length?`<details class="question-source-evidence"><summary>编题依据 · ${esc(q.knowledgeId)} · v${q.sourceKnowledgeVersion}</summary>${q.sourceEvidence.map(item=>`<p><strong>${esc(item.pointId)}</strong> ${esc(item.quote)}</p>`).join('')}<p class="small-copy muted">这是初始编题的依据快照。修改题干、答案或知识主题时，请重新核对内容是否仍由该依据支持。</p></details>`:''}
  ${q.explanationRefs?.length?`<details class="question-linked-explanations"><summary>关联知识讲解 · ${q.explanationRefs.length}</summary>${q.explanationRefs.map(id=>`<p>${esc(materials[id]?.text)}</p>`).join('')}</details>`:''}
  <label><input name="simulation" type="checkbox" ${q.simulation?'checked':''}> 可纳入模拟选题池</label>
  <div class="actions"><button class="button secondary" name="operation" value="preview">预览</button><button class="button secondary" name="operation" value="draft">保存草稿</button><button name="operation" value="publish" class="button">发布</button></div></form></section>
  ${preview||editorDraft.preview?`<section class="panel student-preview"><h2>学员作答预览</h2><p>${esc(displayPrompt(q))}</p>${fields(q,'','preview')}${issues.length?`<p class="error">发布前需处理：${esc(issues.join('；'))}</p>`:`<details><summary>查看答后参考</summary><p class="preserve">${esc(reference(q))}</p><p>${esc(explanationText(q))}</p></details>`}</section>`:'<section class="panel student-preview"><h2>学员作答预览</h2><p class="muted">填写题目后，点击预览查看作答和参考答案。</p></section>'}</div>`;
}
function readQuestion(form) {
  const q=editorDraft.q, f=new FormData(form);
  const choices=lines(f.get('choices')).map((text,i)=>({id:String.fromCharCode(65+i),text}));
  const points=lines(f.get('points'));
  return {...q,
    contentType:'question',questionRole:f.get('parentId')?'variant':'original',
    kind:f.get('kind'),topic:f.get('topic'),knowledgeId:topics[f.get('topic')].knowledgeId,priority:f.get('priority'),parentId:f.get('parentId'),difficulty:f.get('difficulty'),
    explanationRefs:q.topic===f.get('topic')?q.explanationRefs:[],policyBasisRefs:q.topic===f.get('topic')?q.policyBasisRefs:[],
    title:f.get('title').trim(),prompt:f.get('prompt').trim(),max:Number(f.get('max')),
    sourceType:f.get('sourceType'),sourceUrl:f.get('sourceUrl').trim(),explanation:f.get('explanation').trim(),
    simulation:f.has('simulation'),multiple:f.has('multiple'),choices,
    correctIds:String(f.get('correctIds')||'').toUpperCase().split(/[,，\s]+/).filter(Boolean),
    correct:f.get('correct'),blanks:lines(f.get('blanks')).map(s=>({accepted:s.split('|').map(x=>x.trim()).filter(Boolean)})),
    referenceAnswer:String(f.get('referenceAnswer')||'').trim(),points,
    rubric:q.kind==='short'&&f.get('kind')==='short'&&Number(f.get('max'))===q.max&&JSON.stringify(points)===JSON.stringify(q.points)?q.rubric:undefined,
    label:f.get('kind')===q.kind?q.label:undefined
  };
}
function questionIssues(q) {
  const issues=[];
  if(q.difficulty&&!difficulties[q.difficulty])issues.push('请选择基础或辨析难度');
  if(q.contentType!=='question')issues.push('知识讲解和政策依据须归入资料库');
  if(q.questionRole!==(q.parentId?'variant':'original'))issues.push('原题/变式标签须与所属原题一致');
  if(q.knowledgeId!==topics[q.topic]?.knowledgeId)issues.push('知识主题引用不一致');
  if((q.explanationRefs||[]).some(id=>materials[id]?.contentType!=='knowledge_explanation'||materials[id].topicId!==q.topic))issues.push('关联讲解须为同主题的知识讲解');
  if((q.policyBasisRefs||[]).some(id=>materials[id]?.contentType!=='policy_basis'||materials[id].topicId!==q.topic))issues.push('政策引用须为同主题的政策依据');
  if(!q.prompt) issues.push('题干不能为空');
  if(!(q.max>0&&q.max<=100)) issues.push('分值须在 0 至 100 之间且大于 0');
  if((q.sourceUrl&&!validURL(q.sourceUrl))||(['考生回忆','官方材料'].includes(q.sourceType)&&!validURL(q.sourceUrl))) issues.push('请填写有效来源链接');
  if(q.parentId){
    const p=findQ(q.parentId);
    if(!p||!isQuestionContent(p)||p.parentId||p.questionRole!=='original'||p.id===q.id||p.topic!==q.topic) issues.push('所属原题必须已发布且与变式同主题');
  }
  if(published().some(v=>v.parentId===q.id&&(v.topic!==q.topic||q.parentId))) issues.push('请先调整已发布变式的归属');
  if(q.kind==='choice'){
    const c=q.choices||[], ids=q.correctIds||[];
    if(c.length<2||c.length>8||new Set(c.map(x=>x.text)).size!==c.length) issues.push('需有 2 至 8 个不同选项');
    if(!ids.length||new Set(ids).size!==ids.length||(!q.multiple&&ids.length!==1)||ids.some(id=>!c.some(x=>x.id===id))) issues.push('请填写有效的正确选项');
    if(!q.explanation) issues.push('请填写解析');
  }
  if(q.kind==='judgment'&&(!['正确','错误'].includes(q.correct)||!q.explanation)) issues.push('请设置判断答案及依据');
  if(q.kind==='fill'){
    const b=q.blanks||[], marks=[...q.prompt.matchAll(/\{\{(\d+)\}\}/g)].map(m=>Number(m[1]));
    if(b.length<1||b.length>5||b.some((x,i)=>!x.accepted.length||marks.filter(m=>m===i+1).length!==1)||marks.length!==b.length) issues.push('1 至 5 个连续空号必须与逐空答案对应');
  }
  if(q.kind==='short'&&(!q.referenceAnswer||!q.points?.length)) issues.push('请填写参考答案及至少一个要点');
  return issues;
}
function saveQuestion(q,operation) {
  if(!q.title&&!q.prompt) return tell('请至少填写题干或标题。');
  if(operation==='publish'){
    const issues=questionIssues(q);
    if(issues.length) {editorDraft.preview=true;render();tell(issues.join('；'));return;}
  }
  const row=store.questions[q.id]||{id:q.id,history:[],draft:null,published:null,archived:false};
  q={...q,title:q.title||q.prompt.slice(0,65),version:(row.history.at(-1)?.version||0)+1,author:current().name,updated:Date.now(),revision:operation};
  row.history.push(q);
  if(operation==='publish'){row.published=q;row.draft=null;row.archived=false;}
  else row.draft=q;
  store.questions[q.id]=row;
  save(); editorDraft=null;
  tell(operation==='publish'?'题目已发布。':'草稿已保存。');
  go('/maintain');
}
function history(id) {
  const r=store.questions[id];
  return title('题目版本历史')+link('/maintain','返回题库')+(r?r.history.slice().reverse().map(q=>`<details><summary>v${q.version} · ${q.revision==='draft'?'草稿':q.revision==='publish'?'发布':q.revision==='classification'?'内容归类修正':'样例'} · ${esc(q.author||'教学样例')} ${q.updated?fmt(q.updated):''}</summary><p>${esc(displayPrompt(q))}</p><p class="preserve">${esc(reference(q))}</p></details>`).join(''):'<section>题目不存在。</section>');
}
const emptyPolicy = () => ({type:'政策文件',title:'',agency:'',date:'',url:'',excerpt:'',scope:'',topic:'A03',question:'',anchor:0,addition:''});
let policyDraft=null, policyPreview=false;
function policyAdmin() {
  const p=policyDraft||emptyPolicy();
  const related=practiceBank().filter(q=>q.topic===p.topic), q=related.find(q=>q.id===p.question);
  const base=q?String(reference(q)||'').split('\n'):[topics[p.topic].essence];
  const originals=Object.values(materials).filter(m=>m.contentType==='policy_basis'&&!store.policies.some(p=>p.importedMaterialId===m.id));
  return title('时政材料与融合审核')+`<details class="panel imported-policy-bases"><summary>原始政策依据 · 待核验 ${originals.length} 条</summary>
    <p class="small-copy muted">从原始资料中归类的引用。补齐来源、日期和适用范围，核验发布后进入学员端。</p>
    ${originals.map(m=>`<article><p>${esc(m.text)}</p><div class="actions">${tag('政策依据 · 待核验')}${button('import-policy-basis','登记核验',m.id)}</div></article>`).join('')}
  </details><section class="panel editor-form"><h2>登记材料与答案增补</h2><form data-form="policy">
  <div class="grid"><label>材料类别 <select name="type">${options([['政策文件','政策文件'],['时事案例','时事案例']],p.type)}</select></label>
  <label>标题 <input name="title" value="${esc(p.title)}" required></label><label>发布机构 <input name="agency" value="${esc(p.agency)}" required></label>
  <label>发布日期或事件日期 <input name="date" type="date" value="${esc(p.date)}" required></label>
  <label>来源链接 <input name="url" type="url" value="${esc(p.url)}" required></label>
  <label>适用范围 <input name="scope" value="${esc(p.scope)}" required></label>
  <label>关联主题 <select name="topic">${options(topicOptions,p.topic)}</select></label>
  <label>关联题目 <select name="question">${options([['','整主题'],...related.map(q=>[q.id,q.title])],p.question)}</select></label></div>
  <label>原文摘录<textarea name="excerpt" required>${esc(p.excerpt)}</textarea></label>
  <label>增补位置 <select name="anchor">${options(base.map((s,i)=>[i,'第 '+(i+1)+' 段后 · '+s.slice(0,45)]),p.anchor)}</select></label>
  <label>拟增加的考场表达<textarea name="addition" required>${esc(p.addition)}</textarea></label>
  <div class="actions"><button class="button secondary" name="operation" value="preview" formnovalidate>预览</button><button class="button" name="operation" value="draft">保存待核验草稿</button></div></form></section>
  ${policyPreview?`<section class="panel"><h2>融合预览 · 待核验</h2>${base.map((s,i)=>`<p>${esc(s)}</p>${i===Number(p.anchor)?`<p class="preserve"><strong>拟增补</strong> ${esc(p.addition)}</p>`:''}`).join('')}</section>`:''}
  <h2>已登记材料</h2>${store.policies.slice().reverse().map(r=>{
    const outdated=r.question&&findQ(r.question)?.version!==r.version;
    return `<article class="panel"><h3>${esc(r.title)}</h3><p>${r.status==='archived'?'已停用':outdated?'待复核':r.status==='published'?'已发布':'待核验'} · ${esc(topics[r.topic]?.title)} · ${esc(r.date)}</p>
    <details><summary>查看来源与增补</summary>${policyCards([r])}<p>${r.reviewer?'审核 '+esc(r.reviewer)+' · '+fmt(r.reviewedAt):''}</p></details>
    <div class="actions">${button('edit-policy','编辑草稿',r.id)} ${r.status!=='published'||outdated?button('publish-policy','核验并发布',r.id):''} ${r.status==='published'?button('archive-policy','停用',r.id):''}</div></article>`;
  }).join('')||'<section class="panel empty">尚无材料。</section>'}`;
}
function formValues(form) {return Object.fromEntries(new FormData(form));}
function render() {
  const user=current();
  const [route,search='']=path().split('?'), parts=route.split('/').slice(1), page=parts[0];
  const query=new URLSearchParams(search), maintenance=page==='maintain';
  if(page==='practice'&&lastPath!==path()){
    if(query.has('topic')||query.has('status')||lastPath.startsWith('/practice?')){
      practiceQuery={topic:query.get('topic')||'',kind:'',tier:'',status:query.get('status')||'',search:''};
    }
  }
  if(activePage!==route){
    if(page!=='question') questionUi.key='';
    if(page!=='report') reportOpen=null;
    activePage=route;
  }
  lastPath=path();
const learnerSpace=user&&maintenance&&user.role!=='学员'?'内容维护':'学习空间';
  document.querySelector('#workspace-label').textContent=learnerSpace;
  document.querySelector('#workspace').textContent=learnerSpace==='内容维护'?'维护空间 / 题库与内容':'学员空间 / 教育管理备考';
  document.querySelector('#identity').textContent=user?user.name+' · 当前浏览器自动保存':'';
  const navLink=(p,label,active=false,sub=false)=>`<a href="#${p}" class="${sub?'subnav':'navlink'}${active?' active':''}" ${active?'aria-current="page"':''}>${label}</a>`;
  const isExam=['exams','exam','confirm','records','report'].includes(page)||page==='print'&&parts[1]!=='knowledge';
  const isKnowledge=page==='knowledge'||page==='print'&&parts[1]==='knowledge';
  const isPractice=['practice','question','wrong'].includes(page);
  const nav=maintenance&&user?.role!=='学员'?
    navLink('/maintain','题库管理',!['policy','users'].includes(parts[1]))+navLink('/maintain/policy','时政材料',parts[1]==='policy')+(user?.role==='管理员'?navLink('/maintain/users','账号管理',parts[1]==='users'):''):
    navLink('/home','首页',['home','framework'].includes(page))+
    navLink('/knowledge','知识学习',isKnowledge)+(isKnowledge?navLink('/knowledge','知识地图',!parts[1],true):'')+
    navLink('/practice','题目练习',isPractice)+(isPractice?navLink('/practice','全部题目',page==='practice'&&!query.get('status'),true)+navLink('/practice?status=weak-all','薄弱题目',query.get('status')==='weak-all',true)+navLink('/wrong','错题集',page==='wrong',true):'')+
    navLink('/exams','模拟考试',isExam)+(isExam?navLink('/exams','试卷库',!['records','report'].includes(page),true)+navLink('/records','答题记录',['records','report'].includes(page),true):'');
  document.querySelector('#nav').innerHTML=user?nav:'';
  document.querySelector('#sidebar-bottom').innerHTML=user?`${maintenance?'<a class="mode-switch" href="#/home">返回学习空间</a>':user.role!=='学员'?'<a class="mode-switch" href="#/maintain">题库维护端（原型）</a>':''}<button type="button" class="text-button" data-action="logout">切换账号</button><span>数据仅保存在当前浏览器</span>`:'';
  const crumbs={
    home:['首页','备考概览'],framework:['首页','陌生案例入门'],
    knowledge:['知识学习','知识地图',parts[1]==='policy'?'已审核时政':tiers[parts[1]]?parts[1]+' 级主题组':''],
    practice:['题目练习',query.get('status')==='weak-all'?'薄弱题目':'题目列表'],question:['题目练习','单题提取与自评'],wrong:['题目练习','错题集'],
    exams:['模拟考试','试卷库'],exam:['模拟考试','试卷库','作答'],confirm:['模拟考试','试卷库','确认交卷'],
    records:['模拟考试','答题记录'],report:['模拟考试','答题记录',user&&data().exams.some(a=>a.id===parts[1]&&answerOnly(a))?'本卷答案与纸笔核对':'本次答卷与复盘'],
    print:[isKnowledge?'知识学习':'模拟考试','打印与下载'],
    maintain:['维护端',parts[1]==='policy'?'时政材料':parts[1]==='users'?'账号管理':'题库管理',parts[1]==='new'?'新增题目':parts[1]==='edit'?'编辑与预览':parts[1]==='history'?'版本历史':'']
  };
  document.querySelector('#breadcrumbs').innerHTML=user?(crumbs[page]||[]).filter(Boolean).map(c=>`<span>${esc(c)}</span>`).join('<span class="separator">/</span>'):'';
  document.querySelector('.app-shell').classList.toggle('login-shell',!user);
  document.body.classList.toggle('print-view',page==='print');
  document.body.classList.toggle('practice-view',!!user&&page==='question');
  if(!user){app.innerHTML=login();return;}
  if(maintenance&&user.role==='学员'){app.innerHTML=title('当前账号没有维护权限')+link('/home','返回首页');return;}
  const pages={
    home:()=>home(parts[1]==='edit'),
    framework:()=>framework(query),
    knowledge:()=>knowledge(parts[1]),
    practice, question:()=>question(parts[1],query), wrong, exams, exam, confirm:confirmExam, records,
    report:()=>report(parts[1]),print:()=>printPage(parts[1],parts[2]),
    maintain:()=>{
      if(parts[1]==='policy') return policyAdmin();
      if(parts[1]==='users') return accounts();
      if(parts[1]==='new') return editor('');
      if(parts[1]==='edit') return editor(parts[2]);
      if(parts[1]==='history') return history(parts[2]);
      return bankAdmin();
    }
  };
  app.innerHTML=pages[page]?.()||title('页面不存在')+link('/home','返回首页');
  updateClock();
}
let lastPath='';
function updateClock() {
  const clock=app.querySelector('.timer');
  if(clock){const seconds=Math.max(0,Math.floor((Date.now()-Number(clock.dataset.start))/1000));clock.textContent=`${Math.floor(seconds/60)} 分 ${seconds%60} 秒`;}
}
function currentQuestion() {return practiceBank().find(q=>q.id===path().split(/[/?]/)[2]);}
function currentTask(q) {return reviewForQuestion(q,new URLSearchParams(path().split('?')[1]));}
function addCheck(q,r,task) {
  const result=score(q,r.draft), at=Date.now(), last=r.attempts.at(-1);
  if(last&&last.reviewId===task?.id&&(!last.status||last.id===questionUi.ratedAttemptId)&&last.answer===r.draft&&last.question.version===q.version) {
    last.at=at; last.checkedAt=at; last.day=today();last.score=result;
    if(last.status)last.evaluationMode='checked-self';
  } else r.attempts.push({id:uid(),at,checkedAt:at,day:today(),answer:r.draft,question:questionSnapshot(q),score:result,...(task?{reviewId:task.id}:{})});
  save();
}
function storePhoto(input) {
  const file=input.files[0], a=data().draft, id=a.questions[a.index].id, owner=store.user;
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024) return tell('请选择不超过 1 MB 的 PNG、JPEG 或 WebP 图片。');
  const reader=new FileReader();
  reader.onload=()=>{
    if(store.user!==owner||data().draft?.id!==a.id) return;
    const old=a.photos[id];
    a.photos[id]=reader.result;
    if(!save()){if(old)a.photos[id]=old;else delete a.photos[id];}
    render();
  };
  reader.onerror=()=>tell('图片读取失败，请重试。');
  reader.readAsDataURL(file);
}
function printChoices(q) {
  if(q.kind==='judgment') return '<p>□ 正确　　□ 错误</p>';
  return (q.choices||[]).map(c=>`<p>□ ${esc(c.id+'. '+c.text)}</p>`).join('');
}
function readAnswer(element) {
  if(element.tagName==='TEXTAREA') return element.value;
  const siblings=[...app.querySelectorAll('[data-answer="'+element.dataset.answer+'"]')];
  if(element.type==='text') return JSON.stringify(siblings.map(x=>x.value));
  return siblings.filter(x=>x.checked).map(x=>x.value).join(',');
}
app.addEventListener('input',event=>{
  const e=event.target;
  if(e.matches('[data-answer][type="radio"],[data-answer][type="checkbox"]')){
    e.closest('.options').querySelectorAll('.option').forEach(label=>label.classList.toggle('checked',label.querySelector('input').checked));
  }
  if(e.matches('[data-form="submit-exam"] [name="confirmed"]')){
    e.form.querySelector('button[type="submit"], button:not([type])').disabled=
      !e.checked||!data().draft.questions.some(q=>answered(data().draft,q));
  }
  if(e.matches('[data-answer="practice"]')){
    const q=currentQuestion(), r=lessonRecord(q,currentTask(q));
    r.draft=readAnswer(e);
    if(questionUi.result||questionUi.rated){
      questionUi.result=false;questionUi.rated=false;questionUi.ratedAttemptId=null;questionUi.checkedAnswer=null;
      app.querySelector('#check-result')?.replaceChildren();
      app.querySelector('#lesson-feedback').className='lesson-inline-feedback ready';
      const feedback=lessonFeedback(q,r);
      app.querySelector('#lesson-status').textContent=feedback.title;
      app.querySelector('#lesson-status-detail').textContent=feedback.detail;
      app.querySelector('.lesson-followup').replaceChildren();
      app.querySelector('.lesson-review-focus').replaceChildren();
      app.querySelectorAll('[data-action="rate"]').forEach(control=>control.setAttribute('aria-pressed','false'));
    }
    const check=app.querySelector('[data-action="check"]');
    if(check){check.textContent='核对答案';check.setAttribute('aria-expanded','false');}
    save();
  }
  if(e.matches('[data-answer="exam"]')){
    const a=data().draft, q=a.questions[a.index];
    a.answers[q.id]=readAnswer(e);
    save();
    const filled=a.questions.filter(x=>answered(a,x)).length;
    app.querySelector('#answered').textContent=`已答 ${filled} / ${a.questions.length} 题`;
    app.querySelector('.exam-progress').value=filled;
    app.querySelector('#answer-saved').textContent=answered(a,q)?'本题作答已保存':'本题尚未作答';
    app.querySelectorAll('aside [data-action="exam-index"]').forEach((b,i)=>{
      const done=answered(a,a.questions[i]);
      b.classList.toggle('answered',done);
      b.setAttribute('aria-label',`第 ${i+1} 题，${done?'已答':'未答'}`);
    });
  }
});
app.addEventListener('click',event=>{
  const summary=event.target.closest('.topic-group > summary');
  if(!summary)return;
  event.preventDefault();toggleKnowledgeDisclosure(summary.parentElement);
});
app.addEventListener('toggle',event=>{
  const e=event.target;
  if(e.dataset.group){
    const open=knowledgeDisclosures.get(e)?.opening??e.open;
    if(open)expandedGroup.add(e.dataset.group);else expandedGroup.delete(e.dataset.group);
    e.querySelector(':scope > summary').setAttribute('aria-expanded',String(open));
  }
  if(e.dataset.report&&e.open)reportOpen=e.dataset.report;
},true);
app.addEventListener('change',event=>{
  const e=event.target, form=e.closest('form');
  if(e.name==='exam-duration'){
    examMinutesOverride=Number(e.value);render();
    app.querySelector(`input[name="exam-duration"][value="${examMinutesOverride}"]`)?.focus({preventScroll:true});
    return;
  }
  if(e.matches('[data-print-topic]')){
    if(e.checked)knowledgePrint.selected.add(e.dataset.printTopic);else knowledgePrint.selected.delete(e.dataset.printTopic);
    refreshKnowledgeSelection(e);return;
  }
  if(e.matches('[data-photo]')) storePhoto(e);
  if(e.matches('[data-grade]')){
    if(!e.checkValidity())return tell('请输入有效分值。');
    const a=data().exams.find(x=>x.id===path().split('/')[2]), id=e.dataset.grade;
    if(!a||answerOnly(a))return;
    const value=e.value===''?null:Number(e.value);
    if(e.dataset.pointIndex!=null){
      a.ratings[id]||=[];
      a.ratings[id][Number(e.dataset.pointIndex)]=value;
    } else if(value===null) delete a.overrides[id];
    else a.overrides[id]=value;
    a.reviewTimes[id]=Date.now();
    reportOpen=id;save();render();
  }
  if(form?.dataset.form==='question'&&['kind','topic','parentId'].includes(e.name)){
    editorDraft.q=readQuestion(form);
    if(e.name==='topic'){editorDraft.q.parentId='';editorDraft.q.questionRole='original';}
    render();
  }
  if(form?.dataset.form==='policy'&&['topic','question'].includes(e.name)){
    policyDraft={...policyDraft,...formValues(form),anchor:0};
    if(e.name==='topic')policyDraft.question='';
    policyPreview=false;render();
  }
});
app.addEventListener('submit',event=>{
  const form=event.target, type=form.dataset.form;
  if(!type) return;
  event.preventDefault();
  const f=formValues(form), operation=event.submitter?.value||'';
  if(type==='manual-score'){
    const a=data().exams.find(x=>x.id===form.dataset.exam);
    if(!a||!answerOnly(a))return;
    if(f.raw===''||!Number.isFinite(Number(f.raw))||Number(f.raw)<0||Number(f.raw)>paperMax(a.questions))return tell('请填写原卷分值范围内的得分。');
    a.manualScore={raw:Math.round(Number(f.raw)*100)/100,at:Date.now(),source:'self-reported'};
    save();render();tell('已保存手填得分。');
  } else if(type==='practice-review-point'){
    const q=currentQuestion(), task=q&&activeReview(q.topic);
    if(!task||!questionUi.rated||!['weak','fuzzy'].includes(record(q)?.status))return;
    const point=topics[q.topic].knowledge.points.find(p=>p.id===f.point);
    if(point)task.pointId=point.id;
    else delete task.pointId;
    if(save()){render();app.querySelector('[data-form="practice-review-point"] select')?.focus({preventScroll:true});tell('已保存复练要点。');}
  } else if(type==='review-outcome'){
    const q=currentQuestion(), task=q&&currentTask(q), attempt=q&&record(q)?.attempts.at(-1);
    const point=task&&reviewPoint(task);
    if(q?.kind!=='short'||!point||!attempt?.reviewId||attempt.reviewId!==task.id||!hasAnswer(q,attempt.answer))return;
    const source='point:'+attempt.id;
    if(['included','missed'].includes(f.outcome)){attempt.pointOutcome=f.outcome;attempt.pointSummary=point.summary;}
    else {delete attempt.pointOutcome;delete attempt.pointSummary;}
    if(f.outcome==='missed'){
      if(!activeReview(q.topic))scheduleReview(q,source,3,point.id);
    } else data().reviews=reviews().filter(row=>row.completedAt||row.source!==source);
    if(save()){render();app.querySelector('[data-form="review-outcome"] select')?.focus({preventScroll:true});tell('已保存本次要点自查。');}
  } else if(type==='paper-review'){
    const a=data().exams.find(x=>x.id===form.dataset.exam);
    const q=a&&answerOnly(a)&&a.questions.find(q=>q.id===f.question);
    if(!q)return;
    const task=scheduleReview(q,'paper:'+a.id+':'+q.id,1);
    if(!task)return tell('当前没有可复练的关联题。');
    if(save())tell('已安排复练 · '+reviewDate(task.due)+' · '+topics[q.topic].title);
  } else if(type==='knowledge-print-filter'){
    knowledgePrint.filters=f;
    knowledgePrint.selected=new Set(printableTopics().map(t=>t.id));
    render();
  } else if(type==='goal'){
    if(!f.date||f.date<today()){openCalendar(form);return;}
    data().goal={date:f.date,hours:Number(f.hours),include:!!f.include};save();go('/home');
  } else if(type==='filter'){
    practiceQuery=f;render();
  } else if(type==='wrong-filter'){
    wrongQuery=f;render();
  } else if(type==='bank-filter'){
    adminQuery=f;render();
  } else if(type==='account'){
    const email=f.email.trim().toLowerCase(), name=f.name.trim();
    if(!name||store.users.some(u=>u.email===email))return tell('请填写姓名及未被使用的邮箱。');
    store.users.push({id:uid(),email,name,role:f.role,enabled:true});save();render();
  } else if(type==='question'){
    editorDraft.q=readQuestion(form);
    if(operation==='preview'){editorDraft.preview=true;render();}
    else saveQuestion(editorDraft.q,operation||'draft');
  } else if(type==='policy'){
    policyDraft={...policyDraft,...f};
    if(operation==='preview'){policyPreview=true;render();return;}
    if(!validURL(f.url)||['title','agency','date','excerpt','scope','addition'].some(k=>!f[k]?.trim()))return tell('请补齐资料及有效来源链接。');
    const original=store.policies.find(p=>p.id===policyDraft.id);
    const row={...policyDraft,id:original?.status==='draft'?original.id:uid(),replaces:original?.status==='published'?original.id:original?.replaces,status:'draft',version:findQ(f.question)?.version,reviewer:null,reviewedAt:null};
    if(original?.status==='draft') Object.assign(original,row);
    else store.policies.push(row);
    policyDraft=null;policyPreview=false;save();render();tell('已保存待核验草稿。');
  } else if(type==='submit-exam'){
    const a=data().draft;
    if(!a||!f.confirmed||!a.questions.some(q=>answered(a,q))) return;
    const submitted=Date.now();
    if(!data().exams.some(x=>x.id===a.id))data().exams.push({...a,submitted,seconds:Math.round((submitted-a.started)/1000)});
    data().draft=null;save();go('/report/'+a.id);
  }
});
document.addEventListener('click',event=>{
  const b=event.target.closest('[data-action]');
  if(!b) return;
  const {action,value}=b.dataset;
  if(action==='login'){
    const user=store.users.find(u=>u.id===value&&u.enabled);
    if(user){store.user=value;practiceQuery={topic:'',kind:'',tier:'',status:'',search:''};wrongQuery={source:'',status:''};save();go('/home');}
    return;
  }
  if(!current())return;
  const d=data();
  if(action==='import-policy-basis'&&current().role!=='学员'){
    const material=materials[value];
    if(material?.contentType!=='policy_basis')return;
    policyDraft={...emptyPolicy(),topic:material.topicId,title:material.text.replace(/^政策依据[：:]/,''),excerpt:material.text,importedMaterialId:material.id};
    policyPreview=false;render();
    app.querySelector('form[data-form="policy"] input[name="title"]').focus();
  } else if(action==='print-clear-selection'){
    knowledgePrint.selected.clear();refreshKnowledgeSelection();
  } else if(action==='recall-point'){
    const article=b.closest('[data-knowledge]');
    const knowledge=knowledgeCards[article.dataset.knowledge];
    const point=knowledge.points.find(item=>item.id===value);
    if(!point)return;
    const open=b.getAttribute('aria-expanded')!=='true';
    if(open)expandedKnowledge.set(knowledge.id,value);else expandedKnowledge.delete(knowledge.id);
    article.querySelectorAll('.recall-point').forEach(control=>control.setAttribute('aria-expanded',String(open&&control===b)));
    const panel=article.querySelector('.recall-detail');
    panel.hidden=!open;
    panel.innerHTML=open?knowledgePointDetail(point):'';
  } else if(action==='open-calendar'){
    openCalendar(b.closest('form'));
  } else if(action==='close-calendar'){
    b.closest('dialog').close();
  } else if(action==='calendar-month'||action==='calendar-today'){
    const dialog=b.closest('dialog');
    const month=action==='calendar-today'?new Date():new Date(dialog.dataset.month+'T12:00:00');
    if(action==='calendar-month') month.setMonth(month.getMonth()+Number(value));
    renderCalendar(dialog,month);
    if(b.disabled)dialog.querySelector('[data-value="1"]').focus();
  } else if(action==='pick-exam-date'){
    if(value<today())return;
    const form=b.closest('form');
    form.elements.date.value=value;
    form.querySelector('#exam-date-value').textContent=value.replaceAll('-',' / ');
    b.closest('dialog').close();
  } else if(action==='logout'){
    examMinutesOverride=null;
    knowledgePrint={filters:{search:'',group:'',tier:'',status:'',order:'group'},selected:new Set()};
    store.user=null;editorDraft=null;policyDraft=null;policyPreview=false;expandedGroup.clear();expandedKnowledge.clear();save();go('/home');
  } else if(action==='clear-filter'){
    practiceQuery={topic:'',kind:'',tier:'',status:'',search:''};go('/practice');
  } else if(action==='hint'){
    questionUi.showHint=!questionUi.showHint;
    if(!questionUi.hint)questionUi.hint=1;
    render();
  } else if(action==='next-hint'){
    questionUi.hint=Math.min(3,questionUi.hint+1);render();
  } else if(action==='check'){
    const q=currentQuestion(), task=q&&currentTask(q), r=q&&lessonRecord(q,task);
    if(!q||!r||q.kind==='short')return;
    const opening=!questionUi.result;
    if(opening&&hasAnswer(q,r.draft)){
      addCheck(q,r,task);
      questionUi.checkedAnswer=r.draft;
    }
    questionUi.result=opening;render();
    app.querySelector('[data-action="check"]').focus({preventScroll:true});
  } else if(action==='rate'){
    const [id,status]=value.split('|'), q=findQ(id), task=q&&currentTask(q), r=q&&lessonRecord(q,task);
    if(!q||!r||!['weak','fuzzy','good'].includes(status))return;
    const at=Date.now(), last=r.attempts.at(-1);
    const sameAnswer=last&&last.reviewId===task?.id&&last.answer===r.draft&&last.question.version===q.version;
    const checked=hasAnswer(q,r.draft)&&(questionUi.checkedAnswer===r.draft||sameAnswer&&!last.status&&last.checkedAt);
    const item={at,day:today(),status,answer:r.draft,question:questionSnapshot(q),score:checked?score(q,r.draft):null,evaluationMode:checked?'checked-self':'self-only',...(task?{reviewId:task.id}:{})};
    if(sameAnswer&&(!last.status||last.id===questionUi.ratedAttemptId))Object.assign(last,item);
    else r.attempts.push({...item,id:uid()});
    const attempt=r.attempts.at(-1);
    questionUi.ratedAttemptId=attempt.id;
    if(task&&!task.completedAt){task.completedAt=at;task.completedDay=attempt.day;task.completedQuestionId=q.id;}
    const source='practice:'+attempt.id;
    const previousTask=reviews().find(row=>row.id===attempt.reviewId);
    if(status==='good')data().reviews=reviews().filter(row=>row.completedAt||row.source!==source);
    else scheduleReview(q,source,status==='weak'?1:3,previousTask?.pointId);
    record(q).status=status;questionUi.rated=true;save();render();
    app.querySelector(`[data-action="rate"][data-value="${id+'|'+status}"]`).focus({preventScroll:true});
  } else if(action==='schedule-exam-review'){
    const a=d.exams.find(row=>row.id===path().split('/')[2]);
    const q=a&&!answerOnly(a)&&a.questions.find(row=>row.id===value);
    if(!q||!answered(a,q))return;
    const n=examScore(a,q);
    if(n==null||n>=q.max)return;
    const task=scheduleReview(q,'exam:'+a.id+':'+q.id,1);
    if(task&&save()){render();tell('已安排复练 · '+reviewDate(task.due));}
  } else if(action==='mark-wrong'){
    if(wrongItems().find(r=>r.key===value)?.done) delete d.reviewed[value];
    else d.reviewed[value]=Date.now();
    save();render();
  } else if(action==='new-exam'){
    if(d.draft&&!window.confirm('新开一卷会替换当前未交草稿。继续吗？'))return;
    const {questions,minutes,estimatedMinutes}=pickPaper();
    if(!questions.length)return tell('模拟池暂无可用题目。');
    d.draft={id:'exam-'+uid(),title:'教育管理限时练习卷 · '+minutes+' 分钟档',durationMinutes:minutes,estimatedMinutes,questions:questions.map(questionSnapshot),started:Date.now(),index:0,answers:{},photos:{},ratings:{},overrides:{},reviewTimes:{},mode:'online'};
    d.examDraws=[...(d.examDraws||[]),questions.map(q=>q.id)].slice(-8);
    paperMode='online';save();go('/exam');
  } else if(action==='reveal-exam'){
    const a=d.draft;if(!a)return;
    if(!window.confirm('查看答案将结束这次在线作答，记录标为“已看答案 · 纸笔自核”。原作答会保留，未录入题不计错题，可导出答案并手填总分。继续吗？'))return;
    const at=Date.now();
    if(!d.exams.some(row=>row.id===a.id))d.exams.push({...a,completionMode:'answer-only',revealedAt:at,submitted:at,seconds:Math.max(0,Math.round((at-a.started)/1000)),manualScore:null});
    d.draft=null;save();go('/report/'+a.id);
  } else if(action==='clear-manual-score'){
    const a=d.exams.find(row=>row.id===value);
    if(a&&answerOnly(a)){a.manualScore=null;save();render();}
  } else if(action==='exam-index'){
    d.draft.index=Number(value);save();render();
  } else if(action==='report-toggle'){
    reportOpen=reportOpen===value?null:value;render();
  } else if(action==='paper-mode'){
    paperMode=paperMode==='paper'?'online':'paper';d.draft.mode=paperMode;save();render();
  } else if(action==='remove-photo'){
    delete d.draft.photos[d.draft.questions[d.draft.index].id];save();render();
  } else if(action==='toggle-account'&&current().role==='管理员'){
    const u=store.users.find(u=>u.id===value&&u.id!==current().id);
    if(u){u.enabled=!u.enabled;save();render();}
  } else if(action==='archive'&&current().role!=='学员'){
    if(window.confirm('下架后，学员看不到该题及其关联变式。继续吗？')){store.questions[value].archived=true;save();render();}
  } else if(action==='edit-policy'&&current().role!=='学员'){
    policyDraft={...store.policies.find(p=>p.id===value)};policyPreview=true;render();window.scrollTo(0,0);
  } else if(action==='publish-policy'&&current().role!=='学员'){
    const p=store.policies.find(p=>p.id===value);
    if(p.question&&findQ(p.question)?.version!==p.version)return tell('关联题目已更新。请编辑并保存新的核验草稿。');
    if(window.confirm('请确认已经核对原文、来源及适用范围，再发布给学员。')){
      const previous=store.policies.find(row=>row.id===p.replaces);
      if(previous)previous.status='archived';
      p.status='published';p.reviewer=current().name;p.reviewedAt=Date.now();save();render();
    }
  } else if(action==='archive-policy'&&current().role!=='学员'){
    store.policies.find(p=>p.id===value).status='archived';save();render();
  } else if(action==='print'){
    window.print();
  } else if(action==='download'){
    const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${esc(value)}</title><style>body{font:16px/1.6 system-ui;max-width:850px;margin:24px auto;padding:12px}article{break-inside:avoid;border-bottom:1px solid #bbb;padding:12px 0}.write-space{height:75px}.preserve{white-space:pre-wrap}img{max-width:100%}</style>${app.querySelector('.print-page').outerHTML}</html>`;
    const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=value+'.html';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
});
let dateAtRender=today();
function refreshDate() {
  const day=today();
  if(day!==dateAtRender){dateAtRender=day;if(current()&&path()==='/home')render();}
}
window.addEventListener('hashchange',()=>{if(current())paperMode=data().draft?.mode||'online';window.scrollTo(0,0);render();});
window.addEventListener('focus',refreshDate);
setInterval(()=>{updateClock();refreshDate();},1000);
appendBundledKnowledgeQuestions();
migrateContentClassification();
render();
