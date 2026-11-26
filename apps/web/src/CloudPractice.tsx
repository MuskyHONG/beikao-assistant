import { useEffect, useRef, useState } from 'react';
import { ApiError, api, type BankItem } from './api';
import { ReferenceContent, ResponseFields } from './BankPractice.jsx';
import { readablePrompt, type KnowledgeTopic } from './exam';
import { levels } from './data.js';
import { answerLabel, hasResponse, kinds } from './questionBank.js';
import { practiceDetails, practicePath, type ReviewTask, type StudyAttempt, type StudyDraft } from './learning';

type Question = BankItem & { group: BankItem; topic?: KnowledgeTopic; isVariant: boolean };
type Legacy = {
  draft?: string; questionVersion?: number;
  previousDrafts?: { at: number; answer: string; version: number; snapshot?: { prompt: string } }[];
  attempts?: { at: number; answer: string; answerText?: string; questionSnapshot?: { version: number; prompt: string } }[];
};
type Rating = StudyAttempt['rating'];
type Reference = { question: BankItem; assessment?: unknown; response?: string };
const labels = levels as Record<string, { label: string }>;
const names = kinds as Record<string, string>;
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

export function CloudPractice({ question: q, legacy, review, reviewId, missingReview, from, ownerId, refresh, checkQuestion }: {
  question: Question; legacy?: Legacy; review?: ReviewTask; reviewId?: string; missingReview: boolean; from?: string; ownerId: string;
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
  const [referenceVisible, setReferenceVisible] = useState(false);
  const [hintStage, setHintStage] = useState(1);
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
    value.current = response; setDraft(response); setReference(undefined); setReferenceVisible(false); setFocusPoint(''); setPointResult('');
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
    if (reference) { setReferenceVisible(!referenceVisible); return; }
    setHintStage(q.kind === 'short' && q.topic?.card ? 1 : 3);
    const answer = value.current;
    setChecking(true); setError('');
    try {
      if (q.kind === 'short') setReference(await api.request<Reference>(path + '/hint', 'POST', { version: q.version }));
      else if (hasResponse(q, answer)) setReference({ ...await checkQuestion(q, answer), response: answer });
      else { setError('请留下客观题作答再核对，或直接选择回忆程度。'); return; }
      setReferenceVisible(true);
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
  const group = [q.group, ...((q.group.variants ?? []) as BankItem[])];
  const position = group.findIndex(item => item.id === q.id);
  const back = from === 'wrong' ? '/practice/wrong' : reviewId || from === 'home' ? '/home' : '/practice';
  const suffix = from ? '?from=' + encodeURIComponent(from) : '';
  const questionPath = (id: string) => '/practice/question/' + encodeURIComponent(id);
  const guide = '#/framework?return=' + encodeURIComponent(questionPath(q.id) + (reviewId ? '/review/' + reviewId : suffix));
  const points = q.topic?.card?.points ?? [];
  return <div className="lesson">
    <div className="lesson-track">
      <a className="button secondary" href={'#' + back}>返回来源</a>
      <div className="lesson-position"><progress max={group.length} value={position + 1} aria-label="当前题组位置" /><span>{position + 1} / {group.length}</span></div>
      <div className="lesson-nav">
        {group[position - 1] && <a className="button secondary" href={'#' + questionPath(group[position - 1].id) + suffix}>上一题</a>}
        {group[position + 1] && <a className="button secondary" href={'#' + questionPath(group[position + 1].id) + suffix}>下一题</a>}
      </div>
    </div>
    <section className="lesson-question">
      <div className="lesson-meta">
        {q.topic && <span>{q.topic.title}</span>}
        <span className="tag">{q.isVariant ? '关联变式' : '原题提取'} · {title}</span>
        {q.difficulty && ['choice', 'judgment'].includes(q.kind) && <span className="tag">{q.difficulty === 'challenging' ? '辨析' : '基础'}</span>}
        <span className={'tag ' + (current?.rating ?? 'pending')}>{current ? labels[current.rating].label : '待自评'}</span>
      </div>
      {reviewId && <p className="review-context">{missingReview && !rated ? '这项复练已完成或暂不可用。请回首页刷新任务。' : '到期复练 · 先独立回忆，答后再看提示。'}</p>}
      <h1 className="question-title">{readablePrompt(q.prompt)}</h1>
      {loading && <p role="status">正在载入账号草稿与历史…</p>}
      {error && <p className="warning-copy" role="alert">{error}</p>}
      {!ready && !loading && <button className="button secondary" onClick={() => setReload(n => n + 1)}>重新载入学习记录</button>}
      {ready && (!missingReview || rated) && <>
        {!reviewId && !remote && !draft && legacy?.draft && (legacy.questionVersion || 1) === q.version &&
          <p><button className="button secondary small" onClick={() => edit(legacy.draft!)}>带入本机旧草稿</button></p>}
        <fieldset className="cloud-response" disabled={submitting || checking || !!rated}>
          <ResponseFields question={q} value={draft} onChange={edit} />
        </fieldset>
        <div className={'lesson-answer-actions' + (q.kind === 'short' ? ' hint-only' : '')}>
          <div className="lesson-help actions">
            {q.kind === 'short' && <button className="button secondary" aria-expanded={referenceVisible} disabled={checking || submitting}
              onClick={() => void showReference()}>{checking ? '正在载入…' : referenceVisible ? '收起提示' : '记不住？查看提示'}</button>}
            <a className="text-link" href={guide}>陌生案例怎么答</a>
          </div>
          {q.kind !== 'short' && <button className="button" aria-expanded={referenceVisible} disabled={checking || submitting}
            onClick={() => void showReference()}>{checking ? '正在载入…' : referenceVisible ? '收起答案' : '核对答案'}</button>}
        </div>
        {(dirty || remote || savingDraft) && !rated && <div className="answer-footer">
          <span role="status">{savingDraft ? '正在同步草稿…' : dirty ? '作答待同步' : '草稿已同步'}</span>
          {dirty && <button className="button secondary small" disabled={savingDraft || !!conflict || submitting} onClick={() => void saveDraft()}>保存草稿</button>}
        </div>}
        {conflict && <div className="panel soft"><p>服务器草稿 · {date(conflict.updatedAt)}</p><p className="preserve">{conflict.response || '空白草稿'}</p><div className="button-row">
          <button className="button secondary small" onClick={() => { setRemote(conflict); setConflict(undefined); setError(''); setReference(undefined); setReferenceVisible(false); setDraft(conflict.response); value.current = conflict.response; cache(localKey); }}>采用服务器草稿</button>
          <button className="button secondary small" onClick={() => { setRemote(conflict); setConflict(undefined); setError('可点击保存草稿，确认同步当前输入。'); cache(localKey, { response: value.current, revision: conflict.revision }); }}>保留当前输入</button>
        </div></div>}
        <section className="lesson-self-assessment" aria-label="本次回忆掌握程度">
          <div className="rating-row">{(['weak', 'fuzzy', 'good'] as const).map(status =>
            <button key={status} className={'rating ' + status} aria-pressed={rated === status} disabled={submitting || checking || savingDraft || !!rated}
              onClick={() => void rate(status)}>{labels[status].label}</button>)}</div>
          <div className="lesson-inline-feedback">
            {rated ? <div className="lesson-feedback" role="status"><strong>自评已保存 · {labels[rated].label}</strong></div>
              : <div className="lesson-feedback"><strong>按本次回忆选择掌握程度</strong><p>也可直接为口头回忆或纸笔作答自评。</p></div>}
            {rated && <a className="button secondary small" href={'#' + (group[position + 1] && !reviewId ? questionPath(group[position + 1].id) + suffix : back)}>
              {group[position + 1] && !reviewId ? '继续下一题' : '完成并返回'}</a>}
          </div>
        </section>
      </>}
    </section>
    {referenceVisible && reference && <section className={'panel reference-panel lesson-enter' + (q.kind === 'short' ? ' coaching-hint' : '')}>
      {q.kind === 'short' ? <>
        <h2>分步提示</h2>
        {q.topic?.card && <p><strong>理解本质</strong> {q.topic.card.overview}</p>}
        {hintStage >= 2 && points.length > 0 && <p><strong>记忆提示</strong> {points.map(point => point.cue).filter(Boolean).join('—')}</p>}
        {hintStage >= 3 ? <>
          <h3>参考答案</h3><p className="preserve">{reference.question.referenceAnswer || (reference.question.points as string[])?.join('\n')}</p>
          {reference.question.explanation && reference.question.explanation !== reference.question.referenceAnswer &&
            <details><summary>补充解析</summary><p className="preserve">{reference.question.explanation}</p></details>}
          {!rated && reference.question.points?.length > 0 && <label className="review-select">最想补的一个要点（选填）
            <select value={focusPoint} onChange={event => setFocusPoint(event.target.value)}><option value="">暂不指定</option>
              {(reference.question.points as string[]).map((point, index) => <option key={index} value={index}>{point}</option>)}
            </select></label>}
          {!rated && review?.focus && draft.trim() && <label className="review-select">先前要点自查（选填）<span>{review.focus}</span>
            <select value={pointResult} onChange={event => setPointResult(event.target.value)}><option value="">暂不记录</option>
              <option value="included">独立写出</option><option value="missed">仍有遗漏</option>
            </select></label>}
        </> : <button className="button secondary small" onClick={() => setHintStage(hintStage + 1)}>查看下一层提示</button>}
      </> : <ReferenceContent question={reference.question} draft={draft} assessment={reference.assessment} />}
    </section>}
    <div className="lesson-extras">
      <details><summary>内容依据与适用范围</summary><p>{q.sourceType} · 题目 v{q.version}</p>
        {q.topic?.card?.source && <p>知识卡依据 · {q.topic.card.source}</p>}
        {q.sourceUrl && <p><a className="text-link" href={q.sourceUrl} target="_blank" rel="noreferrer">打开来源资料</a></p>}
      </details>
      <details><summary>同组原题与变式 · {group.length}</summary>{group.map(item => <p key={item.id}>
        {item.id === q.id ? <strong aria-current="page">当前 · {item.title || item.prompt}</strong>
          : <a className="text-link" href={'#' + questionPath(item.id) + suffix}>{item.title || item.prompt}</a>}</p>)}</details>
      <details><summary>练习历史 · {history.length}</summary>
        <h3>这道题的练习记录</h3>
        {history.map(item => <PracticeAttempt key={item.id} attempt={item} />)}
        {!history.length && <p>完成一次自评后，这里会显示该次练习。</p>}
        {older.map(item => <details key={item.version}><summary>旧版服务器草稿 v{item.version} · {date(item.updatedAt)}</summary><p className="preserve">{item.response}</p></details>)}
        {legacy?.draft && (legacy.questionVersion || 1) !== q.version &&
          <details><summary>本机旧草稿 v{legacy.questionVersion || 1}</summary><p className="preserve">{legacy.draft}</p></details>}
        {legacy?.previousDrafts?.map((item, index) => <details key={index}><summary>本机草稿 v{item.version} · {date(item.at)}</summary>
          <p>{item.snapshot?.prompt}</p><p className="preserve">{item.answer}</p></details>)}
        {legacy?.attempts && [...legacy.attempts].reverse().map((item, index) => <details key={index}><summary>本机练习 · {date(item.at)}</summary>
          <p>{item.questionSnapshot?.prompt}</p><p className="preserve">{item.answerText || item.answer}</p></details>)}
      </details>
      {q.topic && <a className="text-link" href={'#/knowledge/' + (q.topic.priority ?? q.topic.id)}>查看主题组</a>}
    </div>
  </div>;
}
