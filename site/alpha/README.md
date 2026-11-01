# LorEvolve alpha page

A static page, separate from the app, that shows what LorEvolve does (the brand mark, no artwork, and one screenshot
per feature from the Lord of the Rings universe on DEV, in `public/assets/shots/`) and takes an anonymous survey. Plan: `docs/design/alpha-demo-page-plan.md`. Nothing here
imports or calls the app.

| Path | What |
| --- | --- |
| `public/` | What is served: `index.html`, `privacy.html`, `styles.css` (a trimmed copy of the app's portal and landing styles), `app.js` (the feature index and the survey dialog), `_headers`, `assets/` (brand mark and icons; feature screenshots in `shots/`; the walkthrough and MCP videos with their posters in `clips/`) |
| `?v=` on `/app.js` and `/styles.css` | Browsers keep those two for 4 hours (the zone's cache setting); bump the date in `index.html` and `privacy.html` whenever either changes, or returning visitors run the old one |
| `functions/api/survey.js` | `POST /api/survey`: Turnstile check, validation, one row per send in D1, nothing about the sender |
| `functions/api/play.js` | `POST /api/play`: one row per video play (`walkthrough`, `mcp`), day only |
| `functions/api/config.js` | `GET /api/config`: the public Turnstile site key |
| `lib/survey.js` | The questions the server accepts and their validation, shared by the function and its check |
| `schema.sql` | The `survey_answers` table, for a new database |
| `migrations/0005-video-plays-and-page-events.sql` | Adds `video_plays` (and the since-dropped `page_events`) to an existing database |
| `migrations/0006-drop-page-events.sql` | Drops `page_events`: page views and clicks are no longer counted (2026-11-01) |
| `migrations/0004-anonymous-survey.sql` | Moves a database from the old alpha application form to the anonymous survey (drops `applications`, `surveys`, `video_plays`) |

The page sends no email and collects nothing that identifies a person.

## Cloudflare setup (owner)

1. **D1**: Workers & Pages > D1 > Create, name it (insert a name). Then run the schema once:
   `npx wrangler d1 execute <database name> --remote --file site/alpha/schema.sql`
2. **Turnstile**: Turnstile > Add widget, hostname `<project name>.pages.dev`, mode Managed. Keep the site key and the
   secret key. With a custom domain, add its hostnames to the widget too, or the survey refuses every send there.
3. **Pages**: Workers & Pages > Create > Pages > Connect to Git > `luisfpires18/lorevolve`.
   - Production branch `dev`. Framework preset None. Build command empty. Build output directory `public`.
   - Root directory `site/alpha`.
   - After creating: Settings > Build > Build watch paths, include `site/alpha/**`, so app pushes do not redeploy it.
4. **Pages settings > Bindings**: D1 database, variable name `DB`, the database from step 1.
5. **Pages settings > Variables and secrets** (Production):
   - `TURNSTILE_SITE_KEY`, type Text, the site key.
   - `TURNSTILE_SECRET`, type Secret, the secret key.
6. Retry the deployment so the bindings apply. Open `https://<project name>.pages.dev` and send a test survey.

Custom domain `demo.lorevolve.com` (DNS on Cloudflare, apex and `www` redirect, Turnstile hostname): `docs/design/custom-domain-plan.md`.

Without `DB` or `TURNSTILE_SECRET` the survey refuses every send (503) instead of storing unchecked input.

## Reading the answers

Dashboard: D1 > the database > Console, or the Tables view. From a terminal:

```
npx wrangler d1 execute <database name> --remote --command "SELECT * FROM survey_answers ORDER BY id"
```

`answers` is JSON holding only what was answered; `created_on` is the day (UTC), never the time.

- Per day: `SELECT created_on, COUNT(*) FROM survey_answers GROUP BY created_on;`
- One answer across sends: `SELECT json_extract(answers, '$.payPreference') AS pay, COUNT(*) FROM survey_answers GROUP BY pay;`
- CSV: Console > run the SELECT > Download.
- Video plays: `SELECT video, COUNT(*) FROM video_plays GROUP BY video;`
- Visits: Cloudflare Web Analytics on the zone; the page counts no views or clicks of its own.
- When the alpha ends: `DROP TABLE survey_answers;` (or delete the database).

If the survey or `privacy.html` changes in substance, bump the version line in `privacy.html`.

## Moving off the old application form (2026-11-01)

The database made for the old form has `applications` (email, name, use case), `surveys` and `video_plays`. Its rows
were exported on 2026-11-01 to a file outside the repository (they hold personal data; the repository is public).
Then, with the owner's yes:

```
npx wrangler d1 execute <database name> --remote --file site/alpha/migrations/0004-anonymous-survey.sql
```

It creates `survey_answers` and drops the three old tables. Nothing is copied over, and it cannot be undone.

## Running it locally

Needs Node. From `site/alpha`, with Cloudflare's published Turnstile test keys (they always pass, never use them live):

```
npx wrangler@4.45.0 d1 execute alpha-local --local --persist-to .wrangler/state -c <a wrangler.toml naming alpha-local> --file schema.sql
npx wrangler@4.45.0 pages dev public --d1 DB=alpha-local --persist-to .wrangler/state --binding TURNSTILE_SECRET=1x0000000000000000000000000000000AA --binding TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

The throwaway `wrangler.toml` for the first command only needs `[[d1_databases]]` with `binding = "DB"` and
`database_name` and `database_id` both `alpha-local`. It is not committed: a `wrangler.toml` in this folder would
override the bindings set in the Pages dashboard.

Validation checks: `node --test site/alpha/lib/survey.test.mjs`.
