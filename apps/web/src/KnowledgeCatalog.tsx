import type { BankItem } from './api';
import type { KnowledgeTopic } from './exam';
import { ExamHeading } from './ExamPages';
import { KnowledgeDetails, knowledgeMastery } from './StudyPrint';

const tiers = { S: 'S 级 · 核心必学', A: 'A 级 · 重点巩固', B: 'B 级 · 补充拓展' } as const;
const statuses: Record<string, string> = { new: '未接触', pending: '待自评', weak: '想不起来', fuzzy: '有点模糊', good: '能独立回忆' };

export function KnowledgeCatalog({ route, topics, groups, practice }: {
  route?: string; topics: KnowledgeTopic[]; groups: BankItem[];
  practice: Record<string, { status: string; questionVersion?: number }>;
}) {
  const cards = topics.filter(topic => topic.card);
  const target = cards.find(topic => topic.id === route);
  const level = target?.priority ?? (Object.hasOwn(tiers, route ?? '') ? route as keyof typeof tiers : null);
  const visible = target ? [target] : cards.filter(card => card.priority === level);
  const learned = visible.filter(card => knowledgeMastery(card.id, groups, practice) === 'good').length;
  if (!level) return <><ExamHeading title="知识地图" sub="按优先级进入主题，回顾完整知识卡。">
    <a className="button secondary" href="#/print/knowledge">打印或下载知识提纲</a></ExamHeading>
    <div className="topic-grid knowledge-grid">{(Object.keys(tiers) as (keyof typeof tiers)[]).map(tier =>
      <a className="panel topic-card" key={tier} href={'#/knowledge/' + tier}><h2>{tiers[tier]}</h2><p>{cards.filter(card => card.priority === tier).length} 个主题</p></a>)}</div>
    {topics.some(topic => !topic.card) && <section className="panel knowledge-legacy"><h2>基础教学专题</h2><div className="exam-actions">
      {topics.filter(topic => !topic.card).map(topic => <a key={topic.id} className="button secondary" href={'#/knowledge/' + topic.id}>{topic.title}</a>)}
    </div></section>}</>;
  return <><ExamHeading title={target?.title ?? tiers[level]}><a className="button secondary" href="#/knowledge">返回知识地图</a>
    <a className="button secondary" href="#/print/knowledge">打印或下载知识提纲</a></ExamHeading>
    <div className="knowledge-progress"><progress className="exam-progress" value={learned} max={visible.length || 1} aria-label="知识主题掌握进度" />
      <span>{learned} / {visible.length} 个主题能独立回忆</span></div>
    <div className="stack">{visible.map(topic => {
      const status = knowledgeMastery(topic.id, groups, practice);
      return <details className={'knowledge-row ' + status} key={topic.id} open={target ? true : undefined}>
        <summary><span>{topic.id} · {topic.title}</span><span className="tag">{statuses[status]}</span></summary>
        <div className="knowledge-body"><KnowledgeDetails topic={topic} /><div className="exam-actions">
          {groups.filter(group => group.topic === topic.id).map(question =>
            <a className="button secondary small" href={'#/practice/question/' + question.id} key={question.id}>{question.title}</a>)}
        </div></div>
      </details>;
    })}</div>{!visible.length && <section className="panel empty"><p>该等级暂时没有已发布的知识卡。</p></section>}</>;
}
