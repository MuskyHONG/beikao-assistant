import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type BankItem } from './api';

export interface GoalInput { examDate: string; dailyHours: number; includeExamDay: boolean }
export interface StudyGoal extends GoalInput { revision: number; timezone: string }
export interface ReviewTask {
  id: string; topic: string; sourceQuestionId: string; parentId: string; kind: string; dueOn: string; focus: string | null;
  sourceExamId?: string | null; sourceExamItemNo?: number | null;
}
export interface StudyDraft { version: number; response: string; revision: number; updatedAt: string }
export interface StudyAttempt {
  id: string; questionId: string; version: number; response: string; rating: 'weak' | 'fuzzy' | 'good'; checked: boolean;
  assessment: { state: string; score?: number } | null; submittedAt: string;
  reviewFocus: string | null; pointResult: 'included' | 'missed' | null;
  question: { prompt: string; title: string; kind: string; max: number; choices: { id: string; text: string }[] };
}
interface StudyState {
  goal: StudyGoal | null; day: string; timezone: string; reviews: ReviewTask[]; completedToday: number; completedReviews?: { id: string; topic: string; questionId: string }[];
  mastery: { questionId: string; questionVersion: number; status: StudyAttempt['rating'] | 'pending'; updatedAt: string }[];
}

export const practicePath = (id: string) => '/me/practice/' + encodeURIComponent(id);
export function practiceDetails(id: string, reviewId?: string) {
  return api.request<{ drafts: StudyDraft[]; attempts: StudyAttempt[] }>(practicePath(id) + (reviewId ? '?reviewId=' + encodeURIComponent(reviewId) : ''));
}

export function nextReviewQuestion(task: ReviewTask, groups: BankItem[]) {
  const questions = groups.flatMap(group => [group, ...((group.variants || []) as BankItem[])]).filter(q => q.topic === task.topic);
  const candidates = questions.filter(q => q.id !== task.sourceQuestionId);
  const root = task.parentId || task.sourceQuestionId;
  return candidates.find(q => q.kind === task.kind && (q.parentId === root || q.id === root)) ||
    candidates.find(q => q.kind === task.kind) || questions.find(q => q.id === task.sourceQuestionId) || candidates[0];
}

export function usePersonalStudy() {
  const [study, setStudy] = useState<StudyState | null>(null);
  const [error, setError] = useState('');
  const requestNumber = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    try {
      const latest = await api.request<StudyState>('/me/study');
      if (request === requestNumber.current) { setStudy(latest); setError(''); }
    } catch (error) {
      if (request === requestNumber.current) setError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const reload = () => { void refresh(); };
    const timer = window.setInterval(reload, 60_000);
    window.addEventListener('focus', reload);
    window.addEventListener('hashchange', reload);
    return () => { ++requestNumber.current; window.clearInterval(timer); window.removeEventListener('focus', reload); window.removeEventListener('hashchange', reload); };
  }, [refresh]);
  const saveGoal = async (value: GoalInput, baseRevision: number) => {
    if (!study) throw new Error('请先载入账号的备考计划。');
    try {
      const { goal } = await api.request<{ goal: StudyGoal }>('/me/study-goal', 'PUT', {
        ...value, timezone: study.goal?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Shanghai', revision: baseRevision,
      });
      setStudy(previous => previous ? { ...previous, goal } : null);
      void refresh();
      return goal;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'study_goal_conflict') await refresh();
      throw error;
    }
  };
  return { study, error, refresh, saveGoal };
}
