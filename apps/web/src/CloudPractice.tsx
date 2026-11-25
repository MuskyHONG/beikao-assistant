import { useEffect, useRef, useState } from 'react';
import { ApiError, api, type BankItem } from './api';
import { ReferenceContent, ResponseFields } from './BankPractice.jsx';
import { levels } from './data.js';
import { answerLabel, hasResponse, kinds } from './questionBank.js';
import { practiceDetails, practicePath, type ReviewTask, type StudyAttempt, type StudyDraft } from './learning';

type Question = BankItem & { group: BankItem; topic?: { id: string; title: string }; isVariant: boolean };
type Legacy = {
  draft?: string; questionVersion?: number;
  previousDrafts?: { at: number; answer: string; version: number; snapshot?: { prompt: string } }[];
  attempts?: { at: number; answer: string; answerText?: string; questionSnapshot?: { version: number; prompt: string } }[];
};
type Rating = StudyAttempt['rating'];
type Reference = { question: BankItem; assessment?: unknown; response?: string };
const labels = levels as Record<string, { label: string }>;
const names = kinds as Record<string, string>;
const go = (path: string) => { location.hash = path; };
const date = (value: string | number) => new Date(value).toLocaleString('zh-CN', { hour12: false });

function readCache<T>(key: string): T | undefined {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') ?? undefined; } catch { return undefined; }
}
function cache(key: string, value?: unknown) {
  try { if (value === undefined) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep the input on screen if local browser storage is unavailable. */ }
}

export function PracticeAttempt({ attempt }: { attempt: StudyAttempt }) {
  const question = attempt.question;
  const response = question.kind === 'fill' ? (() => {
    try { return (JSON.parse(attempt.response) as string[]).map((text, i) => `第 ${i + 1} 空 · ${text || '未答'}`).join('\n'); }
    catch { return attempt.response; }
  })() : answerLabel(question, attempt.response);
  return <details><summary>{date(attempt.submittedAt)} · v{attempt.version} · {labels[attempt.rating].label}</summary>
    <p>{question.prompt}</p><p className="preserve">{response || '未录入作答，仅记录回忆自评。'}</p>
    {attempt.assessment?.score != null && <p>参考得分 {attempt.assessment.score} / {question.max}</p>}
    {attempt.pointResult && <p>要点自查 · {attempt.reviewFocus} · {attempt.pointResult === 'included' ? '独立写出' : '仍有遗漏'}</p>}
  </details>;
}

export function CloudPractice({ question: q, legacy, review, reviewId, missingReview, ownerId, refresh, checkQuestion }: {
  question: Question; legacy?: Legacy; review?: ReviewTask; reviewId?: string; missingReview: boolean; ownerId: string;
  refresh: () => Promise<void>; checkQuestion: (question: BankItem, answer: string) => Promise<{ question: BankItem; assessment: unknown }>;
}) {
  const path = practicePath(q.id);
  const localKey = `beikao.learning:${ownerId}:${q.id}:${q.version}:${reviewId ?? 'practice'}`;
  const [draft, setDraft] = useState('');
  const value = useRef('');
  const [remote, setRemote] = useState<StudyDraft>();
  const [older, setOlder] = useState<StudyDraft[]>([]);
  const [history, setHistory] = useState<StudyAttempt[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [conflict, setConflict] = useState<StudyDraft>();
  const [reference, setReference] = useState<Reference>();
  const [checking, setChecking] = useState(false);
  const [rated, setRated] = useState<Rating>();
  const [submitting, setSubmitting] = useState(false);
  const [focusPoint, setFocusPoint] = useState('');
  const [pointResult, setPointResult] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    practiceDetails(q.id, reviewId).then(details => {
      if (!active) return;
      const current = details.drafts.find(item => item.version === q.version);
      const pending = readCache<{ response: string; revision: number }>(localKey);
      const pendingSubmission = readCache<{ id: string }>(localKey + ':submission');
      const finished = details.attempts.find(item => item.id === pendingSubmission?.id);
      const response = finished?.response ?? pending?.response ?? current?.response ?? '';
      value.current = response;
      setDraft(response); setRemote(current); setOlder(details.drafts.filter(item => item.version !== q.version)); setHistory(details.attempts);
      setConflict(pending && current && pending.revision !== current.revision && pending.response !== current.response ? current : undefined);
      if (finished) { setRated(finished.rating); cache(localKey + ':submission'); cache(localKey); }
      setReady(true); setError('');
    }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [localKey, q.id, q.version, reviewId, reload]);

  const edit = (response: string) => {
    value.current = response; setDraft(response); setReference(undefined); setFocusPoint(''); setPointResult('');
    if (response === (remote?.response ?? '')) cache(localKey);
    else cache(localKey, { response, revision: remote?.revision ?? 0 });
  };
  const dirty = draft !== (remote?.response ?? '');
  const saveDraft = async () => {
    if (!ready || savingDraft || conflict || rated || missingReview || !dirty) return;
    const response = value.current;
    setSavingDraft(true); setError('');
    try {
      const result = await api.request<{ draft: StudyDraft }>(path + '/draft', 'PUT', {
        version: q.version, response, expectedRevision: remote?.revision ?? 0, ...(reviewId ? { reviewId } : {}),
      });
      setRemote(result.draft);
      if (value.current === response) cache(localKey);
      else cache(localKey, { response: value.current, revision: result.draft.revision });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'study_draft_conflict') {
        const latest = await practiceDetails(q.id, reviewId).catch(() => null);
        setConflict(latest?.drafts.find(item => item.version === q.version));
      }
      setError((error as Error).message);
    } finally { setSavingDraft(false); }
  };
  useEffect(() => {
    if (!ready || !dirty || error || conflict || rated || submitting || savingDraft || missingReview) return;
    const timer = window.setTimeout(() => void saveDraft(), 600);
    return () => window.clearTimeout(timer);
  }, [ready, dirty, draft, error, conflict, rated, submitting, savingDraft, missingReview]);

  const showReference = async () => {
    if (reference) { setReference(undefined); return; }
    const answer = value.current;
    setChecking(true); setError('');
    try {
      if (q.kind === 'short') setReference(await api.request<Reference>(path + '/hint', 'POST', { version: q.version }));
      else if (hasResponse(q, answer)) setReference({ ...await checkQuestion(q, answer), response: answer });
      else setError('请留下客观题作答再核对，或直接选择回忆程度。');
    } catch (error) { setError((error as Error).message); }
    finally { setChecking(false); }
  };

  const rate = async (rating: Rating) => {
    if (submitting || rated || missingReview) return;
    const response = value.current;
    const payload = { version: q.version, response, rating, checked: q.kind !== 'short' && reference?.response === response && !!reference.assessment,
      ...(reviewId ? { reviewId } : {}), ...(rating !== 'good' && focusPoint !== '' ? { focusPoint: Number(focusPoint) } : {}),
      ...(pointResult && response.trim() ? { pointResult } : {}) };
    const signature = JSON.stringify(payload), pendingKey = localKey + ':submission';
    const retry = readCache<{ signature: string; id: string }>(pendingKey);
    const submissionId = retry?.signature === signature ? retry.id : crypto.randomUUID();
    cache(pendingKey, { signature, id: submissionId });
    setSubmitting(true); setError('');
    try {
      const { attempt } = await api.request<{ attempt: StudyAttempt }>(path + '/attempts', 'POST', { ...payload, submissionId });
      setHistory(rows => [attempt, ...rows.filter(row => row.id !== attempt.id)]);
      setRated(rating); cache(pendingKey); cache(localKey); void refresh();
    } catch (error) { setError((error as Error).message); }
    finally { setSubmitting(false); }
  };

  const current = history.find(item => item.version === q.version);
  const title = names[q.kind];
  return <>
    <div className="page-heading"><div><h1>{reviewId ? '到期复练' : q.isVariant ? '关联变式' : title + '练习'}</h1><p>先独立回忆，再按本次表现选择熟练度。</p></div><button className="button secondary" onClick={() => go(reviewId ? '/home' : '/practice')}>{reviewId ? '返回首页' : '返回题目列表'}</button></div>
    {missingReview && !rated && <section className="panel soft"><p>这项复练已完成或暂不可用。请回首页刷新任务。</p></section>}
    <div className="two-col"><div className="stack"><section className="panel">
      <div className="section-caption"><span className="tag">{title}</span><span className="tag">{q.sourceType}</span><span className={'tag ' + (current?.rating || 'pending')}>{current ? labels[current.rating].label : '待自评'}</span><span className="tag">v{q.version} · {q.max} 分</span></div>
      <h2 className="question-title">{q.title}</h2>
      {q.title !== q.prompt && <p className="large-copy">{String(q.prompt).replace(/\{\{(\d+)\}\}/g, (_, n) => `____（第 ${n} 空）`)}</p>}
      {loading && <p role="status">正在载入账号草稿与历史…</p>}
      {error && <p className="warning-copy" role="alert">{error}</p>}
      {!ready && !loading && <button className="button secondary" onClick={() => setReload(n => n + 1)}>重新载入学习记录</button>}
      {ready && (!missingReview || rated) && <>
        {!reviewId && !remote && !draft && legacy?.draft && (legacy.questionVersion || 1) === q.version && <p><button className="button secondary small" onClick={() => edit(legacy.draft!)}>带入本机旧草稿</button></p>}
        <fieldset className="cloud-response" disabled={submitting || checking || !!rated}><ResponseFields question={q} value={draft} onChange={edit} /></fieldset>
        <div className="answer-footer"><span>{savingDraft ? '正在同步草稿…' : dirty && !rated ? '作答待同步' : remote ? '草稿已同步' : '同一账号可在其他设备恢复已保存记录'}</span>
          {dirty && !rated && <button className="button secondary small" disabled={savingDraft || !!conflict || submitting} onClick={() => void saveDraft()}>保存草稿</button>}</div>
        {conflict && <div className="panel soft"><p>服务器草稿 · {date(conflict.updatedAt)}</p><p className="preserve">{conflict.response || '空白草稿'}</p><div className="button-row">
          <button className="button secondary small" onClick={() => { setRemote(conflict); setConflict(undefined); setError(''); setReference(undefined); setDraft(conflict.response); value.current = conflict.response; cache(localKey); }}>采用服务器草稿</button>
          <button className="button secondary small" onClick={() => { setRemote(conflict); setConflict(undefined); setError('可点击保存草稿，确认同步当前输入。'); cache(localKey, { response: value.current, revision: conflict.revision }); }}>保留当前输入</button>
        </div></div>}
        <button className="button secondary" disabled={checking || submitting} onClick={() => void showReference()}>{checking ? '正在载入…' : reference ? '收起提示' : q.kind === 'short' ? '查看参考提示' : '核对答案并自评'}</button>
        {reference && <div className="reference-panel"><ReferenceContent question={reference.question} draft={draft} assessment={reference.assessment} />
          {q.kind === 'short' && !rated && reference.question.points?.length > 0 && <label>最想补的一个要点（选填）<select value={focusPoint} onChange={event => setFocusPoint(event.target.value)}><option value="">暂不指定</option>{(reference.question.points as string[]).map((point, i) => <option key={i} value={i}>{point}</option>)}</select></label>}
          {q.kind === 'short' && !rated && review?.focus && draft.trim() && <label>先前要点自查（选填）<span>{review.focus}</span><select value={pointResult} onChange={event => setPointResult(event.target.value)}><option value="">暂不记录</option><option value="included">独立写出</option><option value="missed">仍有遗漏</option></select></label>}
        </div>}
        <h3>按本次回忆选择掌握程度</h3>
        <div className="rating-row">{(['weak', 'fuzzy', 'good'] as const).map(status => <button key={status} className={`rating ${status} ${rated === status ? 'chosen' : ''}`} disabled={submitting || checking || savingDraft || !!rated} onClick={() => void rate(status)}>{labels[status].label}</button>)}</div>
        {rated && <div className="success-note" role="status">自评已保存 · {labels[rated].label}<button className="button secondary small" onClick={() => go(reviewId ? '/home' : '/practice')}>{reviewId ? '返回首页查看复练' : '返回列表看状态'}</button></div>}
      </>}
    </section>
    {history.length > 0 && <section className="panel"><h3>这道题的练习记录</h3>{history.map(item => <PracticeAttempt key={item.id} attempt={item} />)}</section>}
    {older.length > 0 && <section className="panel"><h3>旧版服务器草稿</h3>{older.map(item => <details key={item.version}><summary>v{item.version} · {date(item.updatedAt)}</summary><p className="preserve">{item.response}</p></details>)}</section>}
    {(!!legacy?.previousDrafts?.length || !!legacy?.draft && (legacy.questionVersion || 1) !== q.version) && <section className="panel"><h3>这台设备的旧版草稿</h3>
      {legacy.draft && (legacy.questionVersion || 1) !== q.version && <details><summary>v{legacy.questionVersion || 1}</summary><p className="preserve">{legacy.draft}</p></details>}
      {legacy.previousDrafts?.map((item, i) => <details key={i}><summary>v{item.version} · {date(item.at)}</summary><p>{item.snapshot?.prompt}</p><p className="preserve">{item.answer}</p></details>)}
    </section>}
    {!!legacy?.attempts?.length && <section className="panel"><h3>这台设备的旧练习</h3>{[...legacy.attempts].reverse().map((item, i) => <details key={i}><summary>{date(item.at)} · {item.questionSnapshot ? 'v' + item.questionSnapshot.version : '旧记录'}</summary><p>{item.questionSnapshot?.prompt}</p><p className="preserve">{item.answerText || item.answer}</p></details>)}</section>}
    </div><div className="stack"><section className="panel"><h3>同组原题与变式</h3>{([q.group, ...(q.group.variants || [])] as BankItem[]).map(item =>
      <button key={item.id} className={'related ' + (item.id === q.id ? 'current' : '')} onClick={() => go('/practice/question/' + item.id)}>{item.title || item.prompt}</button>)}</section>
      {q.topic && <section className="panel soft"><h3>{q.topic.title}</h3><button className="button secondary" onClick={() => go('/knowledge/' + q.topic!.id)}>查看知识讲解</button></section>}
      <section className="panel"><h3>来源与内容版本</h3><p>{q.sourceType} · v{q.version}</p>{q.sourceUrl && <a className="text-link" href={q.sourceUrl} target="_blank" rel="noreferrer">打开来源资料</a>}</section>
    </div></div>
  </>;
}
