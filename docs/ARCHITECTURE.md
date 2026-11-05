# 技术方案与系统边界

日期：2026-11-05。v0.2.0-alpha.1已接入身份权限与共享题库。目标、个人练习、模拟答卷和时政草稿仍保存在浏览器；下表包含后续目标，以README完成范围为准。

## 应用结构

浏览器加载 Nginx 提供的 React 静态页面；同域 `/api/v1/*` 代理到 Fastify；Fastify 通过连接池访问 PostgreSQL。只有 Nginx 的 HTTP 端口暴露到宿主机，默认监听 127.0.0.1:43128，由服务器现有 HTTPS 反向代理接入域名。

用户端和维护端放在同一前端工程，使用不同路由布局。它们共用后端和数据库，不拆成两个数据库。维护端不是仅靠隐藏菜单隔离，服务器必须逐请求验证身份和角色。未来如需独立维护域名，可复用同一 API 的维护权限策略。

| 模块 | 用户侧 | 服务端职责 | 主要数据 |
|---|---|---|---|
| 首页 | 日期、每日时长、倒计时、时间预算 | 保存个人目标；返回目标设置，不保存每分钟变化的倒计时 | study_goals |
| 知识学习 | 知识地图 → 主题内容 | 发布版本、主题层级、关联题目 | topics、topic_revisions |
| 题目练习 | 题组列表 → 原题 ↔ 变式 | 筛选、可见性、题目版本、作答快照、客观核对 | questions、question_revisions、practice_attempts |
| 掌握自评 | 白/待自评/红/黄/绿及文字 | 每用户每题版本独立保存，不从对错自动推断 | mastery_records |
| 模拟考试 | 试卷 → 完整答题 → 交卷 → 报告 | 冻结试卷与题目版本、幂等交卷、评分、人工复核 | papers、paper_versions、exam_attempts、exam_answers |
| 维护 | 新增、编辑、预览、审核、发布、归档 | 角色授权、校验、并发修改冲突、版本与审计 | 内容版本、audit_events |
| 时政 | 练习中关联来源和增补段落 | 来源核验、映射、审核、失效提醒、发布独立版本 | policy_sources、policy_links |

## 技术选择

- **React 19 + Vite + TypeScript**：沿用已确认的 React 界面，避免换框架重做交互。新模块用 TS；旧 JSX 在接 API 时按模块迁移。当前应用以学习操作为主，不需要搜索引擎收录，因此暂不引入 SSR。
- **Node.js 24 LTS + Fastify 5 + TypeScript**：前后端同一语言，便于复用题型类型和纯函数；API使用JSON Schema验证请求，作答前返回值使用显式白名单。评分、鉴权及可见性以服务器判断为准。
- **PostgreSQL 17 + pg**：用户、题目版本与答卷之间关系明确，需要事务和外键。用普通列保存身份、状态、关系和分值，JSONB 保存不同题型结构；SQL 迁移直接进入 Git，不依赖在线控制台。第一阶段不加 ORM，减少生成层与迁移来源不一致。
- **Docker Compose + Nginx**：一台普通 Linux 服务器可承载初始阶段，之后可迁托管 PostgreSQL 或拆分服务。以代码版本和锁文件重建，不依赖原来的 Sites 服务。
- **GitHub Actions**：检查类型、测试、构建、数据库迁移、容器可启动性。通过检查的 `v*` 标签自动生成源代码发布归档。

单仓库通过 npm workspaces 管理。API 地址固定在 `/api/v1`，前端同源请求，开发时由 Vite 代理，部署时由 Nginx 代理。暂不增加 CORS 配置、Redis、消息队列、微服务或全文向量数据库。

## 身份与权限（已实现）

邮箱/密码配服务器会话。使用Node原生scrypt，N=65536、r=8、p=2，随机16字节盐和64字节派生键，timingSafeEqual比较；格式scrypt-v1固定参数，未来更改成本须增加格式版本。参考[OWASP密码存储指南](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)及[Node crypto文档](https://nodejs.org/docs/latest-v24.x/api/crypto.html)。

会话token为32字节随机数，数据库仅存SHA256摘要及绝对有效期，Cookie为HttpOnly/SameSite=Lax，HTTPS时自动加Secure。CSRF从会话token以不同域前缀单向派生，由同源me接口返回；写请求同时校验精确APP_ORIGIN与CSRF，不从任意Host头推断来源。Cookie与CSRF不进日志或localStorage。

登录每IP每15分钟10次，改密5次；限速存在单实例内存中，重启会清空，多实例时须换共享存储。TRUST_PROXY_HOPS只配置实际可信代理层数。账号停用、改密和服务器重置撤销会话；角色和启停逐请求查库，隐藏菜单只负责界面。

首期不开放注册，通过stdin服务器命令创建首个管理员；管理员网页开通其他账号，不依赖短信/邮件。learner读取已发布题目和核对答案；maintainer另外维护/发布/下架题目及查看历史；admin另外开通和启停账号。维护者本期可直接发布题目；时政审核为后续独立流程。当前个人记录在本机按账号分区，不能称为答卷云端权限已经完成。

首次初始化在users非空时拒绝执行，无默认密码。lock_version防并发覆盖；question_revisions触发器禁止修改和删除，草稿修订也保留历史。

## 发布与作答一致性

1. 保存追加修订，草稿不改变published_version；发布指针、审计与发布历史同事务提交。原题下架时其变式一起从学员可见集合消失。
2. 用户读取的仅为已发布版本；题目列表与作答前响应不携带标准答案和内部审核字段。提交后由服务器返回解析及客观核对结果。
3. 旧练习/答卷引用当时的版本和快照；新版题目不覆盖旧成绩。题目新版的掌握状态重新待自评，旧版历史仍可查看。
4. 客观单题由服务器确定性核对，尚不保存云端练习；主观返回manual，不做语义自动计分。模拟样卷仍在本机按量表自评；后续服务器答卷须区分评分来源，主观待评时不显示最终分。
5. AI 仅作为后续可选评分建议服务；真实接入前无 AI 开关和假结果。本期不申请 API Key。

## 运维边界

- 当前工程仅单机部署，PostgreSQL 以命名卷持久化；备份与恢复使用 pg_dump/pg_restore，不能把 Git 当作数据库备份。
- 所有迁移不可修改已应用文件；新增迁移必须兼容升级窗口。先备份再升级，不做自动反向删表回滚。
- `.env` 只放服务器本机，不提交 Git；数据库不开放公网端口，API 也不直接映射公网。
- `/health/live` 判断进程；`/health/ready` 判断数据库与基础表；`/version` 明示工程阶段和能力。
- Docker 基础镜像锁定主版本，npm 锁文件锁定依赖。本期尚未固定基础镜像 digest；正式发布前固定已验证镜像摘要并建立更新节奏。
- 暂不导入原型 localStorage。用户日后需要迁移时，设计显式导出、预览、归属验证与确认导入，避免把别人的本机记录误关联到账号。

版本依据：[Node.js 发布计划](https://github.com/nodejs/Release)、[Fastify v5 迁移说明](https://github.com/fastify/fastify/blob/main/docs/Guides/Migration-Guide-V5.md)、[PostgreSQL 支持政策](https://www.postgresql.org/support/versioning/)。
