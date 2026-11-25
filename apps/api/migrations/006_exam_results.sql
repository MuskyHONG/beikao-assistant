ALTER TABLE exam_attempts ADD COLUMN total_score numeric(8,2)
  CHECK (total_score IS NULL OR (total_score >= 0 AND total_score <= max_score AND state IN ('submitted', 'answer_only')));
CREATE INDEX exam_finished_history ON exam_attempts(user_id, ended_at DESC, id DESC)
  WHERE state IN ('submitted', 'answer_only');

ALTER TABLE exam_answers
  ALTER COLUMN response DROP NOT NULL,
  ADD COLUMN assessment jsonb CHECK (jsonb_typeof(assessment) = 'object'),
  ADD COLUMN objective_score numeric(8,2) CHECK (objective_score >= 0);

CREATE FUNCTION reject_closed_exam_answer_changes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  attempt_state text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT state INTO attempt_state FROM exam_attempts WHERE user_id = NEW.user_id AND id = NEW.attempt_id FOR UPDATE;
  ELSE
    SELECT state INTO attempt_state FROM exam_attempts WHERE user_id = OLD.user_id AND id = OLD.attempt_id FOR UPDATE;
  END IF;
  IF attempt_state <> 'draft' THEN RAISE EXCEPTION 'A closed exam cannot change its original answers'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.user_id, NEW.attempt_id, NEW.item_no) <> (OLD.user_id, OLD.attempt_id, OLD.item_no) THEN
    RAISE EXCEPTION 'An answer cannot move to another exam item';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_closed_answers BEFORE INSERT OR UPDATE OR DELETE ON exam_answers
  FOR EACH ROW EXECUTE FUNCTION reject_closed_exam_answer_changes();

CREATE TABLE exam_grade_events (
  user_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  item_no integer,
  kind text NOT NULL CHECK (kind IN ('rubric', 'objective_override', 'paper')),
  score numeric(8,2) CHECK (score >= 0),
  point_scores jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, attempt_id, revision),
  FOREIGN KEY (user_id, attempt_id) REFERENCES exam_attempts(user_id, id),
  FOREIGN KEY (user_id, attempt_id, item_no) REFERENCES exam_items(user_id, attempt_id, item_no),
  CHECK ((item_no IS NULL) = (kind = 'paper')),
  CHECK ((point_scores IS NOT NULL) = (kind = 'rubric')),
  CHECK (point_scores IS NULL OR jsonb_typeof(point_scores) = 'array')
);
CREATE INDEX exam_grade_by_item ON exam_grade_events(user_id, attempt_id, item_no, revision DESC);
CREATE TRIGGER immutable_exam_grade_events BEFORE UPDATE OR DELETE ON exam_grade_events
  FOR EACH ROW EXECUTE FUNCTION reject_revision_changes();

ALTER TABLE learning_reviews
  ALTER COLUMN source_attempt_id DROP NOT NULL,
  ADD COLUMN source_exam_id uuid,
  ADD COLUMN source_exam_item_no integer,
  ADD CONSTRAINT review_source_exam_item FOREIGN KEY (user_id, source_exam_id, source_exam_item_no)
    REFERENCES exam_items(user_id, attempt_id, item_no),
  ADD CONSTRAINT review_source_choice CHECK (
    (source_attempt_id IS NOT NULL AND source_exam_id IS NULL AND source_exam_item_no IS NULL) OR
    (source_attempt_id IS NULL AND source_exam_id IS NOT NULL AND source_exam_item_no IS NOT NULL)
  );
