import { useRef, useState, type ReactNode } from 'react';
import type { BankItem } from './api';
import { answerText, examKinds, examUrl, kindLabel, questionType, readablePrompt, referenceText, reportPath, runPath, sumPoints, useExamLoad,
  type ExamAttempt, type ExamReport, type KnowledgeTopic } from './exam';
import { ExamHeading, ExamLoad } from './ExamPages';
import stylesheet from './print.css?raw';
import './print.css';

type Mastery = Record<string, { status: string; questionVersion?: number }>;
const statuses: Record<string, string> = { new: '未接触', pending: '待自评', weak: '想不起来', fuzzy: '有点模糊', good: '能独立回忆' };
const order = ['weak', 'fuzzy', 'pending', 'new', 'good'];
export function knowledgeMastery(id: string, groups: BankItem[], practice: Mastery) {
  const items = groups.filter(group => group.topic === id).flatMap(group => [group, ...(group.variants ?? []) as BankItem[]]);
  const states = items.map(item => {
    const value = practice[item.id];
    return value?.questionVersion === item.version ? value.status : 'new';
  });
  return order.find(state => states.includes(state)) ?? 'new';
}

export function KnowledgeDetails({ topic, compact = false }: { topic: KnowledgeTopic; compact?: boolean }) {
  return <>{!compact && <p className="knowledge-overview">{topic.card?.overview}</p>}
    <p className="knowledge-points">{topic.card?.points.map(point => {
      const before = point.cue + '：';
      const detail = point.detail.startsWith(before) ? point.detail.slice(before.length) : point.detail;
      return <span key={point.id}><strong>{point.cue}</strong>：{detail}{' '}</span>;
    })}</p>
  </>;
}

function saveHtml(node: HTMLElement, title: string) {
  const documentOut = document.implementation.createHTMLDocument(title);
  documentOut.documentElement.lang = 'zh-CN';
  const charset = documentOut.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  documentOut.head.prepend(charset);
  const style = documentOut.createElement('style');
  style.textContent = stylesheet;
  documentOut.head.append(style);
  documentOut.body.append(documentOut.importNode(node, true));
  const url = URL.createObjectURL(new Blob(['<!doctype html>\n', documentOut.documentElement.outerHTML], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = title + '.html'; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PrintFrame({ title, back, printable = true, controls, children }: {
  title: string; back: string; printable?: boolean; controls?: ReactNode; children: ReactNode;
}) {
  const page = useRef<HTMLElement>(null);
  return <div className="print-host">
    <div className="print-no-output exam-actions">
      <a className="button secondary" href={'#' + back}>返回</a>
      <button type="button" className="button" disabled={!printable} onClick={() => window.print()}>打印 / 保存 PDF</button>
      <button type="button" className="button secondary" disabled={!printable} onClick={() => { if (page.current) saveHtml(page.current, title); }}>下载 HTML</button>
    </div>{controls && <div className="print-no-output">{controls}</div>}
    <article className="a4-page" ref={page}><header className="a4-heading"><h1>{title}</h1></header>{children}</article>
  </div>;
}

export function ExamPrint({ id, mode }: { id: string; mode: 'paper' | 'answers' | 'report' }) {
  const request = useExamLoad<{ attempt?: ExamAttempt; report?: ExamReport }>(
    examUrl + '/' + encodeURIComponent(id) + (mode === 'paper' ? '' : '/report'),
  );
  const exam = request.data?.attempt ?? request.data?.report;
  if (!exam) return <><ExamHeading title="打印与下载"><a className="button secondary" href="#/exams">返回试卷库</a></ExamHeading><ExamLoad {...request} /></>;
  const back = exam.state === 'draft' ? runPath(id) : exam.state === 'replaced' ? '/exams' : reportPath(id);
  if (mode === 'paper') {
    const sections = examKinds.map(kind => ({ kind, items: exam.items.filter(item => item.kind === kind) })).filter(section => section.items.length);
    const instructions = { choice: '将正确选项填入括号。', judgment: '在括号内填写“√”或“×”。', fill: '在题干横线上填写答案。', short: '在题后留白处作答。' };
    return <PrintFrame title={exam.title} back={back}>
      <p className="a4-meta">建议用时 {exam.estimatedMinutes} 分钟　共 {exam.items.length} 题　满分 {exam.maxScore} 分</p>
      <div className="paper-id"><span>姓名 ____________</span><span>日期 ____________</span><span>得分 ____________</span></div>
      <table className="paper-scores"><thead><tr><th scope="col">题型</th>{sections.map(section => <th scope="col" key={section.kind}>{kindLabel[section.kind]}</th>)}<th scope="col">合计</th></tr></thead>
      <tbody><tr><th scope="row">满分</th>{sections.map(section => <td key={section.kind}>{sumPoints(section.items)}</td>)}<td>{exam.maxScore}</td></tr>
      <tr><th scope="row">得分</th>{sections.map(section => <td key={section.kind}>　</td>)}<td>　</td></tr></tbody></table>
      {sections.map((section, index) => <section key={section.kind} className="a4-section">
        <h2>{'一二三四'[index]}、{kindLabel[section.kind]} <small>共 {section.items.length} 题，{sumPoints(section.items)} 分</small></h2>
        <p className="a4-instructions">{instructions[section.kind]}</p>
        {section.items.map(item => <section className="a4-question" data-paper-item={item.itemNo} key={item.itemNo}>
          <h3><strong>{item.itemNo}.</strong> {item.kind === 'choice' && item.multiple && '【多选】'}
            {item.prompt.split(/(\{\{\d+\}\})/).map((part, i) => /^\{\{\d+\}\}$/.test(part) ? <span className="a4-blank" key={i}>________</span> : part)}
            {(item.kind === 'choice' || item.kind === 'judgment') && ' （　　）'} <small>（{item.max} 分）</small></h3>
          {item.choices.length > 0 && <div className={'a4-choices' + (item.choices.some(choice => choice.text.length > 35) ? ' long' : '')}>
            {item.choices.map(choice => <p key={choice.id}>{choice.id}. {choice.text}</p>)}</div>}
          {item.kind === 'short' && <div className="a4-lines" aria-label="答题留白">
            {Array.from({ length: item.max >= 10 ? 9 : 6 }, (_, index) => <div key={index} />)}</div>}
        </section>)}
      </section>)}
    </PrintFrame>;
  }
  const report = request.data?.report;
  if (!report || (mode === 'report' && report.state !== 'submitted')) return <><ExamHeading title="当前答卷没有在线复盘" />
    <a className="button secondary" href={'#' + back}>返回答卷</a></>;
  const isReport = mode === 'report';
  return <PrintFrame title={report.title + (isReport ? ' · 答卷复盘' : ' · 参考答案')} back={back}>
    <p className="a4-meta">共 {report.items.length} 题　原卷满分 {report.maxScore} 分
      {isReport && `　参考得分 ${report.totalScore ?? '待评阅'}`}</p>
    {report.items.map(item => <section className="a4-explained" key={item.itemNo} data-paper-item={item.itemNo}>
      <h2>{item.itemNo}. {readablePrompt(item.prompt)} <small>（{questionType(item)} · {item.max} 分）</small></h2>
      {item.choices.length > 0 && <div className="a4-choices">{item.choices.map(choice => <p key={choice.id}>{choice.id}. {choice.text}</p>)}</div>}
      {isReport && <p><strong>原答</strong> {answerText(item) || '未作答'} · <strong>得分</strong> {item.score ?? '待评阅'}</p>}
      <p><strong>参考答案</strong> {referenceText(item)}</p>
      {item.reference.explanation && <p>{item.reference.explanation}</p>}
      {item.reference.rubric.length > 0 && <ul>{item.reference.rubric.map(point => <li key={point.id}>{point.text}（{point.max} 分）</li>)}</ul>}
    </section>)}
  </PrintFrame>;
}

const initialFilters = { query: '', category: '', priority: '', mastery: '', sort: 'priority' };
export function KnowledgePrint({ topics, groups, practice }: { topics: KnowledgeTopic[]; groups: BankItem[]; practice: Mastery }) {
  const cards = topics.filter(topic => topic.card);
  const [draft, setDraft] = useState(initialFilters), [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const mastery = new Map(cards.map(topic => [topic.id, knowledgeMastery(topic.id, groups, practice)]));
  const matching = (values: typeof filters) => cards.filter(topic => {
    const status = mastery.get(topic.id)!;
    const content = [topic.id, topic.title, topic.card?.overview, ...(topic.card?.points.map(point => point.detail) ?? [])].join(' ');
    return (!values.category || topic.category === values.category) && (!values.priority || topic.priority === values.priority) &&
      (!values.query.trim() || content.toLowerCase().includes(values.query.trim().toLowerCase())) &&
      (!values.mastery || (values.mastery === 'weakAll' ? ['weak', 'fuzzy'].includes(status) : status === values.mastery));
  }).sort((a, b) => {
    if (values.sort === 'title') return a.title.localeCompare(b.title, 'zh-CN');
    if (values.sort === 'category') return (a.category ?? '').localeCompare(b.category ?? '', 'zh-CN');
    if (values.sort === 'mastery') return order.indexOf(mastery.get(a.id)!) - order.indexOf(mastery.get(b.id)!);
    return ['S','A','B'].indexOf(a.priority ?? 'B') - ['S','A','B'].indexOf(b.priority ?? 'B');
  });
  const list = matching(filters), chosen = list.filter(topic => selected === null || selected.has(topic.id));
  const categories = [...new Set(cards.map(topic => topic.category).filter(Boolean))];
  const set = (key: keyof typeof draft, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  const controls = <section className="panel print-filter"><form onSubmit={event => {
    event.preventDefault(); setFilters(draft); setSelected(new Set(matching(draft).map(topic => topic.id)));
  }}><div className="print-filter-fields">
    <label>关键词<input value={draft.query} onChange={event => set('query', event.target.value)} /></label>
    <label>主题分类<select value={draft.category} onChange={event => set('category', event.target.value)}>
      <option value="">全部</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
    <label>优先级<select value={draft.priority} onChange={event => set('priority', event.target.value)}><option value="">全部</option>
      {['S','A','B'].map(priority => <option key={priority}>{priority}</option>)}</select></label>
    <label>掌握程度<select value={draft.mastery} onChange={event => set('mastery', event.target.value)}><option value="">全部</option>
      <option value="weakAll">仅看薄弱</option>{Object.entries(statuses).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
    <label>排序<select value={draft.sort} onChange={event => set('sort', event.target.value)}>
      <option value="priority">优先级</option><option value="category">主题分类</option><option value="mastery">薄弱优先</option><option value="title">主题标题</option></select></label>
  </div><div className="exam-actions"><button className="button">应用筛选</button>
    <button type="button" className="button secondary" onClick={() => setSelected(new Set())}>清空已选</button><span role="status">已选 {chosen.length} / {list.length} 项</span></div>
  </form>
  {list.length ? <div className="print-selection">{list.map(topic => <label key={topic.id} className="check-line">
    <input type="checkbox" checked={selected === null || selected.has(topic.id)} onChange={event => {
      const next = new Set(selected ?? list.map(item => item.id));
      if (event.target.checked) next.add(topic.id); else next.delete(topic.id);
      setSelected(next);
    }} /><span>{topic.priority} · {topic.id} · {topic.title}</span></label>)}</div> : <p className="muted">没有符合筛选的知识点。</p>}
  </section>;
  return <PrintFrame title="备考有方知识提纲" back="/knowledge" printable={chosen.length > 0} controls={controls}>
    {chosen.map(topic => <section className="a4-knowledge" key={topic.id}>
      <h2>{topic.priority} · {topic.id} · {topic.title}</h2><KnowledgeDetails topic={topic} compact />
    </section>)}
  </PrintFrame>;
}
