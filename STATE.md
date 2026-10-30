# STATE

Current operational state only, as of 2026-10-29. Trim instead of appending: when work merges, delete its line here;
git history and ADRs keep the detail. History before this trim: `docs/history/state-archive-2026-10.md`.

## Pointers

- Architecture decisions: `docs/architecture/decisions/README.md`. Files and responsibilities: `SYSTEMS.md`.
- Branches, naming, sequence log: `docs/architecture/branching.md`. Tooling rules: `.claude/CLAUDE.md`.
- Runbooks: `docs/deployment/azure-prod.md`, `docs/deployment/azure-dev.md`, `docs/deployment/cloudflare-r2.md`,
  `docs/deployment/assistant-limits-and-cost.md`, `docs/recovery/database-backups.md`,
  `docs/recovery/universe-recovery.md`. Domain and email layout: `docs/design/custom-domain-plan.md`.
- Security assessment and open findings: `docs/security/alpha-security-assessment.md`.
- Manual checklists: `docs/testing/` (PWA, maps, MCP images).

## What is live

- **PROD** https://lorevolve.com, version `1.0.0-alpha`, invite-only alpha. App Service `prod-lorevolve` on B1 in
  `rg-lorevolve-prod`, SQLite on `/home`, media in R2 `lorevolve-media-prod`. Search indexing off
  (`PublicSite__AllowIndexing` unset) until launch. Last deploy: run 40913655940 on `master` `9c755d1`, succeeded.
- **DEV** https://dev-lorevolve.azurewebsites.net, F1 in `rg-lorevolve-dev`, media in R2 `lorevolve-media-dev`.
  Deploys automatically on every push to `dev` (`deploy-dev.yml`; shown version `0.1.N-dev`).
- **Demo / alpha page** https://demo.lorevolve.com, deploys only from the `demo` branch, separate from `dev` and
  `master`. Plan: `docs/design/alpha-demo-page-plan.md`. AI in demos only records what the author dictates.
- **Repo** `luisfpires18/lorevolve` (public). `dev` is the default branch; `master` is what PROD runs.
- **Database backups**: daily PROD SQLite snapshot to R2 `lorevolve-db-backups-prod` (lock rule `keep-7-days`).
  Restore drill (`database-backup restore-drill --latest --check-media`) run by the owner against PROD on 2026-10-29:
  PASSED in 1.89 s on the 10:52 UTC backup (1 account, 0 universes, schema `20261028194705_AddFeedbackReports`). That
  proves the pipeline, not a realistic size; repeat once alpha users have real universes.
- **Email**: Resend, send-only from `noreply@lorevolve.com`. `support@lorevolve.com` forwards to the owner.

## How a release works

1. Work lands on `dev` (numbered branches off `dev`, `docs/architecture/branching.md`); DEV redeploys by itself.
2. When the owner asks: merge `dev` into `master` and push `master`.
3. `gh workflow run deploy-prod.yml --ref master` (or Actions > Deploy PROD). The `prod` environment has a required
   reviewer. Never push, merge or deploy without the owner's explicit go-ahead.

As of 2026-10-29 `origin/master..origin/dev` is empty: everything on `dev` is in PROD.

## In flight

One line per branch. Delete the line when it merges.

- Forgot password (#69), app email reply-to and the health version are on `dev`, not yet on PROD.
- **Workspace load chain** (`fix/workspace-load-chain` off `dev` at `e9346f2`, not merged): types read beside the
  universe, section chunks preloaded with no Suspense fallback, types counts in grouped queries. Lore's data at 164 ms
  instead of 529 on loopback, no 300 ms throttle. Audit section 9.

## Committed, not on `dev`

Checked 2026-10-29 with `git log origin/dev..<branch>`.

- `feat/ai-help-off-by-default` (local only, 1 commit `3f32588`, "New universes start with AI help off"): not on `dev`
  or `demo`. Owner to decide: merge or drop.
- `feat/alpha-demo-page` / `claude/magical-mirzakhani-3846ef` (1 commit, "alpha page features as expandable rows"): not
  on `dev` or `demo`; the branch itself was merged earlier, this later commit was not. Probably superseded by
  `feat/alpha-page-polish`; check before deleting.
- `fix/alpha-contact-address`, `feat/demo-refresh`, `feat/demo-screenshots`: on `demo`, not on `dev`. Expected for
  demo-only work.
- Local `master` is a stale 2026-09-07 ref; `origin/master` is authoritative.

## Open issues

`gh issue list --repo luisfpires18/lorevolve --state open`. As of 2026-10-29:

- Alpha: #34 launch readiness / final review (high), #35 alpha plan and issue index, #54 daily backups (high; the
  pipeline now runs on PROD, so the owner may close it), #51 revisit H-1 invitations and licensed ImageSharp upgrade.
- Follow-ups: #68 email collaborator invitations, #69 forgot password (on `dev`), #70 alerts, tester notes and #34
  cleanup.
- Post-alpha: #1, #10, #13, #16, #17, #19, #21, #22.

Closed since the old entries were written: #33 security, #11 recovery, #56 MCP pictures, #58 PWA entities.

## Owner steps and unverified items

- **Real-client MCP**: Claude or ChatGPT staging schema, progression and pictures over MCP, connecting by the friendly
  `/mcp/u/{name}` URL, and ChatGPT image rendering or its fallback link. Never tried in a real client
  (`docs/testing/mcp-images-checklist.md`). The assistant's 10,000-character tool-result cap can cut a large catalog.
- **Real-device PWA**: Lore entities in an installed iOS, Android and desktop app (`docs/testing/pwa-checklist.md`).
  Passed only in Chromium simulation; #58 was closed without that check.
- **Maps on a device**: a real map, real touch, the assistant's phrasing over geography tools
  (`docs/testing/maps-checklist.md`).
- **Password reset email live**: request a reset on DEV and on PROD, open the emailed link, set a password. Not tried
  with real Resend yet.
- **Restore drill at realistic size** on PROD once real content exists (local drill: 63.6 MB in 57.6 s).
- **Tooling trial verdict** (keep, conditional or remove, per tool for RTK and Graphify):
  `docs/tooling/agent-tooling-trial.md`.

## Settings off until the owner sets them

- PROD `PublicSite__AllowIndexing`: unset, so search engines are told not to index. Set at public launch.
- PROD `Assistant__*`: only if PROD offers the assistant (`docs/deployment/assistant-limits-and-cost.md`).
- Backup retention deletion is proposed and off (ADR 0064, `docs/recovery/database-backups.md`).
- DEV `Mcp__Origin` and `PlatformAdmin__OwnerUserId` were owner steps; not rechecked here. Unset means MCP is off and
  nobody is Admin on DEV.

## Known risks, not blocking

- From the security assessment, still open: auth rate limiting needs the App Service client-IP check (M-2), session
  lifecycle (M-5), no `script-src` in the CSP. ImageSharp held at 3.1.12 (4.x needs a licence key), so its five
  advisories stay open; uploads decode JPEG, PNG and WebP only (#51).
- SQLite on an SMB share with one writer, both environments; a redeploy is a short outage; a rollback cannot undo a
  migration; Data Protection keys unencrypted at rest (ADR 0018). Phase 023 (PostgreSQL, real key store) is deferred,
  not scheduled.
- Search is SQLite FTS5, whole words and prefixes only; a migration that rebuilds a searched table must recreate its
  triggers (ADR 0016, 0031).
- A universe backup over 512 MB downloads but will not restore. A very large restore holds the one writer (~15 s at
  ~145k rows). Ideas with no universe have no file backup (ADR 0030, 0032).
- Orphaned media is swept best-effort, never retried (ADR 0019).

Deferred features and their ADRs: "Deferred / owner decisions" in the archive.

## Blockers

None.
