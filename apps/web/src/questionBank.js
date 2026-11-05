import { groups, topics } from './data.js';
export const kinds = { choice: '选择', judgment: '判断', fill: '填空', short: '简答' };
const teaching = { sourceType: '教学编题', sourceUrl: '', status: 'published', version: 1 };
export const defaultBank = [
  ...groups.map(g => ({ ...g, ...teaching, kind: 'short', type: '简答', priority: topics.find(t => t.id === g.topic).priority, max: 5, points: g.points || topics.find(t => t.id === g.topic).points, referenceAnswer: (g.points || topics.find(t => t.id === g.topic).points).join('\n'), explanation: '', variants: g.variants.map(v => ({ ...v, ...teaching, kind: 'short', type: '简答', max: 5, topic: g.topic, priority: 'A', referenceAnswer: v.points.join('\n'), explanation: '' })) })),
  { ...teaching, id: 'g7', kind: 'choice', type: '选择', topic: 'organization', priority: 'S', max: 2, title: '部门重复布置任务时，首先应采取哪项措施？', prompt: '学校跨部门合作中出现重复任务与标准不一，首先应采取哪项措施？', multiple: false, choices: [{ id: 'A', text: '增加汇报层级' }, { id: 'B', text: '明确牵头主体并统一任务要求' }, { id: 'C', text: '取消所有评价标准' }, { id: 'D', text: '让各部门继续独立安排' }], correctIds: ['B'], explanation: '先回应权责边界和协调口径的问题，再安排具体协作。', variants: [] },
  { ...teaching, id: 'g8', kind: 'judgment', type: '判断', topic: 'organization', priority: 'A', max: 2, title: '扁平化管理意味着取消所有组织层级。', prompt: '扁平化管理意味着学校应取消所有组织层级。', correct: '错误', explanation: '减少不必要层级不等于取消所有层级，仍需要明确管理幅度和职责边界。', variants: [] },
  { ...teaching, id: 'g9', kind: 'fill', type: '填空', topic: 'evaluation', priority: 'A', max: 2, title: '在教学过程中收集信息并改进教学，体现了哪类评价？', prompt: '在教学过程中持续收集信息并据此调整教学，体现了{{1}}评价的作用。', blanks: [{ accepted: ['形成性', '形成性评价'] }], explanation: '按维护者列出的可接受答案核对；未列出的同义表述需要人工复核。', variants: [] },
];
export function flattenBank(bank) { return bank.flatMap(g => [{ ...g, parentId: '', parentTitle: '' }, ...(g.variants || []).map(v => ({ ...v, parentId: g.id, parentTitle: g.title, topic: v.topic || g.topic }))]); }
export function publishedBank(bank) { return bank.filter(q => q.status === 'published').map(g => ({ ...g, variants: (g.variants || []).filter(v => v.status === 'published') })); }
export function resolveQuestion(bank, id) {
  for (const group of bank) {
    const q = group.id === id ? group : (group.variants || []).find(v => v.id === id);
    if (q) return { ...q, group, topic: topics.find(t => t.id === (q.topic || group.topic)), points: q.points || [], isVariant: q.id !== group.id };
  }
  return null;
}
export function validateQuestion(q, bank = []) {
  const errors = [];
  if (!kinds[q.kind]) errors.push('请选择题型。');
  if (!q.prompt?.trim()) errors.push('请填写题干。');
  if (!topics.some(t => t.id === q.topic)) errors.push('请选择知识主题。');
  if (!Number.isFinite(Number(q.max)) || Number(q.max) <= 0 || Number(q.max) > 100) errors.push('分值应大于 0 且不超过 100。');
  if (!q.sourceType) errors.push('请选择资料性质。');
  if (['官方材料', '考生回忆'].includes(q.sourceType) && !q.sourceUrl?.trim()) errors.push('官方材料或考生回忆题需填写可追溯的来源链接。');
  if (q.sourceUrl && !/^https?:\/\/[^\s]+$/i.test(q.sourceUrl)) errors.push('来源链接应以 http:// 或 https:// 开头。');
  if (q.kind === 'choice') {
    const choices = q.choices || [], keys = choices.map(x => x.id), answers = q.correctIds || [];
    if (choices.length < 2 || choices.length > 8 || choices.some(x => !x.text.trim())) errors.push('选择题需要 2 至 8 个非空选项。');
    if (new Set(keys).size !== keys.length || new Set(choices.map(x => x.text.trim())).size !== choices.length) errors.push('选项编号和内容不能重复。');
    if (!answers.length || new Set(answers).size !== answers.length || answers.some(id => !keys.includes(id)) || (!q.multiple && answers.length !== 1)) errors.push('请设置与选项对应的正确答案；单选只能选 1 项。');
    if (!q.explanation?.trim()) errors.push('请填写答案解析。');
  }
  if (q.kind === 'judgment' && !['正确', '错误'].includes(q.correct)) errors.push('请选择判断题正确答案。');
  if (q.kind === 'judgment' && !q.explanation?.trim()) errors.push('请填写判断依据。');
  if (q.kind === 'fill') {
    const blanks = q.blanks || [], tokens = [...(q.prompt || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
    if (!blanks.length || blanks.length > 5 || blanks.some(b => !b.accepted?.length || b.accepted.some(a => !a.trim()))) errors.push('每个空都需至少 1 个可接受答案，最多设置 5 个空。');
    if (tokens.length !== blanks.length || blanks.some((_, i) => tokens.filter(t => t === i + 1).length !== 1)) errors.push('题干须按空数标记 {{1}}、{{2}} 等，每个标记出现一次。');
  }
  if (q.kind === 'short' && (!q.referenceAnswer?.trim() || !q.points?.length || q.points.some(p => !p.trim()))) errors.push('简答题需要参考答案和至少 1 个评分要点。');
  if ((q.variants || []).some(v => v.topic && v.topic !== q.topic)) errors.push('原题含有其他主题的变式，请先调整变式归属。');
  if (q.parentId) {
    const parent = bank.find(x => x.id === q.parentId);
    if (!parent || parent.id === q.id) errors.push('请选择有效的所属原题。');
    if ((q.variants || []).length) errors.push('含有关联变式的原题不能移动为其他题的变式。');
    if (parent && parent.topic !== q.topic) errors.push('原题和关联变式应归属同一知识主题。');
  }
  return errors;
}
export function upsertQuestion(bank, value) {
  const existing = flattenBank(bank).find(q => q.id === value.id);
  const { parentId = '', parentTitle, ...fields } = value;
  const question = { ...fields, type: kinds[value.kind], title: value.title?.trim() || value.prompt.trim().slice(0, 65), version: existing ? (existing.version || 1) + 1 : 1, updatedAt: Date.now(), variants: fields.variants || [] };
  let result = bank.filter(g => g.id !== question.id).map(g => ({ ...g, variants: (g.variants || []).filter(v => v.id !== question.id) }));
  if (parentId) result = result.map(g => g.id === parentId ? { ...g, variants: [...g.variants, question] } : g);
  else result.push(question);
  return result;
}
export function updateStatus(bank, id, status) { return bank.map(g => g.id === id ? { ...g, status } : { ...g, variants: (g.variants || []).map(v => v.id === id ? { ...v, status } : v) }); }
export function fillValues(draft, count) { try { const a = JSON.parse(draft || '[]'); return Array.from({ length: count }, (_, i) => Array.isArray(a) ? String(a[i] || '') : ''); } catch { return Array.from({ length: count }, (_, i) => i === 0 ? draft || '' : ''); } }
export function hasResponse(q, draft) { return q.kind === 'fill' ? fillValues(draft, q.blanks.length).some(v => v.trim()) : !!draft?.trim(); }
const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
export function assessQuestion(q, draft) {
  if (!hasResponse(q, draft)) return { state: 'empty' };
  if (q.kind === 'short') return { state: 'manual' };
  if (q.kind === 'fill') {
    const values = fillValues(draft, q.blanks.length), matches = q.blanks.map((b, i) => b.accepted.some(a => normalize(a) === normalize(values[i]))), hits = matches.filter(Boolean).length;
    return { state: hits === matches.length ? 'correct' : hits ? 'partial' : 'incorrect', matches, hits, total: matches.length, score: Math.round(Number(q.max) * hits / matches.length * 100) / 100 };
  }
  const correct = q.kind === 'judgment' ? draft === q.correct : JSON.stringify([...new Set(draft.split(',').filter(Boolean))].sort()) === JSON.stringify([...(q.correctIds || [])].sort());
  return { state: correct ? 'correct' : 'incorrect', score: correct ? Number(q.max) : 0 };
}
export function answerLabel(q, draft) {
  if (q.kind === 'choice') return draft.split(',').filter(Boolean).map(id => id + '. ' + (q.choices.find(c => c.id === id)?.text || '')).join('；');
  if (q.kind === 'fill') return fillValues(draft, q.blanks.length).map((v, i) => `第 ${i + 1} 空：${v || '未答'}`).join('\n');
  return draft;
}
export function questionSnapshot(q) { return { id: q.id, version: q.version || 1, kind: q.kind, type: q.type, prompt: q.prompt, choices: q.choices, correctIds: q.correctIds, correct: q.correct, blanks: q.blanks, referenceAnswer: q.referenceAnswer, points: q.points, max: q.max, explanation: q.explanation }; }
export function masteryStatus(record, question) { return record && (record.questionVersion || 1) !== (question?.version || 1) ? 'pending' : record?.status || 'new'; }
