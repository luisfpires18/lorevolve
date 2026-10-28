# LorEvolve alpha page

A static page, separate from the app, that explains LorEvolve and takes alpha applications plus a short pricing survey.
Plan: `docs/design/alpha-demo-page-plan.md`. Nothing here imports or calls the app.

| Path | What |
| --- | --- |
| `public/` | What is served: `index.html`, `privacy.html`, `styles.css` (a trimmed copy of the app's portal and landing styles), `app.js` (the dialog), `_headers`, `assets/` |
| `public/assets/shots/` | One 1280x800 WebP per feature card, named as `index.html` references them |
| `functions/api/apply.js` | `POST /api/apply`: Turnstile check, validation, one row per email in D1 |
| `functions/api/config.js` | `GET /api/config`: the public Turnstile site key |
| `lib/application.js` | Validation, shared by the function and its check |
| `schema.sql` | The `applications` table |

The page sends no email. Applications are read by hand in D1.

## Cloudflare setup (owner)

1. **D1**: Workers & Pages > D1 > Create, name it (insert a name). Then run the schema once:
   `npx wrangler d1 execute <database name> --remote --file site/alpha/schema.sql`
2. **Turnstile**: Turnstile > Add widget, hostname `<project name>.pages.dev`, mode Managed. Keep the site key and the
   secret key.
3. **Pages**: Workers & Pages > Create > Pages > Connect to Git > `luisfpires18/lorevolve`.
   - Production branch `dev`. Framework preset None. Build command empty. Build output directory `public`.
   - Root directory `site/alpha`.
   - After creating: Settings > Build > Build watch paths, include `site/alpha/**`, so app pushes do not redeploy it.
4. **Pages settings > Bindings**: D1 database, variable name `DB`, the database from step 1.
5. **Pages settings > Variables and secrets** (Production):
   - `TURNSTILE_SITE_KEY`, type Text, the site key.
   - `TURNSTILE_SECRET`, type Secret, the secret key.
6. Retry the deployment so the bindings apply. Open `https://<project name>.pages.dev` and send a test application.

Without `DB` or `TURNSTILE_SECRET` the form refuses every application (503) instead of storing unchecked input.

## Reading the answers

Dashboard: D1 > the database > Console, or the Tables view. From a terminal:

```
npx wrangler d1 execute <database name> --remote --command "SELECT * FROM applications ORDER BY created_at"
```

- CSV: Console > run the SELECT > Download, or `npx wrangler d1 export <database name> --remote --output applications.sql`.
- Mark a wave invited (after sending the sign-up link from the app's Admin workspace):
  `UPDATE applications SET wave = 1, invited_at = datetime('now') WHERE email = '<email>';`
- A request for a copy: `SELECT * FROM applications WHERE email = '<email>';`
- A request to delete: `DELETE FROM applications WHERE email = '<email>';`
- When the alpha ends: `DROP TABLE applications;` (or delete the database).

If the consent wording or `privacy.html` changes in substance, bump `PRIVACY_VERSION` in `lib/application.js` and the
version line in `privacy.html`.

## Running it locally

Needs Node. From `site/alpha`, with Cloudflare's published Turnstile test keys (they always pass, never use them live):

```
npx wrangler@4.45.0 d1 execute alpha-local --local --persist-to .wrangler/state -c <a wrangler.toml naming alpha-local> --file schema.sql
npx wrangler@4.45.0 pages dev public --d1 DB=alpha-local --persist-to .wrangler/state --binding TURNSTILE_SECRET=1x0000000000000000000000000000000AA --binding TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

The throwaway `wrangler.toml` for the first command only needs `[[d1_databases]]` with `binding = "DB"` and
`database_name` and `database_id` both `alpha-local`. It is not committed: a `wrangler.toml` in this folder would
override the bindings set in the Pages dashboard.

Validation check: `node site/alpha/lib/application.test.mjs`.
