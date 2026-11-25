import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: process.env.BEIKAO_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const capture = process.argv.includes('--capture');
const output = 'docs/assets/whiteboard/';

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const navigate = async (route: string) => {
    if (await page.evaluate(() => location.hash) === '#' + route) return;
    await page.evaluate(route => { location.hash = route; }, route);
    await page.waitForURL(url => url.hash === '#' + route);
  };
  const reviews = () => page.evaluate(() => JSON.parse(localStorage.getItem('beikao-whiteboard-v1')!).personal.learner.reviews || []);
  const shot = async (file: string, markers: [number, string, number?][]) => {
    if (!capture) return;
    await page.evaluate(markers => {
      for (const [number, selector, index = 0] of markers) {
        const target = document.querySelectorAll(selector)[index];
        if (!target) throw Error(`Missing annotation target ${selector}`);
        const box = target.getBoundingClientRect();
        const marker = document.createElement('span');
        marker.className = 'prd-marker';
        marker.textContent = String(number);
        marker.style.cssText = `position:absolute;left:${Math.max(5, box.left - 26)}px;top:${box.top + scrollY - 15}px;z-index:500;background:#1c5fc5;color:white;border:2px solid white;border-radius:50%;width:31px;height:31px;display:grid;place-items:center;font:bold 15px system-ui;box-shadow:0 2px 5px #0005;pointer-events:none`;
        document.body.append(marker);
      }
    }, markers);
    await page.screenshot({ path: output + file, quality: 88, animations: 'disabled' });
    await page.evaluate(() => document.querySelectorAll('.prd-marker').forEach(node => node.remove()));
  };
  const setDay = (day: number) => page.clock.setFixedTime(new Date(2026, 10, day, 10));
  await setDay(21);
  await page.goto(pathToFileURL(resolve('../publish-artifacts/备考有方-白板修订原型.html')).href);
  await button('体验学员 · 学员').click();
  await page.getByRole('button', { name: /考试日期.*选择考试日期/ }).click();
  await button('2026年11月30日').click();
  await button('保存目标').click();
  await page.locator('.home-task-link').first().click();
  await button('想不起来').click();
  assert.match(await page.locator('#lesson-status-detail').innerText(), /明天安排复练/);
  const status = (await reviews())[0];
  assert.equal(status.due, '2026-11-22');
  assert.equal(status.questionId, 'A03-q1');
  const selector = page.getByLabel('最想补的一个要点（选填）');
  const point = await selector.locator('option').nth(1).getAttribute('value');
  assert(point);
  await selector.selectOption(point);
  await button('保存要点').click();
  assert.equal((await reviews())[0].pointId, point);
  await shot('p07-follow-up.jpg', [[10,'.rating-row'], [12,'#lesson-feedback'], [14,'.review-select']]);
  await button('有点模糊').click();
  assert.equal((await reviews()).length, 1);
  assert.equal((await reviews())[0].due, '2026-11-24');
  await button('能独立回忆').click();
  assert.deepEqual(await reviews(), []);
  await button('想不起来').click();
  await selector.selectOption(point);
  await button('保存要点').click();
  await navigate('/home');
  assert.match(await page.locator('.task-completion').innerText(), /1 \/ 2 项已练/);
  assert.match(await page.locator('.home-next-review').innerText(), /明天/);
  await setDay(23);
  await page.reload();
  const task = page.locator('.home-task-link').first();
  assert.match(await task.innerText(), /待补.*\n到期复练 · 8 分钟/);
  const allocated = await page.locator('.home-task-link > span').allTextContents();
  assert(allocated.reduce((sum, text) => sum + Number(text.match(/\d+/)?.[0] || 0), 0) <= 60);
  await shot('p02-due-review.jpg', [[10,'.task-completion'], [9,'.home-task-link'], [17,'.study-scope']]);
  await page.setViewportSize({ width: 320, height: 890 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await task.click();
  assert.match(await page.locator('.review-context').innerText(), /换一道题/);
  assert(!new URL(page.url()).hash.includes('A03-q1?'));
  const reviewRoute = new URL(page.url()).hash.slice(1);
  const variantRoute = reviewRoute.split('?')[0];
  await navigate(variantRoute);
  await page.locator('[data-answer=practice]').fill('上次练习的旧草稿');
  await navigate(reviewRoute);
  assert.equal(await page.locator('[data-answer=practice]').inputValue(), '');
  await page.locator('[data-answer=practice]').fill('校方先控制直接风险，保障学生生命安全，再按预案报告。');
  await page.reload();
  assert.match(await page.locator('[data-answer=practice]').inputValue(), /保障学生生命安全/);
  await button('想不起来').click();
  let rows = await reviews();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].completedDay, '2026-11-23');
  assert.equal(rows[1].due, '2026-11-24');
  assert.equal(rows[1].pointId, point);
  await button('能独立回忆').click();
  rows = await reviews();
  assert.equal(rows.length, 1);
  assert(rows[0].completedAt);
  const outcome = page.getByLabel(/这次写出了.*吗/);
  await outcome.selectOption('missed');
  await button('保存复练结果').click();
  assert.equal((await reviews())[1].due, '2026-11-26');
  await outcome.selectOption('included');
  await button('保存复练结果').click();
  assert.equal((await reviews()).length, 1);
  await shot('p07-review-outcome.jpg', [[15,'[data-form=review-outcome]'], [16,'.review-context']]);
  await page.getByText(/练习历史 · 1/).click();
  assert.match(await page.locator('.lesson-extras article').innerText(), /要点自查.*独立写出/);
  await navigate(variantRoute);
  assert.equal(await page.locator('[data-answer=practice]').inputValue(), '上次练习的旧草稿');
  await navigate('/home');
  assert.match(await page.locator('.home-task-link.is-done').first().innerText(), /今天已复练/);

  await navigate('/exams');
  assert.match(await page.locator('.paper-card').innerText(), /按教学题池组卷/);
  await shot('p09-timed-practice.jpg', [[1,'.exam-duration-options'], [2,'.exam-blueprint'], [7,'.paper-card .small-copy']]);
  await button('开始新卷').click();
  await page.locator('[data-answer=exam]').first().waitFor();
  const wrongAnswer = await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('beikao-whiteboard-v1')!).personal.learner.draft;
    return draft.questions[0].choices.find((choice: { id: string }) => !draft.questions[0].correctIds.includes(choice.id)).id;
  });
  await page.locator(`[data-answer=exam][value="${wrongAnswer}"]`).check();
  await page.getByRole('link', { name: '查看交卷清单' }).click();
  await page.getByRole('checkbox', { name: /确认交卷并保留/ }).check();
  await button('确认交卷').click();
  await page.locator('.review-summary').waitFor();
  assert.equal(await page.locator('.review-suggestion').count(), 1, 'Blank questions never generate recommendations');
  await shot('p13-follow-up.jpg', [[11,'.review-summary'], [12,'.review-suggestion button']]);
  await button('安排复练').click();
  assert.match(await page.locator('.review-suggestion').innerText(), /明天已安排/);
  assert.equal((await reviews()).filter((row: { completedAt?: number }) => !row.completedAt).length, 1);
  await navigate('/exams');
  await button('开始新卷').click();
  page.once('dialog', dialog => void dialog.accept());
  await button('放弃作答，直接查看答案').click();
  const paper = page.locator('[data-form=paper-review]');
  await paper.waitFor();
  assert.equal((await reviews()).filter((row: { completedAt?: number }) => !row.completedAt).length, 1);
  await shot('p13-paper-follow-up.jpg', [[13,'[data-form=paper-review]']]);
  await paper.locator('select').selectOption({ index: 1 });
  await button('安排纸笔复练').click();
  assert.match(await page.locator('#notice').innerText(), /已安排复练/);
  await button('切换账号').click();
  await button('体验维护者 · 维护者').click();
  await navigate('/home');
  assert.equal(await page.locator('.home-next-review').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: rated versus mastered, optional point, editable review date, missed day carryover, different question, daily budget, scored exam and paper workflows, mobile, account isolation.');
} finally {
  await browser.close();
}
