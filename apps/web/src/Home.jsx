import React, { useEffect, useState } from 'react';
import { calculateBudget, recommendPlan } from './studyPlan.js';
import { nextReviewQuestion } from './learning';
import { ExamDatePicker } from './ExamDatePicker';
import { Mascot } from './Mascot';

const number = n => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(n);
const prettyDate = value => value.replaceAll('-', ' / ');
const hours = value => value === .5 ? '30 分钟' : number(value) + ' 小时';
const tiers = [
  { id: 'compact', label: '精简备考', range: '少于 20 小时 · 优先复习 S 级', priorities: ['S'] },
  { id: 'balanced', label: '均衡备考', range: '20 至不足 60 小时 · 覆盖 S / A 级', priorities: ['S', 'A'] },
  { id: 'systematic', label: '系统备考', range: '60 小时及以上 · 覆盖 S / A / B 级', priorities: ['S', 'A', 'B'] },
];
const localDay = (time, timezone) => new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, dateStyle: 'short' }).format(new Date(time));
const questionLink = id => '#/practice/question/' + encodeURIComponent(id);

function dailyTasks({ study, groups, topics, budget, tier }) {
  const taskItems = [];
  const used = new Set();
  const byTopic = new Map(topics.map(topic => [topic.id, topic]));
  const questions = groups.flatMap(group => [group, ...group.variants]);
  const todayMarks = new Map(study.mastery.filter(mark => mark.status !== 'pending' && localDay(mark.updatedAt, study.timezone) === study.day)
    .map(mark => [mark.questionId, mark.questionVersion]));
  const due = study.reviews.filter(task => task.dueOn <= study.day);
  let minutes = budget.studyDays ? budget.dailyMinutes : 0;

  for (const task of study.completedReviews || []) {
    if (used.has(task.topic)) continue;
    const question = questions.find(item => item.id === task.questionId) || groups.find(item => item.topic === task.topic);
    const title = byTopic.get(task.topic)?.title || question?.title || task.topic;
    taskItems.push({ id: task.id, title, minutes: 8, done: true, href: question ? questionLink(question.id) + '?from=home' : '#/practice/history' });
    used.add(task.topic);
    minutes = Math.max(0, minutes - 8);
  }
  for (const task of due) {
    const question = nextReviewQuestion(task, groups);
    if (!question || minutes < 8 || used.has(task.topic)) continue;
    taskItems.push({ id: task.id, title: byTopic.get(task.topic)?.title || question.title, minutes: 8,
      note: task.focus ? '待补 · ' + task.focus : task.sourceExamId ? '来自模拟复盘' : '到期复练',
      href: questionLink(question.id) + '/review/' + encodeURIComponent(task.id) });
    used.add(task.topic);
    minutes -= 8;
  }

  const priorities = tier?.priorities || [];
  const candidates = [
    ...questions.filter(q => todayMarks.get(q.id) === q.version),
    ...priorities.flatMap(priority => groups.filter(q => (byTopic.get(q.topic)?.priority || 'S') === priority)),
  ];
  for (const question of candidates) {
    if (minutes < 8 || used.has(question.topic)) continue;
    const done = todayMarks.get(question.id) === question.version;
    const duration = Math.min(minutes, 30);
    taskItems.push({ id: question.id, title: byTopic.get(question.topic)?.title || question.title, minutes: duration,
      done, href: questionLink(question.id) + '?from=home' });
    used.add(question.topic);
    minutes -= duration;
  }
  return taskItems;
}

export function Home({ goal, legacyGoal, study, groups, topics, onSave }) {
  const [examDate, setExamDate] = useState(goal?.examDate || '');
  const [dailyHours, setDailyHours] = useState(String(goal?.dailyHours || 1));
  const [includeExamDay, setIncludeExamDay] = useState(goal?.includeExamDay !== false);
  const [base, setBase] = useState(goal);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = study.day, budget = calculateBudget(goal, today);
  const plan = recommendPlan(budget);
  const tasks = dailyTasks({ study, groups, topics, budget, tier: tiers.find(item => item.id === plan?.tier) });
  const done = tasks.filter(task => task.done).length;
  const later = study.reviews.filter(task => task.dueOn > today).find(task => nextReviewQuestion(task, groups));
  const dirty = examDate !== (base?.examDate || '') || Number(dailyHours) !== Number(base?.dailyHours || 1) || includeExamDay !== (base?.includeExamDay !== false);
  const changedRemotely = (base?.revision ?? 0) !== (goal?.revision ?? 0);
  const useLatest = () => {
    setBase(goal); setExamDate(goal?.examDate || ''); setDailyHours(String(goal?.dailyHours || 1));
    setIncludeExamDay(goal?.includeExamDay !== false); setError('');
  };
  useEffect(() => { if (changedRemotely && !dirty && !saving) useLatest(); }, [goal, changedRemotely, dirty, saving]);

  const save = async event => {
    event.preventDefault();
    if (saving || changedRemotely) return;
    const value = { examDate, dailyHours: Number(dailyHours), includeExamDay };
    const result = calculateBudget(value, today);
    if (['unset', 'invalid'].includes(result.status)) return setError('请选择有效的考试日期和每日复习时长。');
    if (result.status === 'past') return setError('考试日期已过，请选择今天或之后的日期。');
    setError(''); setSaving(true);
    try { setBase(await onSave(value, base?.revision ?? 0)); setEditing(false); }
    catch (error) { setError(error.message); }
    finally { setSaving(false); }
  };

  return <div className="study-home">
    <div className="home-heading">
      <div><p className="home-date">{new Date(today + 'T12:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p>
        <div className="page-heading"><div><h1>备考概览</h1><p>{goal ? '看清备考节奏，从今天的任务开始。' : '用考试日期和每天可用时间，安排第一天学什么、练什么。'}</p></div></div>
      </div>
      <div className="home-art" aria-hidden="true"><Mascot animal="octopus" /></div>
    </div>

    <section className="home-budget" aria-label="备考时间">
      <div className={'panel budget-hero' + (plan?.examSoon ? ' budget-soon' : '')}>
        <div className="exam-countdown"><h2>距离考试</h2>
          <div className="exam-alarm"><i className="alarm-bells" aria-hidden="true" /><i className="alarm-feet" aria-hidden="true" />
            <p className="alarm-face">{!goal ? '—' : budget.status === 'past' ? '已过期' : budget.status === 'today' ? '考试今天' : <><b>{budget.daysUntil}</b><small>天</small></>}</p>
          </div>
        </div>
        <div className="budget-info"><dl>
          <div><dt>目标考试日</dt><dd>{goal ? <time dateTime={goal.examDate}>{prettyDate(goal.examDate)}</time> : '待设置'}</dd></div>
          <div><dt>每日复习时间</dt><dd>{goal ? hours(goal.dailyHours) : '—'}</dd></div>
        </dl>{goal && !editing && <button className="button secondary" onClick={() => setEditing(true)}>调整目标</button>}</div>
      </div>
    </section>

    {(editing || !goal) && <form className="panel goal-form" onSubmit={save}>
      <h2>{goal ? '调整备考目标' : '设置备考目标'}</h2>
      {!goal && legacyGoal?.examDate && !dirty && <button type="button" className="button secondary small"
        onClick={() => { setExamDate(legacyGoal.examDate); setDailyHours(String(legacyGoal.dailyHours || 1)); setIncludeExamDay(legacyGoal.includeExamDay !== false); }}>带入本机旧目标</button>}
      <ExamDatePicker value={examDate} today={today} onChange={date => { setExamDate(date); setError(''); }} />
      <label htmlFor="daily-hours">每天可用于复习<select id="daily-hours" value={dailyHours} onChange={event => setDailyHours(event.target.value)}>
        {[.5, 1, 1.5, 2, 3, 4].map(h => <option value={h} key={h}>{hours(h)} / 天</option>)}</select></label>
      <label className="check-line"><input type="checkbox" checked={includeExamDay} onChange={event => setIncludeExamDay(event.target.checked)} />
        <span>计入考试当天的复习时间</span></label>
      {error && <p className="warning-copy" role="alert">{error}</p>}
      {changedRemotely && dirty && <div className="button-row">
        <button type="button" className="button secondary small" onClick={useLatest}>采用服务器目标</button>
        <button type="button" className="button secondary small" onClick={() => { setBase(goal); setError(''); }}>保留当前填写</button>
      </div>}
      <button type="submit" className="button" disabled={saving || changedRemotely}>{saving ? '正在保存…' : goal ? '更新备考计划' : '保存目标'}</button>
      {goal ? <button type="button" className="button secondary" disabled={saving} onClick={() => { useLatest(); setEditing(false); }}>取消调整</button>
        : <p className="small-copy muted">目标按账号保存，可随时调整。</p>}
    </form>}

    <div className="home-study-grid">
      <section className="panel home-today" aria-labelledby="today-task-heading">
        <header className="task-meter"><h2 id="today-task-heading">今日任务</h2>
          {tasks.length > 0 && <div className="task-completion"><progress aria-label="今日任务完成度" max={tasks.length} value={done} />
            <span>{done} / {tasks.length} 项已练</span></div>}
        </header>
        {tasks.length ? <ul className="home-task-list">{tasks.map(task => <li key={task.id}>
          <a className={'home-task-link' + (task.done ? ' is-done' : '')} href={task.href}>
            <div><strong>{task.title}</strong>{task.note && <small>{task.note}</small>}</div><span>{task.minutes} 分钟</span>
          </a></li>)}</ul> : <p>{!goal ? '设置备考目标后生成任务。' : budget.status === 'past' ? '考试日期已过，请调整目标。' : plan ? '暂无可安排题目。' : '当前没有可用的备考时间。'}</p>}
        {later && <p className="small-copy muted home-next-review">下次复练 {prettyDate(later.dueOn)} · {topics.find(topic => topic.id === later.topic)?.title || later.topic}{later.sourceExamId && ' · 来自模拟复盘'}</p>}
      </section>
      <section className="panel home-plan"><header><h2>整体备考节奏</h2>
        <p className="small-copy muted">{goal ? '预计可复习 ' + number(budget.totalHours) + ' 小时' : '设置目标后显示推荐档位'}</p></header>
        <ol className="study-tiers">{tiers.map(tier => <li key={tier.id} aria-current={plan?.tier === tier.id ? 'true' : undefined}>
          <div><strong>{tier.label}</strong><p>{tier.range}</p></div>{plan?.tier === tier.id && <span className="tier-tag">当前推荐</span>}
        </li>)}</ol>
        {plan?.examSoon && <p className="small-copy muted">临近考试，优先复练和输出。</p>}
        <details className="study-scope"><summary>适用范围与推荐依据</summary>
          {goal && <p>{budget.studyDays} 个备考日 × 每天 {number(goal.dailyHours)} 小时。{goal.includeExamDay ? '计入考试当天。' : '考试当天不计入。'}</p>}
          <p>当前内容用于教育管理案例备考。S / A / B 来自现有教学整理，结合可用时长推荐学习范围。</p>
        </details>
      </section>
    </div>

    <section className="home-explore"><h2>按需学习</h2><div className="home-links">
      <a className="panel card-motion" href="#/framework"><h3>陌生案例入门</h3><p>读题、搭框架、写具体行动</p></a>
      <a className="panel card-motion" href="#/exams"><h3>模拟考试</h3><p>整套作答并复盘</p></a>
    </div></section>
  </div>;
}
