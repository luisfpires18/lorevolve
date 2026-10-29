-- The tables behind the alpha page. Run once against the D1 database:
--   npx wrangler d1 execute <database name> --remote --file site/alpha/schema.sql
-- A database made before the surveys existed also needs site/alpha/migrations/0002-surveys.sql, once.
-- Times are ISO 8601 UTC text. wave and invited_at are filled in by hand when a sign-up link goes out.
-- Every send is a row of its own (addresses are not verified, so nothing is ever overwritten); one address may have several.
-- The pay_* and price_* columns hold answers from before pricing moved to the end-of-alpha survey; new rows leave them empty.
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  use_case TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  pay_preference TEXT CHECK (pay_preference IN ('subscription', 'usage', 'one-time', 'other')),
  pay_other TEXT,
  price_too_cheap REAL,
  price_too_expensive REAL,
  suggestion TEXT,
  created_at TEXT NOT NULL,
  wave INTEGER,
  invited_at TEXT,
  survey_token TEXT
);

CREATE INDEX IF NOT EXISTS applications_email ON applications (email);
CREATE UNIQUE INDEX IF NOT EXISTS applications_survey_token ON applications (survey_token);

-- One row per survey send, never updated: the latest row per application and part is current.
-- part is 'signup' (the optional questions after applying) or 'end' (the end-of-alpha survey). answers is JSON,
-- checked by lib/survey.js before it is stored.
CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  part TEXT NOT NULL CHECK (part IN ('signup', 'end')),
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS surveys_application ON surveys (application_id, part);
