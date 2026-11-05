const DAY = 86400000;

// Calendar dates are compared at UTC midnight to avoid daylight-saving drift.
function calendarNumber(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return null;
  const [y, m, d] = key.split('-').map(Number);
  if (y < 1000 || y > 9999) return null;
  const n = Date.UTC(y, m - 1, d), date = new Date(n);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? n / DAY : null;
}

export function localDateKey(now = new Date()) {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

export function calculateBudget(goal, today = localDateKey()) {
  if (!goal?.examDate) return { status: 'unset' };
  const exam = calendarNumber(goal.examDate), start = calendarNumber(today);
  const dailyHours = Number(goal.dailyHours);
  if (exam === null || start === null || !Number.isFinite(dailyHours) || dailyHours <= 0 || dailyHours > 24) return { status: 'invalid' };
  const daysUntil = exam - start;
  const studyDays = Math.max(0, daysUntil + (goal.includeExamDay === false ? 0 : 1));
  return { status: daysUntil < 0 ? 'past' : daysUntil === 0 ? 'today' : 'upcoming', daysUntil, studyDays, dailyHours, dailyMinutes: Math.round(dailyHours * 60), totalHours: Math.round(studyDays * dailyHours * 100) / 100 };
}

export function recommendPlan(budget) {
  if (!['upcoming', 'today'].includes(budget.status) || budget.studyDays === 0) return null;
  const { totalHours, dailyMinutes, daysUntil } = budget;
  const tier = totalHours < 20 ? 'compact' : totalHours < 60 ? 'balanced' : 'systematic';
  const content = {
    compact: { name: '精简备考', scope: 'S 级优先，先巩固最关键的内容', desc: '时间较少，优先理解和提取 S 级知识，集中修正薄弱题，减少新增内容。', weights: [.15, .4, .35, .1] },
    balanced: { name: '均衡备考', scope: 'S 级稳住，再推进 A 级', desc: '在知识学习、记忆提取和变式应用之间分配时间，按薄弱程度调整顺序。', weights: [.25, .3, .35, .1] },
    systematic: { name: '系统备考', scope: 'S / A 级为主，逐步扩展与模拟', desc: '留出多轮提取、变式和整套模拟的空间；掌握稳定后再补充 B 级内容。', weights: [.3, .25, .35, .1] },
  }[tier];
  const minutes = content.weights.slice(0, 3).map(w => Math.floor(dailyMinutes * w));
  minutes.push(dailyMinutes - minutes.reduce((a, b) => a + b, 0));
  return { tier, ...content, examSoon: daysUntil <= 7, tasks: [
    { title: '理解知识', desc: tier === 'compact' ? '回看重点知识与记忆支点' : '理解一个主题与它的应用边界', minutes: minutes[0], path: '/knowledge' },
    { title: '提取与复习', desc: '优先筛选想不起来、模糊的题目', minutes: minutes[1], path: '/practice/weak' },
    { title: '作答训练', desc: '从题目列表选择原题或关联变式', minutes: minutes[2], path: '/practice' },
    { title: '自评与调整', desc: '对照参考，记录掌握程度', minutes: minutes[3], path: '/practice' },
  ] };
}
