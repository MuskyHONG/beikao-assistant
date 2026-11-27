import { passwordRules } from './passwordRules';

export interface User { id: string; email: string; displayName: string; role: 'learner' | 'maintainer' | 'admin'; enabled: boolean }
export interface Session { user: User; csrfToken: string }
export type BankItem = Record<string, any> & { id: string; parentId?: string; version: number; etag?: number };
const messages: Record<string, string> = {
  invalid_credentials: '邮箱或密码不正确，或账号已停用。', unauthenticated: '登录已过期，请重新登录。',
  forbidden: '当前账号没有此操作权限。', invalid_origin: '访问地址与服务器配置不一致，请通过配置的站点地址访问。',
  invalid_csrf: '会话校验失败，请刷新后重试。', rate_limited: '尝试过于频繁，请稍后再试。',
  version_conflict: '题目已被其他维护者修改，请返回题库刷新后再编辑。当前未覆盖其他人的修改。',
  question_updated: '这道题已更新，请返回列表刷新。你原来的草稿仍保留在本机。', invalid_question: '题目尚未满足发布要求。',
  parent_not_published: '请先发布同一主题下的所属原题。', invalid_parent: '原题与变式归属无效，请检查主题与层级。',
  published_variants_conflict: '已发布的变式与本次原题修改不一致，请先调整或下架变式。',
  email_exists: '该邮箱已注册，请登录或使用其他邮箱。', invalid_account: '请检查邮箱和显示姓名。', cannot_disable_self: '不能停用自己的账号。',
  invalid_password: passwordRules, registration_unavailable: '暂时无法注册，请联系管理员。',
  empty_question: '请至少填写题干或标题。', not_found: '内容不存在、未发布或已下架。', invalid_response: '请按当前题型填写有效答案。',
  empty_response: '请先留下你的回答。', invalid_request: '输入格式有误，请检查后重试。',
  password_changed: '密码已被另一项操作修改，请重新登录。',
  invalid_goal: '请检查考试日期、每日时间和时区。',
  study_goal_conflict: '备考目标已在另一台设备更新。请核对右侧的填写和最新目标，再决定是否提交。',
  study_draft_conflict: '另一台设备已更新草稿。当前输入保留，请选择采用哪一份。',
  practice_submission_conflict: '该提交编号已用于另一份作答，请重新提交。',
  review_unavailable: '复练尚未到期、已完成或不可用，请回首页查看最新任务。',
  invalid_review_focus: '请选择本题可用的复练要点，或确认已有文字作答。',
  exam_pool_empty: '模拟题池暂时没有可用题目。已有草稿仍可继续。',
  exam_revision_conflict: '这份答卷已在另一设备更新。请核对最新记录。',
  exam_state_conflict: '这份答卷的状态已变化，请返回试卷库查看。',
  exam_no_answers: '请至少回答一道题再交卷。',
  exam_report_unavailable: '交卷或确认查看答案后，才有本次答卷记录。',
  exam_invalid_score: '请检查分值上限，得分最多保留两位小数。',
  exam_item_unanswered: '本题未作答，按 0 分计。',
  exam_review_ineligible: '请从已评分的失分题中选择复练项。',
};
export class ApiError extends Error { constructor(public status: number, public code: string, issues?: string[]) { super(issues?.join('；') || messages[code] || '服务暂时不可用，请稍后重试。'); } }
export const api = {
  csrf: '',
  async request<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
    let response: Response;
    try { response = await fetch('/api/v1' + path, { method, credentials: 'same-origin', cache: 'no-store',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(method === 'GET' ? {} : { 'X-CSRF-Token': this.csrf }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }); } catch { throw new Error('无法连接服务器，请检查网络后重试。'); }
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== '/auth/login' && path !== '/auth/password') window.dispatchEvent(new Event('beikao:session-expired'));
      throw new ApiError(response.status, value.error ?? 'internal_error', value.issues);
    }
    return value as T;
  },
};
export async function loadBank(admin = false): Promise<BankItem[]> {
  const items: BankItem[] = [];
  let cursor: string | null = '';
  do {
    const page: { items: BankItem[]; nextCursor: string | null } = await api.request((admin ? '/admin/questions' : '/questions') + '?limit=200&cursor=' + encodeURIComponent(cursor));
    items.push(...page.items);
    if (page.nextCursor && page.nextCursor <= cursor) throw new Error('题库分页异常，请刷新后重试。');
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}
export function groupBank(items: BankItem[]) {
  return items.filter(q => !q.parentId).map(q => ({ ...q, variants: items.filter(v => v.parentId === q.id) }));
}
const contentKeys = ['parentId','kind','topic','priority','title','prompt','max','sourceType','sourceUrl','explanation','multiple','choices','correctIds','correct','blanks','referenceAnswer','points','simulation','difficulty','knowledgeEvidence'];
export function questionPayload(q: BankItem) { return Object.fromEntries(contentKeys.filter(key => q[key] !== undefined).map(key => [key, q[key]])); }
