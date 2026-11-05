# API现状与后续规划

前缀/api/v1，同源JSON。除health/version外要求登录；写请求要求精确Origin和X-CSRF-Token。错误格式为{error,issues?}，不返回SQL/驱动内部错误。

## v0.2已实现

| 方法/路径 | 权限 | 行为 |
|---|---|---|
| GET /health/live、/health/ready、/version | 无需登录 | 存活、迁移/数据库就绪、版本与能力 |
| POST /auth/login | 同源、IP限速 | email/password，返回user和csrfToken，写HttpOnly会话Cookie |
| GET /auth/me | 已登录 | 当前user及csrfToken，不返回会话token或密码哈希 |
| POST /auth/logout | 已登录、CSRF | 删除当前会话、清Cookie |
| POST /auth/password | 已登录、CSRF、限速 | currentPassword/newPassword，改密后撤销全部会话 |
| GET /admin/users | admin | 最近200个账号，不含哈希 |
| POST /admin/users | admin、CSRF | email/displayName/password/role，role=learner/maintainer/admin |
| PATCH /admin/users/:id | admin、CSRF | enabled:boolean，停用撤销会话，不能停用自己 |
| GET /questions | 已登录 | 已发布内容，cursor/limit游标分页，默认100最多200；不含答案键 |
| GET /questions/:id | 已登录 | 作答前白名单；未发布/下架或父题不可见返回404 |
| POST /questions/:id/check | 已登录、CSRF | version/response，核对当前发布版本；更新冲突409；返回参考question及assessment |
| GET /admin/questions | maintainer/admin | 当前编辑版本、发布版本、etag、hasUnpublishedChanges；同样分页 |
| PUT /admin/questions/:id | maintainer/admin、CSRF | content/expectedRevision/action，action=draft或publish；新建expectedRevision=0 |
| POST /admin/questions/:id/status | maintainer/admin、CSRF | expectedRevision/action，action=publish或archive |
| GET /admin/questions/:id/history | maintainer/admin | 所有不可变修订、创建人/时间、是否曾发布 |

expectedRevision取维护列表返回的etag，不是内容version。每次保存、发布、下架都增加etag；修改内容才增加内容version。409时保持本地编辑，不盲目覆盖；返回题库加载最新版本后再重新编辑。

response为原型兼容的字符串：选择A或A,C、判断“正确/错误”、填空JSON字符串数组、简答自由文字。客观分数只由后端算，忽略客户端传入的score；简答assessment.state=manual，不提供自动语义评分。该check接口不保存云端练习、模拟答卷或掌握自评。

## 后续待实现

- /me/study-goal、练习草稿、practice-attempts和mastery：个人目标、跨设备草稿、练习历史、自评。
- /topics：当前三主题教学内容仍来自前端静态内容，后续内容版本化。
- /papers、/me/exam-attempts及submit/report：真实组卷、幂等交卷、冻结题目版本、服务器复盘。
- /admin/policy-sources和policy-links的review/publish：来源核验与时政增补审批。

待实现路由不供前端调用。所有未来/me接口从会话取user_id，不接受客户端替换归属；当前角色检查不等于未来答卷云同步权限已经建成。
