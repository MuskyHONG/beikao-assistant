import { useEffect, useState } from 'react';
import { api } from './api';

export const examUrl = '/me/exams';
export const examKinds = ['choice', 'judgment', 'fill', 'short'] as const;
type ExamKind = typeof examKinds[number];
export const kindLabel: Record<ExamKind, string> = { choice: '选择题', judgment: '判断题', fill: '填空题', short: '简答题' };
export type ExamState = 'draft' | 'submitted' | 'answer_only' | 'replaced';
export interface ExamItem {
  itemNo: number; questionId: string; questionVersion: number; topic: string; kind: ExamKind;
  prompt: string; max: number; multiple: boolean; choices: { id: string; text: string }[];
  blankCount: number; response: string | null;
}
export interface ExamAttempt {
  id: string; title: string; state: ExamState; revision: number; tierMinutes: number; estimatedMinutes: number;
  startedAt: string; serverNow: string; maxScore: number; currentItemNo: number; items: ExamItem[];
}
export interface ExamPlan {
  tierMinutes: number; requested: number; actual: number; estimatedMinutes: number;
  breakdown: { kind: ExamKind; target: number; actual: number;
    difficulty: { basicTarget: number; challengingTarget: number; basicShortfall: number; challengingShortfall: number } | null }[];
}
export interface ExamAvailability {
  recommendedTier: number; draft: Pick<ExamAttempt, 'id' | 'revision' | 'tierMinutes' | 'title'> | null; tiers: ExamPlan[];
}
export interface ExamSummary {
  id: string; title: string; state: 'submitted' | 'answer_only'; revision: number; tierMinutes: number;
  estimatedMinutes: number; startedAt: string; endedAt: string; durationSeconds: number; maxScore: number;
  totalScore: number | null; percent: number | null; isPerfect: boolean;
  scoreState: 'scored' | 'pending_review' | 'paper_unscored';
}
export interface ReportItem extends ExamItem {
  reference: {
    correctIds: string[]; correct: string | null; blanks: { accepted: string[] }[]; referenceAnswer: string;
    explanation: string; rubric: { id: number; text: string; max: number }[];
  };
  assessment: { state: string; matches?: boolean[] } | null; objectiveScore: number | null;
  score: number | null; scoreSource: string | null; pointScores: (number | null)[] | null;
  canScheduleReview: boolean; review: { id: string; dueOn: string } | null;
}
export interface ExamReport extends ExamSummary {
  answeredCount: number; objectiveScore: number | null; objectiveMaxScore: number; items: ReportItem[];
}
export interface ExamHistory { items: ExamSummary[]; nextCursor: string | null }
export interface KnowledgeTopic {
  id: string; title: string; category?: string; priority: 'S' | 'A' | 'B' | null;
  card?: { id: string; version: number; overview: string; source: string;
    points: { id: string; cue: string; summary: string; detail: string }[] } | null;
}

export const runPath = (id: string) => '/exams/run/' + id;
export const reportPath = (id: string) => '/exams/report/' + id;
export const examDate = (value: string) => new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
export const questionType = (item: ExamItem) => item.kind === 'choice' ? item.multiple ? '多选题' : '单选题' : kindLabel[item.kind];
export const readablePrompt = (prompt: string) => prompt.replace(/\{\{(\d+)\}\}/g, '____（第 $1 空）');
export const isAnswered = (item: ExamItem, value: string | null = item.response) => item.kind === 'fill'
  ? fillValues(value).some(text => text.trim()) : !!value?.trim();
export const sumPoints = (items: ExamItem[]) => items.reduce((n, item) => n + Math.round(item.max * 100), 0) / 100;

function fillValues(value: string | null): string[] {
  try {
    const values: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(values) ? values.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch { return []; }
}

export function answerText(item: ExamItem) {
  if (!item.response) return '';
  if (item.kind === 'fill') return fillValues(item.response).map((value, i) => `第 ${i + 1} 空 ${value || '—'}`).join(' · ');
  if (item.kind === 'choice') return item.response.split(',').map(id => {
    const choice = item.choices.find(option => option.id === id);
    return choice ? `${id}. ${choice.text}` : id;
  }).join(' / ');
  return item.response;
}

export function referenceText(item: ReportItem) {
  if (item.kind === 'choice') return answerText({ ...item, response: item.reference.correctIds.join(',') });
  if (item.kind === 'fill') return item.reference.blanks.map((blank, i) => `第 ${i + 1} 空 ${blank.accepted.join(' / ')}`).join(' · ');
  return item.kind === 'judgment' ? item.reference.correct : item.reference.referenceAnswer;
}

export function useExamLoad<T>(path: string) {
  const [result, setResult] = useState<{ path: string; data: T | null; error: string } | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    api.request<T>(path).then(data => { if (active) setResult({ path, data, error: '' }); })
      .catch(error => { if (active) setResult({ path, data: null, error: error.message }); });
    return () => { active = false; };
  }, [path, reload]);
  const current = result?.path === path ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? '', retry: () => { setResult(null); setReload(n => n + 1); } };
}
