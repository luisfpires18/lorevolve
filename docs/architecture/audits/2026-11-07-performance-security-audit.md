# Performance and security audit, 2026-11-07

On `fix/audit-2026-11-quick-wins`, cut from `dev` at `e08d743`. Owner's brief: a full performance and security audit,
with five "vibe coder" slides (indexes, caching, images, load testing, rate limiting) as prompts to check rather than
rules, plus current practice for ASP.NET Core with SQL, Identity, React and page loading. Three audits already stood:
`2026-10-26-tech-debt-audit.md` (F items), `2026-10-29-performance-audit.md` (P and W items) and
`docs/security/alpha-security-assessment.md` (M, L, N items). This pass re-read the code against them, so every row
below is new or a re-ranking; the open items of those audits are listed once in section 5 and not repeated.

Nothing was measured this pass: every finding is a code read with a file and line. The prior audit's numbers stand.

## 1. Sources consulted

- Microsoft Learn: ASP.NET Core Best Practices (no-tracking reads, paging, caching, HttpClientFactory); Kestrel
  security considerations (forwarded headers before authentication, `ForwardLimit` 1, rate limiter 429); proxy and
  load-balancer configuration (`KnownProxies`, `KnownNetworks`, rightmost value); Identity configuration (lockout five
  tries for five minutes, PBKDF2 100,000 iterations); App Service for ASP.NET Core (TLS terminates at the front end).
- Web: an EF Core performance guide (split queries, no-tracking, N+1), an ASP.NET Core security checklist (cookie
  flags, hashing, rate limiting), one write-up of per-IP limits bypassed through `X-Forwarded-For`, a Vite bundle
  optimisation guide (vendor split, route-level lazy loading), two Core Web Vitals summaries (LCP 2.5 s, INP 200 ms,
  CLS 0.1; no lazy loading on the LCP image; self-hosted fonts; long `Cache-Control` on hashed assets).

## 2. The five slides, against this app

| Slide | Verdict | Where |
| --- | --- | --- |
| Indexes | Sound. Every foreign key is indexed, `UniverseId` leads every scoped index, slugs and email are unique. Three query shapes defeated an index anyway (A5, A6, A10). | `Data/Migrations/*Snapshot.cs` |
| Caching | None in process, by design. Hashed assets are `immutable`. Every anonymous route read SQLite per request and every public picture revalidated with the whole public query (A9). Redis is the wrong tool for one B1 instance; a short `max-age` and, later, a small in-process cache are the right ones. | `PublicUniverseEndpoints.cs`, `SeoEndpoints.cs` |
| Images | Derivatives are WebP, stripped and sized. The entry page and progression stages draw the uploaded original, up to 8 MB with EXIF (A3). Vercel or Cloudflare resizing does not apply: the bucket is private and the apex is DNS-only. | `EntityPage.tsx:300`, `stagePictures.ts:39` |
| Load testing | None. Micro-benchmarks behind `LOREVOLVE_BENCH=1`, never in CI. A k6 smoke script is the right size (A18). | `tests/LorEvolve.Api.Tests/ReadPathBenchmark.cs` |
| Rate limiting | One limiter, global, on MCP client registration; `UseRateLimiter` was wired inside MCP setup. Sign-in had per-account lockout only. Blocked on the client address, which `X-Forwarded-For` was deliberately not supplying (A2). | `McpSetup.cs`, `ProxyHeaders.cs`, `AuthEndpoints.cs` |

## 3. Findings

Severity: High = reachable abuse or user-visible delay on a common path; Medium = bounded or uncommon; Low = hygiene.
Status: Done = on this branch; Listed = ranked for a later pass; Owner = a decision, not a change.

| ID | Area | File:line | Sev | Finding | Change | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Secrets | `.mcp.json` (working tree) | High | A Meshy MCP server entry with its plaintext API key had been added to this repo's tracked `.mcp.json` by mistake; it belongs to another project. Never committed or pushed. | Diff discarded. | Done |
| A2 | Rate limiting (M-2) | `Hosting/ProxyHeaders.cs:35`, `Hosting/RateLimits.cs`, `Program.cs` | High | No per-address ceiling on sign-in, sign-up, forgot and reset password, the anonymous portal, sitemap or `/oauth/token`; one caller could try a password against every account or mail a reset to each. The client address was unknown: only `X-Forwarded-Proto` was forwarded. | `X-Forwarded-For` honoured with `ForwardLimit` 1 (App Service appends the client as the rightmost hop). `RateLimits`: `auth` 10 a minute and `public` 300 a minute per address, fixed window, 429 with `Retry-After`; `RateLimits:AuthPerMinute` and `:PublicPerMinute` tune them. `UseRateLimiter` moved to `Program.cs`. A request with no address (the test server) is not limited. `RateLimitTests`. | Done |
| A3 | Images (extends P13, L-3) | `EntityImageEndpoints.cs`, `AppearanceImageEndpoints.cs`, `ImagePreparation.cs`, `EntityPage.tsx`, `stagePictures.ts`, `AppearanceList.tsx`, `ProgressionView.tsx` | Medium | The entry page and stage pictures loaded the uploaded original on every view; galleries drew the original at 8 rem. | A `display` copy (WebP, whole picture within 1280 px, stripped) cut in the upload's own decode beside the thumbnail, stored under a nullable `DisplayKey` (migration `AddImageDisplayCopies`, two added columns), served at `/display`, swept with the pair. The contract says `hasDisplay`; the client draws the original for a picture stored before this, restored from a backup or staged by the assistant, and the full-size viewer keeps the original. The gallery's centred-square thumbnail stays what it was (QW-E). | Done |
| A4 | Observability (#70) | `Program.cs`, `appsettings.AzureProd.json:3-12` | High (PROD) | No Application Insights or OpenTelemetry, no slow-query log, no alert; logs reachable only by `az webapp log tail`. | Application Insights with its connection string as an app setting; one availability test and one alert on the 5xx rate; a `DbCommandInterceptor` logging commands over 200 ms (EF has no threshold of its own). | Listed |
| A5 | Query shape | `Universes/UniverseEndpoints.cs:56` | Medium | "My universes" filtered on `OwnerId == u OR EXISTS(membership)`. SQLite takes an OR as two index lookups only when both sides are indexable; a correlated EXISTS is not, so the whole table was scanned, twice a page (DEV holds 7,183 rows). | The membership side is `Id IN (the caller's membership universe ids)`, which the primary key answers. | Done |
| A6 | Query shape | `Lore/RevisionCapture.cs:58`, `Lore/RevisionEndpoints.cs:264` | Medium | Three collection `Include`s on one row without a split: aliases x tags x values rows on every entry save and every version read. | `AsSplitQuery()` on both. | Done |
| A7 | Health (F46) | `Features/Health/DatabaseHealthCheck.cs`, `Program.cs` | Medium | `/health` had no checks: App Service's probe and the deploy gate passed beside an unreachable SQLite share, which has happened (`deploy-dev.yml:166`). | `/health` opens the database (`CanConnectAsync`); `/api/health` stays static for the version and start time. | Done |
| A8 | Edge | `docs/design/custom-domain-plan.md:59-60` | High (PROD) | The apex is DNS-only in Cloudflare: no WAF, no edge rate limit, no edge cache, no edge Brotli. | Orange-cloud the apex; then `ForwardLimit` 2 with Cloudflare's ranges as known networks, or read `CF-Connecting-IP`. Runbook change. | Owner |
| A9 | Caching | `Publishing/PublicUniverseEndpoints.cs` (`ServeWebpAsync`) | Medium | Public card, thumbnail and avatar bytes were `no-cache` with an ETag: Explore's two dozen cards cost a full public query each on every visit. | Picture bytes are `public, max-age=60`; a picture that goes private can be shown by a browser already holding it for at most a minute. JSON stays `no-cache`. | Done |
| A10 | Query shape | `Seo/SeoEndpoints.cs:107-117`, `Publishing/PublicationRules.cs:93-97` | Medium | The sitemap filters `Entities` and `Stories` on `Visibility` with no index and a correlated universe test per row: a full scan of both tables per request once `PublicSite:AllowIndexing` is on. | A filtered index `(UniverseId, Visibility) WHERE Visibility <> 0` on both tables, additive, no rebuild. | Listed |
| A11 | Client fetching (extends P12) | `lib/api.ts:96-139`, `ideas/api.ts:69-78`, `NameLinker.tsx:30-35` | Medium | No dedup or cache layer: `listAllUniverses` walks pages one after another and is called by four screens; `NameLinker` fetches a full entry per linked name. | In-flight dedup plus a 30 s TTL for GETs inside `apiFetch`, opt-in per call; `NameLinker` reads names in one request. | Listed |
| A12 | Deploy (P15, L-11) | `vite.config.ts:61` | Low | 7.5 MB of source maps copied to `wwwroot` and served to anyone. | `sourcemap: false` (the repository is public; a map adds nothing for triage). | Done |
| A13 | Bundle (extends P16) | `PublicLorePage.tsx:4`, `LoreEditor.tsx:186` | Medium | The anonymous reader page loads the whole Tiptap editor (400 KB raw) to show a read-only article. | Render the stored JSON to React nodes over the schema's node types; Tiptap leaves the public chunk. | Listed |
| A14 | Headers (M-4 residual) | `Hosting/SecurityHeaders.cs`, `Program.cs` | Low | No `form-action`, no `Permissions-Policy`, HSTS at the 30-day default, `Server: Kestrel` sent. | `form-action 'self'` in the CSP, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, HSTS one year (not `includeSubDomains`: the demo site is on another host), server header off. `script-src` still needs the shell's inline scripts hashed or nonced. | Done |
| A15 | Request limits | `Program.cs` | Low | JSON routes kept Kestrel's 30 MB body default, buffered before validation. | `MaxRequestBodySize` 8 MB (a manuscript save is the largest body); uploads and restore keep their own route ceilings. | Done |
| A16 | Authorization | `Program.cs` | Low | Routes are anonymous unless they opt in; the access-matrix test covers the universe routes, a fallback policy would cover a new route someone forgets. | `SetFallbackPolicy(RequireAuthenticatedUser)` with `AllowAnonymous()` on the listed open groups. | Listed |
| A17 | CI | `.github/workflows/ci.yml` | Medium | No `npm audit` and no CodeQL; NuGet advisories already fail the build. | `npm audit --omit=dev --audit-level=high` in the Web job. CodeQL weekly for C# and JavaScript. | Done (audit); Listed (CodeQL) |
| A18 | Load | `tests/load/k6-smoke.js` | Medium | No load test of any kind. | A k6 smoke script: 20 virtual users for two minutes over the shell, Explore, stats and, with credentials, My universes and a lore list; p95 under 800 ms, failures under 1%. Run by hand against DEV, not in CI. | Done (script); not yet run |
| A19 | Rendering | `usePanZoom.ts:192-224`, `MapViewer.tsx:253`, `IdeaBoardCanvas.tsx:244` | Low | `setView` per pointer move re-renders the whole canvas; nothing is memoised. P18 measured no long tasks at 4x CPU. | Only on a trace showing dropped frames: a ref-driven transform and memoised pins and cards. | Listed |
| A20 | Preload | `UniverseWorkspace.tsx:178-187`, `screens.ts:107-109` | Low | Every section chunk, Tiptap included, is preloaded at idle on every universe open, whatever the connection. | Skip when `navigator.connection.saveData` is set or the effective type is 2g or 3g. | Listed |
| A21 | Hygiene | `.gitignore` | Low | `.wrangler/` (two copies, holding the Cloudflare account id), `.playwright-mcp/`, `review-artifacts/` and `worktrees/` were untracked or ignored only locally. | All four in `.gitignore`; the stray copy under `Features/` deleted. | Done |
| A22 | Infra (P19) | `infra/main.bicep:25,72` | Low | The template says B1 with Always On; DEV runs F1. A redeploy of the template diverges. | SKU as a parameter; `alwaysOn` only when the SKU allows it. | Listed |
| A23 | Cold start | `LorEvolve.Api.csproj`, `Data/DatabaseSetup.cs:30`, the backfills | Low | Migrations and three backfills run before Kestrel listens; no ReadyToRun. | `PublishReadyToRun` in the deploy publish; P08's one-transaction backfill; backfills after listen (F55). | Listed |

## 4. Checked and sound

- Session cookie: `__Host-` prefix, HttpOnly, Secure, `SameSite=Strict`, seven-day sliding window (`AuthSetup.cs:22-44`).
- Every unsafe `/api` method passes the same-origin gate (`SameOriginWrites.cs`); no request record binds an entity or
  carries an owner, role, visibility or quota field.
- Logs carry user id and name, never email or password; the 500 carries a trace id only.
- The MCP gate checks token, audience, scope, connection, block and role on every request.
- `AsNoTracking` on every read that is not a projection. All 37 screens lazy. No `dangerouslySetInnerHTML`, no
  third-party script, no token in browser storage; links limited to http, https and mailto; every search box debounced.
- Workflows: actions pinned by SHA, `contents: read`, OIDC sign-in, no `secrets.*`; dependencies current, `npm audit`
  clean on 2026-10-29. Password hashing is Identity's PBKDF2 at 100,000 iterations, the documented default.
- The launch opening on `/` is the single largest first-paint cost on the front door (about three seconds a browser
  session). Owner decision 2026-11-07: keep; it is an intro meant to be watched and a tap skips it.

## 5. Still open from the earlier audits

Performance: P06 article serialised per keystroke, P07 full-text index keyed by `EntityId UNINDEXED`, P08 backfill
per row, P09 universe search in ten queries, P10 timeline count over a UNION, P11 `lower(Name)`, P12 client request
chain, P13 galleries, P16 and P17 rendering, P19 DEV tier, F06 export in memory, F07 no ImageSharp allocator cap,
F24 public story unpaged, W4 no WAL (Phase 023). Security: M-1 ImageSharp 4.x licence (#51), M-3 in-memory
allowances, M-5 session lifecycle, M-6 AI disclosure, L-1, L-3, L-5, L-6, L-7, L-9, and M-4's `script-src`. M-2 is
closed by A2 once this branch merges.

## 6. Verification on this branch

- `dotnet build` Release with `WarningsAsErrors`; the test classes the changes touch (rate limits, host startup,
  artwork and content publication, auth, password reset, public stats and authors, SEO, OAuth, universes, revisions).
- A2: `RateLimitTests` sends four sign-ins from one forwarded address and expects 429 with `Retry-After` on the fourth,
  a second address still 401, only the rightmost forwarded value counted, the portal in its own bucket, and no limit
  without an address.
- A9: the artwork and thumbnail tests now expect `public, max-age=60`; the list test still expects `no-cache`.
- A12: `npm run build` leaves no `*.map` under `dist/assets`.
- Focused Playwright: explore, entity image, public world and sign-in specs.
- A18: not run yet; the owner runs it against DEV after the deploy and records p95 here.

## 7. Next, in gain order

A3 follow-up: a one-off backfill cutting display copies for pictures uploaded before it, if the originals are large enough to matter.
A4 Application Insights and one alert; A8 Cloudflare proxy (owner); A10 visibility index;
A11 client dedup; A13 public article without Tiptap; A16 fallback policy; A17 CodeQL; A23 ReadyToRun; A22 Bicep SKU;
A20 save-data preload; A19 only after a trace.
