-- The one table behind the alpha page. Run once against the D1 database:
--   npx wrangler d1 execute <database name> --remote --file site/alpha/schema.sql
-- Times are ISO 8601 UTC text. wave and invited_at are filled in by hand when a sign-up link goes out.
-- Every send is a row of its own (addresses are not verified, so nothing is ever overwritten); one address may have several.
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
  invited_at TEXT
);

CREATE INDEX IF NOT EXISTS applications_email ON applications (email);
