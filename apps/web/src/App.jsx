import React, { useEffect, useState } from 'react';
import './prototype.css';
import './maintenance.css';
import './accounts.css';
import { Home } from './Home.jsx';
import { topics, levels, paper, questionScore } from './data.js';
import { flattenBank, masteryStatus, resolveQuestion } from './questionBank.js';
import { CloudPractice } from './CloudPractice';
import { PracticeHistory } from './PracticeHistory';
import { usePersonalStudy } from './learning';
import { BankAdmin } from './BankAdmin.jsx';
import { ExamLibrary, ExamRun, ExamLoad } from './ExamPages';
import { ExamRecords, ExamReportPage } from './ExamResults';
import { ExamPrint, KnowledgePrint } from './StudyPrint';
import { KnowledgeCatalog } from './KnowledgeCatalog';
import { useExamLoad } from './exam';
const KEY = 'beikaoyoufang.engineering.alpha1';
const empty = { practice: {}, draft: null, attempts: [] };
function initial(key) { try { const v = JSON.parse(localStorage.getItem(key)); return v?.version === 2 ? { ...empty, ...v.data } : empty; } catch { return empty; } }
const go = path => { location.hash = path; };
const date = value => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function Button({ children, secondary = false, small = false, ...props }) { return <button className={`button ${secondary ? 'secondary' : ''} ${small ? 'small' : ''}`} {...props}>{children}</button>; }
function Tag({ children, tone = '' }) { return <span className={`tag ${tone}`}>{children}</span>; }
function Panel({ children, className = '' }) { return <section className={`panel ${className}`}>{children}</section>; }
function Empty({ title, children }) { return <Panel className="empty"><span className="eyebrow">从真实记录开始</span><h2>{title}</h2>{children}</Panel>; }
function Heading({ title, sub, children }) { return <div className="page-heading"><div><h1>{title}</h1><p>{sub}</p></div>{children}</div>; }
export function App({user,learnerBank,adminBank,saveQuestion,changeStatus,checkQuestion,onLogout,onPassword,accountsPanel}) {
  const storageKey=KEY+'.'+user.id;
  const topicsRequest = useExamLoad('/topics');
  const registeredTopics = topicsRequest.data?.items ?? topics;
  const {study,error:studyError,refresh:refreshStudy,saveGoal}=usePersonalStudy();
  const [path, setPath] = useState(location.hash.slice(1) || '/home');
  const [data, setData] = useState(()=>initial(storageKey)), [notice, setNotice] = useState(''), [modal, setModal] = useState(null), [storageError, setStorageError] = useState(false);
  useEffect(() => { const fn = () => { setPath(location.hash.slice(1) || '/home'); window.scrollTo(0, 0); }; window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); }, []);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify({ version: 2, data })); setStorageError(false); } catch { setStorageError(true); } }, [data,storageKey]);
  useEffect(() => { if (notice) { const id = setTimeout(() => setNotice(''), 2800); return () => clearTimeout(id); } }, [notice]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('.modal');
    const controls = () => [...dialog.querySelectorAll('button,a,input,select,textarea')].filter(n => !n.disabled);
    controls()[0]?.focus();
    const onKey = e => {
      if (e.key === 'Escape') setModal(null);
      if (e.key === 'Tab') {
        const list = controls(), first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [modal]);
  const route = path.split('/').filter(Boolean), section = route[0] || 'home';
  const bank = section==='maintain'?adminBank:learnerBank, groups = learnerBank;
  const findQuestion = id => resolveQuestion(groups, id, registeredTopics);
  const practice=Object.fromEntries((study?.mastery||[]).map(row=>[row.questionId,row]));
  const openQuestion = id => go('/practice/question/'+id);
  const activePractice = route[1] === 'question';
  const question=activePractice?findQuestion(route[2]):null;
  const reviewId=route[3]==='review'?route[4]:undefined;
  const review=study?.reviews.find(task=>task.id===reviewId);
  const crumb = section === 'maintain' ? ['维护端',route[1]==='policy'?'时政融合规划':route[1]==='users'?'账号管理':'题库管理',...(['new','edit'].includes(route[1])?[route[1]==='new'?'新增题目':'编辑与预览']:[])] : section === 'home' ? ['首页', '备考概览'] : section === 'knowledge' ? ['知识学习', '知识地图', ...(route[1] ? [registeredTopics.find(t => t.id === route[1])?.title || '知识详情'] : [])] : section === 'practice' ? ['题目练习', '题目列表', ...(activePractice ? [findQuestion(route[2])?.isVariant ? '关联变式' : '原题提取'] : [])] : ['模拟考试', ['records', 'report'].includes(route[1]) ? '答题记录' : '试卷库', ...(route[1] === 'report' ? ['本次答卷与复盘'] : ['run','confirm'].includes(route[1]) ? [route[1]==='confirm'?'交卷确认':'本套答卷'] : [])];
  if (section === 'print') crumb.splice(0, crumb.length, route[1]==='knowledge'?'知识学习':'模拟考试', '打印与下载');
  const nav = (name, href, active, sub = false) => <a href={'#' + href} className={`${sub ? 'subnav' : 'navlink'} ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>{name}</a>;
  const [area, itemId] = route.slice(1);
  const inKnowledge = section === 'knowledge' || (section === 'print' && area === 'knowledge');
  const inExams = section === 'exams' || (section === 'print' && area !== 'knowledge');
  let page;
  switch (section) {
    case 'home':
      page = study ? <Home goal={study.goal} legacyGoal={data.studyGoal} study={study} groups={groups}
        practice={practice} onSave={saveGoal} /> : <Panel><p role="status">正在载入账号备考计划…</p></Panel>;
      break;
    case 'maintain':
      if (user.role === 'learner') page = <Empty title="当前账号没有维护权限"><Button onClick={()=>go('/home')}>返回首页</Button></Empty>;
      else if (area === 'users') page = user.role === 'admin' ? accountsPanel : <Empty title="仅管理员可以管理账号" />;
      else page = <BankAdmin registeredTopics={registeredTopics} bank={bank} route={route} notify={setNotice}
        onSaveQuestion={saveQuestion} onSetStatus={changeStatus} policyDrafts={data.policyDrafts}
        onSavePolicy={value=>setData(d=>({...d,policyDrafts:[...(d.policyDrafts||[]),value]}))} />;
      break;
    case 'knowledge':
      if (topics.some(topic => topic.id === area)) page = <Knowledge topicId={area} groups={groups} openQuestion={openQuestion} />;
      else page = topicsRequest.data ? <KnowledgeCatalog key={area || 'catalog'} route={area} topics={registeredTopics}
        groups={groups} practice={practice}/> : <ExamLoad {...topicsRequest} />;
      break;
    case 'practice':
      if (area === 'history') page = <PracticeHistory />;
      else if (!activePractice) page = <PracticeList key={area || 'all'} registeredTopics={registeredTopics} groups={groups}
        practice={practice} initialFilter={area==='weak'?'weakAll':'all'} openQuestion={openQuestion} />;
      else if (question) page = <CloudPractice key={[itemId,question.version,reviewId].join(':')} question={question}
        legacy={data.practice[itemId]} review={review} reviewId={reviewId} missingReview={!!reviewId&&!!study&&!review}
        ownerId={user.id} refresh={refreshStudy} checkQuestion={checkQuestion} />;
      else page = <Empty title="这道题未发布或已下架"><a className="button secondary" href="#/practice/history">查看账号练习历史</a></Empty>;
      break;
    case 'exams': {
      const legacy = data.attempts.find(attempt => attempt.id === itemId);
      if (area === 'records') page = <ExamRecords />;
      else if (['run','confirm'].includes(area) && itemId) page = <ExamRun key={itemId} id={itemId} confirm={area==='confirm'} />;
      else if (area === 'legacy') page = <Records attempts={data.attempts} draft={data.draft} />;
      else if (area === 'legacy-report' || (area === 'report' && legacy)) page = <Report attempt={legacy} mutate={setData} openQuestion={openQuestion} />;
      else if (area === 'report' && itemId) page = <ExamReportPage id={itemId}
        visibleQuestions={new Set(flattenBank(groups).map(item=>item.id))} refreshStudy={refreshStudy} />;
      else page = <ExamLibrary hasLegacy={!!(data.attempts.length || data.draft)} />;
      break;
    }
    case 'print':
      if (area === 'knowledge') page = topicsRequest.data && study ? <KnowledgePrint topics={registeredTopics} groups={groups} practice={practice}/>
        : <ExamLoad error={topicsRequest.error || studyError} retry={topicsRequest.error ? topicsRequest.retry : refreshStudy} />;
      else if (['paper','answers','report'].includes(area) && itemId) page = <ExamPrint key={path} id={itemId} mode={area}/>;
      else page = <Empty title="找不到打印内容"><a className="button secondary" href="#/home">返回首页</a></Empty>;
      break;
    default:
      page = <Empty title="没有找到这个页面"><Button onClick={()=>go('/practice')}>回到题目列表</Button></Empty>;
  }
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href={section==='maintain'?'#/maintain':'#/home'}>备考有方<span>{section==='maintain'?'维护工作台':'把理解变成考场表达'}</span></a><div className="sidebar-label">{section==='maintain'?'内容维护':'学习空间'}</div><nav aria-label="主导航">{section==='maintain'?<>{nav('题库管理','/maintain',route[1]!=='policy')}{nav('时政融合规划','/maintain/policy',route[1]==='policy')}{user.role==='admin'&&nav('账号管理','/maintain/users',route[1]==='users')}</>:<>
    {nav('首页', '/home', section === 'home')}
    {nav('知识学习', '/knowledge', inKnowledge)}{section === 'knowledge' && nav('知识地图', '/knowledge', !route[1], true)}{section === 'knowledge' && route[1] && <span className="subnav current-detail">{topics.find(t => t.id === route[1])?.title}</span>}
    {nav('题目练习', '/practice', section === 'practice')}{section === 'practice' && <>{nav('全部题目','/practice',!route[1],true)}{nav('薄弱题目','/practice/weak',route[1]==='weak',true)}{nav('练习历史','/practice/history',route[1]==='history',true)}{activePractice && <span className="subnav current-detail">{findQuestion(route[2])?.isVariant ? '关联变式' : '单题提取与自评'}</span>}</>}
    {nav('模拟考试','/exams',inExams)}{section==='exams' && <>{nav('试卷库','/exams',!route[1]||['run','confirm'].includes(route[1]),true)}{nav('答题记录','/exams/records',['records','report'].includes(route[1]),true)}</>}
  </>}</nav><div className="sidebar-bottom">{section==='maintain'?<a className="mode-switch" href="#/practice">返回用户端</a>:user.role!=='learner'&&<a className="mode-switch" href="#/maintain">题库维护端</a>}<button className="text-button" onClick={()=>setModal('structure')}>查看产品结构</button><span>v{__APP_VERSION__} · 题库已联网</span><span>学习进度按账号保存</span><button className="text-button reset" onClick={()=>setModal('reset')}>清空本机演示记录</button></div></aside><main><header className="topbar"><span>{section==='maintain'?'维护空间 / 题库与内容':'学员空间 / 教育管理备考'}</span><div><div className="session-controls"><span className="account-name">{user.displayName}</span><button className="text-button" onClick={onPassword}>修改密码</button><button className="text-button" onClick={()=>onLogout().catch(error=>setNotice(error.message))}>退出登录</button></div><span className="save-status">{storageError?'存储不可用，刷新可能丢失':'学习记录按账号保存'}</span></div></header><div className="content"><div className="breadcrumbs" aria-label="当前位置">{crumb.map((x,i)=><React.Fragment key={i}>{i>0&&<span className="separator">/</span>}<span>{x}</span></React.Fragment>)}</div>
    {studyError&&section!=='maintain'&&<Panel className="soft"><p role="alert">{studyError}</p><Button secondary onClick={()=>void refreshStudy()}>重新载入账号学习记录</Button></Panel>}
    {page}
    <footer className="page-footer">教学内容与评分量表为原型示例，非官方试题或评分标准。</footer></div></main>{notice&&<div className="toast" role="status">{notice}</div>}
    {modal&&<div className="modal-backdrop" onClick={()=>setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-label={modal==='reset'?'清空练习记录':modal==='ai'?'提取判断的实现方式':'产品层级结构'} onClick={e=>e.stopPropagation()}>{modal==='structure'?<><span className="eyebrow">首页看时间，三个学习模块各有从属详情</span><h2>先选内容，再学习或作答</h2><div className="structure-grid"><Panel><h3>知识学习</h3><p>知识地图</p><p className="indent">知识主题与教学卡</p></Panel><Panel><h3>题目练习</h3><p>题目列表与掌握筛选</p><p className="indent">原题提取、参考与自评</p><p className="indent">同组关联变式</p></Panel><Panel><h3>模拟考试</h3><p>试卷库 → 整套作答 → 交卷</p><p className="indent">本次记录 → 评阅 → 复盘</p></Panel></div><p>复盘归属于已提交的答卷；没有交卷记录时，不会有成绩或复盘。不同模块通过明确关联入口连接。</p></>:modal==='ai'?<><span className="eyebrow">当前可用：对照参考，自主评估</span><h2>系统怎样知道我回忆了哪些？</h2><p>选择、判断、填空按题库中设置的答案核对；简答题由你对照参考自主评估。两者都需要你自己确认掌握程度，客观题答对不会直接变成绿色。</p><h3>可选的后续 AI 方案</h3><p>输入文字（或语音转写并确认）后，让 AI 按参考得分点逐项判断，展示答卷证据、可能遗漏及不确定项，再由你确认。AI 建议和你的掌握自评分开保存。</p><p>关键词匹配可作提示，但难以可靠理解同义表达、否定和上下文。本版尚未接入 AI，也未接入语音识别。</p></>:<><h2>清空本机演示记录？</h2><p>移除这台设备的旧单题记录与演示答卷。账号学习记录继续保存在服务器。</p><Button onClick={()=>{setData(d=>({...d,practice:{},draft:null,attempts:[]}));setModal(null);go('/practice');setNotice('已清空本机演示记录');}}>确认清空</Button></>}<Button secondary onClick={()=>setModal(null)}>{modal==='reset'?'取消':'知道了'}</Button></section></div>}
  </div>;
}
function Knowledge({topicId,groups,openQuestion}){
 const t=topics.find(t=>t.id===topicId);
 if(!t)return <><Heading title="知识地图" sub="先选择一个知识主题，进入它的讲解与教学卡。"><Tag>知识学习的一级列表</Tag></Heading><div className="topic-grid">{topics.map(t=><button key={t.id} className="panel topic-card" onClick={()=>go('/knowledge/'+t.id)}><Tag>{t.priority} 级优先</Tag><h2>{t.title}</h2><p>{t.desc}</p><span className="text-link">查看教学卡</span></button>)}</div><Panel className="soft"><h3>知识学习与题目练习是什么关系？</h3><p>这里用来理解知识；题目练习用来检验提取与应用。教学卡与具体题目互相关联，不强制自动进入下一模块。</p></Panel></>;
 return <><Heading title={t.title} sub="知识学习 / 知识地图下的教学卡"><Button secondary onClick={()=>go('/knowledge')}>返回知识地图</Button></Heading><div className="two-col"><Panel><div className="section-caption"><Tag>{t.priority} 级</Tag><Tag>教学整理示例</Tag></div><h2>先抓本质</h2><p className="large-copy">{t.essence}</p><h2>学校里的一个故事</h2><p>{t.story}</p><div className="memory"><h2>{t.memory}</h2>{t.points.map(p=><p key={p}>{p}</p>)}</div><h2>展开成考场表达</h2><p>{t.answer}</p></Panel><div className="stack"><Panel className="soft"><h3>为什么这样学？</h3><p>先理解故事和因果，再提取有逻辑的支点，最后练习把支点展开成切题的答案。</p></Panel><Panel><h3>关联题目</h3><p className="muted">按需选择，不会自动跳入其他模块。</p>{groups.filter(g=>g.topic===t.id).map(g=><button key={g.id} className="related" onClick={()=>openQuestion(g.id)}>{g.title}<span>去题目练习</span></button>)}</Panel><Panel><h3>内容依据</h3><p className="small-copy">沿用本次经验总结中的教学设计。例子和答案为教学参考，不是官方标准答案。学习优先级与个人掌握状态分别记录。</p></Panel></div></div></>;
}
function PracticeList({groups,practice,initialFilter,openQuestion,registeredTopics}){
 const [filter,setFilter]=useState(initialFilter),[search,setSearch]=useState(''),[topic,setTopic]=useState('all'),[kind,setKind]=useState('all');
 const byId=new Map(flattenBank(groups).map(q=>[q.id,q]));
 const statusOf=id=>masteryStatus(practice[id],byId.get(id));
 const matches=s=>filter==='all'||(filter==='weakAll'?['weak','fuzzy'].includes(s):filter===s);
 const shown=groups.filter(g=>(topic==='all'||g.topic===topic)&&[g,...g.variants].some(q=>(kind==='all'||q.kind===kind)&&matches(statusOf(q.id))&&(q.title+q.prompt).includes(search)));
 const filters=[['all','全部'],['weakAll','只看薄弱'],['new','未接触'],['pending','待自评'],['weak','想不起来'],['fuzzy','有点模糊'],['good','能独立回忆']];
 return <><Heading title="从一道题开始，练到真正会用" sub="自由选题。先提取原题，再按需练关联变式，不强制跳到模拟考试。"><Tag>{groups.length} 组题目</Tag></Heading><div className="summary-strip"><span>已接触原题 <strong>{groups.filter(g=>practice[g.id]).length} / {groups.length}</strong></span><span>原题与变式薄弱项 <strong>{Object.values(practice).filter(r=>['weak','fuzzy'].includes(r.status)).length}</strong></span><span>颜色由你的回忆自评决定</span></div><Panel className="list-controls"><div className="search-row"><label className="search"><span>搜索题干</span><input aria-label="搜索题干" placeholder="例如：组织、评价、家校社" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>知识主题<select aria-label="知识主题" value={topic} onChange={e=>setTopic(e.target.value)}><option value="all">全部主题</option>{registeredTopics.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label><label>题目类型<select aria-label="练习题型筛选" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部题型</option><option value="choice">选择</option><option value="judgment">判断</option><option value="fill">填空</option><option value="short">简答</option></select></label></div><div className="filter-row" role="group" aria-label="掌握状态筛选">{filters.map(([id,label])=><button key={id} aria-pressed={filter===id} className={'filter '+(filter===id?'selected':'')} onClick={()=>setFilter(id)}>{label}</button>)}</div><div className="legend">{Object.entries(levels).map(([id,l])=><span key={id}><span className={'swatch '+id}/>{l.label}</span>)}</div></Panel><div className="question-grid">{shown.map(g=>{const r=practice[g.id],l=levels[statusOf(g.id)];return <article key={g.id} className={'question-card '+l.className}><button className="question-open" onClick={()=>openQuestion(g.id)}><div className="card-meta"><span>{registeredTopics.find(t=>t.id===g.topic)?.title || g.topic} · {g.type}</span><Tag tone={l.className}>{l.label}</Tag></div><h2>{g.title}</h2><p>{g.kind==='fill'?g.prompt.replace(/\{\{(\d+)\}\}/g,(_,n)=>'____（第 '+n+' 空）'):g.prompt}</p><div className="card-bottom"><span>{g.variants.length} 道关联变式</span><span>{r?.updatedAt?'最近接触 '+date(r.updatedAt):'还没有打开过'}</span></div><span className="text-link">{r?'继续提取与自评':'打开这道题'}</span></button>{g.variants.map(v=><button className={'variant-list '+statusOf(v.id)} key={v.id} onClick={()=>openQuestion(v.id)}><span>变式：{v.title}</span><Tag tone={statusOf(v.id)}>{levels[statusOf(v.id)].label}</Tag></button>)}</article>})}</div>{!shown.length&&<Empty title={filter==='weakAll'?'当前没有标记为薄弱的原题':'没有符合条件的题目'}><p>切换筛选条件，或完成一次提取并自评后再查看。</p><Button secondary onClick={()=>{setFilter('all');setTopic('all');setKind('all');setSearch('');}}>显示全部题目</Button></Empty>}<p className="muted small-copy">原题与变式分别自评。筛选命中变式时，会保留它所属的题组；可直接点击题干进入。</p></>;
}
function Records({attempts,draft}){
 return <><Heading title="本机演示记录" sub="仅显示这台设备在旧教学样卷上保存的数据。"><Button secondary onClick={()=>go('/exams')}>返回试卷库</Button></Heading>{draft&&<Panel><details><summary>旧演示草稿</summary>{paper.questions.map(q=><p className="preserve" key={q.id}>{q.prompt} · {draft.answers?.[q.id]||'未作答'}</p>)}</details></Panel>}{!attempts.length?<Empty title="你还没有提交过模拟答卷"><p>完成一套试卷并交卷后，这里才会出现作答、得分和复盘。</p><Button onClick={()=>go('/exams')}>选择试卷开始作答</Button></Empty>:<div className="stack">{[...attempts].reverse().map(a=>{const scores=paper.questions.map(q=>questionScore(q,a)),done=scores.every(s=>s!==null);return <Panel key={a.id}><div className="card-meta"><Tag tone={done?'good':'pending'}>{done?'参考评分已完成':'主观题待评阅'}</Tag><span>{date(a.submittedAt)}</span></div><h2>{paper.title}</h2><p>作答 {Object.values(a.answers).filter(v=>v.trim()).length} / 5 题 · 用时 {Math.max(1,Math.ceil(a.durationSeconds/60))} 分钟 · {done?'参考总分 '+scores.reduce((x,y)=>x+y,0)+' / 30':'完整总分暂不展示'}</p><Button onClick={()=>go('/exams/legacy-report/'+a.id)}>查看这次答卷与复盘</Button></Panel>})}</div>}</>;
}
function Report({attempt,mutate,openQuestion}){
 const [expanded,setExpanded]=useState(null);
 if(!attempt)return <Empty title="这份答卷不存在或尚未交卷"><p>只有已提交的模拟答卷才能进行评分与复盘。</p><Button onClick={()=>go('/exams/legacy')}>查看答题记录</Button></Empty>;
 const scores=paper.questions.map(q=>questionScore(q,attempt)),complete=scores.every(s=>s!==null),total=complete?scores.reduce((a,b)=>a+b,0):null,objective=paper.questions.filter(q=>!q.rubric).reduce((sum,q)=>sum+questionScore(q,attempt),0);
 const patch=fn=>mutate(d=>({...d,attempts:d.attempts.map(a=>a.id===attempt.id?fn(a):a)}));
 const rate=(q,index,value)=>patch(a=>{const values=[...(a.ratings[q.id]||q.rubric.map(()=>null))];values[index]=Number(value);return {...a,ratings:{...a.ratings,[q.id]:values}};});
 const needs=paper.questions.filter((q,i)=>scores[i]===null||scores[i]<q.max);
 return <><Heading title="本次答卷与复盘" sub={paper.title+' · '+date(attempt.submittedAt)+' 交卷 · 用时 '+Math.max(1,Math.ceil(attempt.durationSeconds/60))+' 分钟'}><Button secondary onClick={()=>go('/exams/records')}>返回答题记录</Button></Heading><div className="score-strip"><Panel><span className="muted">本次参考总分</span><strong className="score">{complete?total:'待评阅'}<small>{complete?' / 30':''}</small></strong><span>{complete?'客观题核对 + 主观题逐点自评':'主观题未评完，不生成完整总分'}</span></Panel><Panel><span className="muted">客观题参考得分</span><strong className="score">{objective}<small> / 6</small></strong><span>按教学参考答案核对</span></Panel><Panel><span className="muted">作答记录</span><strong className="score">{Object.values(attempt.answers).filter(v=>v.trim()).length}<small> / 5 题</small></strong><span>逐题展开原答与评分依据</span></Panel></div>{!complete&&<Panel className="soft"><h3>先完成主观题评阅</h3><p>本版没有连接 AI 阅卷。请展开主观题，对照自己的答卷逐点评分；留空题目按 0 分计。评价未完成前，不编造总分或诊断。</p></Panel>}<Panel><h2>逐题作答与参考得分</h2><div className="report-table"><div className="report-row table-head"><span>题号与题型</span><span>题目</span><span>参考得分</span><span>作答与依据</span></div>{paper.questions.map((q,i)=><React.Fragment key={q.id}><div className="report-row"><span>{i+1} · {q.type}</span><span>{q.prompt}</span><strong>{scores[i]===null?'待评阅':scores[i]+' / '+q.max}</strong><Button secondary small onClick={()=>setExpanded(expanded===q.id?null:q.id)}>{expanded===q.id?'收起':'展开本题'}</Button></div>{expanded===q.id&&<div className="review-detail"><h3>你这次的原始作答</h3><p className="preserve original-answer">{attempt.answers[q.id]||'本题未作答。'}</p><h3>{q.rubric?'按参考评分点自行评阅':'参考答案与核对依据'}</h3><p>{q.rubric?q.explanation:'参考答案：'+q.correct+'。'+q.explanation}</p>{q.rubric&&attempt.answers[q.id]?.trim()&&q.rubric.map((r,j)=><label key={r.text} className="rubric-row"><span>{r.text}</span><select aria-label={q.id+'评分点'+(j+1)} value={attempt.ratings[q.id]?.[j]??''} onChange={e=>rate(q,j,e.target.value)}><option value="" disabled>待评</option>{Array.from({length:r.max+1},(_,k)=><option key={k} value={k}>{k} / {r.max} 分</option>)}</select></label>)}{!q.rubric&&<label className="rubric-row"><span>表述等价时可人工修正参考分</span><select aria-label={q.id+'人工核分'} value={questionScore(q,attempt)} onChange={e=>patch(a=>({...a,overrides:{...a.overrides,[q.id]:Number(e.target.value)}}))}>{Array.from({length:q.max+1},(_,k)=><option key={k} value={k}>{k} 分</option>)}</select></label>}<Button secondary small onClick={()=>openQuestion(q.group)}>去练关联题组</Button></div>}</React.Fragment>)}</div></Panel>{complete&&<Panel className="soft"><h2>基于这份答卷的下一步</h2><p>本次 {needs.length} 道题未拿满参考分。先对照原答核实原因，再选择复练，不凭分数推断理解程度。</p>{needs.length?<div className="stack compact">{needs.map(q=><div className="next-action" key={q.id}><span>{q.type}：{q.prompt}</span><Button secondary small onClick={()=>{setExpanded(q.id);document.querySelector('.report-table')?.scrollIntoView({behavior:'smooth',block:'start'});}}>查看原答与依据</Button></div>)}</div>:<p>这份参考量表下得分完整，可用新变式检查迁移，一次得分不等于长期掌握。</p>}</Panel>}</>;
}
