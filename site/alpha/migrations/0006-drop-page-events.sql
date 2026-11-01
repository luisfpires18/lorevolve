-- Once, on a database that has page_events (made with 0005 or the old schema.sql):
--   npx wrangler d1 execute <database name> --remote --file site/alpha/migrations/0006-drop-page-events.sql
-- Page views and clicks are no longer counted: too much data for too little use. /api/event is gone, so nothing
-- writes here any more. Visits are Cloudflare Web Analytics' job.
DROP TABLE IF EXISTS page_events;
