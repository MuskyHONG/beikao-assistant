export const levels = {
  new: { label: '未接触', detail: '还没有打开过', className: 'new' },
  pending: { label: '待自评', detail: '已打开，尚未确认掌握程度', className: 'pending' },
  weak: { label: '想不起来', detail: '需要重新理解和提取', className: 'weak' },
  fuzzy: { label: '有点模糊', detail: '能想起部分，还需巩固', className: 'fuzzy' },
  good: { label: '能独立回忆', detail: '这次能够独立展开', className: 'good' },
};

export const topics = [
  { id: 'organization', title: '组织与治理', priority: 'S', desc: '从权责边界到部门协同，把管理结构说清楚。', essence: '组织结构，就是让学校里的人知道：谁能决定、谁来负责、信息怎么走、部门怎样合作、效果由谁检查。', story: '学校准备开展跨学科活动。教务处、年级组都在安排任务，教师却收到两套要求。问题不只在于大家忙，而在于权责边界不清、信息没有对齐。', memory: '权 — 责 — 沟 — 协 — 督', points: ['权：谁有决策权，授权边界是什么。', '责：谁对结果负责，避免空白与重复。', '沟：信息及时准确传递，统一工作口径。', '协：部门共享资源，共同完成任务。', '督：检查效果、收集反馈、及时纠偏。'], answer: '先说明组织结构服务于教育目标，再围绕权责、沟通、协作和监督展开；最后根据学校规模与任务复杂度说明适用条件。不能不看题干就机械写满五点。' },
  { id: 'evaluation', title: '评价与发展', priority: 'A', desc: '理解评价的用途，把评价结果用回教学改进。', essence: '评价不仅要判断结果，还应帮助发现问题并持续改进。', story: '某校只在学期结束后统计考试成绩，无法及时帮助遇到困难的学生。教师增加过程观察、学习反馈和阶段调整，让评价参与学习过程。', memory: '目 — 过 — 证 — 馈 — 改', points: ['目：明确评价目的和标准。', '过：关注学习过程。', '证：收集多方面证据。', '馈：提供具体反馈。', '改：依据结果调整教学。'], answer: '结合评价目标，说明证据如何收集、如何形成反馈，以及反馈将怎样改变后续教学。' },
  { id: 'collaboration', title: '家校社协同', priority: 'A', desc: '厘清参与者责任，让协作落实到具体行动。', essence: '协同育人需要各方知道自己的责任，并用稳定的沟通与行动机制共同支持学生。', story: '学校安排社区实践活动，家长不了解目标，社区不知道如何配合。先明确职责和活动目标，再商定联络人、流程及反馈方式。', memory: '责 — 通 — 联 — 共', points: ['责：明确各方职责和边界。', '通：建立稳定沟通渠道。', '联：整合学校、家庭与社区资源。', '共：围绕学生发展落实共同行动并反馈。'], answer: '从题目中的学生需求出发，明确各方责任、协作方式和评价反馈，避免只写“加强联系”。' },
];

export const groups = [
  { id: 'g1', topic: 'organization', type: '简答', title: '学校组织管理，需要先想清楚哪几件事？', prompt: '请从权责、信息传递和部门协作等角度，说明学校组织管理需要考虑的关键问题。', variants: [{ id: 'g1v1', type: '案例论述', title: '两套任务要求，怎样让部门重新协同？', prompt: '某校推进跨学科项目，教务处与年级组分别布置任务，教师反映要求重复、评价标准不一致。请分析问题并提出可执行的改进措施。', points: ['明确牵头负责人及部门决策、执行边界。', '形成统一任务清单，避免重复布置。', '建立信息沟通与部门协作机制。', '统一评价标准并跟踪教师反馈。'] }, { id: 'g1v2', type: '论述', title: '扁平化管理是否意味着取消所有层级？', prompt: '结合学校管理实际，论述扁平化组织的适用条件与可能面临的问题。', points: ['扁平化是减少不必要层级，不等于取消所有层级。', '分析信息传递与响应效率的变化。', '说明管理幅度、职责边界与协调负担。', '结合学校规模和任务说明适用条件。'] }] },
  { id: 'g2', topic: 'organization', type: '简答', title: '怎样避免学校部门之间出现责任空白？', prompt: '请提出避免责任空白和重复指挥的具体做法。', points: ['明确决策者和执行责任人。', '使用职责清单界定边界与交接事项。', '遇到跨部门事项确定牵头主体。', '建立检查反馈和责任调整机制。'], variants: [] },
  { id: 'g3', topic: 'evaluation', type: '简答', title: '形成性评价怎样帮助改进教学？', prompt: '说明形成性评价的主要作用，并给出一个教学应用例子。', variants: [] },
  { id: 'g4', topic: 'evaluation', type: '案例分析', title: '只看期末成绩，会遗漏哪些信息？', prompt: '某校主要依据期末考试成绩评价教学。请说明局限及改进思路。', points: ['单次结果难以完整反映学习过程。', '增加过程观察、作品和阶段反馈等证据。', '关注学生起点差异与发展变化。', '将评价结果用于教学调整。'], variants: [] },
  { id: 'g5', topic: 'collaboration', type: '简答', title: '家校社协同中，各方怎样分工？', prompt: '请说明学校、家庭和社区如何围绕学生发展合理分工与协作。', variants: [] },
  { id: 'g6', topic: 'collaboration', type: '方案题', title: '如何组织一次家校社共同参与的实践活动？', prompt: '围绕明确的学生发展目标，设计一项学校、家庭和社区共同参与的实践活动。', points: ['依据学生需求设定活动目标。', '明确学校、家庭、社区职责。', '确定行动安排、资源和沟通方式。', '建立安全保障和过程反馈。'], variants: [] },
];

export function findQuestion(id) {
  for (const g of groups) {
    const topic = topics.find(t => t.id === g.topic);
    if (g.id === id) return { ...g, group: g, topic, points: g.points || topic.points };
    const v = g.variants.find(v => v.id === id);
    if (v) return { ...v, group: g, topic, isVariant: true };
  }
  return null;
}

export const paper = {
  id: 'paper1', title: '教育管理综合练习卷 01', minutes: 30,
  note: '教学演示卷，共 5 题、30 分，用于体验各种题型的作答、记录与复盘流程，不代表正式考试结构。',
  questions: [
    { id: 'e1', type: '单选', max: 2, prompt: '学校出现跨部门重复布置任务时，应优先采取哪项措施？', options: ['增加汇报层级', '明确权责并统一协调', '取消所有评价标准', '由各部门继续独立推进'], correct: '明确权责并统一协调', explanation: '应针对职责与沟通问题，明确牵头主体、权责边界和统一协调机制。', group: 'g1' },
    { id: 'e2', type: '判断', max: 2, prompt: '扁平化管理意味着学校应取消所有组织层级。', options: ['正确', '错误'], correct: '错误', explanation: '减少不必要层级不等于取消所有层级，仍需明确管理幅度与责任边界。', group: 'g1' },
    { id: 'e3', type: '填空', max: 2, prompt: '在教学过程中持续收集信息并据此调整教学，体现了________评价的作用。', correct: '形成性', accepted: ['形成性', '形成性评价'], explanation: '本题按教学参考答案精确匹配“形成性”或“形成性评价”；其他表述可在结果中人工调整。', group: 'g3' },
    { id: 'e4', type: '简答', max: 8, prompt: '学校如何减少跨部门合作中的责任空白与重复要求？', rubric: [{ text: '明确牵头主体及各部门权责', max: 2 }, { text: '统一任务清单与发布口径', max: 2 }, { text: '建立沟通与资源协作机制', max: 2 }, { text: '检查执行结果并持续纠偏', max: 2 }], explanation: '每点最多 2 分：仅出现方向性表述可考虑 1 分，有具体主体与行动可考虑 2 分。该量表为教学参考。', group: 'g2' },
    { id: 'e5', type: '论述', max: 16, prompt: '某校跨学科活动中出现重复任务和评价标准不一致。请分析原因，并提出有责任主体、具体行动与效果检查的改进方案。', rubric: [{ text: '切题分析职责不清和沟通不一致', max: 4 }, { text: '明确牵头负责人和分工安排', max: 4 }, { text: '提出统一任务与评价标准的具体措施', max: 4 }, { text: '设置执行检查与反馈调整机制', max: 4 }], explanation: '逐项对照自己的答卷选择参考分。未接入 AI 或教师评阅时，主观题保持“待评阅”，不能自动生成成绩。', group: 'g1' },
  ],
};

export function objectiveScore(q, answer) {
  if (!answer?.trim()) return 0;
  const normalized = answer.trim().replace(/[。.!！\s]/g, '');
  return (q.accepted || [q.correct]).includes(normalized) ? q.max : 0;
}

export function questionScore(q, attempt) {
  if (q.rubric) {
    if (!attempt.answers[q.id]?.trim()) return 0;
    const scores = attempt.ratings?.[q.id];
    return scores && scores.length === q.rubric.length && scores.every(s => s !== null) ? scores.reduce((a, b) => a + b, 0) : null;
  }
  return attempt.overrides?.[q.id] ?? objectiveScore(q, attempt.answers[q.id] || '');
}
