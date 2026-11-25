CREATE TABLE knowledge_topics (
  id text PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL,
  priority text CHECK (priority IN ('S', 'A', 'B')),
  position integer NOT NULL DEFAULT 0,
  published_card_id text,
  published_card_version integer,
  CHECK ((published_card_id IS NULL) = (published_card_version IS NULL))
);

CREATE TABLE knowledge_card_revisions (
  topic_id text NOT NULL REFERENCES knowledge_topics(id),
  card_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  PRIMARY KEY (topic_id, card_id, version)
);
ALTER TABLE knowledge_topics ADD CONSTRAINT published_card_revision
  FOREIGN KEY (id, published_card_id, published_card_version)
  REFERENCES knowledge_card_revisions(topic_id, card_id, version);
CREATE TRIGGER immutable_knowledge_cards BEFORE UPDATE OR DELETE ON knowledge_card_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_revision_changes();

INSERT INTO knowledge_topics (id, title, category) VALUES
  ('organization', '组织与管理', '组织与管理'),
  ('collaboration', '家校社协同', '家校社协同'),
  ('evaluation', '教育评价', '教育评价');

CREATE TABLE exam_attempts (
  user_id uuid NOT NULL REFERENCES users(id),
  id uuid NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'submitted', 'answer_only', 'replaced')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  tier_minutes integer NOT NULL CHECK (tier_minutes IN (20, 40, 60)),
  estimated_minutes integer NOT NULL CHECK (estimated_minutes > 0),
  rule_version integer NOT NULL CHECK (rule_version > 0),
  title text NOT NULL,
  max_score numeric(8,2) NOT NULL CHECK (max_score > 0),
  current_item_no integer NOT NULL DEFAULT 1 CHECK (current_item_no > 0),
  replace_draft_id uuid,
  replace_draft_revision integer CHECK (replace_draft_revision > 0),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  PRIMARY KEY (user_id, id),
  CHECK ((state = 'draft') = (ended_at IS NULL)),
  CHECK ((replace_draft_id IS NULL) = (replace_draft_revision IS NULL))
);
CREATE UNIQUE INDEX exam_one_draft_per_user ON exam_attempts(user_id) WHERE state = 'draft';
CREATE INDEX exam_draw_history ON exam_attempts(user_id, started_at DESC, id DESC);

CREATE TABLE exam_items (
  user_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  item_no integer NOT NULL CHECK (item_no > 0),
  question_id text NOT NULL,
  question_version integer NOT NULL,
  topic_id text NOT NULL REFERENCES knowledge_topics(id),
  kind text NOT NULL CHECK (kind IN ('choice', 'judgment', 'fill', 'short')),
  difficulty text CHECK (difficulty IN ('basic', 'challenging')),
  max_score numeric(8,2) NOT NULL CHECK (max_score > 0),
  public_snapshot jsonb NOT NULL CHECK (jsonb_typeof(public_snapshot) = 'object'),
  grading_snapshot jsonb NOT NULL CHECK (jsonb_typeof(grading_snapshot) = 'object'),
  PRIMARY KEY (user_id, attempt_id, item_no),
  UNIQUE (user_id, attempt_id, question_id),
  FOREIGN KEY (user_id, attempt_id) REFERENCES exam_attempts(user_id, id),
  FOREIGN KEY (question_id, question_version) REFERENCES question_revisions(question_id, version)
);
CREATE TRIGGER immutable_exam_items BEFORE UPDATE OR DELETE ON exam_items
  FOR EACH ROW EXECUTE FUNCTION reject_revision_changes();

CREATE TABLE exam_answers (
  user_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  item_no integer NOT NULL,
  response text NOT NULL,
  PRIMARY KEY (user_id, attempt_id, item_no),
  FOREIGN KEY (user_id, attempt_id, item_no) REFERENCES exam_items(user_id, attempt_id, item_no)
);
