-- Once, on a database made before the anonymous survey (owner decision, 2026-11-01):
--   npx wrangler d1 export <database name> --remote --output <a file outside the repository>
--   npx wrangler d1 execute <database name> --remote --file site/alpha/migrations/0004-anonymous-survey.sql
-- Export first: this deletes every application (email, name, use case), every survey tied to one, and the video play
-- counts. Nothing is copied over; survey_answers starts empty. It cannot be undone.
CREATE TABLE IF NOT EXISTS survey_answers (
  id INTEGER PRIMARY KEY,
  answers TEXT NOT NULL,
  created_on TEXT NOT NULL
);

DROP TABLE IF EXISTS surveys;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS video_plays;
