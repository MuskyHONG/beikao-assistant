-- Business tables are introduced with the corresponding server-side features.
-- Do not edit an applied migration; add a new numbered migration instead.
CREATE TABLE app_metadata (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_metadata (key, value) VALUES ('schema_stage', 'engineering-foundation');
