# 备考有方

面向备考用户的学习与题目练习工具，另设内容维护工作台。根据已确认的网页原型建立可独立部署的工程。

**当前版本：v0.1.0-alpha.1（工程基线）。** 可以运行前端工程预览、后端健康检查、PostgreSQL 迁移和 Docker Compose 部署。前端业务仍保存于当前浏览器，尚未连接账号、共享题库、学习记录 API；不是已经完成服务器化的正式产品。

## 技术栈

| 层 | 选择 | 用途 |
|---|---|---|
| 用户端与维护端 | React 19 + Vite 6 + TypeScript | 同一应用内分离学习和维护入口，沿用确认的界面。现有 JSX/JS 逐模块迁移 |
| 后端 | Node.js 24 LTS + Fastify 5 + TypeScript | REST API、身份权限、题目版本、答题及评分服务 |
| 数据库 | PostgreSQL 17 + pg + SQL 迁移 | 用户、题库、学习记录、模拟答卷、时政来源和审核日志 |
| 部署 | Docker Compose + Nginx | web、api、db，另有一次性迁移任务；同域名 `/api/v1`，数据库不开放公网端口 |
| 代码与版本 | GitHub + GitHub Actions + SemVer | 单仓库、锁定 npm 依赖、自动检查、标签和发布归档 |

不引入 Redis、微服务或必须付费的托管数据库。服务器、域名与可选 AI 服务按实际使用配置。Node 与数据库的支持周期依据 [Node.js 发布计划](https://github.com/nodejs/Release) 和 [PostgreSQL 版本政策](https://www.postgresql.org/support/versioning/)。

## 当前功能范围

- 前端：首页考试倒计时和时间预算；知识地图及学习；四种题型、原题及变式、自评颜色；模拟作答与提交后复盘；题库维护；时政增补草稿预览。全部沿用已确认的原型交互与教学样例，数据仅保存在本浏览器。
- 后端：`/api/v1/health/live`、`/api/v1/health/ready`、`/api/v1/version`。无公开题库写入或业务接口。
- 数据库：迁移账本及工程元数据。迁移有并发锁、校验和与事务回滚；业务表按接入里程碑新增，当前尚未建成题库数据库。
- 工程：类型检查、现有业务规则测试、API 测试、独立 PostgreSQL 集成测试、容器配置、CI 和标签发布流程。

## 快速开始

Node.js 24、npm 11；完整服务器部署另需 Docker Engine 与 Compose v2。

```sh
git clone https://github.com/MuskyHONG/beikao-assistant.git
cd beikao-assistant
git checkout v0.1.0-alpha.1
npm ci
npm run dev:web
```

前端地址：`http://127.0.0.1:4174`。此模式无需数据库；当前界面仍是浏览器存储预览。前后端完整容器启动见 [部署说明](docs/DEPLOY.md)。

```sh
npm run check
npm test
npm run build
# 单独准备 PostgreSQL 测试库，再设置 TEST_DATABASE_URL：
npm run test:db
```

## 目录与实施顺序

```text
apps/web/           已确认原型的工程副本，新代码使用 TypeScript
apps/api/           Fastify 后端、SQL 迁移与测试
deploy/             前后端镜像与 Nginx 配置
docs/               架构、数据模型、接口规划、部署和版本管理
.github/workflows/  CI、Docker 冒烟检查和标签发布
```

按“身份权限 → 共享题库 → 学习记录 → 模拟考试 → 时政审核”的顺序接入真实后端。维护权限先于维护写入 API，评分在服务器再次计算，旧答卷保留当时的题目与答案快照。详细范围和验收标准见 [技术方案](docs/ARCHITECTURE.md) 与 [实施计划](docs/ROADMAP.md)。

完整说明：[数据模型](docs/DATA_MODEL.md) · [接口规划](docs/API_PLAN.md) · [部署](docs/DEPLOY.md) · [版本管理](docs/RELEASING.md) · [时政融合](docs/POLICY_INTEGRATION_PLAN.md) · [变更记录](CHANGELOG.md)。

原型参考版本的源码提交：`4e438bc96dad595767312576361f59f8c406e89c`。本仓库不包含 Sites 身份配置、访问凭据或个人学习数据，也不依赖 Sites 运行。
