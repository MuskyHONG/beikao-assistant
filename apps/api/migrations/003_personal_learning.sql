CREATE TABLE learning_goals (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  exam_date date NOT NULL,
  daily_hours numeric(2,1) NOT NULL CHECK (daily_hours IN (0.5, 1, 1.5, 2, 3, 4)),
  include_exam_day boolean NOT NULL,
  timezone text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE TABLE learning_drafts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  question_version integer NOT NULL,
  review_id uuid,
  response text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, question_id, question_version, review_id),
  FOREIGN KEY (question_id, question_version) REFERENCES question_revisions(question_id, version)
);

CREATE TABLE learning_attempts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  question_id text NOT NULL,
  question_version integer NOT NULL,
  response text NOT NULL,
  rating text NOT NULL CHECK (rating IN ('weak', 'fuzzy', 'good')),
  checked boolean NOT NULL,
  assessment jsonb,
  review_id uuid,
  focus_point integer CHECK (focus_point >= 0),
  point_result text CHECK (point_result IN ('included', 'missed')),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (question_id, question_version) REFERENCES question_revisions(question_id, version)
);
CREATE INDEX learning_attempts_by_question ON learning_attempts (user_id, question_id, submitted_at DESC, id DESC);
CREATE INDEX learning_attempts_by_time ON learning_attempts (user_id, submitted_at DESC, id DESC);

CREATE TABLE learning_reviews (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  topic text NOT NULL,
  source_attempt_id uuid NOT NULL,
  due_on date NOT NULL,
  focus_text text,
  completed_attempt_id uuid,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, source_attempt_id) REFERENCES learning_attempts(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, completed_attempt_id) REFERENCES learning_attempts(user_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX learning_one_open_review ON learning_reviews (user_id, topic) WHERE completed_attempt_id IS NULL;
ALTER TABLE learning_attempts ADD CONSTRAINT learning_attempt_review
  FOREIGN KEY (user_id, review_id) REFERENCES learning_reviews(user_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE learning_drafts ADD CONSTRAINT learning_draft_review
  FOREIGN KEY (user_id, review_id) REFERENCES learning_reviews(user_id, id) ON DELETE CASCADE;
