import React, { useEffect, useState } from 'react';
import { calculateBudget, recommendPlan } from './studyPlan.js';
import { nextReviewQuestion } from './learning';
import { topics } from './data.js';

const number = n => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(n);
const prettyDate = value => value ? value.replace(/-/g, ' / ') : '尚未设置';
const go = path => { location.hash = path; };

export function Home({ goal, legacyGoal, study, groups, onSave, practice }) {
  const [examDate, setExamDate] = useState(goal?.examDate || '');
  const [dailyHours, setDailyHours] = useState(String(goal?.dailyHours || 1));
  const [includeExamDay, setIncludeExamDay] = useState(goal?.includeExamDay !== false);
  const [base, setBase] = useState(goal);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const today = study.day, budget = calculateBudget(goal, today);
  const validTasks = study.reviews.map(task => ({ task, question: nextReviewQuestion(task, groups) })).filter(row => row.question);
  const due = validTasks.filter(({task}) => task.dueOn <= today);
  const available = budget.studyDays ? Math.max(0, budget.dailyMinutes - Math.max(0, study.completedToday) * 8) : 0;
  const dueToday = due.slice(0, Math.floor(available / 8));
  const later = validTasks.find(({task}) => task.dueOn > today);
  const remaining = available - 8 * dueToday.length;
  const plan = recommendPlan({ ...budget, dailyMinutes: remaining });
  const hasGoal = budget.status !== 'unset' && budget.status !== 'invalid';
  const dirty = examDate !== (base?.examDate || '') || Number(dailyHours) !== Number(base?.dailyHours || 1) || includeExamDay !== (base?.includeExamDay !== false);
  const changedRemotely = (base?.revision ?? 0) !== (goal?.revision ?? 0);
  const useLatest = () => { setBase(goal); setExamDate(goal?.examDate || ''); setDailyHours(String(goal?.dailyHours || 1)); setIncludeExamDay(goal?.includeExamDay !== false); setError(''); };
  useEffect(() => { if (changedRemotely && !dirty && !saving) useLatest(); }, [goal, changedRemotely, dirty, saving]);
  const save = async e => {
    e.preventDefault();
    if (saving || changedRemotely) return;
    const value = { examDate, dailyHours: Number(dailyHours), includeExamDay };
    const result = calculateBudget(value, today);
    if (['unset', 'invalid'].includes(result.status)) return setError('请填写有效考试日期和每日复习时长。');
    if (result.status === 'past') return setError('考试日期已过，请选择今天或之后的日期。');
    setError(''); setSaving(true); setSaved(false);
    try { setBase(await onSave(value, base?.revision ?? 0)); setSaved(true); }
    catch (error) { setError(error.message); }
    finally { setSaving(false); }
  };
  const weak = Object.values(practice).filter(x => ['weak', 'fuzzy'].includes(x.status)).length;
  return <>
    <div className="page-heading"><div><h1>把剩下的时间，安排得更清楚</h1><p>设定考试目标，看看你还有多少时间可以用于备考。</p></div><span className="tag">首页</span></div>
    <section className="countdown-layout" aria-label="考试倒计时与时间设置">
      <div className="countdown-hero">
        <div className="countdown-top"><span className="eyebrow">我的备考时间</span><span>今天 {prettyDate(today)}</span></div>
        <div className="countdown-title"><span>目标考试日</span><strong>{prettyDate(goal?.examDate)}</strong></div>
        <div className="countdown-metrics" aria-live="polite">
          <div><span>{budget.status === 'past' ? '考试日期已过' : budget.status === 'today' ? '考试就在今天' : '距离考试'}</span><strong>{hasGoal && budget.status !== 'past' ? budget.daysUntil : '—'}<small>{hasGoal && budget.status !== 'past' ? '天' : ''}</small></strong></div>
          <div><span>预计可用于备考</span><strong>{hasGoal ? number(budget.totalHours) : '—'}<small>{hasGoal ? '小时' : ''}</small></strong></div>
        </div>
        {hasGoal ? <div className="budget-formula">
          <strong>{budget.studyDays} 个可备考日 × 每天 {number(budget.dailyHours)} 小时 = {number(budget.totalHours)} 小时</strong>
          <p>{budget.status === 'past' ? '请更新右侧考试日期，重新安排备考。' : `按日估算，包含今天${goal.includeExamDay !== false ? '和考试当天' : '，不包含考试当天'}；今天按一整天计。`}</p>
          <p>这是计划可用时数，不是已完成的学习时数。</p>
        </div> : <div className="budget-formula"><strong>先设日期，再看时间预算</strong><p>填写右侧考试日期和每日时长后，这里会自动计算。</p></div>}
      </div>
      <form className="panel goal-form" onSubmit={save}>
        <h2>{goal ? '调整备考目标' : '设置备考目标'}</h2>
        {!goal && legacyGoal?.examDate && !dirty && <button type="button" className="button secondary small" onClick={() => { setExamDate(legacyGoal.examDate); setDailyHours(String(legacyGoal.dailyHours || 1)); setIncludeExamDay(legacyGoal.includeExamDay !== false); }}>带入本机旧目标</button>}
        <label htmlFor="exam-date">考试日期<input id="exam-date" type="date" required min={today} value={examDate} onChange={e => { setExamDate(e.target.value); setError(''); }} /></label>
        <label htmlFor="daily-hours">每天可用于复习<select id="daily-hours" value={dailyHours} onChange={e => setDailyHours(e.target.value)}>{[.5, 1, 1.5, 2, 3, 4].map(h => <option value={h} key={h}>{h === .5 ? '30 分钟' : h + ' 小时'} / 天</option>)}</select></label>
        <label className="check-line"><input type="checkbox" checked={includeExamDay} onChange={e => setIncludeExamDay(e.target.checked)} /><span>计入考试当天的复习时间</span></label>
        {error && <p role="alert" className="warning-copy">{error}</p>}
        {changedRemotely && dirty && <div className="button-row"><button type="button" className="button secondary small" onClick={useLatest}>采用服务器目标</button><button type="button" className="button secondary small" onClick={() => { setBase(goal); setError(''); }}>保留当前填写</button></div>}
        <button type="submit" className="button" disabled={saving || changedRemotely}>{saving ? '正在保存…' : goal ? '更新并重新计算' : '保存并计算'}</button>
        <p className="small-copy muted">{dirty && goal ? '有未保存的修改，点击更新后生效。' : '目标按账号保存，可在其他设备恢复。'}</p>
        {saved && !dirty && <p role="status">备考目标已同步。</p>}
      </form>
    </section>
    <section className="panel plan-recommendation" aria-label="到期复练">
      <div className="plan-heading"><h2>到期复练</h2><a className="button secondary small" href="#/practice/history">查看练习历史</a></div>
      {study.completedToday > 0 && <p className="small-copy muted">今天已复练 {study.completedToday} 项</p>}
      {dueToday.length ? <ul className="cloud-review-list">{dueToday.map(({ task, question }) => <li key={task.id}>
        <a href={'#/practice/question/' + encodeURIComponent(question.id) + '/review/' + task.id}><span><strong>{topics.find(item => item.id === task.topic)?.title || question.title}</strong><small>{task.focus ? '待补 · ' + task.focus : task.sourceExamId ? '来自模拟复盘' : '上次回忆需要巩固'}</small></span><span>约 8 分钟</span></a>
      </li>)}</ul> : <p>{due.length ? budget.studyDays ? '今天的复练时段已用完，待复练会继续保留。' : '设置有效的备考目标后可将复练排入今天。' : '今天暂无到期复练。选「想不起来」或「有点模糊」后会排入后续日期。'}</p>}
      {dueToday.length > 0 && due.length > dueToday.length && <p className="small-copy muted">还有 {due.length - dueToday.length} 项待安排，会保留到后续日期。</p>}
      {later && <p className="small-copy muted">下一项复练 {prettyDate(later.task.dueOn)} · {topics.find(item => item.id === later.task.topic)?.title || later.question.title}{later.task.sourceExamId && ' · 来自模拟复盘'}</p>}
      {study.reviews.length > validTasks.length && <p className="small-copy muted">部分复练的关联题暂未发布，题目可用后会重新显示。</p>}
    </section>
    {plan && remaining > 0 ? <section className="panel plan-recommendation" aria-label="备考任务强度建议">
      <div className="plan-heading"><div><span className="eyebrow">按时间预算推荐</span><h2>{plan.name}<span className="tag">{plan.scope}</span></h2></div><strong>其他学习安排 {remaining} 分钟</strong></div>
      <p>{plan.desc}</p>
      {plan.examSoon && <p className="exam-soon">距离考试不超过 7 天，优先复习与输出，减少新内容。</p>}
      <div className="daily-task-grid">{plan.tasks.map(t => <article key={t.title}><span>{t.minutes} 分钟</span><h3>{t.title}</h3><p>{t.desc}</p><button className="text-button" onClick={() => go(t.path)}>去{t.title === '理解知识' ? '知识学习' : '题目练习'}</button></article>)}</div>
      <details className="plan-basis"><summary>这个建议怎么算的？</summary><p>当前按总可用时数分档：少于 20 小时为精简备考，20 至不足 60 小时为均衡备考，60 小时起为系统备考。每日分钟数按你设置的时间分配。此规则用于原型体验，后续可结合考点覆盖、掌握情况和实际完成速度调整。</p></details>
    </section> : !plan && <section className="panel soft"><h2>{hasGoal ? '先更新目标，再安排任务' : '让任务安排有一个时间依据'}</h2><p>{hasGoal && budget.status === 'today' ? '今天就是考试日，当前未计入考试当天，因此可用时数为 0。你仍可以按需进入知识学习或题目练习。' : hasGoal ? '考试日期已过，更新后即可重新计算时间与任务建议。' : '设置目标后，首页会根据总可用时数推荐学习范围，并把每天的时间分配给理解、提取、训练与自评。'}</p></section>}
    <div className="home-links"><button className="panel" onClick={() => go('/knowledge')}><span className="eyebrow">知识学习</span><h3>从知识地图进入主题</h3><p>理解本质、故事和记忆支点</p></button><button className="panel" onClick={() => go('/practice/weak')}><span className="eyebrow">题目练习</span><h3>{weak} 道原题或变式需要巩固</h3><p>按掌握状态挑选薄弱题</p></button><button className="panel" onClick={() => go('/exams')}><span className="eyebrow">模拟考试</span><h3>限时练习与答题记录</h3><p>整套作答，再进入评阅与复盘</p></button></div>
  </>;
}
