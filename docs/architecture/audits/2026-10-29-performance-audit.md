# Performance Audit

Generated 2026-10-29 on `chore/performance-audit`, cut from `dev` at `0f43927`, in the worktree
`.claude/worktrees/chore+performance-audit`. Scope chosen by the owner: measure a baseline, write a cited report,
implement the low-risk high-gain quick wins, re-measure. Bigger items are ranked here, not done. "Good practices" this
pass means performance plus a fresh dependency freshness and vulnerability check; standards, duplication, logging,
secrets and tests were covered by `2026-10-26-tech-debt-audit.md`, whose open perf rows get cross-reference rows below.

## 0. Baseline

| Item | Value |
| --- | --- |
| Branch, commit | `chore/performance-audit` at `0f43927` (`dev`), tree clean |
| Client build | `npm ci && npm run build` in `src/LorEvolve.Web` (Vite 8.3.5, Rolldown) |
| Staged server | `dotnet run --project src/LorEvolve.Api -c Release --no-launch-profile --urls http://localhost:5181 -- --Frontend:ShellPath=wwwroot/index.html`, `ASPNETCORE_ENVIRONMENT=Development`, `dist/*` copied into `wwwroot` |
| Database | copy of `App_Data/lorevolve.dev.db` (63.7 MB, 7,183 universes); the real file is never written |
| Seeded universe "Perf" | one throwaway local account; 60 entries, one 150,060-char article, one story and scene with a 150,040-char manuscript holding 20 mention tokens, 60 dated moments, one map with 5 pins |
| Page loads | Playwright 1.63 Chromium harness over CDP, 3 cold runs per page and device, fresh context each, cache and service worker off |
| Insights | Chrome DevTools MCP `performance_start_trace` + `performance_analyze_insight` (Lore list and Explore, mobile) |
| API numbers | `tests/LorEvolve.Api.Tests/ReadPathBenchmark.cs` (new) and `CanonSweepBenchmark.cs`, `LOREVOLVE_BENCH=1`, Release |
| Tools | .NET 10 SDK, Node 22.23, Chrome DevTools MCP, curl 8 |

## 1. Method and limits

- **Devices.** Desktop = 1365x900 at DPR 1, no throttling. Mobile = 390x844 at DPR 3, touch, CPU 4x, network 150 ms
  RTT, 1.6 Mbps down, 750 Kbps up (Lighthouse's mobile "slow 4G"). The MCP's own "Slow 4G" preset is lighter, so its
  trace LCPs (Lore 2,969 ms, Explore 2,509 ms) are lower than the harness's; they are used for the insights, not the
  tables.
- **Metrics.** TTFB and FCP from Navigation and Paint Timing; LCP, CLS and long tasks from `PerformanceObserver`
  registered before any page script; **ready** = when the page's own content first appears (an entry card, the
  article's first paragraph, the manuscript box, a timeline item, the map picture), because on the signed-in pages
  the LCP element is the decorative `.atmosphere` layer, painted before any data arrives. Requests and bytes from
  Resource Timing (`transferSize`). Each cell is the median of 3; spreads are in the raw files.
- **Interactions.** Event Timing entries of 16 ms and over (the API's floor) and long tasks while typing 30
  characters at 60 ms intervals at the end of the 150k article and manuscript, dragging the map 300 px, and clicking
  a Lore card through to the entry heading. Run at CPU 1x and 4x.
- **Why a harness and not 3 MCP traces per page.** Three traces per page and device, before and after, is about 70
  traces whose summaries alone exceed a working context. The harness records the same Web Vitals for every run and
  the MCP traces supply the insight detail. Lighthouse's performance category is not available through this MCP and
  `npx lighthouse` (a package download) was not run without the owner's approval.
- **What the numbers leave out.** Loopback HTTP/1.1 without TLS (Azure serves HTTP/2 over TLS), no F1 CPU quota, no
  SMB latency on `/home`, no cold start (DEV F1 has no Always On). The launch animation is disabled under automation
  (`navigator.webdriver`), so it is not in the landing numbers: about 2.35 s opening plus 1.1 s exit, owner design,
  unchanged.

## 2. Measured

### 2.1 Bundle (`vite build`, raw / gzip)

| Chunk | Raw | Gzip | Note |
| --- | --- | --- | --- |
| `LoreEditor` | 400.8 KB | 126.6 KB | Tiptap; lazy, loaded by EntityPage and StoryPage |
| `index` (entry) | 309.3 KB | 95.7 KB | holds react-dom (635 KB source), scheduler, part of react-router, lucide, 231 KB of app source |
| `index.css` | 263.2 KB | 45.1 KB | one stylesheet for every route |
| `EntityPage` | 147.2 KB | 37.7 KB | |
| `UniverseTypes` | 114.7 KB | 32.2 KB | |
| `jsx-runtime` | 104.0 KB | 34.7 KB | react plus the rest of react-router plus 4.5 KB of app source; Rolldown's automatic shared chunk |
| `StoryPage` | 98.2 KB | 24.5 KB | |

`dist` is 13.1 MB, of which 7.5 MB is source maps (`vite.config.ts:61` `sourcemap: true`) and 2.37 MB is the Explore
PNG fallback that no WebP-capable browser downloads. `public/brand-mark.png` is 160.2 KB at 384 px.

### 2.2 Page loads (median of 3)

| Page | Device | TTFB | FCP | LCP | Ready | CLS | Long tasks | Requests | Transfer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | desktop | 2 | 96 | 420 | 363 | 0 | 0 | 14 | 1,007 KB |
| `/` | mobile | 2 | 4,120 | 5,760 | 4,224 | 0.084 | 257 | 14 | 1,007 KB |
| `/explore` | desktop | 2 | 104 | 408 | 370 | 0.004 | 0 | 37 | 1,108 KB |
| `/explore` | mobile | 2 | 4,164 | 6,288 | 4,265 | 0.020 | 289 | 19 | 1,102 KB |
| `/login` | desktop | 2 | 432 | 432 | 394 | 0 | 0 | 11 | 1,029 KB |
| `/login` | mobile | 2 | 4,692 | 6,296 | 4,669 | 0 | 382 | 11 | 1,029 KB |
| Lore by type | desktop | 3 | 92 | 156 | 618 | 0.060 | 0 | 34 | 929 KB |
| Lore by type | mobile | 3 | 4,272 | 6,156 | 6,012 | 0.121 | 311 | 34 | 929 KB |
| 150k article | desktop | 4 | 152 | 296 | 529 | 0.075 | 53 | 58 | 1,671 KB |
| 150k manuscript | desktop | 5 | 148 | 276 | 542 | 0.050 | 0 | 50 | 1,203 KB |
| Timeline | desktop | 5 | 164 | 296 | 568 | 0.048 | 0 | 35 | 941 KB |
| Map | desktop | 5 | 160 | 264 | 505 | 0.047 | 0 | 33 | 1,097 KB |

All times in ms. On mobile every page moves about 1 MB before it can render; the MCP insights agree: the Lore trace's
LCP is 93% "load delay" behind the critical chain document -> `index-*.js` (861 ms) and `index-*.css` (670 ms), and
`DocumentLatency` flags "enabling text compression". The Lore desktop "ready" is about 80 ms later than the other
signed-in pages, the 150 ms debounce (P04).

### 2.3 Interactions (desktop)

| Interaction | CPU | Events over 16 ms | Max event | Mean processing | Long tasks |
| --- | --- | --- | --- | --- | --- |
| Type 30 chars, 150k article | 1x | 31 | 24 ms | 4 ms | 0 |
| Type 30 chars, 150k article | 4x | 130 | 128 ms | 14 ms | 4, 276 ms |
| Type 30 chars, 150k manuscript | 1x | 17 | 32 ms | 1 ms | 0 |
| Type 30 chars, 150k manuscript | 4x | 123 | 56 ms | 6 ms | 0 |
| Map drag 300 px | 1x | 9 | 16 ms | 0 ms | 0 |
| Map drag 300 px | 4x | 25 | 40 ms | 1 ms | 0 |
| Lore card to entry heading | 1x | 41 | 40 ms | 0 ms | 0 (934 ms wall) |
| Lore card to entry heading | 4x | 41 | 168 ms | 2 ms | 4, 693 ms (1,674 ms wall) |

`findMentions` over the 150,070-char manuscript, isolated: 0.1 ms at 1x, 0.6 ms at 4x per call, far under the 8 ms
the plan set for acting on it.

### 2.4 Wire (`curl -H "Accept-Encoding: br, gzip"`)

| Resource | Content-Encoding | Vary | Cache-Control | Bytes |
| --- | --- | --- | --- | --- |
| `/assets/index-*.css` | none | none | `public, max-age=31536000, immutable` | 263,158 |
| `/assets/index-*.js` | none | none | `public, max-age=31536000, immutable` | 309,282 |
| `/api/public/stats` | none | none | `no-cache` | 77 |
| `/` (shell) | none | none | `no-cache` | 11,912 |

### 2.5 API read paths (2,000 entries, 5,000 relationships, 1,000 moments, 200 scenes; warm, N=20)

| Read | Median | p95 | Queries |
| --- | --- | --- | --- |
| `GET /api/auth/me` | 1.2 ms | 2.3 ms | 1 |
| Universe detail | 1.9 ms | 2.9 ms | 2 |
| Chronology | 4.0 ms | 7.6 ms | 5 |
| Entity types | 4.3 ms | 5.4 ms | 2 |
| Entities browse, page 1 | 3.5 ms | 5.2 ms | 3 |
| Entities text search | 16.5 ms | 23.1 ms | 3 |
| Entities exact search | 3.8 ms | 5.3 ms | 3 |
| One entity detail | 4.2 ms | 10.6 ms | 2 |
| Timeline items, page 1 | 7.1 ms | 10.4 ms | 4 |
| Universe search | 11.1 ms | 15.1 ms | 10 |

Query counts exclude the per-request session check (ADR 0059), as `CommandCounter` does everywhere.

### 2.6 Startup backfill and gated save

- Search index backfill for 2,000 unindexed entries: **1,928 ms** (N+1, one autocommit per row,
  `EntitySearchIndex.cs:240-256`).
- `CanonSweepBenchmark`: evaluate 796 / 3,198 / 3,180 ms and one gated save 582 / 246 / 477 ms at 200 / 2,000 /
  5,000 entries; the sweeps themselves are 9 to 166 ms, so most of a gated save is the save, not the rules.

### 2.7 Dependencies

- `npm audit`: 0 vulnerabilities in web and E2E.
- `npm outdated` (web): patch or minor only: `@tiptap/*` 3.32.0 -> 3.32.1, `lucide-react` 1.61 -> 1.64, `oxlint`
  1.89 -> 1.90, `react-router-dom` 7.18.4 -> 7.18.5, `@types/node`. E2E: `@types/node` only.
- `dotnet list package --outdated`: `AWSSDK.S3` 4.0.104.7 -> .8; `SixLabors.ImageSharp` 3.1.12 -> 4.1.3.
- `--vulnerable --include-transitive`: ImageSharp 3.1.12, the same six advisories as F02 (four High). Held at 3.1.12
  by issue #51 until the licensed 4.x decision; nothing new this pass.

## 3. Findings

Severity: High = measured user-visible delay on a common path (over 300 ms on a cold page or over 100 ms per
interaction) or per-write or per-request work that grows with universe size; Medium = measurable but bounded or an
uncommon path; Low = payload or hygiene with no measured time cost.

| ID | Area | File:Line | Sev | Effort | Evidence | Smallest change | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | Wire | `src/LorEvolve.Api/Program.cs:101` | High | S | Measured: CSS 263 KB and entry JS 309 KB sent raw (2.4); about 1 MB per cold mobile page, LCP 5.8 to 6.3 s; MCP `DocumentLatency` flags compression | Response compression, Brotli then gzip, OAuth and MCP excluded (QW-A) | Done |
| P02 | Bundle | `src/LorEvolve.Web/vite.config.ts:59-62` | Medium | S | Measured: react-dom and scheduler in the entry chunk (2.1); the entry's hash changes on every deploy, and DEV deploys on every push, so returning visitors refetch about 96 KB gzip of unchanged React | One `vendor` chunk group for react, react-dom, scheduler, react-router (QW-B) | Done |
| P03 | Images | `scripts/render-icons.py:62`; `src/LorEvolve.Web/src/components/BrandMark.tsx:30-31` | Medium | S | Measured: 160.2 KB at 384 px, drawn at 34 px in every bar and at most 88 px on the sign-in plate | Render at 192 px (2x of the largest placement) (QW-C) | Done |
| P04 | Request chain | `src/LorEvolve.Web/src/pages/LorePage.tsx:274-300` | Medium | S | Measured: Lore desktop ready 618 ms vs 505 to 568 ms on the other signed-in pages; Code-read: the 150 ms debounce also delays the first load and every type, page and sort change | Debounce only a change of the search text (QW-F) | Done |
| P05 | Interaction | `src/LorEvolve.Web/src/components/EntityArticle.tsx:157-160` | Medium | S | Measured: 4x CPU, 130 events over 16 ms, max 128 ms, 4 long tasks while typing 30 chars; Code-read: three full parses of up to 200k chars per render, two of them of values that do not change while typing | Memoize the stored-content parses (QW-H) | Done |
| P06 | Interaction | `src/LorEvolve.Web/src/components/LoreEditor.tsx:146` | Medium | M | Code-read: `JSON.stringify(editor.getJSON())` of the whole document on every Tiptap update, feeding P05 | Serialize on idle or on save; needs the dirty check reworked | Listed |
| P07 | Write path | `src/LorEvolve.Api/Features/Lore/EntitySearchIndex.cs:139-141`; `Data/Migrations/20260909234511_AddEntitySearchIndex.cs:27-35` | Medium | M | Code-read: FTS5 keyed by `EntityId UNINDEXED`, so `DELETE ... WHERE EntityId = ?` scans the whole index on every entry or article save; the 26 universe-search triggers share the shape | Key by rowid or a side table mapping EntityId to rowid; a migration | Listed |
| P08 | Startup | `src/LorEvolve.Api/Features/Lore/EntitySearchIndex.cs:240-256` | Medium | S | Measured: 1,928 ms for 2,000 rows, one autocommit per row | One transaction around the loop | Listed |
| P09 | Read path | `src/LorEvolve.Api/Features/Search/UniverseSearchEndpoints.cs:56-70` | Low | M | Measured: 10 queries, 11.1 ms median at 2,000 entries; the client asks at a 200 ms cadence while typing | Fewer, union-shaped queries; or a longer client debounce | Listed |
| P10 | Read path | `src/LorEvolve.Api/Features/Timeline/TimelineFeed.cs:118-137` | Low | M | Measured: 4 queries, 7.1 ms; Code-read: `COUNT` over the `UNION ALL` plus a sort per page | Persisted sort keys; count once per filter | Listed |
| P11 | Read path | `src/LorEvolve.Api/Features/Lore/EntityEndpoints.cs:227-228` | Low | S | Measured: exact search 3.8 ms; Code-read: `lower(Name)` defeats any index | `COLLATE NOCASE` index on `(UniverseId, Name)` | Listed |
| P12 | Request chain | `src/LorEvolve.Web/src/pages/UniverseWorkspace.tsx:75-103,142-148` | Medium | L | Measured: Lore card to entry, 4x CPU, 1,674 ms wall, 4 long tasks; Code-read: `/me` -> universe + chronology -> page chunk -> types -> entries in sequence; no client cache, types refetched by 6 components | Client reference-data cache; start the page chunk import with the universe fetch | Listed |
| P13 | Images | `src/LorEvolve.Web/src/components/AppearanceList.tsx:280-294`; `ProgressionView.tsx:733-746` | Low | M | Code-read: galleries draw the `original` variant at 8rem | Fitted display copy (owner question 7) | Listed |
| P14 | Deploy size | `src/LorEvolve.Web/src/pages/ExplorePage.tsx:6,112-115` | Low | S | Measured: 2.37 MB PNG in `dist` beside the 250 KB WebP; Chrome fetched only the WebP (Explore mobile 1,102 KB total) | WebP only (QW-D); closes F58 | Done |
| P15 | Deploy size | `src/LorEvolve.Web/vite.config.ts:61` | Low | S | Measured: 7.5 MB of the 13.1 MB `dist` is source maps, copied to `wwwroot` on F1's 1 GB `/home` | `sourcemap: 'hidden'` or off (owner question 5) | Listed |
| P16 | Rendering | `src/LorEvolve.Web/src/components/LoreEditor.tsx:186-206` | Low | M | Code-read: read-only article views mount a Tiptap editor | Render read-only documents as HTML | Listed |
| P17 | Rendering | `src/LorEvolve.Web/src/components/FamilyTreeView.tsx:119-278`; `UniverseTypes.tsx:123-142`; `IdeaBoardCanvas.tsx:218-222,281` | Low | M | Code-read: hover and drag re-measure the DOM per event | Measure once per gesture | Listed |
| P18 | Interaction | `src/LorEvolve.Web/src/lib/usePanZoom.ts:192-226` | Low | S | Measured: map drag max event 40 ms at 4x, no long tasks | rAF batching only if a trace shows dropped frames (QW-K) | Deferred |
| P19 | Hosting | `infra/main.bicep` | Medium | S | Code-read: DEV runs F1 without Always On while bicep says B1 + alwaysOn; cold starts are outside every number here | Owner question 3 | Listed |
| F06 | Memory | `src/LorEvolve.Api/Features/Export/UniverseBackupArchive.cs:130,147` | High | M | Cross-reference, 2026-10-26 audit: archive built in memory then `ToArray()` | As F06 | Open |
| F07 | Memory | `src/LorEvolve.Api/Features/Media/ImagePreparation.cs:130` | Medium | M | Cross-reference: no ImageSharp `MemoryAllocator` cap | As F07 | Open |
| F24 | Read path | `src/LorEvolve.Api/Features/Publishing/PublicContentEndpoints.cs:186-192` | Medium | M | Cross-reference: anonymous story GET returns every manuscript unpaged | As F24 | Open |
| F46 | Health | `src/LorEvolve.Api/Program.cs:48` | Low | S | Cross-reference: `/health` has no DB check | As F46, with the SMB flap caveat | Open |
| F58 | Bundle | `src/LorEvolve.Web/src/pages/ExplorePage.tsx:6,115` | Low | S | Cross-reference: same as P14 | QW-D | Done |
| W4 | Database | `src/LorEvolve.Api/Data/DatabaseSetup.cs:26` | Medium | M | Cross-reference, 2026-10-25 audit: rollback journal; WAL untested off the SMB share | Phase 023 experiment; DEV stays on `delete` | Open |

## 4. Checked and found sound, or looks bad but is fine

- The per-request session check (ADR 0059) is one indexed read; `/api/auth/me` is 1 query, 1.2 ms. Stays.
- `index.html` and `sw.js` are `no-cache` and the service worker precaches nothing (ADR 0017): correct for a site that
  deploys on every push.
- `/assets/*` is `public, max-age=31536000, immutable`: the right header for hashed files; compression pays once per
  browser per deploy.
- The launch animation is owner design and outside these numbers.
- Export in memory is ADR 0014; its ceiling is F06, not a speed problem.
- No WAL on the SMB share (W4): correct for DEV.
- Canon gate sweeps (W3, W9): 56 to 166 ms at 2,000 to 5,000 entries; done.
- Images are proxied through the API because the R2 bucket is private; a CDN is a later decision (owner question 8).
- List reads already use `AsNoTracking`; browse is 3 queries, 3.5 ms at 2,000 entries.
- `findMentions` per keystroke: 0.6 ms at 4x CPU over 150k chars. Looks heavy, is not.
- Map drag: no long tasks at 4x CPU.

## 5. Open questions for the owner

1. Compression over HTTPS with `/oauth` and `/mcp` excluded, or CSS, JS and HTML only (JSON stays raw)?
2. Brand mark at 192 px (check the sign-in plate on a 2x desktop) or 256 px (about 60 KB)?
3. DEV on F1 while `infra/main.bicep` says B1 + alwaysOn: cold starts are outside these numbers; one timed request
   against DEV after 20 idle minutes would quantify them.
4. W4: the WAL experiment (opt-in, local and CI only) and PROD's journal mode belong to Phase 023.
5. Source maps in `wwwroot` on F1's 1 GB: keep, `sourcemap: 'hidden'`, or off?
6. Compiled EF model: only if startup model build measures slow on DEV.
7. Appearance galleries: square thumbnails, or a fitted display copy?
8. A public media CDN later; images stay proxied while the bucket is private.

## 6. Smallest safe sequence

Done in this pass, one commit each: QW-A compression (P01), QW-B vendor chunk (P02), QW-C brand mark (P03), QW-D
Explore WebP (P14, F58), QW-F Lore first load (P04), QW-H article parses (P05).

Deferred quick wins, each with its reason:

- **QW-E** gallery `thumbnail` variant: it is a 320 px centred square crop (`ImagePreparation.cs`) while the gallery
  shows the picture's own shape on purpose (`AppearanceList.tsx:290`); a visual decision; the real fix is a fitted
  display copy.
- **QW-G** chunk preload: saves one fetch on a cold cache only and needs a route-to-import map over 36 lazy routes;
  revisit if the Lore chunk measures over 150 ms on the cold mobile trace.
- **QW-H manuscript part**: `findMentions` costs 0.6 ms per call at 4x CPU (2.3), under the 8 ms bar; left as is.
- **QW-I** `/me` projection: 1 query, 1.2 ms.
- **QW-J** context memo: consumers are not memoized and the shell re-renders on every navigation anyway.
- **QW-K** rAF in `usePanZoom`: the drag shows no long tasks at 4x CPU (P18).
- **QW-L** SQLite pragmas or `AddDbContextPool`: W4 forbids WAL on DEV; reads are 1 to 17 ms.
- **QW-M** CI size gate: `vite build` already prints the size table in the CI log; a budget gate is new tooling.

Then, in gain order: P12 client reference cache and earlier chunk import; P06 article serialization; P07 FTS key
redesign; P08 backfill transaction; F24 public story paging; F06 export streaming; F07 allocator cap; P15 source maps;
P09, P10, P11 query shapes; P16, P17 rendering; F46 health DB check; P19 DEV tier.

Not changed on purpose: launch animation, per-request session check (ADR 0059), service worker strategy (ADR 0017),
journal mode (W4), export in memory (ADR 0014).

## 7. Remediation log

| Commit | Finding | Change | Before | After |
| --- | --- | --- | --- | --- |
| `eaf032e` | P01 | Brotli then gzip, `/oauth` and `/mcp` excluded | CSS 263,158 B, entry JS 309,282 B, shell 11,912 B, all raw | CSS 76,849 B br, entry 38,193 B + vendor 125,145 B br, shell 4,969 B br |
| `655c1e0` | P02 | `vendor` chunk group | entry 309.3 KB raw holding react-dom | entry 98.5 KB raw; vendor hash unchanged after an app-only change (`vendor-BMz_cmJY.js` both builds) |
| `931e8f0` | P03 | brand mark at 192 px | 160,172 B | 45,744 B |
| `4f6d011` | P14, F58 | Explore hero WebP only | `dist` 13.1 MB with a 2.37 MB PNG | `dist` 10.6 MB |
| `b5656b8` | P04 | debounce only the search text | Lore desktop ready 618 ms | 523 ms |
| `4bbc93c` | P05 | memoized stored-article parses | typing at 4x CPU: max event 128 ms, long tasks 276 ms | max event 88 ms, long tasks 69 ms |
| `9d2149a` | W2 (section 9) | types and groups read beside the universe | Lore `entity-types` sent at 490 ms | sent at 139 ms |
| `c2e8ab7` | W1 (section 9) | section chunks preloaded, no Suspense fallback | 255 to 269 ms throttle timer after the chunk | none |
| `51f5a65` | W3 (section 9) | types list counts in grouped queries | `GET entity-types` 23.8 ms | 13.8 ms |

## 8. Before and after

Same harness, same seeded database copy, same devices, 3 runs each; after = the branch tip with all six quick wins.
The raw baseline files were deleted from the scratchpad by a concurrent cleanup after section 2 was written from them;
the after run is kept in the shared session notes folder. Delta is (after - before) / before. On desktop the server is
on loopback, so compression cannot save network time there and the desktop rows move within a few tens of ms either
way; the mobile rows, with a real network model, are the ones that show the change.

### 8.1 Bytes

| What | Before | After | Delta |
| --- | --- | --- | --- |
| Stylesheet on the wire | 263,158 B | 76,849 B | -71% |
| Entry JS on the wire (first visit, entry + vendor) | 309,282 B | 163,338 B | -47% |
| Entry JS refetched after an app-only deploy | 309,282 B | 38,193 B | -88% |
| App shell `index.html` | 11,912 B | 4,969 B | -58% |
| Brand mark | 160,172 B | 45,744 B | -71% |
| `dist` (and the deploy zip) | 13.1 MB | 10.6 MB | -19% |
| Cold page transfer, landing | 1,007 KB | 455 KB | -55% |
| Cold page transfer, Lore list | 929 KB | 445 KB | -52% |
| Cold page transfer, 150k article | 1,671 KB | 688 KB | -59% |
| Cold page transfer, map | 1,097 KB | 446 KB | -59% |
| `/api/public/stats` (77-byte JSON) | 77 B | 81 B | +5% (a body this small does not shrink) |

### 8.2 Page loads, mobile (CPU 4x, slow 4G)

| Page | Metric | Before | After | Delta |
| --- | --- | --- | --- | --- |
| `/` | FCP | 4,120 | 2,148 | -48% |
| `/` | LCP | 5,760 | 3,208 | -44% |
| `/explore` | FCP | 4,164 | 2,076 | -50% |
| `/explore` | LCP | 6,288 | 3,588 | -43% |
| `/login` | FCP | 4,692 | 2,716 | -42% |
| `/login` | LCP | 6,296 | 3,740 | -41% |
| Lore by type | LCP | 6,156 | 4,072 | -34% |
| Lore by type | Ready (first entry card) | 6,012 | 3,780 | -37% |

### 8.3 Page loads, desktop (no throttling, loopback)

| Page | Metric | Before | After | Delta |
| --- | --- | --- | --- | --- |
| `/` | LCP | 420 | 232 | -45% |
| `/explore` | LCP | 408 | 460 | +13% (loopback noise; nothing on this page got heavier) |
| `/login` | LCP | 432 | 496 | +15% (loopback noise) |
| Lore by type | Ready | 618 | 523 | -15% |
| 150k article | Ready | 529 | 509 | no change |
| 150k manuscript | Ready | 542 | 505 | -7% |
| Timeline | Ready | 568 | 497 | -13% |
| Map | Ready | 505 | 460 | -9% |

### 8.4 Interactions (desktop, CPU 4x)

| Interaction | Metric | Before | After | Delta |
| --- | --- | --- | --- | --- |
| Typing in the 150k article | Max event | 128 ms | 88 ms | -31% |
| Typing in the 150k article | Mean processing per event | 14 ms | 8 ms | -43% |
| Typing in the 150k article | Long tasks | 276 ms (4) | 69 ms (1) | -75% |
| Typing in the 150k manuscript | Max event | 56 ms | 64 ms | no change (not touched) |
| Map drag 300 px | Max event | 40 ms | 24 ms | no change (not touched) |
| Lore card to entry heading | Wall time | 1,674 ms | 1,492 ms | -11% |
| Lore card to entry heading | Long tasks | 693 ms | 442 ms | -36% |

### 8.5 API

No server read path changed; the rerun is within run-to-run noise (for example entities browse 3.5 -> 5.4 ms, universe
search 11.1 -> 9.0 ms, same query counts; backfill 1,928 -> 1,845 ms). Compression adds a few milliseconds of CPU per
text response at Brotli `Fastest`; it was not measurable here.

### 8.6 What the after numbers suggest next

- Brotli at `Fastest` gives the stylesheet 76.8 KB, where gzip at Vite's level gives 45.1 KB. Compressing the built
  files once at build or publish time (`MapStaticAssets` precompression, or a precompression step) would get the
  smaller size with no per-request CPU on F1. Listed with P01's follow-ups; it moves cache rules into MSBuild, so it is
  not a quick win.

## 9. Workspace load chain (2026-10-30)

On `fix/workspace-load-chain`, cut from `dev` at `e9346f2`. The owner still saw about a second before a workspace page
was drawn, piece by piece. A production trace of the signed-in Lore landing page on lorevolve.com that day put the
catalog's paint at about 986 ms with the server answering every read in 60 to 90 ms. Three causes, one commit each.

| Id | Cause | Fix |
| --- | --- | --- |
| W1 | React's Suspense fallback throttle: the Outlet's fallback showed at ~360 ms, the `LorePage` chunk arrived ~30 ms later, and React held the fallback until 300 ms after it first showed (`TimerInstall` 265 ms, re-armed 255 ms, fired at 664). Every first visit to a lazy section paid it. | `lazyWithPreload` (`src/lib/lazyWithPreload.ts`): a screen whose code is here is drawn directly, so its boundary never suspends. `main.tsx` preloads the screen at the address beside the session check; the workspace prefetches every section's code and an entry's when open and idle. The lazy screens moved to `src/screens.ts`. |
| W2 | The mount-order chain: `me` -> universe + chronology -> chunk -> throttle -> types + groups (`LorePage`'s mount effect) -> paint. Types and groups need only the universe id. | `UniverseWorkspace` reads both in the same effect as the universe and hands them down through the Outlet context with a refresh (`useWorkspaceTypes`); Lore, an entry, the Family Tree, Mass create and Types use it. The first screen uses that read; later screens read again as they open, showing the copy they have, so entry counts stay current. `QuickCreateDialog` still reads on open, as its comment asks. |
| W3 | `LoadTypesAsync`: one projection with three correlated entry counts per type and four correlated distinct counts per field. Production median 152 ms beside 60 to 90 ms for every other read. | Types, fields and sections read plain; per-type entry counts, per-field holders (own values unioned with era overrides) and fields in history in one grouped query each, composed in memory. Response unchanged. `AsSplitQuery` was tried first: no faster (24.1 against 23.8 ms) and four more queries, so not used. |

### 9.1 Method

Section 0's staged server (Release on :5181, `dist/*` in `wwwroot`, a copy of `lorevolve.dev.db`), one throwaway local
account registered through the UI, one universe with 20 entries over four types. Chrome DevTools MCP
`performance_start_trace` (reload, cache ignored, service worker warm), desktop, no throttling, loopback; three runs
each of the Lore landing page and one entry page. Times are ms from navigation start, read from the saved traces
(`ResourceSendRequest`, `ResourceFinish`, `TimerInstall` of 100 ms or more). The first run after a new build or server
start is a warm-up and is not counted. Server side: `ReadPathBenchmark`, now seeding six fields on every type and a
value in each Character field for all 2,000 entries (12,000 values), so the types read carries per-field counts.

### 9.2 Before and after (median of 3)

| Page | Metric | Before | After | Delta |
| --- | --- | --- | --- | --- |
| Lore landing | `entity-types` sent | 490 | 139 | -72% |
| Lore landing | Types and groups answered (the catalog's data) | 529 | 164 | -69% |
| Lore landing | Fallback throttle timer after the chunk | 254 to 269 ms, every run | none | gone |
| Entry page | `entity-types` sent | 482 | 171 | -65% |
| Entry page | Entry read sent | 483 | 194 | -60% |
| Entry page | Last read answered (map pins) | 543 | 262 | -52% |
| Entry page | Fallback throttle timer after the chunk | 246 to 257 ms, every run | none | gone |
| Both | JS chunks fetched in the trace | 25 (Lore), 46 (entry) | 81 | the idle prefetch, after the page's reads |

Loopback hides the network, so on production the saving is the throttle (about 270 ms) plus the chain (the types no
longer wait for the chunk, about 320 ms in the trace) plus W3's server time.

| Read (`ReadPathBenchmark`, warm, N=20, Release) | Before | After |
| --- | --- | --- |
| `GET entity-types` | median 23.8 ms, p95 25.6 ms, 2 queries | median 13.8 ms, p95 14.7 ms, 5 queries |
| `GET entity-types`, empty fields (section 2.5's seed) | 5.1 ms | not rerun |

The very first run with the new seed read 36.4 ms on the old code; it ran on a cold machine and every read in it was
slower, so the same-session 23.8 ms is the fair baseline.

### 9.3 Checks and what is left

- Focused Playwright (`--retries=0 --workers=2`, fresh database): 145 of 146 passed. `nested-types.spec.ts` failed 3 of
  3 alone: Lore now draws its heading from the workspace's copy of the types before its own entries read has gone out,
  and the spec counted that read as the crumb's. `320a82a` waits for the entries first; 15 of 15 then.
- `UniverseAccessMatrixTests.Every_member_lacking_a_capability_is_refused_with_403_and_nothing_changes` fails on this
  branch and on its base backend alike ("Reviewer: restore entry version: expected 403, got 404"); no server file it
  touches changed here. Not fixed in this pass.
- `entity detail` in the bench went from 5.0 ms to 46 to 72 ms with the new seed: it has its own per-field reads, not
  `LoadTypesAsync`. A candidate for the same treatment.
- The idle prefetch fetches every section's code, the rich-text editor's included, once per workspace visit until the
  service worker holds it. If that ever shows on a metered phone, prefetch only the entry page and the sidebar
  sections the author actually uses.
