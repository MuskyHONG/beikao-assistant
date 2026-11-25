import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { ResponseFields } from './BankPractice.jsx';
import { answerText, examUrl, isAnswered, kindLabel, questionType, readablePrompt, reportPath, runPath, useExamLoad,
  type ExamAttempt, type ExamAvailability, type ExamItem } from './exam';
import './exam.css';

const go = (path: string) => { location.hash = path; };
export function ExamHeading({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div className="exam-actions">{children}</div></div>;
}
export function ExamLoad({ error, retry }: { error: string; retry: () => void }) {
  return <section className="panel">{error ? <><p role="alert" className="warning-copy">{error}</p>
    <button className="button secondary" onClick={retry}>重试</button></> : <p role="status">正在读取账号记录…</p>}</section>;
}

export function ExamLibrary({ hasLegacy }: { hasLegacy: boolean }) {
  const { data, error, retry } = useExamLoad<ExamAvailability>(examUrl + '/availability');
  const [tier, setTier] = useState<number>();
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const createRequest = useRef<{ key: string; id: string } | null>(null);
  if (!data) return <><ExamHeading title="模拟考试" /><ExamLoad error={error} retry={retry} /></>;
  const plan = data.tiers.find(row => row.tierMinutes === (tier ?? data.recommendedTier)) ?? data.tiers[0];
  const start = async () => {
    if (busy || !plan.actual || (data.draft && !window.confirm('新开一套会替换当前未交卷草稿。确认开始新卷？'))) return;
    const key = [plan.tierMinutes, data.draft?.id, data.draft?.revision].join(':');
    if (createRequest.current?.key !== key) createRequest.current = { key, id: crypto.randomUUID() };
    setBusy(true); setProblem('');
    try {
      const { attempt } = await api.request<{ attempt: ExamAttempt }>(examUrl, 'POST', {
        attemptId: createRequest.current.id, tierMinutes: plan.tierMinutes,
        ...(data.draft && { replaceDraft: { id: data.draft.id, revision: data.draft.revision } }),
      });
      go(runPath(attempt.id));
    } catch (error) {
      setProblem((error as Error).message);
      if (error instanceof ApiError && error.status === 409) retry();
    } finally { setBusy(false); }
  };
  return <><ExamHeading title="模拟考试" sub="从实际可用的教学题库随机组卷。"><a className="button secondary" href="#/exams/records">答题记录</a></ExamHeading>
    <section className="panel exam-library"><h2>选择模拟时长</h2>
      <fieldset className="exam-tiers"><legend>推荐 {data.recommendedTier} 分钟档，可以自行切换</legend>
        {data.tiers.map(option => <label className="exam-tier" key={option.tierMinutes}>
          <input type="radio" name="exam-tier" value={option.tierMinutes} checked={plan.tierMinutes === option.tierMinutes}
            onChange={() => setTier(option.tierMinutes)} disabled={busy} />
          <strong>{option.tierMinutes} 分钟</strong><span>目标 {option.requested} 题{option.tierMinutes === data.recommendedTier && ' · 推荐'}</span>
        </label>)}
      </fieldset>
      <table className="exam-blueprint"><thead><tr><th scope="col">题型</th><th scope="col">目标题量</th><th scope="col">本次可组</th></tr></thead>
        <tbody>{plan.breakdown.map(row => <tr key={row.kind}><th scope="row">{kindLabel[row.kind]}</th><td>{row.target} 题</td><td>{row.actual} 题</td></tr>)}</tbody>
      </table>
      <p className="exam-plan-summary" aria-live="polite">本次可组 <strong>{plan.actual} 题</strong> · 预计 <strong>{plan.estimatedMinutes} 分钟</strong></p>
      {plan.actual < plan.requested && <p className="muted small-copy">部分题型题量不足，按可用题量组卷。</p>}
      {plan.breakdown.some(row => row.difficulty && (row.difficulty.challengingShortfall || row.difficulty.basicShortfall)) &&
        <p className="muted small-copy">部分难度配额不足，优先用同题型的其他难度补齐。</p>}
      {data.draft && <p className="muted">未交答卷 · {data.draft.title}</p>}
      {problem && <p role="alert" className="warning-copy">{problem}</p>}
      <div className="exam-actions">
        {data.draft && <a className="button" href={'#' + runPath(data.draft.id)}>继续上次答卷</a>}
        <button className={'button' + (data.draft ? ' secondary' : '')} disabled={busy || !plan.actual} onClick={() => void start()}>{busy ? '正在组卷…' : '开始新卷'}</button>
        {!plan.actual && <button className="button secondary" onClick={retry}>刷新可用题量</button>}
      </div>
    </section>{hasLegacy && <a className="text-link exam-legacy-link" href="#/exams/legacy">查看这台设备的旧演示记录</a>}</>;
}

type Pending = { itemNo: number; response: string | null };
function useExamDraft(initial: ExamAttempt) {
  const [attempt, setAttempt] = useState(initial);
  const latest = useRef(initial);
  const pending = useRef<Pending | null>(null);
  const [local, setLocal] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState<ExamAttempt | null>(null);
  const blocked = useRef(false), mounted = useRef(true), ownerToken = useRef(api.csrf);
  const timer = useRef<number | undefined>(undefined);
  const activeWrite = useRef<Promise<boolean> | null>(null);
  const path = examUrl + '/' + initial.id;
  const apply = (value: ExamAttempt) => { latest.current = value; if (mounted.current) setAttempt(value); };
  const flush = async (position?: number): Promise<boolean> => {
    window.clearTimeout(timer.current);
    while (activeWrite.current) {
      if (!await activeWrite.current) return false;
    }
    if (blocked.current || api.csrf !== ownerToken.current) return false;
    const change = pending.current;
    if (!change && position === undefined) return true;
    if (mounted.current) { setSaving(true); setError(''); }
    const operation = api.request<{ attempt: ExamAttempt }>(path + '/draft', 'PATCH', {
      expectedRevision: latest.current.revision, ...(change && { answer: change }),
      ...(position !== undefined && { currentItemNo: position }),
    }).then(({ attempt: saved }) => {
      apply(saved);
      if (pending.current === change) {
        pending.current = null;
        if (mounted.current) setLocal(null);
      }
      return true;
    }).catch(async (problem: Error) => {
      if (problem instanceof ApiError && problem.status === 409) {
        blocked.current = true;
        if (api.csrf === ownerToken.current && mounted.current) {
          try {
            const result = await api.request<{ attempt: ExamAttempt }>(path);
            if (mounted.current) setConflict(result.attempt);
          } catch { blocked.current = false; }
        }
      }
      if (mounted.current) setError(problem.message);
      return false;
    }).finally(() => { activeWrite.current = null; if (mounted.current) setSaving(false); });
    activeWrite.current = operation;
    if (!await operation) return false;
    return pending.current ? flush() : true;
  };
  useEffect(() => {
    mounted.current = true;
    const warn = (event: BeforeUnloadEvent) => { if (pending.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', warn);
      if (pending.current && !blocked.current) void flush();
      else window.clearTimeout(timer.current);
    };
  }, []);
  return {
    attempt, local, error, conflict, saving, flush, latest, hasUnsaved: !!local,
    change(item: ExamItem, response: string) {
      const change = { itemNo: item.itemNo, response: isAnswered(item, response) ? response : null };
      pending.current = change; setLocal(change);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 380);
    },
    acceptServer(keep: boolean) {
      if (!conflict) return;
      apply(conflict); setConflict(null); setError(''); blocked.current = false;
      if (keep && conflict.state === 'draft' && pending.current) void flush(pending.current.itemNo);
      else { pending.current = null; setLocal(null); }
    },
    showConflict(server: ExamAttempt) { blocked.current = true; setConflict(server); },
  };
}

export function ExamRun({ id, confirm }: { id: string; confirm: boolean }) {
  const request = useExamLoad<{ attempt: ExamAttempt }>(examUrl + '/' + encodeURIComponent(id));
  if (!request.data) return <><ExamHeading title="本套答卷"><a className="button secondary" href="#/exams">返回试卷库</a></ExamHeading><ExamLoad {...request} /></>;
  return <ExamWorkspace key={id} initial={request.data.attempt} confirm={confirm} />;
}

function Elapsed({ startedAt, serverNow }: Pick<ExamAttempt, 'startedAt' | 'serverNow'>) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const base = performance.now(), initial = Date.parse(serverNow) - Date.parse(startedAt);
    const update = () => setElapsed(Math.max(0, Math.floor((initial + performance.now() - base) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, serverNow]);
  return <span className="exam-clock">已用时 {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>;
}

function ExamWorkspace({ initial, confirm }: { initial: ExamAttempt; confirm: boolean }) {
  const draft = useExamDraft(initial), { attempt, conflict, local, saving } = draft;
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  useEffect(() => { setReady(false); setProblem(''); }, [confirm]);
  const current = attempt.items.find(item => item.itemNo === attempt.currentItemNo) ?? attempt.items[0];
  const value = (item: ExamItem) => local?.itemNo === item.itemNo ? local.response : item.response;
  const answered = attempt.items.filter(item => isAnswered(item, value(item))).length;
  const groups = [...new Set(attempt.items.map(questionType))];
  const finish = async (mode: 'submit' | 'reveal') => {
    if (mode === 'reveal' && !window.confirm('查看答案将结束本次在线作答，并保存为一条纸笔自核记录。确认查看答案？')) return;
    setBusy(true); setProblem('');
    try {
      if (!await draft.flush()) return;
      await api.request(examUrl + '/' + attempt.id + '/' + mode, 'POST', { expectedRevision: draft.latest.current.revision });
      go(reportPath(attempt.id));
    } catch (error) {
      setProblem((error as Error).message);
      if (error instanceof ApiError && error.status === 409) {
        const { attempt: server } = await api.request<{ attempt: ExamAttempt }>(examUrl + '/' + attempt.id).catch(() => ({ attempt: null }));
        if (server?.state === 'submitted' || server?.state === 'answer_only') go(reportPath(attempt.id));
        else if (server) draft.showConflict(server);
      }
    } finally { setBusy(false); }
  };
  const jump = async (path: string) => { if (await draft.flush()) go(path); };
  if (attempt.state !== 'draft') return <><ExamHeading title="本套答卷已结束" /><a className="button" href={'#' + (attempt.state === 'replaced' ? '/exams' : reportPath(attempt.id))}>
    {attempt.state === 'replaced' ? '返回试卷库' : '查看答卷记录'}</a></>;
  const syncNotice = <>
    {(draft.error || problem) && <p className="warning-copy" role="alert">{draft.error || problem}</p>}
    {conflict ? <div className="exam-actions"><button className="button secondary" onClick={() => draft.acceptServer(false)}>采用服务器答卷</button>
      {conflict.state === 'draft' && draft.hasUnsaved && <button className="button secondary" onClick={() => draft.acceptServer(true)}>保留本次输入并覆盖本题</button>}</div>
      : draft.error && !saving && <button className="button secondary" onClick={() => void draft.flush()}>重试保存</button>}
  </>;
  if (confirm) return <><ExamHeading title="检查本套答卷，再交卷" sub={`${attempt.title} · 已作答 ${answered} / ${attempt.items.length} 题`}>
    <a className="button secondary" href={'#' + runPath(attempt.id)}>返回作答</a></ExamHeading>
    <form className="panel exam-library" onSubmit={event => { event.preventDefault(); if (ready && answered && !busy) void finish('submit'); }}>
      {attempt.items.map(item => <div className="submission-item" key={item.itemNo}><div><span className="tag">{item.itemNo}. {questionType(item)}</span>
        <strong>{readablePrompt(item.prompt)}</strong></div><p className="preserve">{answerText({ ...item, response: value(item) }) || '未作答，交卷后按 0 分计。'}</p></div>)}
      <label className="check-line"><input type="checkbox" checked={ready} onChange={event => setReady(event.target.checked)} />确认交卷并保留本次答题记录</label>
      {!answered && <p className="warning-copy">请至少回答一道题再交卷。</p>}{syncNotice}
      <button className="button" disabled={!answered || !ready || busy || !!conflict}>{busy ? '正在交卷…' : '确认交卷'}</button>
    </form></>;
  return <><ExamHeading title={attempt.title} sub={`建议用时 ${attempt.estimatedMinutes} 分钟`}>
    <button className="button secondary" disabled={busy} onClick={() => void jump('/exams')}>保存并返回试卷库</button>
  </ExamHeading><div className="two-col exam-layout"><section className="panel">
    <div className="section-caption"><span className="tag">第 {current.itemNo} / {attempt.items.length} 题</span><span className="tag">{questionType(current)} · {current.max} 分</span></div>
    <h2 className="question-title">{readablePrompt(current.prompt)}</h2>
    <fieldset className="exam-input" disabled={busy || !!conflict}>
      <ResponseFields key={current.itemNo} question={{ ...current, id: current.questionId, blanks: Array.from({ length: current.blankCount }) }}
        value={value(current) ?? ''} onChange={(response: string) => draft.change(current, response)} labelPrefix="exam-" />
    </fieldset>
    <p className="answer-footer" role="status">{saving ? '正在保存…' : draft.hasUnsaved ? '有未保存的输入' : isAnswered(current) ? '本题作答已保存' : '本题尚未作答'}</p>
    {syncNotice}<div className="exam-actions">
      <button className="button secondary" disabled={current.itemNo === 1 || busy || !!conflict} onClick={() => void draft.flush(current.itemNo - 1)}>上一题</button>
      {current.itemNo < attempt.items.length && <button className="button" disabled={busy || !!conflict} onClick={() => void draft.flush(current.itemNo + 1)}>下一题</button>}
    </div>
  </section><aside className="stack"><section className="panel">
    <h2>本套答题卡</h2><p>已答 {answered} / {attempt.items.length} 题 · <Elapsed {...attempt} /></p>
    <progress className="exam-progress" aria-label="本套答题完成度" max={attempt.items.length} value={answered} />
    {groups.map(label => <section className="exam-sheet-group" key={label}><h3>{label} <small>{attempt.items.filter(item => questionType(item) === label).length} 道</small></h3>
      <div className="answer-sheet">{attempt.items.filter(item => questionType(item) === label).map(item => <button type="button" key={item.itemNo}
        aria-current={item.itemNo === current.itemNo ? 'step' : undefined} aria-label={`第 ${item.itemNo} 题，${label}，${isAnswered(item, value(item)) ? '已答' : '未答'}`}
        className={`${item.itemNo === current.itemNo ? 'current' : ''} ${isAnswered(item, value(item)) ? 'answered' : ''}`}
        disabled={busy || !!conflict} onClick={() => void draft.flush(item.itemNo)}>{item.itemNo}</button>)}</div></section>)}
    <button className="button" disabled={busy || !!conflict} onClick={() => void jump('/exams/confirm/' + attempt.id)}>查看交卷清单</button>
  </section><section className="panel exam-actions">
    <button className="button secondary" disabled={busy} onClick={() => void jump('/print/paper/' + attempt.id)}>打印或下载空白卷</button>
    <button className="text-button" disabled={busy || !!conflict} onClick={() => void finish('reveal')}>放弃作答，直接查看答案</button>
  </section></aside></div></>;
}
