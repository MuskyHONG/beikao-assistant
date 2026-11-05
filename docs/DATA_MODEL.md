# 数据模型规划

以下是待业务接入时逐步落地的模型。当前数据库实际仅包含 schema_migrations 和 app_metadata，不能据此文档认为业务表已建成。

所有业务主键使用 UUID；时间戳使用 timestamptz。考试目标保留 date、时区和是否含考试当天，避免把本地日期转换成 UTC 后偏移。列表采用游标分页与组合索引，分值使用 numeric，不采用浮点累计。

| 表 | 核心字段/关联 | 约束及索引 |
|---|---|---|
| users | id、email、password_hash、role、enabled | email 规范化唯一；role 枚举约束；不存明文密码 |
| sessions | token_hash、user_id、expires_at | 摘要唯一，用户与过期索引；注销/停用立即撤销 |
| study_goals | user_id、exam_date、daily_minutes、include_exam_day、timezone | 一用户一个当前目标；每日分钟范围约束；服务端不接受负值 |
| topics/topic_revisions | topic_id、parent_id、version、content | 主题父子关系；发布内容不可变；防循环 |
| questions | id、parent_id、topic_id、current_revision、published_revision、status | 原题 parent_id 为空；变式指向原题；不允许跨主题或多层变式 |
| question_revisions | question_id、version、kind、prompt、body、grading_key、max_score、source | (question_id, version) 唯一；body/grading_key 为 JSONB；发布版本不可变 |
| practice_drafts | user_id、question_id、question_version、response、updated_at | 每用户每题版本唯一；不包含题目答案键 |
| practice_attempts | user_id、question_id/version、question_snapshot、response、result、submitted_at | 用户与提交时间索引；提交幂等键；提交后原始答题不可覆盖 |
| mastery_records | user_id、question_id、question_version、rating、updated_at | 每用户每题版本唯一；rating=forgot/fuzzy/recalled；打开和自评分别存 |
| papers/paper_versions | paper_id、version、title、sections、time_limit、status | 试卷版本固定题目版本与分值，题型顺序和总分可复核 |
| exam_attempts | user_id、paper_version、status、started_at、submitted_at、snapshot | draft/submitted/graded；交卷事务与幂等键；不允许越权读取 |
| exam_answers | attempt_id、item_id、response、objective_score、manual_score、grading_state | 一份答卷每道题唯一；得分来源分开；空题明确记零；题目快照保留 |
| grading_reviews | answer_id、actor_id、rubric_version、points、score、source | 手工/未来 AI 建议/教师复核分开；每次变更追加记录 |
| policy_sources | id、title、issuer、source_url、published_on、verified_at、validity、status | 官方文件和新闻案例分型；来源可追溯；不得以 URL 自动表示核验通过 |
| policy_links | source_id、question_id/version、anchor、addition、applicability、status、reviewer | 多对多关系；基础答案不变；审核状态和发布记录独立 |
| audit_events | actor_id、entity_type/id、action、before_version、after_version、created_at | 追加记录；不存明文会话 token 或用户密码 |

## 四种题型的 JSONB 结构

| kind | body（作答前可返回） | grading_key（作答前不可返回） |
|---|---|---|
| choice | multiple、options[{id,text}] | correct_option_ids、解析；多选首期全对才得分，不设隐含部分分 |
| judgment | prompt | correct:boolean、判断依据 |
| fill | prompt 中 {{1}}…{{n}}、blank_count | accepted_answers[][]、每空分值、已定义的大小写/空白规范化规则 |
| short | prompt、答题提示 | reference_answer、rubric_points[{id,text,score}]、评分来源 |

服务器按 kind 验证结构：选项 2–8 个且编号不重复，单选唯一答案；填空标记和空数量一致；简答有参考和评分点；分值范围受约束。数据写入时验证，读出时用明确响应 schema 白名单，避免把 JSONB 内答案键泄漏给作答前页面。

题目与试卷软归档，已被答卷引用的版本禁止级联删除。账号删除采取明确的业务清理/匿名化流程，不能简单级联删掉题库及全站审核历史。用户输入的答题内容不进入普通请求日志。
