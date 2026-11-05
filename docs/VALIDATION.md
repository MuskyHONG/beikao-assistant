# 验证记录

## 0.2.0-alpha.1

本机Node24/npm11：类型检查（含API测试及浏览器测试代码）、20项单元/原型规则测试、前后端构建通过。

第一轮实现9d4e12b已通过[真实PostgreSQL、Docker与浏览器CI](https://github.com/MuskyHONG/beikao-assistant/actions/runs/41949234607)：匿名/角色隔离、CSRF/Origin、账号停用/会话过期、版本不可变、并发冲突、草稿发布分离、原题下架关联变式、四题型核对和游标分页；浏览器中管理员开通学员并发布四题型，独立账号作答、自评、读取发布更新及退出。

后续补充了更强scrypt成本、改密与Secure Cookie验证、初始化/样例导入/重置CLI验证，以及前端请求竞态与键盘焦点处理。最终验证以v0.2.0-alpha.1对应标签的Actions为准，不能把首轮结果替代最终提交。

本机没有Docker/PostgreSQL，真实数据库与容器测试在GitHub隔离环境执行。个人云同步、正式组卷答卷、时政审核及AI尚未实现，因此没有这些功能已通过的结论。

## 0.1.0-alpha.1（历史）

版本：0.1.0-alpha.1，2026-11-05。

本机环境 Windows、Node.js 24.18.0、npm 11.16.0。

- npm install：通过，已生成并提交 package-lock.json。
- npm run check：通过，API 源码及测试、前端新增 TypeScript、版本一致性检查通过。旧 JSX/JS 尚未启用 checkJs，后续按模块迁移。
- npm test：17 项通过（14 项原型业务规则、3 项 API/配置），包括题型校验、答案核对与主观待评、题目版本、变式关系、倒计时边界、API 就绪失败和敏感错误不泄漏。
- npm run build：前后端构建通过。
- 本机未安装 Docker/PostgreSQL，因此未在本机执行真实 PostgreSQL 和 Compose 测试；CI 设有独立 PostgreSQL 集成测试，以及完整容器启动、反向代理、前端与 API 冒烟检查。远程结果以对应提交的 Actions 记录为准。

当前没有业务 API 的端到端测试，因为业务尚未服务器化。不要把原型本地规则测试当作账号、权限、云同步和共享题库已通过验证的证据。
