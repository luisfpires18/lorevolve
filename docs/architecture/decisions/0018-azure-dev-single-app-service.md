# ADR 0018 - DEV is one App Service serving both halves, with state on the site's own share

Status: accepted (2026-09-10)

## Context

Phase 022 had to put LorEvolve somewhere a browser can reach it, over HTTPS, and keep pushing to
`dev` from being a manual chore. Two things about LorEvolve bound the answer.

It is one API and one first-party SPA on the same origin (ADR 0005): the session cookie is
HttpOnly and `SameSite=Strict`, and every lore route is gated on ownership (ADR 0006). Splitting
the client onto a second origin would mean CORS with credentials and a cookie that has to relax
to `SameSite=None`, all to serve files the API can serve itself.

And it stores everything in SQLite (ADR 0002), including an FTS5 index that PostgreSQL will not
implement the same way (ADR 0016). SQLite is one file with one writer. Anything that multiplies
instances, or that puts the file anywhere a deploy can replace, breaks it.

There was also a bug that made the question urgent: migrations only ran in Development, so any
other environment started against an empty file and the search-index backfill died with
`no such table: Entities`. Nothing could deploy until that was answered, and answering it meant
deciding who applies migrations.

## Decision

**One Linux App Service, serving the API and the built client from the same process.** The
client is built and copied into the API's `wwwroot` at publish time; `UseStaticFiles` serves it
and a fallback route hands unmatched paths to `index.html`. A catch-all under `/api` returns 404
so an unknown API path is never answered with the app shell and a 200. All of it is conditional
on `wwwroot/index.html` existing, so development and the test host - which have no `wwwroot` -
are untouched.

Hashed assets under `/assets/` are served `immutable` for a year; everything else, `sw.js`
included, is `no-cache`. A stale service worker or a stale `index.html` would pin a browser to a
frontend the API no longer matches, which is the one caching mistake this shape can make.

**The app migrates itself, before anything reads a table.** `LorEvolveDatabaseInitializer` is a
singleton registered as the first hosted service, exposing `EnsureSchemaAsync`. The search-index
backfill awaits it. Schema readiness is therefore a dependency, not a consequence of
registration order: reordering the two cannot bring the failure back, and nothing sleeps, polls
or retries. `Database:MigrateOnStartup` hands the job to a deployment instead, and says so in
the log when it does.

**State lives on `/home`, not in the deployed content.** SQLite at `/home/data/lorex.db` and the
Data Protection key ring at `/home/data/keys`. On Linux App Service `/home` is an Azure Files
share mounted into the site: it survives restarts and redeploys, while the content directory
does not. Both paths are ordinary configuration and can be overridden by an app setting.

Persisting the key ring is what ADR 0005 left to a deployment. Without it every restart signs
everyone out, because the cookie is encrypted with a key that only existed in memory.

**One worker, and no autoscale.** `numberOfWorkers` is 1. A second instance is a second writer
against one SQLite file.

**Secure by default, relaxed only where plain HTTP is deliberate.** The session cookie is Secure
in every environment except Development and the test host, which serve plain HTTP on purpose.
Azure terminates TLS and forwards `http`, so the app honours `X-Forwarded-Proto` - and only that
header, only when `Hosting:UseForwardedHeaders` says so. `X-Forwarded-For` is deliberately not
forwarded: nothing reads the client address, and App Service's proxy address is not known ahead
of time, so the known-proxy list has to be cleared and any forwarded value would be spoofable
for no gain. A scheme claim can only make the app stricter.

**Two workflows, and no credential in the repository.** `ci.yml` runs the backend Release build,
the tests, the pending-model check, the web typecheck, lint, format and build, and Playwright.
`deploy-dev.yml` calls it, then builds, publishes and deploys - from `dev` only. Sign-in is OIDC
federated identity, so the four Azure values are GitHub *variables*, not secrets.

**Bicep, for two resources.** `infra/main.bicep` declares the plan and the site, parameterized
on name, location, SKU, runtime and allowed hosts, and declares no secret. Two resources is
little enough to click through once and too much to remember correctly the second time.

**PostgreSQL is not introduced.** Phase 022 is DEV infrastructure. Moving off SQLite is a
separate decision with a search rewrite attached to it (ADR 0016).

## Consequences

- **A redeploy is a short outage.** One instance, no slots, no swap. Authored lore survives it,
  because `/home` is not what gets replaced.
- **SQLite runs on an SMB share.** Azure Files locking is weaker than local disk, and a second
  writer could corrupt the file. Nothing in the code defends against that; one worker and no
  autoscale rule are the whole mitigation, and they have to stay.
- **Data Protection keys are unencrypted at rest.** File-system permissions are the only
  protection, and App Service logs `No XML encryptor configured` on every start to say so.
  Anyone who can read `/home/data/keys` can forge a session cookie. Accepted for DEV; production
  needs a key store, which is where ADR 0005's open question moves to rather than closes.
- **Migrations run on the web process**, so a long one delays the first response after a deploy,
  and a second instance would race. Another reason there is exactly one.
- **A rollback does not roll the database back.** Migrations are forward-only, so redeploying an
  older build against a newer schema is not a supported move. The only restore path in DEV is
  the per-universe JSON export (ADR 0014).
- **The test host now proves the real startup path.** It used to migrate itself, because it runs
  as `Testing` and was caught by the same Development-only gate. It no longer does, so all 335
  backend tests boot through the same initializer a deployment uses.
- **`AllowedHosts` is `*` until someone narrows it.** With `X-Forwarded-Host` unforwarded the
  practical risk is small, but it is a default, not a decision.
- **The runbook is the operational half of this ADR** and is expected to drift with Azure:
  `docs/deployment/azure-dev.md`.
