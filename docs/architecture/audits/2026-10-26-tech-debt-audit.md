# Tech Debt & Best-Practice Audit

Generated 2026-10-26 on `dev` at `8295bab`. Method: `tech-debt-audit` skill protocol (orient, 9 dimensions, cited
findings) plus `code-audit` tooling checks. Six parallel module auditors (API core, API backup/restore, API AI/misc,
web shell+pages, web feature folders, tests/CI/config), then merged, deduped and ranked here. Read-only: nothing changed.

Does not repeat `docs/security/alpha-security-assessment.md` (#33) or `2026-10-25-architecture-audit.md` (#55); where a
finding overlaps #55 it says so (`known #55 Px`).

Tooling run: `tsc --noEmit` clean; `npm audit --omit=dev` 0; `npm audit` (dev) 2 High (vite 8.2.2, source-map-js);
`dotnet list package --vulnerable` ImageSharp 3.1.12 6 advisories; `--deprecated` xunit 2.x (legacy, -> xunit.v3);
`--outdated` EF Core/ASP.NET 10.0.11 -> 10.0.14 patches. Not run: knip/madge (not installed, not added).

## Executive summary

1. **Export can write a backup that restore refuses.** Quota 1 GiB vs restore cap 512 MB / 5,000 pictures; export
   never checks. Data-safety promise broken for big universes (F01).
2. **ImageSharp has a 6th advisory, GHSA-v76p-62qx-wwq2 (High), not in #33 M-1**, and nothing fails CI on new
   High advisories because NuGet warnings never fail the build (F02, F03).
3. **No React error boundary.** Any render throw or stale lazy chunk after a deploy blanks the whole app (F04).
4. **Client path traversal via route params.** React Router 7 decodes `%2F` back to `/` in params, and params go
   into API paths unencoded (F05).
5. **Memory ceilings on the single App Service instance**: export buffers twice (`ToArray`), ImageSharp has no
   allocator cap, no concurrency limit on export/validate (F06, F07).
6. **AI cost has no hard ceiling** per question; the documented "seven calls" is really up to ~28 (F08).
7. **Clock split**: ~97 `DateTime.UtcNow` sites beside an injected `TimeProvider`, sometimes in the same handler (F12).
8. **Hand-mirrored API contracts drift**: chronology era type already missing two server fields, causing a wrong UI
   (F09, F10).
9. **Copy-paste hot spots**: 5-file media upload pipeline, 4× picture validation, 4× restore store routine,
   72 E2E specs with their own `signUp` (F15-F18).
10. Counts: 0 Critical, 6 High, 36 Medium, 18 Low (60 findings).

## Architectural mental model

Modular monolith: one ASP.NET Core 10 process (minimal APIs, 33 feature folders, EF Core over SQLite, Identity cookie
auth) that also serves the built React 19 + Vite SPA (34 lazy routes, a hand-written fetch client in `lib/api.ts`,
hand-mirrored types per feature, one 18k-line `styles.css`). Media and DB backups go to Cloudflare R2. AI enters
two ways - an in-app assistant (OpenAI/Groq Responses API, read-only tools + staged proposals) and an MCP server
with OAuth - and every AI write is a proposal a human approves through each feature's own `*CoreAsync` write path
(ADR 0047). The backup format (v35) is the heaviest cross-cutting contract: every new table or column touches
builder, validation, normalization, restore, counts and readable export. Deployed as one Linux App Service with
SQLite on `/home`; CI is GitHub Actions with sharded API tests and Playwright. Matches README/SYSTEMS; drift is only
in counts and stale rows (F50-F53).

## Findings

| ID | Category | File:Line | Sev | Eff | Description | Recommendation |
|---|---|---|---|---|---|---|
| F01 | Contract | `Restore/BackupRestoreLimits.cs:23,35`; `Storage/StorageQuota.cs:19` | High | M | Quota allows 1 GiB pictures; restore caps upload 512 MB, 1 GB uncompressed, 5,000 pictures (appearance + map pictures count, unbounded). Export checks nothing. `universe-recovery.md:82` admits size only. | Share constants; export warns/refuses past restore limits, or raise restore limits to match quota. |
| F02 | Dependencies | `Directory.Packages.props:18` | High | S | ImageSharp 3.1.12: **GHSA-v76p-62qx-wwq2 (High) is new**, not listed in #33 M-1 (which lists j3p4, j9gm, jjfr, gwg2, wmxv). | Add to M-1; re-assess reachability before alpha. |
| F03 | Build/CI | `Directory.Build.props:3-14` | High | S | NU1903 (High vuln) is a warning; last deploy run had 230 of them and passed. Next new High package ships silently. | `<WarningsAsErrors>NU1903;NU1904</WarningsAsErrors>` + `<NuGetAuditSuppress>` for the accepted GHSAs citing M-1. |
| F04 | Resilience | `src/LorEvolve.Web/src/App.tsx:348` | High | S | No `errorElement`/ErrorBoundary/`vite:preloadError` anywhere. Render throw or 404 on an old hashed chunk after deploy (SW drops old caches) shows the router's default error screen. | Root `errorElement` ("LorEvolve was updated - reload" for chunk errors) + once-per-session `vite:preloadError` reload. |
| F05 | Security | `src/LorEvolve.Web/src/aiChanges/api.ts:223` (pattern in `lore/api.ts:315`, `stories/api.ts:46`, 16 `base()` builders) | High | M | Verified: RR7 `matchPath` re-decodes `%2F` to `/` in params (`react-router chunk:802`). `/ai-changes/..%2F..%2Fx` sends a same-origin cookie request to another `/api` route; a mutation needs a victim click. Server authz still applies. | One `universePath(id, ...segs)` in `lib/` that `encodeURIComponent`s, or GUID-check params. |
| F06 | Perf/DoS | `Export/UniverseBackupArchive.cs:130,147`; `Export/ReadableExport.cs:50,68` | High | M | Archive built in MemoryStream then `ToArray()`: ~2 GB peak for 1 GiB universe; >2 GB throws 500. No export concurrency cap on single instance. | Keep in-memory per ADR 0014 but drop `ToArray` (or temp FileStream); per-process semaphore on export/validate. |
| F07 | Perf/DoS | `Media/ImagePreparation.cs:130`; `Restore/BackupValidation.cs:199,277,347` | Medium | M | No ImageSharp `MemoryAllocator` cap; 24 MP decodes ×4 parallel ×16 staged requests = several GB. | `MemoryAllocator.Create(new() { AllocationLimitMegabytes = … })`; global restore-validation semaphore. |
| F08 | Cost/Docs | `Assistant/AssistantSetup.cs:25`; `Assistant/ResponsesConversation.cs:103,163,206` | Medium | M | "At most seven model calls" false: Groq retry ×2, uncounted answer call, pipeline retry -> ~28 calls, each resending the conversation. Tokens only logged (`UniverseAssistant.cs:137`). | Per-question budget on calls + input tokens in `ResponsesConversation`; fix comment and ADR 0045:187. |
| F09 | Contract | `src/LorEvolve.Web/src/chronology/types.ts:28-40` vs `ChronologyContracts.cs:41-42` | Medium | S | TS era type lacks `EntryEraCount`, `PeriodCount`; server blocks removal on them (`ChronologyEndpoints.cs:239`). `ChronologyEditor.tsx:73-78` shows era removable, save fails. | Add both fields to type and `usageOf`. |
| F10 | Contract | 325 hand-written types, 43 enum mirrors in `src/*/types.ts`, `api.ts` | Medium | M | No codegen, no contract test, though API serves OpenAPI (`Program.cs:45,87`). F09 slipped through. | API-side snapshot test of enum names/values, or `openapi-typescript` for enums only. |
| F11 | Contract | `Assistant/AssistantProposals.cs:123-291` vs `AiChanges/AiChangeContracts.cs:23-55` | Medium | M | Strict `propose_changes` schema is a hand copy; parity test (`McpProposalTests.cs:344-348`) checks top-level only. Nested field added = never reaches assistant. | Generate via `JsonSchemaExporter` + strict transform, or deepen parity test. |
| F12 | Consistency/Test | e.g. `Universes/InvitationEndpoints.cs:141` vs `:159`; `Restore/UniverseRestore.cs:280`; `Export/UniverseExportEndpoints.cs:108` | Medium | M | ~97 `DateTime.UtcNow` vs 53 `TimeProvider` sites. Invitation accept checks expiry with clock, stamps membership with UtcNow. Timestamps untestable. | Move to injected `TimeProvider` feature by feature; then BannedApiAnalyzers on `DateTime.UtcNow`. |
| F13 | Consistency | `Comments/CommentEndpoints.cs:315`; `Ideas/IdeaEndpoints.cs:579`; `Trash/TrashEndpoints.cs:322` (23 `SpecifyKind`) | Medium | M | No UTC value converter; each handler re-applies Kind; `Utc()` helpers disagree (some convert Local). | One `ConfigureConventions` DateTime converter in `LorEvolveDbContext`; delete helpers. |
| F14 | Error handling | `Data/DatabaseFailures.cs:18`; used `Stories/ChapterEndpoints.cs:146,301,379`, `SceneEndpoints.cs` ×5, `PlotArc`/`PlotBeat`, `Chronology/ChronologyEndpoints.cs:160` | Medium | S | `IsConstraintViolation` matches FK/CHECK/NOT NULL too; all become silent "order changed" 409. Real FK bug looks like a race. | Use `IsUniqueViolation` for order races; let others reach the 500 handler. |
| F15 | Duplication | `Lore/EntityImageEndpoints.cs:126-408`; `Profile/ProfileImageEndpoints.cs:196-247`; `Progression/AppearanceImageEndpoints.cs:154-195`; `Maps/MapEndpoints.cs:399,1004`; `Publishing/UniverseArtworkEndpoints.cs:514` | Medium | M | Upload pipeline (buffer, prepare, hold, put, catch, sweep, consume) copied 5×; a hold/sweep-order fix needs 5 edits. | One helper beside `MediaObjectWrites`; per-feature keys/row update as delegates. |
| F16 | Duplication | `Restore/BackupValidation.cs:133,191,266,340` | Medium | M | 4 near-identical picture checks (read, decode, catch-all, type/size). | One `CheckPictureAsync(path, expected, prepare)`. |
| F17 | Duplication | `Restore/UniverseRestore.cs:316,415,470,580` | Medium | M | 4 near-identical store routines; only one parallel. | One helper taking a key factory. |
| F18 | Test debt | `tests/LorEvolve.E2E/specs/account-usage.spec.ts:16-30` (pattern) | Medium | M | `signUp` copied in 72 specs, `unique()` 88, `scrollsSideways` 20; `specs/support/` exists. All sign up through UI. | Move to `support/account.ts`; API sign-up + `storageState` for non-auth specs. |
| F19 | Backup safety | `tests/LorEvolve.Api.Tests/BackupInventoryTests.cs:1-60` | Medium | M | Inventory catches new tables, not new columns. Round-trip compares export with export-of-restore, so a column the builder never reads passes. Silent backup loss. Extends #55 M3. | Column-level inventory: each `db.Model` property carried / derived / excluded. |
| F20 | Correctness | `DatabaseBackups/DatabaseBackupRunner.cs:281,284` | Medium | S | `RefreshAsync` inside the run `try`: R2 list failure after a verified upload records "Failed", bumps counter, retries -> duplicate backup. | Move outside try or wrap like `PruneSafelyAsync`. |
| F21 | Resources | `Media/MediaObjectWrites.cs:85` | Medium | S | `SweepAsync` fires all deletes at once; failed 5,000-picture restore = 10k+ concurrent R2 DELETEs, throttling, orphans. | `Parallel.ForEachAsync` with MaxDegreeOfParallelism ~8. |
| F22 | Correctness risk | `Chronology/ChronologyCalendarEndpoints.cs:201,214,359,372,491,600-690`; `ChronologyEndpoints.cs:216,313` | Medium | M | Tables carrying a month/era listed in ~7 places; a missed site undercounts usage or orphans refs. | One queryable union of month/era references per universe. |
| F23 | DoS/Cost | `Mcp/LorEvolveMcpImageTools.cs:336`; `Mcp/McpSetup.cs:240-246,308` | Medium | M | Only client registration is rate limited; tool calls unlimited, each picture preview re-decodes up to 24 MP. | Per-connection fixed-window limiter on `/mcp/*`; cache previews or store derivative. |
| F24 | DoS | `Publishing/PublicContentEndpoints.cs:186-192` | Medium | M | Anonymous story GET returns every scene manuscript, unpaged, uncached; public groups have no rate limit. | Page per part; output cache or rate limit on public groups. |
| F25 | Architecture | `Lore/EntityTypeEndpoints.cs` (1927 LOC), `Lore/EntityEndpoints.cs` (1649), `Maps/MapEndpoints.cs` (1091); cross-feature `*Endpoints` calls at `Universes/UniverseEndpoints.cs:373`, `Trash/TrashEndpoints.cs:59` | Medium | L | God files; HTTP handlers double as domain API across 10+ call sites. **known #55 P1.** | As #55 P1: move rules into `<Feature>Operations` statics when next heavily edited. |
| F26 | Architecture | `AiChanges/AiChangeChecks.cs` (1406), `AiChangeCommit.cs:324-604`, `AiChangeViews.cs` (886) | Medium | L | 280-line resource switch; a new resource touches ~8 sites. | Partial file per resource (stage/check/snapshot/commit), thin dispatcher. |
| F27 | Architecture | Backup touchpoints: `UniverseBackup.cs`, `UniverseBackupBuilder.cs`, `BackupArchiveReader.cs:23`, `BackupNormalization.cs:73-130`, `UniverseRestore.cs:74`, `BackupValidation.cs:412`, `ReadableExport.cs` | Medium | L | Maps (format 34) touched 13 prod files in 33 hunks. **known #55 P2.** | Checklist beside `BackupFormatSupport`; keep CountRecords/KnownIds beside their record. |
| F28 | Web arch | `src/LorEvolve.Web/src/lib/api.ts:103-110` | Medium | S | No global 401 handling: expired session = every screen "Something went wrong", no route to sign-in. | `apiFetch` emits session-ended on 401; AuthProvider clears user; `RequireAuth` redirects with `from`. |
| F29 | Web arch | `src/LorEvolve.Web/src/auth/AuthProvider.tsx:17-21` | Medium | S | Any `/me` failure (network/500) treated as signed out -> redirect to login during an outage. | Error state + retry for non-401. |
| F30 | Web arch | `src/LorEvolve.Web/src/pages/EntityPage.tsx:201-1482` | Medium | L | `EntityScreen` 1,280-line function, 24 `useState`, 6 effects. | Extract `useEntryDetail`, `useEntryEditor`, `EntryFacts` when next touched. |
| F31 | Web arch | `src/LorEvolve.Web/src/pages/UniverseTrash.tsx:208-913` | Medium | M | ~700-line component with 3 parallel confirm state machines. | One `confirming: {kind, item}` union. |
| F32 | Consistency | `src/LorEvolve.Web/src/lib/useUsageLoad.ts:11` vs 78 hand-written load effects (`LorePage.tsx:61`, `MapsPage.tsx:14`, `CanonPage.tsx:29`) | Medium | M | Generic load hook exists, named for Profile; `AdminWorkspace.tsx:40` defines a second `Load<T>`. | Rename to `useLoad<T>`; adopt as screens are touched. |
| F33 | Consistency | `pages/UniverseTrash.tsx:914,1001,1077`; `UniverseSettings.tsx:331,417`; `UniversePublish.tsx:343,437` | Medium | M | ADR 0049 says confirmations go through `confirmAction`; these use bespoke in-row panels not listed as exceptions. | Migrate, or record as exceptions in ADR 0049. |
| F34 | CSS | `src/LorEvolve.Web/src/styles.css:1-18404` | Medium | M | 400 KB render-blocking single file, #1 churn (136 commits/6 mo), conflict magnet; 106 section headers already mark split points. Specificity is fine (1 `!important`). | Pure-move split into `styles/*.css` behind `@import` chain in current order. |
| F35 | CSS | `styles.css:80-87` scale vs 588 raw spacing, 194 raw font-size | Medium | M | ~40% bypass tokens; header (`:11-13`) says migration "Tasks 003-007" - stalled. | stylelint `declaration-strict-value` in warn mode; fix on touch. |
| F36 | CSS | `styles.css` media queries | Medium | S | 30 distinct breakpoints, `640px`×38 beside `40rem`×5 (same width), near-dupes 860/900/1023px. | 4-5 named breakpoints documented in tokens file. |
| F37 | CI | `.github/` (no `dependabot.yml`) | Medium | S | No automated updates for NuGet, 2 npm lockfiles, Actions; CVE pins done by hand. | Grouped weekly dependabot. |
| F38 | CI | `deploy-dev.yml:115,123`; `ci.yml:49,51,85,201` | Medium | S | Actions pinned by movable tags, incl. `azure/login@v3` in the `id-token: write` job. | SHA pins with `# vX.Y.Z`, deploy job first. |
| F39 | Build | `Directory.Build.props:10-11` | Medium | M | Analyzers + `EnforceCodeStyleInBuild` on but advisory (CA1859 ×25, CA1861 ×12, CA1822 ×12). | Fix ~49, then `TreatWarningsAsErrors` (CI-only if needed). |
| F40 | CI | `ci.yml:55-73` | Medium | S | Web gets typecheck/lint/format gates; C# gets none. | `dotnet format --verify-no-changes LorEvolve.slnx` in shard 1. |
| F41 | Test debt | `tests/LorEvolve.Api.Tests/LaterSchema.cs:8-345` | Medium | M | Hand list per migration, 31 commits; already shaping schema design. **known #55 Draft D.** | Derive from `sqlite_master` of fresh vs rolled-back DB. |
| F42 | Test debt | `src/LorEvolve.Web/package.json:14` | Medium | M | 2 `node --test` files for ~61k LOC; pure `lib/` logic (`localDrafts.ts`, `leaveGuard.ts`, `editConflict.ts`, `dates.ts`) E2E-only. | Add `node --test` files beside pure `lib/` modules; no new dep. |
| F43 | Dependencies | `src/LorEvolve.Web/package.json` (dev) | Low | S | vite 8.2.2 (2 High: launch-editor, custom middleware) and source-map-js. Dev-server only. | `npm audit fix` -> vite 8.3.5. |
| F44 | Dependencies | `Directory.Packages.props:57` | Low | M | xunit 2.9.3 flagged legacy (-> xunit.v3); coverlet referenced but CI never collects coverage. | Plan v3 move; collect coverage or drop coverlet. |
| F45 | Observability | `Auth/AuthEndpoints.cs:189-226`; `Universes/CollaboratorEndpoints.cs` (no logger) | Low | S | Lockout, blocked sign-in, invite-only refusal, role change/removal unlogged; password spraying (#33 M-2) invisible. | `[LoggerMessage]` with user id only. |
| F46 | Observability | `Program.cs:48`; `Health/HealthEndpoints.cs:11` | Low | S | `AddHealthChecks()` with no checks: `/health` green with a broken DB. | `AddDbContextCheck<LorEvolveDbContext>()`. |
| F47 | Error handling | `Data/LorEvolveDatabaseInitializer.cs:46` | Low | S | `_ready ??= MigrateAsync(token)` caches a faulted/cancelled task for process lifetime. | Use `CancellationToken.None`/host token, or clear on fault. |
| F48 | Error handling | `Restore/BackupValidation.cs:155,218,293,363` | Low | S | Catch-all maps OOM/decoder bugs to "image could not be read", unlogged. | Log Warning; exclude OOM. |
| F49 | Security hygiene | `Maps/MapEndpoints.cs:75-79` | Low | S | Multipart POST + `DisableAntiforgery`; sibling uploads use PUT as second CSRF defence. | PUT, or record exception in #33. |
| F50 | Config | `Auth/AuthEndpoints.cs:57`; `Auth/DataProtectionSetup.cs:35`; `Program.cs:64` | Low | S | Config read 3 ways; no startup validation. | Options records + `ValidateOnStart` for Registration, PlatformAdmin, Cors. |
| F51 | Config | `.editorconfig:6,19,21-22` vs `.gitattributes:1,8` | Low | S | editorconfig says CRLF (LF for ps1); gitattributes says LF (CRLF for ps1). Inverted. | Match `.gitattributes`. |
| F52 | Config | `.git/info/exclude:20-22` | Low | S | `review-artifacts/`, `worktrees/`, `ui-polish-references/` ignored only locally; fresh clone could commit a 280 MB log. | Move to `.gitignore`. |
| F53 | Infra | `infra/main.bicep:31`; `appsettings.json:10` | Low | S | `AllowedHosts=*`; SCM/FTP basic publishing creds not disabled despite OIDC deploy. | Hostname allow-list; `basicPublishingCredentialsPolicies` off. |
| F54 | Metric | `Admin/AdminEndpoints.cs:59-60` | Low | S | Admin "stored pictures" omits `UniverseMaps`; lower than sum of account usage. | Add maps sum; update ADR 0059 table. |
| F55 | Dead code | `universes/access.ts:103-111` (8 `can*`), `aiChanges/api.ts:197-203` (7 codes), `lib/dates.ts:45,50`, `Publishing/PublicAuthorBackfill.cs:30-50`, `Universes/InvitationEndpoints.cs:123,190` | Low | S | Zero-importer exports; one-off backfill blocks every startup; unused param/delegate. | Delete (backfill once all envs ran it). |
| F56 | Docs | `STATE.md` (2082 lines) vs `CLAUDE.md:22` | Low | S | Read-first file breaks its own "concise, trim" rule. | Archive merged phases; keep live state <150 lines. |
| F57 | Docs | `SYSTEMS.md:260,367,584-590`; `src/LorEvolve.Web/README.md:6-10`; `Restore/BackupArchiveReader.cs:11`; `.claude/skills/aspnet-core-guidance/SKILL.md:36` | Low | S | Stale: "eight tools" (12), export row lacks readable export, 25 specs + 7 API files unindexed, web README says editor not built, "versions 1 to 18" (35), "migrates in Development only" (all envs). | Fix rows; optional CI check for unindexed specs/features. |
| F58 | Bundle | `src/LorEvolve.Web/src/pages/ExplorePage.tsx:6,115` | Low | S | 2.37 MB PNG `<picture>` fallback ships and is SW-allow-listed. | ~200 KB JPEG or drop. |
| F59 | Lint | `src/LorEvolve.Web/.oxlintrc.json:3-7` | Low | S | jsx-a11y plugin off; nothing guards a11y regressions. | Enable recommended; disable dialog-backdrop rule with reason. |
| F60 | Test debt | `tests/LorEvolve.E2E/specs/universe-search.spec.ts:614` + 10 `waitForTimeout`; `McpClientInteropTests.cs:182-186` | Low | S | Fixed sleeps (worst 1.8 s) and real 5 s wall-clock waits; `retries: 2` hides flakes (`playwright.config.ts:47`). | `expect.poll`/request counters; TimeProvider for MCP timeout; report flaky count. |

Smaller items folded in or omitted for padding: duplicate R2 settings/`IsMissing` (MediaSetup vs DatabaseBackupSetup),
3× `EscapeLike`, 4× MCP result helpers, 71 inline coded ProblemDetails, snake_case vs PascalCase enums in MCP vs
assistant, `instanceof ApiError` ×130 (reuse `failureText`), breakpoint/selector duplicates in CSS, NuGet cache in CI,
`EntityTypeEndpoints.cs:1105` per-option `AnyAsync` loop, FTS MATCH across tenants (`UniverseSearchIndex.cs:110`).

## Top 5 - if you fix nothing else

1. **F01 export/restore limit gap.** Move the restore limits into one `BackupLimits` static used by both sides. In
   `UniverseExportEndpoints`, before building: sum picture bytes and count; if over `MaxUploadBytes`/`MaxPictures`,
   return 409 `backup_exceeds_restore_limits` with the numbers, and show it in Settings > Data. Add a test that
   seeds 5,001 tiny pictures and expects the refusal.
2. **F02 + F03 vulnerability gate.** In `Directory.Build.props`:
   ```xml
   <WarningsAsErrors>$(WarningsAsErrors);NU1903;NU1904</WarningsAsErrors>
   ```
   and in `Directory.Packages.props` one `<NuGetAuditSuppress Include="https://github.com/advisories/GHSA-…" />` per
   accepted advisory, each commented `#33 M-1`. Add GHSA-v76p to M-1 first.
3. **F04 error boundary.** `createBrowserRouter([{ path: '*', element: <Root/>, errorElement: <AppCrashed/> }])`,
   where `AppCrashed` uses `useRouteError()`; chunk-load errors (`TypeError: Failed to fetch dynamically imported
   module`) get "LorEvolve was updated - Reload". Plus in `main.tsx`:
   `addEventListener('vite:preloadError', () => { if (!sessionStorage.reloaded) { sessionStorage.reloaded = 1; location.reload() } })`.
4. **F05 path encoding.** `lib/api.ts`: `export const universePath = (id: string, ...p: string[]) =>
   ['/api/universes', id, ...p].map((s, i) => i ? encodeURIComponent(s) : s).join('/')`; replace the 16 `base()`
   builders and `proposalPath`. Add one E2E: `/ai-changes/..%2F..%2Fx` hits a 404, not another route.
5. **F06 + F07 memory ceilings.** Return `stream.GetBuffer()` slice / `File(stream, …)` instead of `ToArray()`;
   one `SemaphoreSlim(1)` shared by export, validate and restore (409 `busy_try_again` when taken); set ImageSharp
   `Configuration.Default.MemoryAllocator` with `AllocationLimitMegabytes` sized to one 24 MP decode ×4.

## Quick wins (Low effort × Medium+)

- [ ] F02 add GHSA-v76p to #33 M-1
- [ ] F03 `NU1903;NU1904` as errors with explicit suppressions
- [ ] F04 root `errorElement` + `vite:preloadError`
- [ ] F09 add `entryEraCount`/`periodCount` to chronology era type
- [ ] F14 `IsUniqueViolation` for order-race 409s
- [ ] F20 move DB-backup `RefreshAsync` out of the run `try`
- [ ] F21 bound `SweepAsync` parallelism
- [ ] F28 global 401 -> sign-in
- [ ] F29 `/me` outage is not sign-out
- [ ] F36 document breakpoints
- [ ] F37 `dependabot.yml`
- [ ] F38 SHA-pin deploy job actions
- [ ] F40 `dotnet format --verify-no-changes` in CI

## Things that look bad but are actually fine

- **Archives held in memory, no extraction** (`BackupArchiveReader.cs:424`, ADR 0032): nothing touches disk, so no
  zip-slip; reads stop one byte past declared size; central directory bounded first. Guards are solid. Only the
  `ToArray` copy and missing concurrency cap are debt (F06).
- **Full re-validation (decode every picture) on `/restore`**: deliberate; never trust a client token over bytes.
- **Pictures first, one DB transaction, sweep on failure** (`UniverseRestore.cs:283-299`): ADR 0019/0032 ordering;
  failed restore leaves no partial universe.
- **AiChanges calling other features' `*CoreAsync`** (`AiChangeCommit.cs:337-420`): ADR 0047 requires each
  resource's own write path. Not a layering violation (the god-file part is F25/F26).
- **Image endpoints' `catch (Exception)`**: each sweeps and rethrows - compensation, not swallowing.
- **Raw SQL in `EntitySearchIndex`** (`:139-384`): identifiers are constants, values parameterized.
- **Two concurrency schemes (`EditVersion` vs `updatedAt`)**: ADR 0043:71.
- **Suggestions and AiChanges as parallel "proposed change" systems**: ADR 0044 vs 0047.
- **Assistant clients not from `IHttpClientFactory`**: singleton System.ClientModel pipelines pool connections with
  timeout and bounded retry; the one user-URL fetch (CIMD) does use the factory with public-address and no-redirect
  checks.
- **Prompt-injection surface**: lore reaches the model only as tool results; tools are read-only; proposals need a
  cookie-session `EditContent` approval; MCP bearer principal confined to MCP routes.
- **No `"strict"` in `tsconfig.app.json`**: TS 6 defaults strict on (probe confirmed). Adding it explicitly is
  cheap insurance, not a fix.
- **Hand-mirrored numeric enums on the web**: deliberate (numbers on the wire); every spot-checked value matched.
  Debt is the missing check (F10), not the pattern.
- **`styles.css` specificity**: 1 `!important`, flat BEM, only ~5 dead classes. Size and churn are the problem,
  not quality.
- **Production `sourcemap: true`**: public repo, helps triage.
- **`ProxyHeaders.cs:36-37` clearing KnownProxies**: only `XForwardedProto` forwarded, behind a flag - no IP spoofing.
- **Unpaged revision list, in-memory family grouping**: ADR 0013:121, ADR 0035:216.

## Open questions for the maintainer

1. F01: raise restore limits to match quota (and admin-raised quotas), or have export refuse?
2. F06/F07: acceptable to run one heavy archive job (export/validate/restore) at a time on the single instance?
3. F08: hard per-question budget on calls/tokens, or is 20 questions / 10 min + provider spend limit the ceiling?
4. F12: is `TimeProvider` meant to cover every timestamp, or only expiry/quota logic?
5. F14: does any story 409 path deliberately rely on FK/CHECK failures?
6. F23: rate limit `/mcp/*` per connection before more alpha testers connect?
7. F24: will public story pages stay one response with all scenes, or is paging planned?
8. F33: are the in-row Trash/Settings/Publish confirmations exceptions to ADR 0049, or missed?
9. F34: pure-move split of `styles.css` acceptable now, given parallel sessions edit it?
10. F39: is `TreatWarningsAsErrors` off by choice? No ADR says so.
11. CI: does branch protection require "CI"? `paths-ignore` (`ci.yml:12-16`) means docs-only PRs never report it.
12. CI: does the GitHub `dev` environment have required reviewers, or does every push deploy unattended?
13. F04: after an App Service deploy, do previous `/assets` chunks survive in `wwwroot`? Decides how urgent F04 is.
14. F55: has every environment run `PublicAuthorBackfill`?

## Remediation log (2026-10-26, quick wins, `fix/audit-quick-wins`)

| ID | Outcome |
|---|---|
| F02 | GHSA-v76p added to #33 M-1. It is in the TIFF decoder, which is not registered, so it can't be reached. No version change: issue #51 holds ImageSharp at 3.1.12 until the licensed 4.x upgrade. |
| F03 | `NU1903;NU1904` are errors. The 6 accepted ImageSharp GHSAs are suppressed by URL in `Directory.Build.props`, citing #51. A new High advisory now fails the build. |
| F04 | Root `errorElement` (`AppCrashed`): a stale chunk says "LorEvolve was updated", anything else offers a reload. `vite:preloadError` reloads once per session. |
| F09 | `entryEraCount` and `periodCount` are carried to the chronology editor and included in "Dates ...", so such an era can't be removed. |
| F14 | **Partly reversed.** The auditor misread it: the broad predicate is deliberate, because an FK failure is the "row vanished" race. Narrowed to unique + primary key + foreign key; NOT NULL now reaches the 500 handler (no CHECK exists on those tables). |
| F20 | `RefreshSafelyAsync`: a failed list refresh after a verified backup logs a warning and no longer records the run as failed. |
| F21 | `SweepAsync` limited to 8 concurrent deletes. |
| F28 | `apiFetch` fires `lorevolve:session-ended` on a 401 outside `/api/auth/`. Checked first that nothing else returns 401. `AuthProvider` clears the user and the guards redirect with `from`. |
| F29 | A non-401 probe failure sets `isUnreachable`; the guards show a "Try again" alert instead of sending the author to sign in. |
| F37 | `.github/dependabot.yml`: weekly and grouped for NuGet, both npm lockfiles and Actions, with ImageSharp majors ignored (#51). |
| F38 | Every action is pinned to a commit SHA with its `# vX.Y.Z` tag. |
| F51 | `.editorconfig` now matches `.gitattributes` (LF, with CRLF for cmd/bat/ps1/sln). This removed 146,842 false `ENDOFLINE` hits from `dotnet format`. |
| F36 | **Skipped.** `640px` and `40rem` match only at default font size, so unifying them changes layout for users with a larger font. It needs a visual pass. |
| F40 | **Deferred.** With F51 fixed, `dotnet format --verify-no-changes` still reports 416 whitespace issues and 10 style issues in 9 files, mostly `AiChangeViews.cs` (225) and `EntityEndpoints.cs` (108). Both are hot shared files, so reformat them in a quiet window, then add the CI gate. |

Checks: `dotnet build -c Release` green, with no NU1903 error now that the GHSAs are suppressed. 519 related API tests passed (DatabaseBackup, Chapter, Scene, PlotArc, PlotBeat, Chronology, EntityImage, Restore, StoryContent). `tsc -b`, oxlint and prettier are clean. Playwright `app-recovery` (3 new), `chronology-date-periods` (+1) and `auth` passed 13/13 with `--retries=0` on a fresh DB. The dev-server log during that run showed React "two children with the same key" console errors; no changed file renders a keyed list, so they are likely pre-existing and were not investigated.
