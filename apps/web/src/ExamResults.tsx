import { useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import { answerText, examDate, examUrl, questionType, readablePrompt, referenceText, reportPath, useExamLoad,
  type ExamHistory, type ExamReport, type ExamSummary, type ReportItem } from './exam';
import { ExamHeading, ExamLoad } from './ExamPages';
import seal from './assets/full-marks-seal.png';

const scoreLabel = (entry: ExamSummary) => entry.state === 'answer_only' ? '已看答案 · 纸笔自核' :
  entry.scoreState === 'scored' ? '已评阅' : '待评阅';
export function ExamRecords() {
  const request = useExamLoad<ExamHistory>(examUrl);
  const [extra, setExtra] = useState<ExamHistory | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const records = [...(request.data?.items ?? []), ...(extra?.items ?? [])];
  const next = extra ? extra.nextCursor : request.data?.nextCursor;
  const more = async () => {
    if (!next || busy) return;
    setBusy(true); setError('');
    try {
      const page = await api.request<ExamHistory>(examUrl + '?before=' + encodeURIComponent(next));
      setExtra(previous => ({ ...page, items: [...(previous?.items ?? []), ...page.items] }));
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  return <><ExamHeading title="答题记录"><a className="button secondary" href="#/exams">返回试卷库</a></ExamHeading>
    {!request.data ? <ExamLoad {...request} /> : records.length ? <div className="record-paper-grid">{records.map(entry =>
      <RecordCard initial={entry} key={entry.id} />)}</div> : <section className="panel empty"><h2>还没有模拟答卷记录</h2><p>交卷或确认查看答案后，这里会保留本套试卷。</p>
      <a className="button" href="#/exams">选择试卷</a></section>}
    {error && <p role="alert">{error}</p>}{next && <button className="button secondary" disabled={busy} onClick={() => void more()}>加载更多</button>}</>;
}

function RecordCard({ initial }: { initial: ExamSummary }) {
  const [entry, setEntry] = useState(initial), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const paper = entry.state === 'answer_only';
  const save = async (score: number | null) => {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    const endpoint = examUrl + '/' + entry.id;
    try {
      const { report } = await api.request<{ report: ExamReport }>(endpoint + '/paper-score', 'PUT', { score, expectedRevision: entry.revision });
      setEntry(report); setNotice('得分已保存'); return true;
    } catch (error) {
      setError((error as Error).message);
      if (error instanceof ApiError && error.status === 409) {
        const latest = await api.request<{ report: ExamReport }>(endpoint + '/report').catch(() => null);
        if (latest) setEntry(latest.report);
      }
      return false;
    } finally { setBusy(false); }
  };
  return <article className="record-paper">
    <div className="record-paper-heading"><span>{examDate(entry.endedAt)}</span><span>{scoreLabel(entry)}</span></div>
    <div className="record-paper-title"><h2><a className="record-link" href={'#' + reportPath(entry.id)}>{entry.title}</a></h2>
      {entry.percent === null ? <span className="record-ungraded">{paper ? '未填分' : '待评阅'}</span> :
        <span className="record-mark"><strong>{entry.percent}</strong><small>百分制</small></span>}</div>
    {paper && <ScoreForm label="手填本次原卷得分" max={entry.maxScore} score={entry.totalScore} busy={busy} save={save} />}
    <div className="record-paper-footer"><p>原卷 {entry.totalScore ?? '—'} / {entry.maxScore} 分</p>
      {paper && entry.totalScore !== null && <p>纸笔手填成绩</p>}
      {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="warning-copy">{error}</p>}
      {entry.isPerfect && <img src={seal} loading="lazy" alt="满分章" width="74" height="74" />}</div>
  </article>;
}

export function ExamReportPage({ id, visibleQuestions, refreshStudy }: {
  id: string; visibleQuestions: Set<string>; refreshStudy: () => void;
}) {
  const request = useExamLoad<{ report: ExamReport }>(examUrl + '/' + encodeURIComponent(id) + '/report');
  return request.data ? <Report key={id} initial={request.data.report} visibleQuestions={visibleQuestions} refreshStudy={refreshStudy} /> :
    <><ExamHeading title="本次答卷与复盘"><a className="button secondary" href="#/exams/records">返回答题记录</a></ExamHeading><ExamLoad {...request} /></>;
}

function Report({ initial, visibleQuestions, refreshStudy }: {
  initial: ExamReport; visibleQuestions: Set<string>; refreshStudy: () => void;
}) {
  const [report, setReport] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const endpoint = examUrl + '/' + report.id, paper = report.state === 'answer_only';
  const mutate = async (path: string, method: 'POST' | 'PUT', body?: object) => {
    if (busy) return false;
    setBusy(true); setError(''); setStatus('');
    try {
      const result = await api.request<{ report?: ExamReport; review?: { dueOn: string }; existing?: boolean }>(
        endpoint + path, method, body && { ...body, expectedRevision: report.revision },
      );
      if (result.report) { setReport(result.report); setStatus('得分已保存'); }
      if (result.review) {
        setStatus((result.existing ? '沿用已有复练' : '已安排复练') + ' · ' + result.review.dueOn);
        refreshStudy();
        const latest = await api.request<{ report: ExamReport }>(endpoint + '/report');
        setReport(latest.report);
      }
      return true;
    } catch (error) {
      setError((error as Error).message);
      if (error instanceof ApiError && error.status === 409) {
        const latest = await api.request<{ report: ExamReport }>(endpoint + '/report').catch(() => null);
        if (latest) setReport(latest.report);
      }
      return false;
    } finally { setBusy(false); }
  };
  return <><ExamHeading title={paper ? '本卷参考答案' : '本次答卷与复盘'} sub={report.title}>
    <a className="button secondary" href="#/exams/records">返回答题记录</a>
    <a className="button secondary" href={'#/print/paper/' + report.id}>空白卷</a>
    <a className="button secondary" href={'#/print/answers/' + report.id}>打印或下载答案</a>
    {!paper && <a className="button secondary" href={'#/print/report/' + report.id}>打印或下载复盘</a>}
  </ExamHeading>
  <section className="panel exam-report-overview"><div><span className="tag">{scoreLabel(report)}</span>
    <h2>{report.totalScore === null ? paper ? '尚未填写得分' : '待评阅' : `${report.totalScore} / ${report.maxScore} 分`}</h2>
    {report.percent !== null && <p>百分制 {report.percent} 分</p>}
    {!paper && <p>客观参考分 {report.objectiveScore} / {report.objectiveMaxScore} · 已答 {report.answeredCount} / {report.items.length} 题</p>}
  </div>{paper && <ScoreForm label="手填本次原卷得分" max={report.maxScore}
    score={report.totalScore} busy={busy} save={value => mutate('/paper-score', 'PUT', { score: value })} />}
  </section>
  <div className="exam-feedback">{error && <p className="warning-copy" role="alert">{error}</p>}{status && <p role="status">{status}</p>}</div>
  <div className="stack">{report.items.map(item => <details key={item.itemNo} className="panel exam-review-item" open={paper || undefined}>
    <summary><span className="tag">{item.itemNo}. {questionType(item)}</span><strong>{readablePrompt(item.prompt)}</strong>
      {!paper && <span>{item.score === null ? '待评阅' : `${item.score} / ${item.max}`}</span>}</summary>
    <div className="exam-review-detail">
      {item.choices.length > 0 && <ul className="exam-review-options">{item.choices.map(choice => <li key={choice.id}>{choice.id}. {choice.text}</li>)}</ul>}
      {(!paper || item.response !== null) && <><h3>{paper ? '结束作答前保留的原答' : '原答'}</h3>
        <p className="preserve">{answerText(item) || '本题未作答。'}</p></>}
      <h3>参考答案</h3><p className="preserve">{referenceText(item)}</p>
      {item.reference.explanation && <><h3>解析</h3><p className="preserve">{item.reference.explanation}</p></>}
      {!paper && item.objectiveScore !== null && item.response !== null && <p className="muted">规则核对 {item.objectiveScore} / {item.max} 分</p>}
      {!paper && item.response !== null && (item.kind === 'short' ?
        <RubricForm item={item} busy={busy}
          save={pointScores => mutate('/items/' + item.itemNo + '/grade', 'PUT', { pointScores })} /> :
        <ScoreForm label="人工核对参考分" max={item.max}
          score={item.scoreSource === 'objective_override' ? item.score : null} busy={busy} clearLabel="恢复规则计分"
          save={score => mutate('/items/' + item.itemNo + '/grade', 'PUT', { score })} />)}
      {((paper || item.response === null) && item.reference.rubric.length > 0) && <ul>
        {item.reference.rubric.map(point => <li key={point.id}>{point.text}（{point.max} 分）</li>)}</ul>}
      <div className="exam-actions">
        {visibleQuestions.has(item.questionId) && <a className="button secondary small" href={'#/practice/question/' + item.questionId}>去练关联题目</a>}
        {item.review ? <span className="tag">已安排复练 · {item.review.dueOn}</span> : item.canScheduleReview &&
          <button className="button secondary small" disabled={busy} onClick={() => void mutate('/items/' + item.itemNo + '/review', 'POST')}>安排次日复练</button>}
      </div>
    </div>
  </details>)}</div></>;
}

function ScoreForm({ label, max, score, busy, clearLabel = '清空得分', save }: {
  label: string; max: number; score: number | null; busy: boolean; clearLabel?: string; save: (score: number | null) => Promise<boolean>;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const value = typed ?? (score === null ? '' : String(score));
  const submitScore = async (value: number | null) => { if (await save(value)) setTyped(null); };
  const saveScore = (event: FormEvent) => { event.preventDefault(); if (value !== '' && !busy) void submitScore(Number(value)); };
  return <form className="exam-score-form" onSubmit={saveScore}><label>{label}
    <input type="number" min={0} max={max} step="0.01" required disabled={busy} value={value} onChange={event => setTyped(event.target.value)} />
  </label><span>/ {max} 分</span><button className="button secondary small" disabled={busy}>保存得分</button>
    {score !== null && <button className="text-button" type="button" disabled={busy} onClick={() => void submitScore(null)}>{clearLabel}</button>}</form>;
}

function RubricForm({ item, busy, save }: { item: ReportItem; busy: boolean; save: (points: (number | null)[]) => Promise<boolean> }) {
  const [typed, setTyped] = useState<string[] | null>(null);
  const scores = typed ?? item.reference.rubric.map((_, i) => item.pointScores?.[i]?.toString() ?? '');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!busy && await save(scores.map(value => value === '' ? null : Number(value)))) setTyped(null);
  };
  return <form className="exam-rubric" onSubmit={submit}>
    <h3>按要点自评</h3>{item.reference.rubric.map((point, i) => <label key={point.id} className="rubric-row">
      <span>{point.text}（{point.max} 分）</span>
      <input type="number" aria-label={`第 ${item.itemNo} 题评分点 ${i + 1}`} min={0} max={point.max} step="0.01" placeholder="待评" disabled={busy}
        value={scores[i]} onChange={event => setTyped(scores.map((value, index) => i === index ? event.target.value : value))} />
    </label>)}<button className="button secondary small" disabled={busy}>保存本题自评</button></form>;
}
