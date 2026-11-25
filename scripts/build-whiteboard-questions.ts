// Curated questions only: no network, model calls, or automatic factual expansion.
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

type Point = { id: string; cue: string; summary: string; detail: string };
type Knowledge = { id: string; topicId: string; version: number; title: string; points: Point[] };
type ChoiceSpec = [number, string, string, string, string, string];
type Spec = { topic: string; choices: ChoiceSpec[]; judgment: [number, string, boolean]; fill: [number, string] };
type DifficultySpec = {topic:string;choices:[number,number,number,string,string,string,string,string,string][];judgment:[number,number,string,boolean,string]};
type Question = Record<string, any>;
const file = 'prototypes/whiteboard/data.js';
const context = { window: {} as any };
runInNewContext(readFileSync(file, 'utf8'), context);
const data = context.window.beikaoData;
const specs: Spec[] = JSON.parse(readFileSync('prototypes/whiteboard/knowledge-question-specs.json', 'utf8'));
const difficultySpecs: DifficultySpec[] = JSON.parse(readFileSync('prototypes/whiteboard/knowledge-difficulty-specs.json', 'utf8'));
const cards = Object.values(data.knowledgeCards) as Knowledge[];
assert.equal(specs.length, cards.length);
assert.equal(new Set(specs.map(s => s.topic)).size, cards.length);
const generated: Question[] = [];
for (const [topicIndex, spec] of specs.entries()) {
  const card = cards.find(k => k.topicId === spec.topic)!;
  assert(card, 'Unknown topic: ' + spec.topic);
  const base = (kind: string, number: number, pointIndex: number, prompt: string): Question => {
    const point = card.points[pointIndex - 1];
    assert(point, 'Unknown source point');
    return {
      id: `kb-${spec.topic}-${kind}-${number}`, kind, type: {choice:'选择',judgment:'判断',fill:'填空'}[kind],
      title: prompt, prompt, topic: spec.topic, knowledgeId: card.id,
      priority: data.topics[spec.topic].tier, max: 2, version: 1, difficulty:'basic',
      contentType: 'question', questionRole: 'original', parentId: '',
      sourceType: '教学编题', sourceUrl: '', simulation: true,
      origin: 'knowledge-derived-v1', sourceKnowledgeVersion: card.version,
      sourcePointIds: [point.id], sourceEvidence: [{pointId: point.id, quote: point.detail}],
      explanation: `依据知识卡「${card.title}」的「${point.summary}」要点：${point.detail}`,
      explanationRefs: [], policyBasisRefs: [],
    };
  };
  const level = difficultySpecs.find(s=>s.topic===spec.topic)!;
  assert(level);
  const addConfusion = (q:Question, otherIndex:number, reason:string) => {
    const other=card.points[otherIndex-1]; assert(other);
    q.difficulty='challenging'; q.confusionExplanation=reason;
    if(!q.sourcePointIds.includes(other.id)){
      q.sourcePointIds.push(other.id);q.sourceEvidence.push({pointId:other.id,quote:other.detail});
    }
    q.explanation=q.sourceEvidence.map((e:any)=>`知识卡「${card.title}」· ${e.pointId}：${e.quote}`).join('\n')+'\n辨析：'+reason;
  };
  spec.choices.forEach((original, index) => {
    const advanced=level.choices.find(row=>row[0]===index+1);
    const [point,prompt,correct,...distractors]=advanced?[advanced[1],advanced[3],advanced[4],advanced[5],advanced[6],advanced[7]] as ChoiceSpec:original;
    const correctIndex = (topicIndex + index * 2) % 4;
    const choices = [...distractors]; choices.splice(correctIndex, 0, correct);
    const q = base('choice', index + 1, point, prompt);
    q.multiple = false;
    q.choices = choices.map((text, i) => ({id: 'ABCD'[i], text}));
    q.correctIds = ['ABCD'[correctIndex]];
    if(advanced)addConfusion(q,advanced[2],advanced[8]);
    assert.equal(new Set(choices).size, 4);
    generated.push(q);
  });
  const [point, prompt, correct] = spec.judgment;
  generated.push({...base('judgment', 1, point, prompt), correct: correct ? '正确' : '错误'});
  const [hardPoint,otherPoint,hardPrompt,hardCorrect,reason]=level.judgment;
  const hard=base('judgment',2,hardPoint,hardPrompt);hard.correct=hardCorrect?'正确':'错误';
  addConfusion(hard,otherPoint,reason);generated.push(hard);
  const [fillPoint, answer] = spec.fill;
  const body = card.points[fillPoint - 1].detail.replace(/^[^：｜]+[：｜]/, '');
  assert.equal(body.split(answer).length, 2, 'Fill answer must occur once in source');
  generated.push({
    ...base('fill', 1, fillPoint, `根据「${card.title}」的知识要点，补全下句：${body.replace(answer, '{{1}}')}`),
    blanks: [{accepted: [answer]}],
  });
}
assert.equal(generated.length, 115);
assert.equal(new Set(generated.map(q => q.kind + '|' + q.prompt)).size, generated.length);
// Explicit previous-content rules upgrade only untouched bundled content in cached browsers.
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
data.questionUpdates ||= [];
for(const q of generated){
  const previous=data.bank.find((old:Question)=>old.id===q.id);
  if(!previous)continue;
  const {version:oldVersion,...oldContent}=previous;const {version,...content}=q;
  if(JSON.stringify(stable(oldContent))===JSON.stringify(stable(content))){q.version=oldVersion;continue;}
  q.version=oldVersion+1;
  data.questionUpdates.push({id:q.id,previous:structuredClone(previous),targetVersion:q.version});
}
// Preserve every existing item and revision. Only this reproducible batch is replaced.
data.bank = [...data.bank.filter((q: Question) => q.origin !== 'knowledge-derived-v1'), ...generated];
for (const card of cards) {
  const topic = data.topics[card.topicId];
  topic.questionIds = [...new Set([...topic.questionIds, ...generated.filter(q => q.topic === card.topicId).map(q => q.id)])];
}
writeFileSync(file, '// Explicitly classified teaching content from the supplied HTML and alpha.3 samples.\nwindow.beikaoData = ' + JSON.stringify(data, null, 2) + ';\n');
const labels = {choice:'单选',judgment:'判断',fill:'填空'};
const lines = ['# 知识点客观题编制清单', '', '现有 115 道知识卡教学编题：46 道单选、46 道判断、23 道填空。覆盖现有 23 张知识卡。不是官方真题，不增补政策年份、法条、数据或外部知识。', '', '单选保留 12 道基础题，34 道升级为相邻要点辨析题；判断包含 23 道基础题及 23 道新增辨析题。辨析题给出相邻要点的原文与差别说明。难度是编题预设，未用真实作答数据标定。', '', '编题规格：`prototypes/whiteboard/knowledge-question-specs.json` 与 `knowledge-difficulty-specs.json`。重建：`node scripts/build-whiteboard-questions.ts`。旧浏览器只追加缺失题目或升级内容完全匹配的内置旧题，保留维护修订、下架状态和答卷快照。', ''];
for (const card of cards) {
  lines.push(`## ${card.topicId} ${card.title}`, '');
  for (const q of generated.filter(q => q.topic === card.topicId)) {
    const answer = q.kind === 'choice' ? q.correctIds[0] + ' · ' + q.choices.find((c: any) => c.id === q.correctIds[0]).text : q.kind === 'fill' ? q.blanks[0].accepted[0] : q.correct;
    lines.push(`### ${q.id} · ${labels[q.kind as keyof typeof labels]} · ${q.difficulty==='challenging'?'辨析':'基础'} · v${q.version}`, '', q.prompt, '');
    if (q.kind === 'choice') lines.push(...q.choices.map((c: any) => `- ${c.id}. ${c.text}`), '');
    lines.push(`参考答案：${answer}`, '', `依据：${card.id} · v${card.version} · ${q.sourcePointIds.join('、')}`, '', ...q.sourceEvidence.map((e:any)=>`> ${e.quote}`), '');
    if(q.confusionExplanation)lines.push(`辨析：${q.confusionExplanation}`,'');
  }
}
writeFileSync('docs/知识点客观题编制清单.md', lines.join('\n').trimEnd() + '\n');
console.log(JSON.stringify({added: generated.length, total: data.bank.length, topics: cards.length}));
