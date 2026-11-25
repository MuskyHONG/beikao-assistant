# 数据模型规划

v0.3 新增 `learning_goals`、`learning_drafts`、`learning_attempts`、`learning_reviews`。账号、会话、题库及审计沿用 v0.2 数据表。

questions以稳定text题号兼容原型及维护生成ID，current_version/published_version分别指向不可变修订，lock_version每次保存/发布/下架递增。kind/topic/parentId和题型字段在JSONB content中保存，可分别保留草稿与发布版本关系；服务端在串行事务验证父题、主题与可见性，无删除接口。本期知识主题仍由三类固定教学结构提供，未建topics表。

question_publications保留曾发布版本；question_revisions触发器禁止UPDATE/DELETE。写请求expectedRevision必须等于lock_version，否则409。学员作答前响应为显式白名单，不能直接返回content。

用户主键为 UUID，题目为稳定 text 编号，提交时间为 timestamptz。考试日期、复练日期用 date，当前学习日按已保存的时区计算。主题内容、正式试卷、模拟答卷、时政审核等数据表仍为规划。

| 表 | 核心字段/关联 | 约束及索引 |
|---|---|---|
| users | id、email、password_hash、role、enabled | email 规范化唯一；role 枚举约束；不存明文密码 |
| sessions | token_hash、user_id、expires_at | 摘要唯一，用户与过期索引；注销/停用立即撤销 |
| learning_goals | user_id、exam_date、daily_hours、include_exam_day、timezone、revision | 每账号一份当前设置，限定每日时长，修订号检查并行修改 |
| 知识主题与知识卡 | 见下文的主题登记、知识卡修订 | 题目与知识卡共用稳定主题号 |
| questions | id、current_version、published_version、archived、lock_version | 题目 ID 稳定，发布和编辑版本分别指向不可变修订 |
| question_revisions | question_id、version、content、created_by、created_at | `(question_id, version)` 唯一。题型、主题、原题关系、题干及评分依据都保存在 `content` 中，修订不可更新 |
| learning_drafts | user_id、question_id/version、review_id、response、revision | 每账号、题目版本和练习场景一份草稿。普通练习与到期复练独立 |
| learning_attempts | user_id、id、question_id/version、response、rating、assessment、review_id、point_result | 账号加提交编号去重，使用外键固定不可变题目版本，最新一次自评供题目列表使用 |
| learning_reviews | user_id、id、topic、due_on、source_attempt_id、completed_attempt_id、focus_text | 每账号每主题至多一个待复练；来源和完成记录均属同账号 |
| 服务器试用版答卷 | 见下文的试卷快照、作答和评分模型 | 一套随机卷对应一份账号答卷 |
| policy_sources | id、title、issuer、source_url、published_on、verified_at、validity、status | 官方文件和新闻案例分型；来源可追溯；不得以 URL 自动表示核验通过 |
| policy_links | source_id、question_id/version、anchor、addition、applicability、status、reviewer | 多对多关系；基础答案不变；审核状态和发布记录独立 |
| audit_events | actor_id、entity_type/id、action、before_version、after_version、created_at | 追加记录；不存明文会话 token 或用户密码 |

## 四种题型的公开字段与计分字段

下表按用途描述题目数据。当前题库统一存于 `question_revisions.content`，作答前响应和答卷的公开快照分别从中提取允许展示的字段。

| kind | body（作答前可返回） | grading_key（作答前不可返回） |
|---|---|---|
| choice | multiple、options[{id,text}] | correct_option_ids、解析；多选首期全对才得分，不设隐含部分分 |
| judgment | prompt | correct:boolean、判断依据 |
| fill | prompt 中 {{1}}…{{n}}、blank_count | accepted_answers[][]、每空分值、已定义的大小写/空白规范化规则 |
| short | prompt、答题提示 | reference_answer、rubric_points[{id,text,score}]、评分来源 |

服务器按 kind 验证结构：选项 2–8 个且编号不重复，单选唯一答案；填空标记和空数量一致；简答有参考和评分点；分值范围受约束。数据写入时验证，读出时用明确响应 schema 白名单，避免把 JSONB 内答案键泄漏给作答前页面。

题目与试卷软归档，已被答卷引用的版本禁止级联删除。账号删除采取明确的业务清理/匿名化流程，不能简单级联删掉题库及全站审核历史。用户输入的答题内容不进入普通请求日志。

## v0.4 服务器试用版数据设计

沿用现有 `questions`、`question_revisions` 和个人学习表。`004_exam_drafts.sql` 建立知识卡、卷面快照和账号草稿，`005_initial_knowledge.sql` 初始化 23 张知识卡，`006_exam_results.sql` 增加答后评分、评分历史及复练来源。随机卷与答卷共用一个编号，开卷时落库并固定内容。将来需要多名学员做同一份指定卷时，再引入可复用的固定试卷模板。

### 知识卡与题库

- `knowledge_topics` 使用原型中的稳定主题号，例如 `A03`，保存标题、分类、S/A/B 优先级和发布的知识卡版本。`knowledge_card_revisions` 关联主题号，使用原有 `knowledgeId` 和版本号，保留理解句、完整速记段、要点编号及依据。卡片修订只追加，发布指针须指向同主题的修订。速记字和要点正文分别保存，页面和知识提纲共用，关键词未出现在原句时仍可正确排版。
- 先注册现有 `organization`、`collaboration`、`evaluation` 三个主题标识，再加入原型主题。保留已有题号、题目修订和学习记录。新题通过主题号关联知识卡，编题依据可引用具体知识卡版本和要点；仅对有明确对应依据的旧题新增修订，原有历史照常可读。原题、变式用 `parentId` 关系，政策依据和要点放在内容字段。
- 在现有题目修订中增加 `simulation` 和 `difficulty`。旧修订未填写时视为不进入模拟池，维护者可确认后发布新修订加入。选择和判断加入模拟池时标明 `basic` 或 `challenging`。只从已发布且当前可见的题目取题，归档原题时沿用现有规则隐藏其变式。题库网页录入继续使用现有发布和历史流程。
- 初始化按主题号、知识卡版本、题号校验。重复执行跳过相同内容，遇到同 ID 内容冲突逐条报告，不覆盖网站维护过的内容。首批题不足以拼满三档时仍可验收实际题量和难度提示。

### 答卷、答题与评分

| 表 | 首轮字段 | 数据约束 |
| --- | --- | --- |
| `exam_attempts` | `user_id`、`id`、`state`、`revision`、`tier_minutes`、`estimated_minutes`、`rule_version`、`title`、`current_item_no`、开始和结束时间、原卷满分 | 主键 `(user_id, id)`。每账号最多一行 `draft`，用部分唯一索引约束。按结束时间和 ID 查询历史。保存开卷参数以识别重试。 |
| `exam_items` | `user_id`、`attempt_id`、`item_no`、`question_id`、`question_version`、`topic_id`、`kind`、`difficulty`、`max_score`、`public_snapshot`、`grading_snapshot` | 复合外键绑定同账号答卷。每卷的题号和题目 ID 各自唯一。题目版本引用原修订。题干、选项顺序、参考答案、解析、量表和计分规则随卷固定。 |
| `exam_answers` | 同卷同题键、`response`、`objective_score`、`assessment` | 同账号同卷同题唯一，纸笔或在线终结后由数据库触发器锁定。在线卷空题记 0 分，纸笔自核的未填写题保留为空。 |
| `exam_grade_events` | `user_id`、`attempt_id`、`item_no`、`kind`、`revision`、`score`、`point_scores`、`created_at` | 只追加，在线核分必须关联同卷题号。纸笔卷只记整卷手填总分，题号为空。分数汇总与事件同事务写入，保留核分前的客观分。 |

分数用两位小数保存，计分时用整数分值单位计算。选择、判断、填空沿用现有 `assess` 的规则和已配置的可接受答案；空题跳过核对并记 0 分。简答沿用原型量表，已提供每点评分的题直接生成快照，只有文字要点时按要点平均分配，舍入余量放在最后一点。模拟入池校验各点可评分，且量表加总等于题目分值。已有不满足计分精度的题仍可用于原有单题练习，由维护者修订后再加入模拟池。

答卷状态使用 `draft`、`submitted`、`answer_only` 和 `replaced`。交卷与查看答案均是终结操作。`submitted` 的成绩状态由各题评分推导，尚有待评时整卷总分为空。`answer_only` 可保留结束前填过的内容，另记手工总分，留空与 0 分分别保存。`replaced` 不在历史中展示，可用于下一套避重复。纸质卡片百分制分数按原始总分四舍五入，满分章只在原始分等于原卷满分时展示。

### 与现有复练数据联动

扩展 `learning_reviews` 的来源关联。旧记录继续引用 `learning_attempts`，新来源可引用同账号的 `(attempt_id, item_no)`。两种来源必选其一，复练完成仍指向单题作答记录。P13 由用户主动选题安排次日复练，在线卷可选有原答且已经评分的失分题，纸笔自核可手动选本卷题。沿用「每账号每主题最多一个待复练」约束，已有排期返回原任务和日期。打开任务时从相同主题的当前可见题选题；暂时无题时提示并保留待复练项。

### 迁移与初始化顺序

1. 在 `003_personal_learning.sql` 之后追加迁移，先注册知识卡和旧主题标识，再创建答卷子表和新增复练来源约束。已应用迁移、账号、题目指针和已有作答保持原样。
2. 用隔离 PostgreSQL 分别运行全新安装和从 v0.2、v0.3 数据升级。初始化内容可重跑，校验知识卡正文完整、题型与原题关系有效、模拟标记和难度明确。
3. 用实际备份恢复演练检查账号、公开题库、答卷快照、评分及复练来源。旧浏览器模拟演示记录仍在原浏览器，试用版从服务器的新记录开始。
