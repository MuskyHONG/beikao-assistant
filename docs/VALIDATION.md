# 验证记录

版本：0.1.0-alpha.1，2026-11-05。

本机环境 Windows、Node.js 24.18.0、npm 11.16.0。

- npm install：通过，已生成并提交 package-lock.json。
- npm run check：通过，API 源码及测试、前端新增 TypeScript、版本一致性检查通过。旧 JSX/JS 尚未启用 checkJs，后续按模块迁移。
- npm test：17 项通过（14 项原型业务规则、3 项 API/配置），包括题型校验、答案核对与主观待评、题目版本、变式关系、倒计时边界、API 就绪失败和敏感错误不泄漏。
- npm run build：前后端构建通过。
- 本机未安装 Docker/PostgreSQL，因此未在本机执行真实 PostgreSQL 和 Compose 测试；CI 设有独立 PostgreSQL 集成测试，以及完整容器启动、反向代理、前端与 API 冒烟检查。远程结果以对应提交的 Actions 记录为准。

当前没有业务 API 的端到端测试，因为业务尚未服务器化。不要把原型本地规则测试当作账号、权限、云同步和共享题库已通过验证的证据。
