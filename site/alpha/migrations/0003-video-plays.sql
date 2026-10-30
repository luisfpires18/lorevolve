-- Once, on a database made before the play counter:
--   npx wrangler d1 execute <database name> --remote --file site/alpha/migrations/0003-video-plays.sql
-- Until it runs, /api/play answers 500 and the page carries on; plays are simply not counted.
-- One row per video play, at most once per video per page load. Only which video and when: nothing about the viewer.
CREATE TABLE IF NOT EXISTS video_plays (
  id INTEGER PRIMARY KEY,
  video TEXT NOT NULL CHECK (video IN ('walkthrough', 'mcp')),
  created_at TEXT NOT NULL
);
