import { useId, useState } from 'react';
import type { BankItem } from './api';
import type { KnowledgeTopic } from './exam';
import { ExamHeading } from './ExamPages';
import { knowledgeMastery } from './StudyPrint';

const tiers = { S: 'S 级 · 核心必学', A: 'A 级 · 重点巩固', B: 'B 级 · 补充拓展' } as const;
export const knowledgeTierTitle = (id: string) => Object.hasOwn(tiers, id) ? tiers[id as keyof typeof tiers] : undefined;
const statuses: Record<string, string> = { new: '未接触', pending: '待自评', weak: '想不起来', fuzzy: '有点模糊', good: '能独立回忆' };
type Card = NonNullable<KnowledgeTopic['card']>;

function TopicSummary({ card }: { card: Card }) {
  const [expanded, setExpanded] = useState<string>();
  const detailId = useId();
  const point = card.points.find(item => item.id === expanded);
  const cuePrefix = point?.cue + '：';
  return <>
    <div className="recall-summary" role="group" aria-label="速记提纲，点击查看解释">
      {card.points.map(item => <button className="recall-point" key={item.id} type="button" aria-expanded={item.id === expanded}
        aria-controls={detailId} onClick={() => setExpanded(item.id === expanded ? undefined : item.id)}>
        {item.cue && <strong>{item.cue}</strong>}<span>{item.summary}</span>
      </button>)}
    </div>
    <section className="recall-detail" id={detailId} aria-live="polite" hidden={!point}>{point && <>
      <h4>{point.summary}</h4><p>{point.detail.startsWith(cuePrefix) ? point.detail.slice(cuePrefix.length) : point.detail}</p>
    </>}</section>
    <details className="knowledge-overview"><summary>展开理解</summary><p>{card.overview}</p></details>
  </>;
}

export function KnowledgeCatalog({ route, topics, groups, practice }: {
  route?: string; topics: KnowledgeTopic[]; groups: BankItem[];
  practice: Record<string, { status: string; questionVersion?: number }>;
}) {
  const cards = topics.filter(topic => topic.card);
  const target = cards.find(topic => topic.id === route);
  const level = target?.priority ?? (Object.hasOwn(tiers, route ?? '') ? route as keyof typeof tiers : null);
  const visible = target ? [target] : cards.filter(card => card.priority === level);
  const mastery = (topic: KnowledgeTopic) => knowledgeMastery(topic.id, groups, practice);
  const assessed = (list: KnowledgeTopic[]) => list.filter(topic => groups.filter(group => group.topic === topic.id)
    .flatMap(group => [group, ...((group.variants || []) as BankItem[])]).some(question => {
      const mark = practice[question.id];
      return mark?.questionVersion === question.version && ['weak', 'fuzzy', 'good'].includes(mark.status);
    })).length;
  const distribution = Object.entries(statuses).map(([id, label], index) => ({
    id, label, count: cards.filter(topic => mastery(topic) === id).length,
    color: ['#fff', '#e4edf5', '#f7c9c1', '#f4df9c', '#badbc2'][index],
  }));
  let start = 0;
  const segments = distribution.map(item => {
    const end = start + 100 * item.count / (cards.length || 1);
    const segment = item.color + ' ' + start + '% ' + end + '%';
    start = end;
    return segment;
  });
  if (!level) return <><ExamHeading title="知识地图" sub={`共 ${cards.length} 个主题。先选优先级，再展开知识主题。`}>
    <a className="button secondary" href="#/print/knowledge">打印或下载知识提纲</a></ExamHeading>
    <div className="topic-grid knowledge-grid">{(Object.keys(tiers) as (keyof typeof tiers)[]).map(tier => {
      const list = cards.filter(card => card.priority === tier), count = assessed(list);
      const groupCount = new Set(list.map(card => card.category ?? card.id)).size;
      return <a className="panel topic-card card-motion" key={tier} href={'#/knowledge/' + tier}>
        <h2>{tiers[tier]}</h2><p>{list.length} 个主题 · {groupCount} 个主题组</p>
        <div className="tier-meter"><p className="small-copy">{count} / {list.length} 个主题已自评</p>
          <progress value={count} max={list.length || 1} aria-label={tier + ' 级主题自评进度'} /></div>
      </a>;
    })}</div>
    <section className="panel knowledge-distribution">
      {cards.length > 0 && <div className="knowledge-pie" aria-hidden="true" style={{ background: 'conic-gradient(' + segments.join(',') + ')' }} />}
      <div><h2>主题完成度 · {assessed(cards)} / {cards.length}</h2><div className="legend">{distribution.map(({ id, label, count }) =>
        <span key={id}><i className={'swatch ' + id} />{label} {count}</span>)}</div></div>
    </section>
    {topics.some(topic => !topic.card) && <section className="panel knowledge-legacy"><h2>基础教学专题</h2><div className="exam-actions">
      {topics.filter(topic => !topic.card).map(topic => <a key={topic.id} className="button secondary" href={'#/knowledge/' + topic.id}>{topic.title}</a>)}
    </div></section>}</>;
  const count = assessed(visible);
  return <><header className="knowledge-level-header"><h1>{target?.title ?? tiers[level]}</h1>
    <div className="knowledge-level-progress"><p>已自评主题 <strong>{count}<span> / {visible.length}</span></strong></p>
      <progress value={count} max={visible.length || 1} aria-label="本级主题进度" /></div>
    <div className="actions"><a className="button secondary small" href="#/knowledge">返回知识地图</a>
      <a className="button secondary small" href="#/print/knowledge">打印或下载知识提纲</a></div>
  </header>
    <div className="stack compact">{visible.map(topic => {
      const status = mastery(topic);
      const hasQuestions = groups.some(group => group.topic === topic.id);
      return <details className="panel topic-group" data-mastery={status} key={topic.id} open={target ? true : undefined}>
        <summary><span className="topic-heading">{topic.title}</span><span className={'tag ' + status}>{statuses[status]}</span>
          <span className="topic-chevron" aria-hidden="true" /></summary>
        <div className="topic-group-content">
          {topic.category && <p className="muted small-copy topic-note">主题组 · {topic.category}</p>}
          <header className="knowledge-card-header"><span className="knowledge-topic-id">{topic.id}</span></header>
          {topic.card && <TopicSummary card={topic.card} />}
          <footer className="knowledge-card-footer"><p className="muted small-copy">来源 · {topic.card?.source}</p>
            {hasQuestions && <a className="button small" href={'#/practice?topic=' + encodeURIComponent(topic.id)}>开始主题自测</a>}
          </footer>
        </div>
      </details>;
    })}</div>{!visible.length && <section className="panel empty"><p>该等级暂时没有已发布的知识卡。</p></section>}</>;
}
