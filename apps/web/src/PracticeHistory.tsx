import { useEffect, useState } from 'react';
import { api } from './api';
import { type StudyAttempt } from './learning';
import { PracticeAttempt } from './CloudPractice';

interface Page { items: StudyAttempt[]; next: string | null }

export function PracticeHistory() {
  const [items, setItems] = useState<StudyAttempt[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [before, setBefore] = useState('');
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.request<Page>('/me/practice-history' + (before ? '?before=' + encodeURIComponent(before) : '')).then(page => {
      if (active) { setItems(previous => before ? [...previous, ...page.items] : page.items); setNext(page.next); }
    }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [before, retry]);
  return <>
    <div className="page-heading"><div><h1>练习历史</h1><p>查看当时的题干、作答和自评，题目更新或下架后也可回看。</p></div><a className="button secondary" href="#/practice">返回题目列表</a></div>
    <section className="panel">
      {items.map(attempt => <article className="learning-history-entry" key={attempt.id}><h2>{attempt.question.title}</h2><PracticeAttempt attempt={attempt} /></article>)}
      {loading && <p role="status">正在载入练习历史…</p>}
      {error && <><p role="alert">{error}</p><button className="button secondary" onClick={() => setRetry(n => n + 1)}>重新载入</button></>}
      {!loading && !error && !items.length && <p>完成一次自评后，这里会显示该次练习。</p>}
      {!loading && !error && next && <button className="button secondary" onClick={() => setBefore(next)}>显示更多</button>}
    </section>
  </>;
}
