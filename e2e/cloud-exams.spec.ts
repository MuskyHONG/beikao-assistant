import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';

const password = 'E2E.Only.Password.123';
const origin = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:43128';
const printDir = process.env.BEIKAO_PRINT_TEST_DIR;
const docsDir = process.env.BEIKAO_EXAM_DOC_SCREENSHOTS;

async function login(page: Page, email: string) {
  await page.goto('/#/home');
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible();
  const me = await page.request.get('/api/v1/auth/me');
  return { origin, 'x-csrf-token': (await me.json()).csrfToken };
}

async function screenshot(page: Page, name: string, marks: Locator[]) {
  if (!docsDir) return;
  for (const [index, mark] of marks.entries()) {
    await mark.evaluate((target, index) => {
      const box = target.getBoundingClientRect(), badge = document.createElement('span');
      badge.dataset.examMark = '';
      badge.textContent = String(index + 1);
      Object.assign(badge.style, { position: 'absolute', zIndex: '9999', pointerEvents: 'none',
        left: Math.max(2, window.scrollX + box.left - 10) + 'px', top: (window.scrollY + box.top - 9) + 'px',
        display: 'grid', placeItems: 'center', width: '25px', height: '25px', borderRadius: '50%',
        background: '#155ec5', color: '#fff', fontWeight: '700' });
      document.body.append(badge);
    }, index);
  }
  await page.screenshot({ path: join(docsDir, name + '.jpg'), fullPage: true, animations: 'disabled' });
  await page.locator('[data-exam-mark]').evaluateAll(elements => elements.forEach(element => element.remove()));
}

async function verifyPaper(page: Page, count: number) {
  const printed = page.locator('.a4-page');
  await expect(printed.locator('[data-paper-item]')).toHaveCount(count);
  await expect(printed.getByText('姓名', { exact: false })).toBeVisible();
  await expect(printed.locator('.a4-lines').first().locator('div')).toHaveCount(9);
  await expect(printed).not.toContainText('PDF_ANSWER_SENTINEL');
  await expect(printed).not.toContainText('PDF_STUDENT_SENTINEL');
  if (printDir) await page.pdf({ path: join(printDir, `paper-${count}.pdf`), preferCSSPageSize: true });
}

test('learner completes server exams and exports consistent A4 documents', async ({ browser }) => {
  const admin = await browser.newPage({ baseURL: origin }), a = await browser.newPage({ baseURL: origin, viewport: { width: 1440, height: 950 } });
  const b = await browser.newPage({ baseURL: origin, viewport: { width: 1440, height: 950 } });
  const fixtures: string[] = [];
  const headers = await login(admin, 'admin@e2e.test');
  try {
    const learner = await admin.request.post('/api/v1/admin/users', {
      headers, data: { email: 'exam-ui@e2e.test', displayName: '模拟测试学员', password, role: 'learner' },
    });
    expect(learner.ok(), await learner.text()).toBeTruthy();
    for (const [kind, count] of [['choice', 12], ['judgment', 6], ['fill', 9], ['short', 3]] as const) {
      for (let i = 0; i < count; i++) {
        const id = `print-${kind}-${i}`;
        const common = { kind, title: `模拟排版样题 ${i + 1}`, topic: 'A03', simulation: true, max: kind === 'short' ? 10 : 2 };
        const fields = kind === 'choice' ? { prompt: `第 ${i + 1} 个选择题练习。以下哪项符合题意？`, difficulty: i < 3 ? 'basic' : 'challenging',
          choices: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }, { id: 'C', text: '丙' }, { id: 'D', text: '丁' }], correctIds: ['A'], explanation: '按题意核对。' }
          : kind === 'judgment' ? { prompt: `第 ${i + 1} 个判断题练习。`, difficulty: i === 0 ? 'basic' : 'challenging', correct: '正确', explanation: '逐项核对。' }
          : kind === 'fill' ? { prompt: `第 ${i + 1} 个填空题练习，依次填入{{1}}和{{2}}。`, blanks: [{ accepted: ['甲'] }, { accepted: ['乙'] }] }
          : { prompt: `第 ${i + 1} 个简答题练习。请根据下列场景解释处理过程。` +
            '学校开展一次教学案例讨论，请结合实际职责说明如何明确参与人员、整理行动顺序并安排后续复盘。'.repeat(5),
            referenceAnswer: 'PDF_ANSWER_SENTINEL。先明确职责，再解释安排。', points: ['明确职责', '说明依据'] };
        const created = await admin.request.put('/api/v1/admin/questions/' + id, {
          headers, data: { content: { ...common, ...fields }, expectedRevision: 0, action: 'publish' },
        });
        expect(created.ok(), await created.text()).toBeTruthy();
        fixtures.push(id);
      }
    }
    await login(a, 'exam-ui@e2e.test');
    await a.getByRole('link', { name: '模拟考试', exact: true }).click();
    await expect(a.getByText('本次可组').first()).toBeVisible();
    await screenshot(a, 'p09-server-exam', [a.getByRole('group', { name: /推荐 20 分钟档/ }), a.getByRole('button', { name: '开始新卷' })]);
    await a.getByRole('button', { name: '开始新卷' }).click();
    await expect(a.getByRole('heading', { name: '本套答题卡' })).toBeVisible();
    const draftRoute = a.url().split('#')[1];
    await login(b, 'exam-ui@e2e.test');
    await b.goto('/#' + draftRoute);
    await expect(b.getByRole('radio', { name: 'A. 甲' })).toBeVisible();
    await a.getByRole('radio', { name: 'A. 甲' }).check();
    await expect(a.getByText('本题作答已保存', { exact: true })).toBeVisible();
    await b.getByRole('radio', { name: 'B. 乙' }).check();
    await expect(b.getByRole('button', { name: '采用服务器答卷' })).toBeVisible();
    await b.getByRole('button', { name: '采用服务器答卷' }).click();
    await expect(b.getByRole('radio', { name: 'A. 甲' })).toBeChecked();
    await b.getByRole('radio', { name: 'B. 乙' }).check();
    await expect(b.getByText('本题作答已保存', { exact: true })).toBeVisible();
    await screenshot(b, 'p10-server-exam', [b.getByRole('heading', { name: '本套答题卡' }),
      b.getByRole('button', { name: '打印或下载空白卷' }), b.getByRole('button', { name: '放弃作答，直接查看答案' })]);
    await b.getByRole('button', { name: /第 10 题，简答题/ }).click();
    await b.getByLabel('先不看参考，写下你的回答').fill('PDF_STUDENT_SENTINEL');
    await b.getByRole('button', { name: '打印或下载空白卷' }).click();
    await verifyPaper(b, 10);
    const blankDownload = b.waitForEvent('download');
    await b.getByRole('button', { name: '下载 HTML' }).click();
    const blank = await readFile(await (await blankDownload).path(), 'utf8');
    expect(blank).not.toContain('PDF_ANSWER_SENTINEL');
    expect(blank).not.toContain('PDF_STUDENT_SENTINEL');
    await screenshot(b, 'p14-server-exam-print', [b.getByRole('button', { name: '打印 / 保存 PDF' }), b.locator('.paper-scores')]);
    await b.getByRole('link', { name: '返回', exact: true }).click();
    await expect(b.getByLabel('先不看参考，写下你的回答')).toHaveValue('PDF_STUDENT_SENTINEL');
    await b.getByRole('button', { name: '查看交卷清单' }).click();
    await expect(b.getByRole('heading', { name: '检查本套答卷，再交卷' })).toBeVisible();
    await screenshot(b, 'p11-server-exam', [b.getByLabel('确认交卷并保留本次答题记录'), b.getByRole('button', { name: '确认交卷' })]);
    await b.getByLabel('确认交卷并保留本次答题记录').check();
    await b.getByRole('button', { name: '确认交卷' }).click();
    await expect(b.getByRole('heading', { name: '待评阅', exact: true })).toBeVisible();
    const short = b.locator('details').filter({ has: b.getByText('10. 简答题', { exact: true }) });
    await short.locator('summary').click();
    await short.getByLabel('第 10 题评分点 1').fill('2');
    await short.getByLabel('第 10 题评分点 2').fill('1');
    await short.getByRole('button', { name: '保存本题自评' }).click();
    await expect(b.getByRole('heading', { name: '3 / 28 分' })).toBeVisible();
    await short.getByRole('button', { name: '安排次日复练' }).click();
    await expect(short.getByText(/已安排复练 ·/)).toBeVisible();
    await screenshot(b, 'p13-server-exam', [b.getByRole('heading', { name: '3 / 28 分' }), short.getByRole('button', { name: '保存本题自评' }), short.getByText(/已安排复练 ·/)]);
    await b.getByRole('link', { name: '打印或下载复盘' }).click();
    await expect(b.locator('.a4-page')).toContainText('PDF_STUDENT_SENTINEL');
    if (printDir) await b.pdf({ path: join(printDir, 'review.pdf'), preferCSSPageSize: true });

    await b.goto('/#/exams');
    await b.getByRole('radio', { name: /40 分钟/ }).check();
    await b.getByRole('button', { name: '开始新卷' }).click();
    await b.getByRole('button', { name: '打印或下载空白卷' }).click();
    await verifyPaper(b, 20);
    await b.getByRole('link', { name: '返回', exact: true }).click();
    b.once('dialog', dialog => void dialog.accept());
    await b.getByRole('button', { name: '放弃作答，直接查看答案' }).click();
    await expect(b.getByRole('heading', { name: '本卷参考答案', exact: true })).toBeVisible();
    await b.getByRole('link', { name: '返回答题记录' }).click();
    const scoredCard = b.locator('.record-paper').first();
    await scoredCard.getByLabel('手填本次原卷得分').fill('56');
    await scoredCard.getByRole('button', { name: '保存得分' }).click();
    await expect(scoredCard.getByAltText('满分章')).toBeVisible();
    await expect(b.getByRole('heading', { name: '答题记录', exact: true })).toBeVisible();
    await screenshot(b, 'p12-server-exam', [scoredCard, scoredCard.getByAltText('满分章'), scoredCard.getByLabel('手填本次原卷得分')]);
    await scoredCard.getByRole('link').click();
    await expect(b.getByRole('heading', { name: '56 / 56 分' })).toBeVisible();
    await b.getByRole('link', { name: '打印或下载答案' }).click();
    await expect(b.locator('.a4-page')).toContainText('PDF_ANSWER_SENTINEL');
    if (printDir) await b.pdf({ path: join(printDir, 'answers.pdf'), preferCSSPageSize: true });
    const download = b.waitForEvent('download');
    await b.getByRole('button', { name: '下载 HTML' }).click();
    const object = await download;
    const exported = await readFile(await object.path(), 'utf8');
    expect(exported).toContain('PDF_ANSWER_SENTINEL');
    expect(exported).toContain('size:A4');
    expect(exported).not.toContain('PDF_STUDENT_SENTINEL');
    await b.goto('/#/exams');
    await b.getByRole('radio', { name: /60 分钟/ }).check();
    await b.getByRole('button', { name: '开始新卷' }).click();
    await b.getByRole('button', { name: '打印或下载空白卷' }).click();
    await verifyPaper(b, 30);
    await b.goto('/#/knowledge');
    const priorityCard = b.getByRole('link', { name: /S 级 · 核心必学/ });
    await expect(priorityCard).toBeVisible();
    await screenshot(b, 'p04-server-knowledge', [priorityCard, b.getByRole('link', { name: '打印或下载知识提纲' })]);
    await priorityCard.click();
    const crisis = b.locator('details').filter({ hasText: /A03 · 学校危机与心理危机管理/ });
    await crisis.locator('summary').click();
    await expect(crisis.getByText('生命和人身安全优先', { exact: false })).toBeVisible();
    await screenshot(b, 'p05-server-knowledge', [b.getByRole('progressbar', { name: '知识主题掌握进度' }), crisis.locator('summary'), crisis.locator('.knowledge-points')]);
    await b.getByRole('link', { name: '打印或下载知识提纲' }).click();
    await b.getByLabel('关键词').fill('A03');
    await b.getByRole('button', { name: '应用筛选' }).click();
    await expect(b.locator('.a4-knowledge')).toHaveCount(1);
    await expect(b.locator('.a4-knowledge')).toContainText('生命和人身安全优先');
    await expect(b.locator('.a4-knowledge')).not.toContainText('来源');
    await screenshot(b, 'p14-server-knowledge-print', [b.locator('.print-filter-fields'), b.getByRole('button', { name: '应用筛选' }), b.locator('.a4-knowledge')]);
    if (printDir) await b.pdf({ path: join(printDir, 'knowledge.pdf'), preferCSSPageSize: true });
    await b.getByRole('button', { name: '清空已选' }).click();
    await expect(b.getByRole('button', { name: '打印 / 保存 PDF' })).toBeDisabled();
    await b.setViewportSize({ width: 390, height: 840 });
    expect(await b.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  } finally {
    for (const id of fixtures) await admin.request.post('/api/v1/admin/questions/' + id + '/status', {
      headers, data: { expectedRevision: 2, action: 'archive' },
    });
    await Promise.all([admin.close(), a.close(), b.close()]);
  }
});
