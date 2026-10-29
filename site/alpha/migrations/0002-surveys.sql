-- Once, on a database made from the first schema.sql (before the surveys):
--   npx wrangler d1 execute <database name> --remote --file site/alpha/migrations/0002-surveys.sql
-- Earlier applications get no survey token, so they have no survey link; send those testers a fresh application link.
ALTER TABLE applications ADD COLUMN survey_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS applications_survey_token ON applications (survey_token);

CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  part TEXT NOT NULL CHECK (part IN ('signup', 'end')),
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS surveys_application ON surveys (application_id, part);
