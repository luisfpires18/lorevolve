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
