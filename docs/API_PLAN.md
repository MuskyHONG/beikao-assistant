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

## v0.3 个人学习接口

| 方法与路径 | 行为 |
|---|---|
| `GET /me/study` | 返回登录账号的目标、时区、当前日期、每题最新自评和待复练任务。 |
| `PUT /me/study-goal` | 提交 `examDate`、`dailyHours`、`includeExamDay`、`timezone`、`revision`。首次修订号为 0，冲突返回 `409 study_goal_conflict`。 |
| `GET /me/practice/:id` | 返回当前账号的该题草稿与最近 30 次自评。可用 `reviewId` 查询该次复练的独立草稿。 |
| `PUT /me/practice/:id/draft` | 提交题目 `version`、`response`、`expectedRevision` 和可选 `reviewId`。相同内容重试返回原记录，冲突返回 `409 study_draft_conflict`。 |
| `POST /me/practice/:id/hint` | 显式查看简答参考和要点。请求包含 `version`，可在空白作答时打开。 |
| `POST /me/practice/:id/attempts` | 提交 `submissionId`、`version`、`response`、`rating`、`checked`。可选 `reviewId`、零起始 `focusPoint`、`pointResult`。保存作答与排期在同一事务中完成。 |
| `GET /me/practice-history` | 按登录账号分页返回历史，版本、题干、原答和成绩从当时的题目修订读取。以返回的 `next` 作 `before` 查询参数。 |

账号归属取自会话。写请求沿用同源与 CSRF。题目版本更新返回 `409 question_updated`。同账号重复提交同一编号和相同内容返回第一次记录；编号相同而内容不同时返回 `409 practice_submission_conflict`。`reviewId` 仅可完成本人已到期且与作答同主题的待复练。选填的要点结果来自用户自查。

## v0.4 服务器试用版接口契约

下面的路径沿用 `/api/v1` 前缀，所列接口已在工作区接入。账号与权限取自服务器会话。答卷响应仅提供给答卷所属账号，其他账号返回 404。写请求沿用同源与 CSRF 校验。数据来源及关联见[试用版数据设计](DATA_MODEL.md#v04-服务器试用版数据设计)。

| 页面 | 方法与路径 | 请求或返回 |
| --- | --- | --- |
| P04、P05、P14 | `GET /topics` | 返回发布的主题、版本化知识卡和可打印片段，使用稳定主题号。学员掌握度从现有 `/me/study` 独立读取。 |
| M01 | 现有 `PUT /admin/questions/:id` 与发布接口 | 沿用 `expectedRevision`。校验已登记主题和原题关系，同步接收模拟池标记、难度及可选编题依据。 |
| P09 | `GET /me/exams/availability` | 返回推荐档、已保存草稿摘要及三个档位的可组题数、预计用时、分题型目标和实际数量、难度缺额。预览发生变化时，以实际组出的卷为准。 |
| P09 | `POST /me/exams` | 提交新建 UUID `attemptId` 和 `tierMinutes`，替换时另带用户已确认的 `replaceDraft`，其中含 `id`、`revision`。返回实际卷面、可续答位置和修订号。没有可用题时保留现有草稿。 |
| P10、P11、P14 空白卷 | `GET /me/exams/:id` | 返回本卷题序、题型、题干、选项、填空数量、满分、预计用时、当前题号和本人已保存原答。空白卷用同一结果打印并隐藏原答。 |
| P10 | `PATCH /me/exams/:id/draft` | `expectedRevision` 必填，可更新 `currentItemNo`、一题的回答或同时更新两者。回答使用 `itemNo` 和 `response`，格式沿用四题型现有字符串约定，清空传 `null`。 |
| P11 | `POST /me/exams/:id/submit` | 提交已保存修订号 `expectedRevision`，至少一题有有效原答。原子冻结原答、计算客观分并返回当前成绩状态。已交卷可用同一操作重试。 |
| P10 | `POST /me/exams/:id/reveal` | 确认结束在线作答后提交 `expectedRevision`，空白草稿也可转纸笔自核。保留原答，在同一个编号生成答案记录。 |
| P12 | `GET /me/exams` | 只列本账号已交卷和纸笔自核记录，返回 `items` 和 `nextCursor`。传 `before=nextCursor` 继续翻页，排序依据为该答卷结束时间与 UUID。每页默认 20 条。 |
| P13、P14 答案及复盘 | `GET /me/exams/:id/report` | 仅允许 `submitted` 和 `answer_only`。回传当时的参考答案、解析与量表。在线卷还返回逐题核对和评分状态，纸笔卷仅回传手工总分和已保留原答。 |
| P13 | `PUT /me/exams/:id/items/:itemNo/grade` | 在线卷提交 `expectedRevision`。简答传完整 `pointScores` 数组，各项以 `null` 表示待评。已作答客观题传 `score`，以 `null` 恢复自动分。服务器按快照校验并返回更新后的 `report`。 |
| P13 | `PUT /me/exams/:id/paper-score` | 仅纸笔自核，提交 `expectedRevision` 与 `score`。区间为 0 到原卷满分，`null` 清空总分。 |
| P13 → P02 → P07 | `POST /me/exams/:id/items/:itemNo/review` | 校验该题允许排期，返回新建或已有待复练任务和到期日。P02 现有接口返回该任务，P07 完成后写回同一条排期。 |

### 状态与并发约定

- 交卷、查看答案、复盘和评分更新返回 `report`。概要有 `totalScore`、`maxScore`、`percent` 和 `isPerfect`，以及 `scored`、`pending_review`、`paper_unscored` 三种成绩状态。逐题返回 `reference` 和原答，在线卷还有 `assessment`、`objectiveScore`、最终参考 `score` 及其 `scoreSource`。最多两位小数，客观分与人工调整独立保存。

- 开卷在一个事务内完成候选查询、抽题、快照生成和草稿替换。`attemptId` 只用于同账号同参数的重试，重新抽卷使用新编号。重复请求返回同一套题。已有草稿时，旧的替换确认不能覆盖新设备上的新稿。
- 草稿更新、交卷、转纸笔及核分共用答卷修订号。同一更新重试且目标字段已保存时回当前结果。旧修订内容与服务器不同则返回 `409 exam_revision_conflict`，提供当前修订。前端读回原稿并保留本机未同步输入，等用户选择后再写。交卷和看答案按钮先等待待保存的改动处理完，再带最新修订号提交。
- 并行交卷与看答案只允许一个状态先落库。同一个终结动作重复调用返回已存在的结果，另一动作返回 `409 exam_state_conflict`。`409 exam_pool_empty` 保留已存在的草稿，`422 exam_no_answers` 提示在线卷至少答一题。尝试在草稿阶段打开复盘与答案返回 `409 exam_report_unavailable`。
- 所有草稿接口采用明确的公开字段列表，排除正确选项、可接受答案、简答量表和解析。报告、个人历史和用户作答响应禁止共享缓存。空白卷和复盘分别使用匹配的响应和打印视图。教学卷的题目仍可通过正常的单题学习流程独立复习，首轮无考场管控机制。

## 后续接口

- `/admin/policy-sources` 和 `policy-links` 的审核与发布接口留待时政内容治理阶段。
