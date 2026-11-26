import { useState } from 'react';
import type { BankItem } from './api';
import { readablePrompt, type KnowledgeTopic } from './exam';
import { ExamHeading } from './ExamPages';
import { levels } from './data.js';
import { kinds, masteryStatus } from './questionBank.js';

const statusOptions = { all: '全部状态', weakAll: '仅看薄弱', ...Object.fromEntries(Object.entries(levels).map(([id, level]) => [id, level.label])) };
const empty = { search: '', topic: '', kind: '', priority: '', status: 'all' };
const labels = kinds as Record<string, string>;
const mastery = levels as Record<string, { label: string }>;
const questionHref = (id: string) => '#/practice/question/' + encodeURIComponent(id);

export function PracticeList({ groups, practice, initialFilter, initialTopic, registeredTopics }: {
  groups: BankItem[]; practice: Record<string, { status: string; updatedAt: string; questionVersion: number }>;
  initialFilter: string; initialTopic: string; registeredTopics: KnowledgeTopic[];
}) {
  const initial = { ...empty, topic: initialTopic, status: initialFilter };
  const [draft, setDraft] = useState(initial), [filter, setFilter] = useState(initial);
  const byTopic = new Map(registeredTopics.map(topic => [topic.id, topic]));
  const status = (question: BankItem) => masteryStatus(practice[question.id], question);
  const matches = (question: BankItem) => {
    const state = status(question);
    return (!filter.topic || filter.topic === question.topic) && (!filter.kind || filter.kind === question.kind)
      && (!filter.priority || filter.priority === question.priority)
      && (filter.status === 'all' || (filter.status === 'weakAll' ? ['weak', 'fuzzy'].includes(state) : filter.status === state))
      && (question.title + question.prompt).toLowerCase().includes(filter.search.trim().toLowerCase());
  };
  const visible = groups.filter(group => [group, ...((group.variants ?? []) as BankItem[])].some(matches));
  const set = (key: keyof typeof draft, value: string) => setDraft(previous => ({ ...previous, [key]: value }));

  return <>
    <ExamHeading title="题目练习" sub={byTopic.get(filter.topic)?.title ?? '按题干、题型和掌握情况选题。'}>
      <a className="button secondary" href={filter.topic ? '#/knowledge/' + (byTopic.get(filter.topic)?.priority ?? filter.topic) : '#/practice/wrong'}>
        {filter.topic ? '返回主题组' : '错题集'}
      </a>
    </ExamHeading>
    <form className="panel list-controls practice-filters" onSubmit={event => { event.preventDefault(); setFilter(draft); }}>
      <div className="search-row">
        <label className="search">搜索题干<input type="search" value={draft.search} onChange={event => set('search', event.target.value)} /></label>
        <label>主题<select value={draft.topic} onChange={event => set('topic', event.target.value)}>
          <option value="">全部主题</option>{registeredTopics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
        </select></label>
        <label>题型<select aria-label="练习题型筛选" value={draft.kind} onChange={event => set('kind', event.target.value)}>
          <option value="">全部题型</option>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <label>优先级<select value={draft.priority} onChange={event => set('priority', event.target.value)}>
          <option value="">全部优先级</option>{['S', 'A', 'B'].map(priority => <option key={priority} value={priority}>{priority} 级</option>)}
        </select></label>
        <label>状态<select value={draft.status} onChange={event => set('status', event.target.value)}>
          {Object.entries(statusOptions).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
      </div>
      <div className="button-row"><button className="button">筛选</button>
        <button className="button secondary" type="button" onClick={() => { setDraft(empty); setFilter(empty); }}>清除筛选</button></div>
    </form>
    {visible.length > 0 ? <div className="question-grid">{visible.map(group => {
      const state = status(group), record = practice[group.id];
      const variants = (group.variants ?? []) as BankItem[];
      const difficulty = ['choice', 'judgment'].includes(group.kind) && group.difficulty ? (group.difficulty === 'challenging' ? ' · 辨析' : ' · 基础') : '';
      return <article key={group.id} className={'question-card card-motion ' + state}>
        <div className="card-meta"><span>{byTopic.get(group.topic)?.title ?? group.topic} · {group.priority} 级 · {labels[group.kind]}{difficulty}</span>
          <span className={'tag ' + state}>{mastery[state].label}</span></div>
        <h2><a href={questionHref(group.id)} className="question-card-link">{readablePrompt(group.prompt)}</a></h2>
        <p className="card-bottom"><span>{variants.length} 道变式</span>
          {record?.updatedAt && <span>最近 {new Date(record.updatedAt).toLocaleDateString('zh-CN')}</span>}</p>
        {variants.map(variant => {
          const level = status(variant);
          return <a className={'variant-list ' + level} href={questionHref(variant.id)} key={variant.id}>
            <span>变式 · {variant.title}</span><span className={'tag ' + level}>{mastery[level].label}</span></a>;
        })}
      </article>;
    })}</div> : <section className="panel empty"><h2>没有符合条件的题目</h2><p>调整筛选条件后再试。</p></section>}
  </>;
}
