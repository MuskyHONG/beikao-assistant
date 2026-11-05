# API 接口规划

前缀 `/api/v1`，同源 JSON。只有下表“已实现”接口存在，其余为后续契约草案。

| 状态 | 方法 / 路径 | 说明 |
|---|---|---|
| 已实现 | GET /health/live | 进程与版本，数据库故障时依旧 200 |
| 已实现 | GET /health/ready | 基础迁移与数据库就绪为 200，否则 503，不输出驱动错误 |
| 已实现 | GET /version | 工程版本与能力标识 |
| 待实现 | POST /auth/login，POST /auth/logout，GET /auth/me | 会话、限速、角色与 CSRF |
| 待实现 | GET/PUT /me/study-goal | 只访问当前用户目标 |
| 待实现 | GET /topics，GET /topics/:id | 已发布主题和地图 |
| 待实现 | GET /questions，GET /questions/:id | 类型、主题、掌握筛选与分页；作答前不返答案 |
| 待实现 | PUT /me/practice/:questionId/draft | 带题目版本的草稿 |
| 待实现 | POST /me/practice/:questionId/attempts | 幂等提交；由后端按固定题目版本核对客观答案 |
| 待实现 | PUT /me/mastery/:questionId | 明确的自评值和版本；不从分数自动推导 |
| 待实现 | GET /papers，POST /me/exam-attempts | 试卷列表、开始作答与版本冻结 |
| 待实现 | PUT /me/exam-attempts/:id/answers/:itemId | 本人未交卷草稿 |
| 待实现 | POST /me/exam-attempts/:id/submit | 事务交卷、校验题目集合、幂等重复提交 |
| 待实现 | GET /me/exam-attempts/:id/report | 仅本人已交卷答卷，待主观评分明确标注 |
| 待实现 | POST /me/exam-attempts/:id/self-review | 自评来源与教师/AI 建议分开 |
| 待实现 | GET/POST /admin/questions | 维护者及以上；草稿和版本管理 |
| 待实现 | PATCH /admin/questions/:id | expectedVersion，冲突返回 409 |
| 待实现 | POST /admin/questions/:id/publish 或 /archive | 服务端校验、权限与审计；发布不可变版本 |
| 待实现 | GET/POST/PATCH /admin/papers… | 组卷、版本、可用题目与分值校验 |
| 待实现 | GET/POST/PATCH /admin/policy-sources… | 来源核验与有效期 |
| 待实现 | POST /admin/policy-links/:id/review 或 /publish | 审核与发布分开，来源失效可追踪 |

所有 `/me/*` 从服务器会话取 user_id，不接受客户端指定记录归属。维护接口统一鉴权插件，不能只在前端判断角色。请求 schema、响应 schema、错误代码与幂等键规则随每个实现里程碑补齐并测试，后端仍返回 404 的规划接口不供前端调用。
