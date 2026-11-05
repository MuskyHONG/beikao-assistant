import React, { useEffect, useState } from 'react';
import { calculateBudget, localDateKey, recommendPlan } from './studyPlan.js';

const number = n => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(n);
const prettyDate = value => value ? value.replace(/-/g, ' / ') : '尚未设置';
const go = path => { location.hash = path; };

export function Home({ goal, onSave, practice, attempts }) {
  const [now, setNow] = useState(() => new Date());
  const [examDate, setExamDate] = useState(goal?.examDate || '');
  const [dailyHours, setDailyHours] = useState(String(goal?.dailyHours || 1));
  const [includeExamDay, setIncludeExamDay] = useState(goal?.includeExamDay !== false);
  const [error, setError] = useState('');
  const today = localDateKey(now), budget = calculateBudget(goal, today), plan = recommendPlan(budget);
  const hasGoal = budget.status !== 'unset' && budget.status !== 'invalid';
  const dirty = examDate !== (goal?.examDate || '') || Number(dailyHours) !== Number(goal?.dailyHours || 1) || includeExamDay !== (goal?.includeExamDay !== false);
  useEffect(() => {
    const update = () => setNow(new Date());
    const id = setInterval(update, 60000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(id); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  const save = e => {
    e.preventDefault();
    const value = { examDate, dailyHours: Number(dailyHours), includeExamDay };
    const result = calculateBudget(value, today);
    if (['unset', 'invalid'].includes(result.status)) return setError('请填写有效考试日期和每日复习时长。');
    if (result.status === 'past') return setError('考试日期已过，请选择今天或之后的日期。');
    setError(''); onSave(value);
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
        <label htmlFor="exam-date">考试日期<input id="exam-date" type="date" required min={today} value={examDate} onChange={e => { setExamDate(e.target.value); setError(''); }} /></label>
        <label htmlFor="daily-hours">每天可用于复习<select id="daily-hours" value={dailyHours} onChange={e => setDailyHours(e.target.value)}>{[.5, 1, 1.5, 2, 3, 4].map(h => <option value={h} key={h}>{h === .5 ? '30 分钟' : h + ' 小时'} / 天</option>)}</select></label>
        <label className="check-line"><input type="checkbox" checked={includeExamDay} onChange={e => setIncludeExamDay(e.target.checked)} /><span>计入考试当天的复习时间</span></label>
        {error && <p role="alert" className="warning-copy">{error}</p>}
        <button type="submit" className="button">{goal ? '更新并重新计算' : '保存并计算'}</button>
        <p className="small-copy muted">{dirty && goal ? '有未保存的修改，点击更新后生效。' : '目标会保存在当前浏览器，可随时调整。'}</p>
      </form>
    </section>
    {plan ? <section className="panel plan-recommendation" aria-label="备考任务强度建议">
      <div className="plan-heading"><div><span className="eyebrow">按时间预算推荐</span><h2>{plan.name}<span className="tag">{plan.scope}</span></h2></div><strong>每日总安排 {budget.dailyMinutes} 分钟</strong></div>
      <p>{plan.desc}</p>
      {plan.examSoon && <p className="exam-soon">距离考试不超过 7 天，优先复习与输出，减少新内容。</p>}
      <div className="daily-task-grid">{plan.tasks.map(t => <article key={t.title}><span>{t.minutes} 分钟</span><h3>{t.title}</h3><p>{t.desc}</p><button className="text-button" onClick={() => go(t.path)}>去{t.title === '理解知识' ? '知识学习' : '题目练习'}</button></article>)}</div>
      <details className="plan-basis"><summary>这个建议怎么算的？</summary><p>当前按总可用时数分档：少于 20 小时为精简备考，20 至不足 60 小时为均衡备考，60 小时起为系统备考。每日分钟数按你设置的时间分配。此规则用于原型体验，后续可结合考点覆盖、掌握情况和实际完成速度调整。</p></details>
    </section> : <section className="panel soft"><h2>{hasGoal ? '先更新目标，再安排任务' : '让任务安排有一个时间依据'}</h2><p>{hasGoal && budget.status === 'today' ? '今天就是考试日，当前未计入考试当天，因此可用时数为 0。你仍可以按需进入知识学习或题目练习。' : hasGoal ? '考试日期已过，更新后即可重新计算时间与任务建议。' : '设置目标后，首页会根据总可用时数推荐学习范围，并把每天的时间分配给理解、提取、训练与自评。'}</p></section>}
    <div className="home-links"><button className="panel" onClick={() => go('/knowledge')}><span className="eyebrow">知识学习</span><h3>从知识地图进入主题</h3><p>理解本质、故事和记忆支点</p></button><button className="panel" onClick={() => go('/practice/weak')}><span className="eyebrow">题目练习</span><h3>{weak} 道原题或变式需要巩固</h3><p>按掌握状态挑选薄弱题</p></button><button className="panel" onClick={() => go('/exams')}><span className="eyebrow">模拟考试</span><h3>已提交 {attempts.length} 份答卷</h3><p>整套作答，再进入评阅与复盘</p></button></div>
  </>;
}
