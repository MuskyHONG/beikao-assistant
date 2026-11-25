import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const browser = await chromium.launch({executablePath: process.env.BEIKAO_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const url = pathToFileURL(resolve('../publish-artifacts/备考有方-白板修订原型.html')).href;
  const key = 'beikao-whiteboard-v1';
  const go = async (route: string) => {await page.evaluate(v => location.hash = v, route); await page.waitForTimeout(80);};
  const state = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)!), key);
  const btn = (name: string) => page.getByRole('button', {name, exact: true});
  const draw = async (minutes: number) => {
    await go('/exams'); await page.locator(`[name="exam-duration"][value="${minutes}"]`).check();
    await btn('开始新卷').click(); await page.locator('.two-col').waitFor();
    return (await state()).personal.learner.draft;
  };
  await page.goto(url); await btn('体验学员 · 学员').click();
  const provenance = await page.evaluate(() => {
    const {bank, knowledgeCards} = (window as any).beikaoData;
    const generated = bank.filter((q: any) => q.origin === 'knowledge-derived-v1');
    return generated.map((q: any) => ({
      kind: q.kind, topic: q.topic,
      valid: q.sourceEvidence.every((e: any) => knowledgeCards[q.knowledgeId].points.some((p: any) => p.id === e.pointId && p.detail === e.quote)) && q.sourceKnowledgeVersion === knowledgeCards[q.knowledgeId].version,
      fillValid: q.kind !== 'fill' || q.sourceEvidence[0].quote.includes(q.blanks[0].accepted[0]),
    }));
  });
  assert.equal(provenance.length, 115);
  assert(provenance.every((q: any) => q.valid && q.fillValid));
  assert.equal(new Set(provenance.map((q: any) => q.topic)).size, 23);
  assert.deepEqual(['choice','judgment','fill'].map(kind => provenance.filter((q: any) => q.kind === kind).length), [46,46,23]);
  // Execute the actual answer checker for every new question, including wrong answers.
  assert.equal(await page.evaluate(() => {
    const generated = (window as any).beikaoData.bank.filter((q: any) => q.origin === 'knowledge-derived-v1');
    return generated.filter((q: any) => {
      const correct = q.kind === 'choice' ? q.correctIds.join(',') : q.kind === 'fill' ? JSON.stringify([q.blanks[0].accepted[0]]) : q.correct;
      const wrong = q.kind === 'choice' ? q.choices.find((c: any) => !q.correctIds.includes(c.id)).id : q.kind === 'fill' ? '["错误示例"]' : q.correct === '正确' ? '错误' : '正确';
      return (window as any).eval('score')(q,correct) === q.max && (window as any).eval('score')(q,wrong) === 0;
    }).length;
  }), 115);
  for (const minutes of [20,40,60]) {
    const draft = await draw(minutes);
    const factor = minutes / 20;
    assert.equal(draft.questions.length, 10 * factor);
    assert.equal(draft.estimatedMinutes, minutes);
    assert.deepEqual(['choice','judgment','fill','short'].map(kind => draft.questions.filter((q: any) => q.kind === kind).length), [4,2,3,1].map(n => n * factor));
    assert.equal(new Set(draft.questions.map((q: any) => q.id)).size, draft.questions.length);
    assert.equal(await page.locator('.answer-sheet button').count(), draft.questions.length);
    const headings = await page.locator('.answer-sheet-group h3').allTextContents();
    assert.equal(headings.filter(s => s.startsWith('单选题')).length, 1);
    assert.equal(headings.filter(s => s.startsWith('选择题')).length, 0);
    await page.locator('.answer-sheet button').last().click();
    assert.match(await page.locator('.section-caption').innerText(), new RegExp('第 ' + draft.questions.length + ' /'));
    await go('/print/paper');
    assert.equal(await page.locator('.exam-paper-question').count(), draft.questions.length);
    assert.equal(await page.locator('.exam-paper-section').count(), 4);
    assert.equal(await page.locator('[data-answer]').count(), 0);
    await go('/exam'); assert.deepEqual((await state()).personal.learner.draft.questions, draft.questions);
  }
  const first = await draw(60), second = await draw(60);
  for (const kind of ['choice','judgment','fill']) {
    assert(second.questions.filter((q: any) => q.kind === kind).every((q: any) => !first.questions.some((p: any) => p.id === q.id)), 'Avoid last paper while pool is sufficient');
  }
  // A real submission creates exactly one paper record.
  await draw(20); await page.locator('[data-answer=exam]').first().check(); await go('/confirm');
  await page.locator('[name=confirmed]').check(); await btn('确认交卷').click(); await page.locator('.score-strip').waitFor();
  assert.equal((await state()).personal.learner.exams.length, 1);
  // Old cached stores add the new bank once, retaining edits, archives and personal snapshots.
  const original = await state();
  const old = structuredClone(original);
  const editedId = 'kb-A03-choice-1', archivedId = 'kb-A03-choice-2';
  Object.keys(old.questions).filter(id => id.startsWith('kb-') && ![editedId, archivedId].includes(id)).forEach(id => delete old.questions[id]);
  old.questions[editedId].draft = {...old.questions[editedId].published, prompt:'维护中的个人修订', version:2};
  old.questions[archivedId].archived = true;
  const exams = structuredClone(old.personal.learner.exams);
  await page.evaluate(({key,old}) => localStorage.setItem(key, JSON.stringify(old)), {key,old});
  await page.reload(); let migrated = await state();
  assert.equal(Object.values(migrated.questions).filter((r: any) => r.published?.origin === 'knowledge-derived-v1').length,115);
  assert.equal(migrated.questions[editedId].draft.prompt, '维护中的个人修订');
  assert.equal(migrated.questions[archivedId].archived, true);
  assert.deepEqual(migrated.personal.learner.exams, exams);
  await page.reload(); assert.deepEqual(await state(), migrated);
  // Display conversion cannot award a seal for a rounded-up non-perfect paper.
  await page.evaluate(({key,original}) => {
    const s = original, base = s.personal.learner.exams[0], template = base.questions.find((q: any) => q.kind === 'choice');
    const make = (id: string, max: number, value: number) => ({...structuredClone(base),id,title:'评分边界核验 '+id,questions:[{...template,id:'score-'+id,max}],answers:{['score-'+id]:template.correctIds.join(',')},overrides:{['score-'+id]:value},ratings:{},photos:{}});
    s.personal.learner.exams = [make('partial',50,37),make('rounded',100,99.6),make('perfect',8,8),make('zero',8,0)];
    const short = base.questions.find((q: any) => q.kind === 'short');
    s.personal.learner.exams.push({...structuredClone(base),id:'pending',questions:[short],answers:{[short.id]:'作答待自评'},ratings:{},overrides:{},photos:{}});
    localStorage.setItem(key,JSON.stringify(s));
  }, {key,original});
  await page.reload(); await go('/records'); await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.record-paper').count(),5);
  assert.equal(await page.locator('.record-seal').count(),1);
  const partial=page.locator('.record-paper').filter({has:page.locator('a[href="#/report/partial"]')});
  assert.equal(await partial.locator('.record-mark strong').innerText(),'74');
  assert.match(await partial.innerText(),/37 \/ 50/);
  const rounded=page.locator('.record-paper').filter({has:page.locator('a[href="#/report/rounded"]')});
  assert.equal(await rounded.locator('.record-mark strong').innerText(),'100'); assert.equal(await rounded.locator('.record-seal').count(),0);
  assert.equal(await page.locator('.record-ungraded').count(),1);
  assert(await page.evaluate(() => document.fonts.check('20px "Patrick Hand"')));
  await partial.locator('.record-report-link').click(); await page.locator('.score-strip').waitFor();
  await btn('展开本题').first().click(); await page.locator('[data-grade]').fill('50'); await page.locator('[data-grade]').dispatchEvent('change');
  await go('/records'); assert.equal(await page.locator('.record-seal').count(),2);
  for (const route of ['/records','/exam']) {
    await page.setViewportSize({width:390,height:844}); await go(route);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth),390,route+' mobile overflow');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: 115 grounded answer keys; full 3-tier papers; normalized answer sheet; fixed snapshots; cached-bank append/idempotence; submission; score conversion, pending/full/rounded states; live grading; embedded font; mobile.');
} finally {await browser.close();}
