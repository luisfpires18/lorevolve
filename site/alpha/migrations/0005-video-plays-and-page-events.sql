-- Once, on a database made before video and click counting:
--   npx wrangler d1 execute <database name> --remote --file site/alpha/migrations/0005-video-plays-and-page-events.sql
-- Until it runs, /api/play answers 500 and the page carries on uncounted. Tables: see schema.sql.
-- page_events was dropped on 2026-11-01 (0006); a database made after that does not need it.
CREATE TABLE IF NOT EXISTS video_plays (
  id INTEGER PRIMARY KEY,
  video TEXT NOT NULL CHECK (video IN ('walkthrough', 'mcp')),
  created_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS page_events (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('view', 'click')),
  target TEXT,
  human INTEGER NOT NULL CHECK (human IN (0, 1)),
  created_on TEXT NOT NULL
);
