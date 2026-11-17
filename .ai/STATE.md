# STATE

Current operational state only, as of 2026-11-13. Trim instead of appending: when work merges, delete its line here;
git history and ADRs keep the detail. History before this trim: `docs/history/state-archive-2026-10.md`.

## Pointers

- Workflow: shared luisfpires18/ai-workflow since 2026-11-11 (Codex reviews; Claude merges into `dev` on ACCEPTED; PROD stays the owner's). Project mapping: `.ai/PROJECT.md`. This file moved here from the repository root on 2026-11-11.
- Architecture decisions: `docs/architecture/decisions/README.md`. Files and responsibilities: `SYSTEMS.md`.
- Branches, naming, sequence log: `docs/architecture/branching.md`. Tooling rules: `.claude/CLAUDE.md`.
- Runbooks: `docs/deployment/azure-prod.md`, `docs/deployment/azure-dev.md`, `docs/deployment/cloudflare-r2.md`,
  `docs/recovery/database-backups.md`,
  `docs/recovery/universe-recovery.md`. Domain and email layout: `docs/design/custom-domain-plan.md`.
- Security assessment and open findings: `docs/security/alpha-security-assessment.md`.
- Manual checklists: `docs/testing/` (PWA, maps, MCP images).

## What is live

- **PROD** https://lorevolve.com, version `1.0.0-alpha`, invite-only alpha. App Service `prod-lorevolve` on B1 in
  `rg-lorevolve-prod`, SQLite on `/home`, media in R2 `lorevolve-media-prod`. Search indexing off
  (`PublicSite__AllowIndexing` unset) until launch. Last deploy: run 43468813582 on `master` `c8581c0`, succeeded (2026-11-13, release PR #121: a story opens on its first arc and first chapter; a scene lists all its lore in the author's order, dragged by a grip or the arrow keys, and group priority no longer reorders it; beats fold; more interface language strings; no migration).
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
3. `gh workflow run deploy-prod.yml --ref master` (or Actions > Deploy PROD). The `prod` environment's required
   reviewer was removed on 2026-11-07 at the owner's request, to be restored later (Settings > Environments > prod);
   only `master` may deploy to it. Never push, merge or deploy without the owner's explicit go-ahead.
4. Deploy passes only when `/api/health`'s `startedUtc` is after the upload (up to 12 minutes), not on a bare 200.

As of 2026-11-14 `dev` is ahead of `master` by the language work merged since PR #121 (latest: #161, #162). `WEBSITE_RUN_FROM_PACKAGE=1` and
`SCM_MAX_ZIP_PACKAGE_COUNT=2` are set on DEV and PROD (2026-11-11), so a deploy no longer swaps files under the running app. The demo page (`demo` branch, live) has the plain hero, the four-step Frodo
example and Literata. Still open there: the step 4 screenshot shows an empty scene, and an original showcase world is
deferred.

## In flight
- #300 M3 Types tracker running; #279 done: types audit in `docs/architecture/types-architecture.md` (one shared EntityTypes engine scoped by ProjectId; templates go in a new table pair); #280 done: Types page Lore/Gaming switch and game picker (`?context=gaming&game=`), no API change.
- #302 M5 Cinema tracker running; #288 done: Film/Series projects have a selectable production format (`ProjectFormats` map, `CreativeProjects.Format`, backup v49); a project save must send the current format back.
- #303 M6 Comics tracker running; #293 done: Comic projects pick a format (western-comic, manga, graphic-novel, one-shot, webcomic) through the same `ProjectFormats` map; a set format drives the starter template, Subtype is the fallback.
- #301 M4 GameEntity tracker running; #284 done: Game Entities picks a game (`game-entities`, one game skips it), `game-entities/:projectId` opens that game's category directory via `ProjectEntitiesView`; no API change.
- #281 (tracker #300) `feat/type-templates-281`, PR #331: universe-scoped type templates, API + migration + backup format 50.

One line per branch. Delete the line when it merges.

#299 M2 Projects & Writing tracker running; its deferred E2E and CI run at the tracker end (owner). #275 done: a universe's Projects (`/app/universes/:id/projects`) is a directory of four category cards (Writing, Gaming, Cinema, Comic) drawn from `CREATION`, each with its project count and a link to its list; `ProjectsDirectory.tsx`, one `listAllProjects` read (PR #324).

#298 sidebar tracker (#271-#274) complete; its deferred E2E and CI run at the tracker end (owner). #274 done: below 860px the one `nav.sidebar` is an off-canvas drawer (scrim, Escape, focus in and back, page behind `inert`), no inline sheet (PR #320). #271 done (PR #315). #272 done: Creation (Writing, Gaming, Cinema, Comic) and World Building Game Entities appear only when the universe has a project of that family (`needs` + `projectFamilies` + `offered()`); refreshed after story create, trash, restore (PR #317). #273 done: the Overview draws the sidebar's own groups (World building, Creation, Management) through `SECTION_GROUPS`, `groupKey`, `offered(..., families)` and the shared `families` outlet context; Stories, Canon and Settings cards gone (routes kept) (PR #318).

#299 M2 Projects & Writing tracker; its deferred E2E and CI run at the tracker end (owner). #276 done: Writing, Gaming, Cinema and Comic lists show category empty wording, `New project` preselects the list's kind (`?kind=`), rows carry `data-kind`, and the universe name is dropped inside a universe (PR #327).

#299 M2 Projects & Writing tracker; its deferred E2E and CI run at the tracker end (owner). #278 done: a project overview shows the type counts only; the "Last worked on" and "Where this project reaches" sections are gone, and the tab bar and the sidebar Lore link reach everything they linked to (PR #326).
#299 M2 Projects & Writing tracker; its deferred E2E and CI run at the tracker end (owner). #277 done: `/app/universes/:id/writing` renders `StoriesPage` (story rows with status, scene count, premise, Move up/down, New story, plus the universe's non-story Writing projects below), `/stories` redirects to `/writing` keeping query and hash, story links go to `projects/:storyId/structure`, and the Writing-only reorder branch is gone from `ProjectsPage`. Story ids, names and statuses are untouched; no API change.

#248 UI consistency tracker running sequentially. #249 merged (PR #258); #250 done: `Drawer.tsx` plus all 23 drawers (PR #260, then #261), `DIALOG_FILES` at five. #255 done: link `Drawer` replaces `window.prompt`/`alert`, `Avatar` default dropped, inline confirms stay inline and are listed in the catalogue (PR #263). #251 done: one `Field` markup (PR #264). #253 one set of verbs (PR #265). #254 done (PR #269, #306, #308, #307): every field is `Field`, and `uiContract.test.ts` checks `field__label` appears only in `Field.tsx`. #252 (project tabs are `.views`, crumb is `.pageheader__crumb`, panel heads are `.sectionrule`, one raised-card rule, cropper and finding on tokens, font-size ratchet 200) in PR #268, evidence in `docs/design/evidence/252/`.

#247 backend consistency tracker running sequentially. #241 done: unused members removed, including `MapGeography.GetPinAsync` (PR #257, merged 2026-11-16). #242 done: `Common/` holds `UtcDates`, `Problems`, `Sql`, `PrincipalExtensions` (PR #267). #243 done: `Mcp/McpResults.cs` holds `Result`, `Error`, `NotFound`, `Found`, `Guard`, `RoleAsync` for the MCP tool classes. #244 done: one definition each for the entry-is-live check (`Lore/LoreEntries`), canon link check (`ProjectEntities/CanonLink`), rule outcome text (`ConditionOutcomeText`), accent and name normalizers; Stories create/reorder stay separate (different entities and refusals). #245 done: `Media/ImagePreparation` holds `TrimFileName`, `ReadCrop`, `Megabytes`; `MediaObjectWrites.SweepAsync(store, logger, keys)` replaces the per-feature sweep, orphan log and 503 wrappers; crop columns are set by tuple assignment (PR #305). #246 done: the "New feature recipe" in `aspnet-core-guidance` lists the file set, access rule, shared helpers and EF configuration placement (PR #313).

Previously: #238 (image fields with crop on project and Lore entry types) merged as PR #239 on 2026-11-16:
migration `AddEntityFieldImages`, backup format 48. Owner check on DEV: upload and crop a real 2D drawing and a 3D render.

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

- **Languages** (umbrella #99, ADR 0071): #100 to #109 are on `dev`, and #108 (refusal codes, PR #161) with #110's export half (PR #162) landed 2026-11-14; `dev` is at `4490106`. The switch is live in the account menu, the portal's appearance menu and Profile; the API writes its emails, starter types, the language line it hands a connected AI app, 56 refusal codes and the readable export in the reader's language. Open: #110's canon rule messages (approach is the owner's choice, TBD and plan on the issue) and #111 (public SEO, deferred until `PublicSite__AllowIndexing` is set at launch). #99 itself stays open for the owner, with its deferred checks in the milestone summary. A refusal whose English names the author's own records stays English by design; `ApiErrorCodeContractTests` refuses to translate one.
- **Roadmap M1 to M4** (trackers #133, #134, #135, #136), started 2026-11-14 as an unattended milestone run. **M4 (#136) is done**, merged 2026-11-15: #156 (PR #182) the retirement inventory, #157 (PR #185) the web UI, #158 (PR #187) the API, the Groq and OpenAI providers and the `OpenAI` package, #159 (PR #190) no migration because nothing assistant-only was stored, #160 (PR #202) the settings, the Groq cost guide, the docs and `docs/testing/mcp-only-ai-checklist.md`. AI reaches a universe over MCP only. `UniverseAiHelpOff` (now the Connect to AI and AI Changes switch) and `AiChangeSource.Assistant` are kept on purpose. Owner actions on the milestone summary: delete the five `Assistant__*` settings on `dev-lorevolve`, revoke the Groq and OpenAI keys, and walk the MCP-only checklist on DEV. Closing #136 is the owner's. **M3 (#135) World Logic is done**, merged 2026-11-15: #149 (PR #183) the specification (ADR 0072, `docs/architecture/world-logic-condition-spec.md`, six fixtures), #150 (PR #188) `Features/Systems/` with backup format 44, #151 (PR #205) the evaluator in `Features/RuleValidation/Conditions/` with backup format 45, #152 (PR #206) the read-only World Logic page, #153 (PR #208) persisted findings with backup format 46, #154 (PR #211) seven MCP read tools plus `submit_semantic_finding`, #209 (PR #214) the Integrity tab reading those findings (the list route gained an optional `sort=newest`, its `attention` default unchanged), and #155 (PR #207) the MCP capability matrix (`docs/testing/mcp-capability-matrix.md`, `McpCapabilityMatrixTests`). Owner decisions are gathered in the milestone summary on #135; closing #135 is the owner's. Left open on purpose: #210 (`ConditionSchema.SourceFields` refuses `attributes.<name>` with `unknown_field` although section 2 of the specification lists it), nothing in `src/LorEvolve.Web` shows a submitted semantic finding so an author reviews one over the API, and the MCP findings reader cannot ask for `sort` because #154's tools predate it. M1 Projects Foundation and Writing: #137 (agent task template, PR #164), #138 (`CreativeProject` domain, PR #165) #139 (Projects navigation, PR #166), #140 (existing Stories listed as Writing Projects, PR #167, a derived mapping with no migration), #141 (the Structure tab, PR #168) and #142 (projects over MCP, PR #169) done. The milestone summary on #133 is next; closing #133 and starting M2 are the owner's. A project is account-owned with an optional universe link, reached at `/app/projects/<id>` whether or not it has one; a universe backup leaves projects out on purpose. #140 is the one that must not lose author data: existing Story URLs and MCP story IDs keep resolving. Trackers close only on the owner's word.
- **Roadmap M5 Navigation and project workspace** (tracker #201, issues #191 to #200), opened 2026-11-15 from the owner's IA brief and the review at `docs/architecture/audits/2026-11-15-navigation-and-project-workspace-review.md` (PR #203). All ten landed by 2026-11-15; the milestone summary on #201 is the coordinating session's. Landed: #200 Chronology is Timeline's configuration view at `timeline/configuration` (a link on the Timeline header), no sidebar row, and `chronology` redirects there; #191 (PR #213) the universe sidebar as Overview, then labelled World building, Projects and Management groups, with Stories and Canon off the sidebar but at their addresses and Overview doors; #192 project sections as data per kind (`projects/sections.ts`), `ProjectShell` tab bar, routes `projects/:projectId/*` under both addresses (the bare address redirects to the kind's first view); #197 project Ideas: `Idea.ProjectId` (migration `AddIdeaProjects`, hand-written ALTER so the Ideas search triggers survive, backup format 47), a project idea takes its project's universe, the view is `components/ProjectIdeas.tsx` over `IdeasBrowser`, and MCP idea proposals carry `projectId`; #193 one panel per view: every kind now opens on Overview and offers Entities, the schema sits on Overview until #196, entries on Entities, the Series, Film and Comic structure on Structure, and any other view is an empty state; `schemaVersion` stays in `ProjectPage`'s `Project`, which stays mounted across the views; #196 Entities opens on the type cards (counts from `ListProjectEntityTypes`, one request), a card opens that type's entries 25 at a time with Show more, and the type editor (`ProjectSchema`, unchanged) is the Manage types action at `?manage=types`; a project with no types gets the starter offer there; the overview is an empty state until #195; `ListProjectEntities` takes `skip` and `take` (default and ceiling 500); #194 a Story shown as a Writing Project opens its project shell at `/app/universes/<u>/projects/<storyId>/structure|manuscript/:sceneId?|ideas`, rendering `StoryPage` unchanged (found by a client-side story read on the project 404, no API change); every `stories/:storyId...` address redirects there keeping scene id, query and hash; its sidebar row expands; #195 the non-Writing overview (`components/ProjectOverview.tsx`): counts per type from the one types list, the entries touched last from `GET /api/projects/{id}/entities?recent=true` (a second order on the read that already existed, not a new endpoint, since that list could only order by name), the universe's lore and every other view the kind offers as links, and a project with no types and no entries is an empty state leading to Entities. A recent entry opens that entry: `?entry=` beside the Entities view's `?type=`, which marks the row with `aria-current` and reads as many pages as it takes to reach it, bounded by the endpoint's 500-row ceiling (Codex round 1 required this rather than the deferral first offered). An entry still has no screen of its own, because nothing reads its field values although `GetProjectEntity` serves them; that is issue #222. The Series, Film and Comic script view is labelled Script from the existing `projects.seasons.script` strings, because the owner's table was not in the repository; owner check on #201. Order is dependency order: #191 sidebar groups and the duplicate Stories entry, #192 project sections and shell, #193 the project page split, #194 one entry point per kind, #195 non-Writing overview, #196 Entity Types inside Entities with paging, #197 project-scoped Ideas (needs a column on `Idea` and a migration, which is why it is P1 and not the brief's P2), #198 bound the sidebar project list, #199 addresses and the leftover no-universe assumptions, #200 Chronology under Timeline. Three open questions sit on the tracker. #198 the sidebar lists at most `SIDEBAR_PROJECT_LIMIT` (8, in `ProjectsNav.tsx`) projects plus the one in view, the PROJECTS heading folds the group, and `GET /api/projects` pages (`offset`, `limit` up to 100, `include`) with stored and story-derived projects merged in one order; the bound of eight is an owner check on #201. #199 one address per project view: `/app/universes/<u>/projects/<id>/<view>` is canonical (`projectPath` takes the universe), and `/app/projects/<id>...`, a universe the project is not in, the bare address and an unknown view all redirect there keeping query and hash; `ProjectShell` draws a breadcrumb (universe, project) above the tabs; `ProjectDetail.universe` and `ProjectInput.universeId` are non-nullable, `projects.list.noUniverse` is gone, and the account-level project frame (`.projectshell`) with it.

`gh issue list --repo luisfpires18/lorevolve --state open`. As of 2026-10-29:

- Alpha: #34 launch readiness / final review (high), #35 alpha plan and issue index, #54 daily backups (high; the
  pipeline now runs on PROD, so the owner may close it), #51 revisit H-1 invitations and licensed ImageSharp upgrade.
- Follow-ups: #68 email collaborator invitations, #69 forgot password (on `dev`), #70 alerts, tester notes and #34
  cleanup.
- Post-alpha: #1, #10, #13, #16, #17, #19, #21, #22.

Closed since the old entries were written: #33 security, #11 recovery, #56 MCP pictures, #58 PWA entities.

## Owner steps and unverified items

- **Perf pass** (PR #97), on PROD. Owner to check: move a type up or down, reorder groups on
  the Groups tab and resolve a comment thread; each should change at once, before the server answers. Redis and new
  indexes were judged not worth it (reasons in the PR).
- **Types: group priority (#94) and inherited fields (#95)**, on PROD. Owner to check: reorder groups on the
  Groups tab and look at a scene's Lore chips; give a parent type a field and write an entry of a nested type.
- **AI proposals for story structure** (PR #92, on PROD): a scene's beats as its whole list, a chapter's `arc`/`noArc`,
  MCP `get_arc`. Not yet tried in a real client: add, reorder, remove beats and move a chapter between arcs, approve.
- **Real-client MCP**: Claude or ChatGPT staging schema, progression and pictures over MCP, connecting by the friendly
  `/mcp/u/{name}` URL, and ChatGPT image rendering or its fallback link. Never tried in a real client
  (`docs/testing/mcp-images-checklist.md`). A client's own tool-result cap can cut a large catalog.
- **World Logic and project schema over MCP** (PR #235, PR #237), on DEV only. `propose_changes` now takes `system`,
  `system_rule`, `project_type` and `project_field` (create and update, never remove); an entry names a new type or
  field by `typeRef` / `fieldRef`, so one proposal can hold a game's GameEntity type, its fields and its units. Owner:
  ask for the `dev` to `master` release when ready; ChatGPT's connector must be refreshed to see new tools (it showed a
  stale list on PROD). Not yet tried in a real client. Per-tool status lives in `docs/testing/mcp-capability-matrix.md`
  "Tool status"; keep it current with every MCP change (a test fails when a tool has no row).
- **Real-device PWA**: Lore entities in an installed iOS, Android and desktop app (`docs/testing/pwa-checklist.md`).
  Passed only in Chromium simulation; #58 was closed without that check.
- **Maps on a device**: a real map, real touch, a connected app's phrasing over the geography tools
  (`docs/testing/maps-checklist.md`).
- **Password reset email live**: request a reset on DEV and on PROD, open the emailed link, set a password. Not tried
  with real Resend yet.
- **Restore drill at realistic size** on PROD once real content exists (local drill: 63.6 MB in 57.6 s).
- **k6 smoke run** against DEV (`tests/load/k6-smoke.js`, audit 2026-11-07 A18), and the Cloudflare proxy (A8) and
  Application Insights (A4) decisions in that audit's report.
- **Tooling trial verdict** (keep, conditional or remove, per tool for RTK and Graphify):
  `docs/tooling/agent-tooling-trial.md`.

## Settings off until the owner sets them

- PROD `PublicSite__AllowIndexing`: unset, so search engines are told not to index. Set at public launch.
- Backup retention deletion is proposed and off (ADR 0064, `docs/recovery/database-backups.md`).
- DEV `Mcp__Origin` and `PlatformAdmin__OwnerUserId` were owner steps; not rechecked here. Unset means MCP is off and
  nobody is Admin on DEV.

## Known risks, not blocking

- From the security assessment, still open (M-2 closed by the 2026-11-07 audit branch): session
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
- A deploy that kills the app mid-migration leaves a row in `__EFMigrationsLock`, and every later start then waits on it
  until App Service gives up (230 s). Happened on DEV 2026-11-11 (files swapped under the running app). Recovery: stop
  the site, download `/home/data/lorevolve.db` via Kudu, check integrity and history, delete the lock row, upload,
  start. `WEBSITE_RUN_FROM_PACKAGE=1` (below) removes the usual cause.

Deferred features and their ADRs: "Deferred / owner decisions" in the archive.

## Blockers

None.
