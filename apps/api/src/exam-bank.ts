import type { QuestionRow } from './questions.js';

export const examTiers = [20, 40, 60] as const;
export type ExamTier = typeof examTiers[number];
const sections = [
  { kind: 'choice', count: 4, minutes: 1, rated: true },
  { kind: 'judgment', count: 2, minutes: 1, rated: true },
  { kind: 'fill', count: 3, minutes: 2, rated: false },
  { kind: 'short', count: 1, minutes: 8, rated: false },
] as const;

export function examPool(questions: QuestionRow[]) {
  const seen = new Set<string>();
  return questions.filter(question => {
    const key = question.kind + ':' + question.prompt.normalize('NFKC').toLowerCase().replace(/\s/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function planExam(pool: QuestionRow[], tierMinutes: ExamTier) {
  const breakdown = sections.map(({ kind, count, minutes, rated }) => {
    const candidates = pool.filter(q => q.kind === kind);
    const target = count * tierMinutes / 20;
    const actual = Math.min(target, candidates.length);
    const basicTarget = rated ? Math.floor(target / 4) : null;
    const challengingTarget = basicTarget === null ? null : target - basicTarget;
    const basic = candidates.filter(q => q.difficulty === 'basic').length;
    const challenging = candidates.filter(q => q.difficulty === 'challenging').length;
    const difficulty = basicTarget === null || challengingTarget === null ? null : {
      basicTarget, challengingTarget,
      basicShortfall: Math.max(basicTarget - basic, 0),
      challengingShortfall: Math.max(challengingTarget - challenging, 0),
    };
    return { kind, target, actual, estimatedMinutes: minutes * actual, difficulty };
  });
  return {
    tierMinutes, breakdown,
    requested: breakdown.reduce((n, section) => n + section.target, 0),
    actual: breakdown.reduce((n, section) => n + section.actual, 0),
    estimatedMinutes: breakdown.reduce((n, section) => n + section.estimatedMinutes, 0),
  };
}

export function drawExam(pool: QuestionRow[], plan: ReturnType<typeof planExam>, previous: Set<string>, usage: Map<string, number>, dueTopics: Set<string>) {
  return plan.breakdown.flatMap(({ kind, actual, difficulty }) => {
    const ranked = pool.filter(q => q.kind === kind)
      .map(q => ({ q, previous: Number(previous.has(q.id)), used: usage.get(q.id) ?? 0,
        due: Number(dueTopics.has(q.topic)), tie: Math.random() }))
      .sort((a, b) => a.previous - b.previous || a.used - b.used || b.due - a.due || a.tie - b.tie)
      .map(row => row.q);
    if (!difficulty) return ranked.slice(0, actual);
    const selected = [
      ...ranked.filter(q => q.difficulty === 'basic').slice(0, difficulty.basicTarget),
      ...ranked.filter(q => q.difficulty === 'challenging').slice(0, difficulty.challengingTarget),
    ];
    const selectedIds = new Set(selected.map(q => q.id));
    selected.push(...ranked.filter(q => !selectedIds.has(q.id)).slice(0, actual - selected.length));
    return selected.map(q => ({ q, tie: Math.random() })).sort((a, b) => a.tie - b.tie).map(row => row.q);
  });
}

export function examQuestionSnapshot(q: QuestionRow) {
  const publicSnapshot = {
    questionId: q.id, questionVersion: q.version, topic: q.topic, kind: q.kind,
    prompt: q.prompt, max: q.max, multiple: q.multiple,
    choices: q.kind === 'choice' ? q.choices.map(({ id, text }) => ({ id, text })) : [],
    blankCount: q.kind === 'fill' ? q.blanks.length : 0,
  };
  const cents = Math.round(q.max * 100);
  const share = q.kind === 'short' ? Math.floor(cents / q.points.length) : 0;
  const rubric = q.kind === 'short' ? q.points.map((text, index) => ({
    id: index + 1, text, max: q.rubricMaxes?.[index] ?? (index === q.points.length - 1 ? cents - share * index : share) / 100,
  })) : [];
  return {
    publicSnapshot,
    gradingSnapshot: {
      correctIds: q.kind === 'choice' ? q.correctIds : [],
      correct: q.kind === 'judgment' ? q.correct : null,
      blanks: q.kind === 'fill' ? q.blanks : [],
      referenceAnswer: q.kind === 'short' ? q.referenceAnswer : '',
      explanation: q.explanation,
      rubric,
    },
  };
}
