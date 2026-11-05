CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('learner', 'maintainer', 'admin')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE questions (
  id text PRIMARY KEY,
  current_version integer NOT NULL CHECK (current_version > 0),
  published_version integer,
  archived boolean NOT NULL DEFAULT false,
  lock_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE question_revisions (
  question_id text NOT NULL REFERENCES questions(id),
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, version)
);
ALTER TABLE questions ADD CONSTRAINT current_question_revision
  FOREIGN KEY (id, current_version) REFERENCES question_revisions(question_id, version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE questions ADD CONSTRAINT published_question_revision
  FOREIGN KEY (id, published_version) REFERENCES question_revisions(question_id, version) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE question_publications (
  question_id text NOT NULL,
  version integer NOT NULL,
  published_by uuid NOT NULL REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, version),
  FOREIGN KEY (question_id, version) REFERENCES question_revisions(question_id, version)
);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity ON audit_events(entity_type, entity_id, created_at);

-- Enforce append-only revisions even if a future endpoint accidentally uses UPDATE.
CREATE FUNCTION reject_revision_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published content history is append-only'; END;
$$;
CREATE TRIGGER immutable_question_revisions BEFORE UPDATE OR DELETE ON question_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_revision_changes();
