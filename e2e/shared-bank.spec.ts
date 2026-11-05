import { test, expect, type Page } from '@playwright/test';
const password='E2E.Only.Password.123';
async function login(page:Page,email:string){
  await page.goto('/#/home');await page.getByLabel('邮箱',{exact:true}).fill(email);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('button',{name:'退出登录'})).toBeVisible();
}
test('administrator publishes four types; another account practices and sees versioned updates',async({browser})=>{
  const options={baseURL:process.env.E2E_BASE_URL??'http://127.0.0.1:8080',viewport:{width:1440,height:1000}};
  const adminContext=await browser.newContext(options), learnerContext=await browser.newContext(options);
  const admin=await adminContext.newPage(), learner=await learnerContext.newPage();
  try{
    await login(admin,'admin@e2e.test');await admin.getByRole('link',{name:'题库维护端',exact:true}).click();await admin.getByRole('link',{name:'账号管理',exact:true}).click();
    await admin.getByLabel('姓名',{exact:true}).fill('测试学员');await admin.getByLabel('邮箱',{exact:true}).fill('learner@e2e.test');await admin.getByLabel('初始密码').fill(password);await admin.getByRole('button',{name:'创建账号',exact:true}).click();await expect(admin.getByRole('status')).toContainText('账号已创建');
    await admin.getByRole('link',{name:'题库管理',exact:true}).click();
    const ids:Record<string,string>={};
    for(const kind of ['choice','judgment','fill','short']){
      await admin.getByRole('button',{name:'新增题目',exact:true}).click();await admin.getByLabel('题目类型',{exact:true}).selectOption(kind);
      await admin.getByLabel('列表标题（可选）').fill('端到端-'+kind);
      await admin.getByLabel('维护题干',{exact:true}).fill(kind==='fill'?'这种评价属于{{1}}评价。':'测试题干-'+kind);
      if(kind==='choice'){
        for(const [id,text] of [['A','错误选项'],['B','正确选项'],['C','干扰项一'],['D','干扰项二']])await admin.getByLabel('选项'+id+'内容',{exact:true}).fill(text);
        await admin.getByLabel('设为正确选项B',{exact:true}).check();
      }
      if(kind==='judgment')await admin.getByLabel('判断题正确答案',{exact:true}).selectOption('错误');
      if(kind==='fill')await admin.getByLabel('第1空可接受答案',{exact:true}).fill('形成性\n形成性评价');
      if(kind==='short'){await admin.getByLabel('简答参考答案',{exact:true}).fill('这是用于测试的参考答案。');await admin.getByLabel('简答评分要点',{exact:true}).fill('说明行动与依据');}
      await admin.getByLabel('维护答案解析',{exact:true}).fill('这是对应题型的解析。');
      const saved=admin.waitForResponse(r=>r.url().includes('/admin/questions/')&&r.request().method()==='PUT');
      await admin.getByRole('button',{name:'发布题目',exact:true}).click();
      const response=await saved;expect(response.status()).toBe(200);ids[kind]=(await response.json()).question.id;
      await expect(admin.getByRole('heading',{name:'题库管理',exact:true})).toBeVisible();
    }
    await login(learner,'learner@e2e.test');await expect(learner.getByRole('link',{name:'题库维护端',exact:true})).toHaveCount(0);
    await learner.goto('/#/maintain');await expect(learner.getByRole('heading',{name:'当前账号没有维护权限'})).toBeVisible();
    await learner.goto('/#/practice');
    for(const kind of ['choice','judgment','fill','short']){
      await learner.getByRole('button',{name:new RegExp('端到端-'+kind)}).click();
      await expect(learner.getByRole('heading',{name:'参考答案',exact:true})).toHaveCount(0);
      if(kind==='choice')await learner.getByRole('radio',{name:'B. 正确选项',exact:true}).check();
      if(kind==='judgment')await learner.getByRole('radio',{name:'正确',exact:true}).check();
      if(kind==='fill')await learner.getByLabel('第1空答案',{exact:true}).fill('形成性评价');
      if(kind==='short')await learner.getByLabel('先不看参考，写下你的回答').fill('我的回答包括行动与依据。');
      await learner.getByRole('button',{name:kind==='short'?'对照参考，完成自评':'核对答案并自评',exact:true}).click();
      if(kind==='choice'||kind==='fill')await expect(learner.getByText('参考核对：回答正确',{exact:true})).toBeVisible();
      if(kind==='judgment')await expect(learner.getByText('参考核对：需要修正',{exact:true})).toBeVisible();
      if(kind==='short'){await expect(learner.getByRole('heading',{name:'参考答案',exact:true})).toBeVisible();await learner.getByRole('checkbox',{name:'说明行动与依据',exact:true}).check();}
      await learner.getByRole('button',{name:/能独立回忆/}).click();await learner.getByRole('button',{name:'返回列表看状态',exact:true}).click();
      await expect(learner.getByRole('button',{name:new RegExp('端到端-'+kind)})).toContainText('能独立回忆');
    }
    const list=await learner.request.get('/api/v1/questions');for(const item of (await list.json()).items){expect(item).not.toHaveProperty('correctIds');expect(item).not.toHaveProperty('referenceAnswer');}
    // Saving a new draft must keep the learner on the old published version.
    await admin.goto('/#/maintain/edit/'+ids.choice);await admin.getByLabel('维护题干',{exact:true}).fill('服务器修订后的选择题干');await admin.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(admin.getByRole('heading',{name:'题库管理',exact:true})).toBeVisible();
    let published=await learner.request.get('/api/v1/questions/'+ids.choice);expect((await published.json()).question.prompt).toBe('测试题干-choice');
    const row=admin.locator('.bank-row').filter({hasText:'端到端-choice'});await expect(row).toContainText('有待发布修改');await row.getByRole('button',{name:'发布修改',exact:true}).click();await expect(row).not.toContainText('有待发布修改');
    published=await learner.request.get('/api/v1/questions/'+ids.choice);expect((await published.json()).question.version).toBe(2);
    await learner.reload();await learner.getByRole('button',{name:/端到端-choice/}).click();await expect(learner.getByText('服务器修订后的选择题干',{exact:true})).toBeVisible();
    await expect(learner.locator('.reference-panel')).toHaveCount(0);await expect(learner.getByRole('heading',{name:'这道题的练习记录'})).toBeVisible();
    // Separate browser contexts do not reuse the learner's local mastery record.
    await admin.goto('/#/practice');await expect(admin.getByRole('button',{name:/端到端-choice/})).toContainText('未接触');
    await learner.getByRole('button',{name:'退出登录',exact:true}).click();await expect(learner.getByRole('heading',{name:'登录学习空间'})).toBeVisible();
  }finally{await adminContext.close();await learnerContext.close();}
});
