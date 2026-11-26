import { useState } from 'react';
import type { BankItem } from './api';
import { ExamHeading, ExamLoad } from './ExamPages';
import { examDate, kindLabel, readablePrompt, useExamLoad } from './exam';
import type { ReviewTask } from './learning';

type Event = {
  id: string; source: 'practice' | 'exam'; questionId: string; topic: string; version: number; kind: keyof typeof kindLabel;
  prompt: string; occurredAt: string; rating: 'weak' | 'fuzzy' | 'good' | null; score: number | null;
  max: number; itemNo: number | null; done: boolean; attempts: number;
};
const empty = { source: '', state: '' };

export function WrongQuestions({ groups, reviews, day }: { groups: BankItem[]; reviews: ReviewTask[]; day?: string }) {
  const [draft, setDraft] = useState(empty), [filter, setFilter] = useState(empty), [offset, setOffset] = useState(0);
  const query = new URLSearchParams({ offset: String(offset) });
  if (filter.source) query.set('source', filter.source);
  if (filter.state) query.set('state', filter.state);
  const request = useExamLoad<{ items: Event[]; next: number | null }>('/me/wrong-questions?' + query.toString());
  const published = new Set(groups.flatMap(group => [group.id, ...((group.variants ?? []) as BankItem[]).map(item => item.id)]));
  return <>
    <ExamHeading title="错题集" />
    <form className="panel error-filters actions" onSubmit={event => { event.preventDefault(); setOffset(0); setFilter(draft); }}>
      <label>来源 <select value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })}>
        <option value="">全部</option><option value="practice">练习</option><option value="exam">模拟</option></select></label>
      <label>复练 <select value={draft.state} onChange={event => setDraft({ ...draft, state: event.target.value })}>
        <option value="">全部</option><option value="todo">待复练</option><option value="done">已复练</option></select></label>
      <button className="button">筛选</button><a className="button secondary" href="#/practice">返回题目练习</a>
    </form>
    {!request.data ? <ExamLoad {...request} /> : request.data.items.length ? <div className="stack">{request.data.items.map(item => {
      const question = published.has(item.questionId) ? item.questionId : groups.find(group => group.topic === item.topic)?.id;
      const review = !item.done && day && reviews.find(task => task.topic === item.topic && task.dueOn <= day);
      const score = item.score != null && item.score < item.max;
      return <article className="panel learn-error" key={item.source + ':' + item.questionId}>
        <h2>{readablePrompt(item.prompt)}</h2>
        <p className="small-copy muted">{item.source === 'exam' ? '模拟' : '练习'} · {kindLabel[item.kind]} · {item.done ? '已复练' : '待复练'} · {examDate(item.occurredAt)}</p>
        <p>{score ? '参考分未满 ' + item.score + ' / ' + item.max : item.rating === 'weak' ? '想不起来' : '有点模糊'}</p>
        <div className="actions">{question && <a className="button secondary small" href={'#/practice/question/' + question + (review ? '/review/' + review.id : '') + '?from=wrong'}>
          {question === item.questionId ? '复练原题' : '练习同主题'}</a>}
          {item.source === 'exam' ? <a className="button secondary small" href={'#/exams/report/' + item.id}>查看原答卷</a> :
            <a className="button secondary small" href="#/practice/history">查看练习历史</a>}
        </div>
        <p className="small-copy muted">历史记录 {item.attempts} 次 · 题目 v{item.version}</p>
      </article>;
    })}</div> : <section className="panel empty">当前筛选下没有错题记录。</section>}
    {request.data && (offset > 0 || request.data.next !== null) && <div className="button-row">
      <button className="button secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 30))}>上一页</button>
      <button className="button secondary" disabled={request.data.next === null} onClick={() => setOffset(request.data?.next ?? offset)}>下一页</button>
    </div>}
  </>;
}
