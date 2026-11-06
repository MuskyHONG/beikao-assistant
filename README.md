# 备考有方

面向备考用户的学习与题目练习工具，另设维护工作台。根据已确认的网页原型逐步建设可独立部署的服务。

**当前版本：v0.2.0-alpha.3（身份权限与共享题库）。** 登录、账号管理、题目版本与发布、客观答案核对已连接 PostgreSQL。备考目标、个人练习、模拟答卷仍保存在当前浏览器，尚未云同步；时政融合仍是未核验草稿预览。

## 技术栈

| 层 | 技术 | 职责 |
|---|---|---|
| 前端 | React 19 + Vite + TypeScript | 用户端、维护端、账号管理；原型 JSX 逐模块迁移 |
| 后端 | Node.js 24 + Fastify 5 + TypeScript | 会话、角色、题型校验、版本发布、客观核对 |
| 数据库 | PostgreSQL 17 + pg + SQL 迁移 | 账号、会话、不可变修订、发布历史和审计 |
| 部署与版本 | Docker Compose + Nginx + GitHub Actions | 独立服务器运行、自动迁移、测试及标签发布 |

## 已完成范围

- 管理员开通学员/维护者/管理员，停用账号立即撤销会话；用户改密撤销全部旧会话。
- 维护者维护选择、判断、填空、简答；保存服务器草稿、预览、发布、下架、查看历史。学员无法调用维护接口。
- 草稿和发布版本分离，保存草稿不替换学员端。并发修改检查修订号，冲突返回409；历史由数据库禁止覆盖。
- 学员读取已发布的共享原题及变式；作答前API不返回答案键，核对接口按服务器答案计分，简答只返回参考和人工自评要点。
- 保留倒计时、知识学习、掌握颜色、模拟交卷后复盘等交互。个人记录按账号分隔保存在本机；更新题目保留旧作答快照及旧版未提交草稿。

没有开放注册、邮件发送、AI阅卷、服务器模拟考试或时政审核发布。首次启动没有默认管理员、默认密码或自动写入的题库。

## 服务器启动

```sh
git clone --branch v0.2.0-alpha.3 --depth 1 https://github.com/MuskyHONG/beikao-assistant.git
cd beikao-assistant
cp .env.example .env
```

填写唯一数据库密码与实际 APP_ORIGIN，按 [部署说明](docs/DEPLOY.md) 配置并启动，然后初始化管理员。

```sh
docker compose up -d --build
python3 scripts/account-input.py bootstrap | docker compose exec -T api node apps/api/dist/bootstrap.js
# 可选：空题库导入11道教学样例（含变式），非官方试题
docker compose exec -T api node apps/api/dist/seed-demo.js
```

## 开发与验证

默认开发网页43126、API43127、Docker部署网页入口43128。不会使用3000或8765，端口占用时不自动跳到其他端口。服务器部署与测试可只安装Docker，无需在宿主机安装Node/PostgreSQL。

Node.js24、npm11及单独PostgreSQL开发库。根.env填入开发DATABASE_URL，APP_ORIGIN=http://127.0.0.1:43126，TRUST_PROXY_HOPS=0。

```sh
npm ci
npm run db:migrate
python3 scripts/account-input.py bootstrap | npm run db:bootstrap
npm run dev:api
# 另一个终端
npm run dev:web
```

访问 http://127.0.0.1:43126。后端不可用时显示错误，不降级到可随意修改的本机题库。

```sh
npm run check
npm test
npm run build
# 仅对独立测试库设置 TEST_DATABASE_URL
npm run test:db
# 需隔离Docker栈及合成测试账号，禁止对业务库执行
npm run test:e2e
```

在服务器跑隔离的完整单元/构建/数据库测试：`bash scripts/test-server.sh`，不映射宿主端口、不接业务数据库。实际拉取、初始化管理员、SSH访问和运行验收见[部署说明](docs/DEPLOY.md)。

apps/web为前端；apps/api为后端、迁移、样例与初始化工具；deploy为容器配置；e2e为真实浏览器跨账号测试。

文档：[技术方案](docs/ARCHITECTURE.md) · [接口](docs/API_PLAN.md) · [数据模型](docs/DATA_MODEL.md) · [部署/恢复](docs/DEPLOY.md) · [版本管理](docs/RELEASING.md) · [实施顺序](docs/ROADMAP.md) · [变更记录](CHANGELOG.md) · [验证](docs/VALIDATION.md)。

原型参考源码：4e438bc96dad595767312576361f59f8c406e89c。原有Sites原型保持原样，此工程不依赖Sites，不包含其凭据或身份配置。
