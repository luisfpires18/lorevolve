-- The one table behind the alpha page. Run once against a new D1 database:
--   npx wrangler d1 execute <database name> --remote --file site/alpha/schema.sql
-- A database made before the anonymous survey needs site/alpha/migrations/0004-anonymous-survey.sql instead, once.

-- One row per anonymous survey send, never updated. answers is JSON, checked by lib/survey.js before it is stored.
-- Nothing about the sender: no name, no email, no IP, no token, and the day only (YYYY-MM-DD, UTC), not the time.
CREATE TABLE IF NOT EXISTS survey_answers (
  id INTEGER PRIMARY KEY,
  answers TEXT NOT NULL,
  created_on TEXT NOT NULL
);

-- One row per video play, at most once per video per page load. Which video and the day: nothing about the viewer.
CREATE TABLE IF NOT EXISTS video_plays (
  id INTEGER PRIMARY KEY,
  video TEXT NOT NULL CHECK (video IN ('walkthrough', 'mcp')),
  created_on TEXT NOT NULL
);

-- One row per page view or click, nothing about the visitor: no IP, no cookie, no user agent, the day only.
-- kind: 'view' (sent when the page is left) or 'click' (target: the link's #feature or a data-track name).
-- human: 1 when the browser reported a real pointer, key or touch input and no automation flag, and the user agent
-- does not name a crawler; 0 otherwise. A guess, not proof: a careful bot can pass, a keyboard-free reader cannot fail.
CREATE TABLE IF NOT EXISTS page_events (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('view', 'click')),
  target TEXT,
  human INTEGER NOT NULL CHECK (human IN (0, 1)),
  created_on TEXT NOT NULL
);
