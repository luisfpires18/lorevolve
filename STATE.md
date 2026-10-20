# STATE

Operational state only. Architecture: `docs/architecture/decisions/README.md`. Paths:
`SYSTEMS.md`. Tooling rules: `.claude/CLAUDE.md`. Trial history: `docs/tooling/agent-tooling-trial.md`.

## Roadmap position

- Phases 001-022 done and merged. Sequence log: `docs/architecture/branching.md`.
- **Phase 020** (Full-Text Search) merged into `dev`. Entity search reads the article an author
  wrote, not only the name, aliases and summary, and orders hits by relevance. Index shape,
  synchronization and query semantics: ADR 0016.
- **Phase 021** (PWA / Mobile Refinement) merged into `dev`. Lorex installs: a hand-written
  manifest, four icons, and a service worker that caches build output and refuses `/api`,
  non-`GET`, navigations and cross-origin outright - ADR 0017, which also says plainly that
  nothing works offline. Narrow-screen chrome folds into one sticky bar; desktop untouched.
- **Phase 022** (Azure DEV + CI/CD) merged into `dev`. The deployment-blocking startup bug is
  fixed, and DEV has a topology, workflows and a runbook. The owner has since created it.
  - The host no longer dies outside Development. `LorexDatabaseInitializer` migrates once per
    process in every environment, and the search-index backfill awaits it, so schema readiness is
    a dependency rather than an accident of registration order. ADR 0018.
  - DEV is **one Linux App Service** serving the API and the built client from one process, with
    SQLite and the Data Protection key ring on the site's persistent `/home` share.
  - `ci.yml` validates every pull request into `dev`; `deploy-dev.yml` calls it and then deploys,
    from `dev` only, over OIDC. No credential is stored in the repository.
  - Runbook, limitations and troubleshooting: `docs/deployment/azure-dev.md`.
- **The Lorex mark** (`feat/lorex-brand-icon`, merged into `dev`). The owner supplied the
  real icon - three interlocking red rings around a star - so the drawn stand-in is gone.
  `assets/brand/lorex-icon.png` is the one source, unaltered, and `scripts/render-icons.py` now
  resamples it into every shipped asset rather than reading geometry out of an SVG. The source has
  genuine transparency; the checkerboard a viewer shows is the viewer's.
  - **The icons keep the master's transparency** (`fix/transparent-app-icons`, merged into `dev`
    at `1b94d92`). The first cut put every platform-facing asset on `--paper`, because 62% of the
    artwork is darker than luminance 40; in a dark tab strip that is a pale tile, which the owner
    saw straight away. Rendered against a browser's own tab greys, the transparent mark is
    legible at 16px anyway. The ground survives only where transparency is not a choice: the
    maskable icon, which a platform crops and fills, and the Apple touch icon, which iOS
    composites onto black. `CACHE_VERSION` is `v3`.
  - Paddings are per platform: the maskable icon keeps the mark inside the middle 62% so
    Android's circle cannot clip it, Apple gets 12%, the favicons 2-4%. `public/icon.svg` is
    deleted - tracing shaded artwork into vectors would be redrawing it - so the favicon is PNG
    at 48, 32 and 16.
  - **The rail keeps its `L`.** The symbol was tried there: at ~30px it reads as a red tangle and
    it puts the only saturated colour in the chrome above the universe accent seal. The mark is
    large on the auth plate and small beside the wordmark in the paper bars, decorative in both.
  - Same filenames, new bytes, and root static files are cached by path - hence the version
    bumps. ADR 0017 amendment.
- **Numbered implementation pauses after 022.** Work continues on unnumbered
  `<type>/<description>` branches: Phase 2 Story, Phase 3, and now Phase 4.
  **Phase 023 - Production Hardening / PostgreSQL - remains deferred** and is not started; the
  next numbered phase resumes only when the owner says so.
- **Design refactor 001-007 done and merged** (007 at `cc798c1`, merged into `dev` at `a87b7da`; Deploy DEV #47 green).
  The contract is now an as-built reference. See Design refactor below.
- **Assistant usage indicator V1** (`feat/assistant-usage-indicator` off `dev` at `f03823a`; committed, not merged, not
  pushed). No migration. ADR 0045 amendment. Profile > Usage > AI Assistant: "N of 20 questions used", %, meter, left,
  and when used up the time it comes back. `AssistantAllowance` (in-process fixed window per account) replaces the
  framework limiter so enforcing and showing share one count; same 20/10 min, same 429, `Retry-After` now exact.
  `GET /api/profile/assistant-usage` (session only). Counted by `UseAssistantAllowance` (metadata-scoped middleware after
  authorization, before binding), so a malformed body counts. Tests: API 1566 passed (`AssistantUsageTests` 7). Playwright
  `account-usage.spec.ts` 4; focused + 5 neighbouring specs on a fresh DB green. Full suite delegated to GitHub Actions.
  Follow-up done: **unified Usage section** (`feat/unified-usage-section` off `dev` at `a00c750`; committed, not merged,
  not pushed). Profile's Storage section folded into Usage: Storage, then AI Assistant, one heading, shared
  `UsageItem`/`UsageMeter`/`useUsageLoad`. Frontend only, no API change. Storage now shows its percentage and, if its
  read fails, an error with Try again instead of vanishing. Playwright usage + storage + neighbours 34/34.
- **Groq assistant provider** (`feat/groq-assistant-provider` off `dev` at `76c2abe`; committed, not merged, not pushed).
  DEV's OpenAI account has no credit, so `Assistant:Provider` `Groq` (`Assistant:Groq:ApiKey`, `Assistant:Groq:Model`,
  DEV `openai/gpt-oss-120b`) runs the same exchange on Groq's OpenAI-compatible Responses API. Shared
  `ResponsesConversation`; OpenAI keeps `store: false` + encrypted reasoning, Groq omits `store` and `include`. No
  behaviour, copy or limit change. ADR 0045 amendment. Tests: `GroqAssistantProviderTests` 16. Not yet run live on Groq.
- **CI format fix + E2E sharding** (`fix/ci-format-and-pipeline-performance` off `dev` at `b6f0850`; committed, not
  merged, not pushed). Run 39239505293 failed only on Prettier for `lore-context.spec.ts` (formatted without the web
  `.prettierrc.json`); reformatted, no behaviour change. `ci.yml` E2E is now a 2-shard matrix (`--shard=N/2`, 2 workers,
  own runner, API, Vite and `lorex-e2e-shard-N.db`), `fail-fast: false`, reports `playwright-report-shard-N-of-2`. Job
  timeouts added. No cache or build-reuse change (seconds at most). Partition checked locally: 246 + 245 = 491, no
  overlap. actionlint 1.7.7 clean. Not yet measured on GitHub; estimate merge-to-DEV ~27 min -> ~15 min.
- **Issue #36 - semantic groups for Lore types** (P0; `feat/lore-semantic-groups` off `dev` at `70cfc90`; merged into `dev`
  at `74773fe`). One migration (`AddEntityTypeGroups`), backup format 23. ADR 0007 and 0014 amendments.
  - Universe-scoped `EntityTypeGroups` + `EntityTypeGroupMembers` (stable ids, explicit membership, a type in 0..n groups);
    same-universe triggers. Membership saved with the type (`EntityTypeRequest.Groups`, new groups by name, created only
    if the save commits). Routes: `GET`/`PUT` rename/`DELETE` `/entity-type-groups`; Read to list, EditContent to change.
  - Link fields: any type, one exact type, or one group (`TargetGroupId`), enforced on entry save, Lore field filters,
    field retarget (409 `entity_field_target_conflict`) and restore. Leaving a group links rely on: 409
    `entity_type_group_in_use`; deleting a targeted group: 409 `entity_type_group_targeted`. Nothing cleared or widened.
  - Lore: `entityTypeGroupId` filter; a "Groups" nav row on desktop, folded into the Category menu on a phone. Type editor:
    a small Groups control (select, Add another group, new group by name, rename/delete folded away). No badges.
  - Starter template gets Characters, Places, Factions, Objects; existing universes and restores are never classified.
    Family Tree untouched: per-type `FamilyTreeEligible` only; group-based eligibility is Issue #37.
  - Review fix: retyping an entry is refused (409 `entity_type_change_linked`) while limited fields (exact type or group,
    Trash included) link to it; field add and type delete now each run in one IMMEDIATE transaction.
  - Tests: API 1679 passed, 6 skipped (new: `EntityTypeGroupTests` 21, file-backed races 4 + migration walk 1). Playwright
    `semantic-groups.spec.ts` 4; with neighbouring specs green on a fresh DB. Full Playwright delegated to CI.
- **Issue #37 - Family Tree redesign** (P1; `feat/family-tree-redesign` off `dev` at `74773fe`; merged into `dev` at
  `2df01fc`). One migration (`AddEntityTypeGroupFamilyTree`), backup format 24. ADR 0040 and 0014
  amendments.
  - Members are circular portraits (about 7.5rem desktop, 4.5rem phone) with the name beneath and an eye that opens
    `FamilyMemberDetails`: the shared modal `<dialog>` as a popover by the node, a bottom sheet at 640px and below. Type,
    Canon status, derived positions, drawn parent links, that member's authored family, Open entry, Show this family.
  - Authored non-structural links are now read for every drawn member (`FamilyTreeConnection.EntityId`), at most six
    queries; still never walked, no lines, no peripheral nodes. "Other family connections" section removed; "Other
    relationships" (focal entry's no-meaning links) added below the tree.
  - Group eligibility: `EntityTypeGroups.FamilyTreeEnabled`, off by default; effective = own switch OR enabled group
    (`FamilyTreeEligibility.TypeIds`, used by picker, families, nodes, `EntityTypeResponse.familyTreeOffered`).
    `PUT /entity-type-groups/{id}/family-tree` (EditContent); deleting an enabled group 409
    `entity_type_group_family_tree`. UI: "Types in Family Tree" at the foot of the Family Tree page.
  - Tests: API 1689 passed, 6 skipped (new: `FamilyTreeRedesignTests` 10; query bound now 6; matrix +1 route). Playwright
    `family-tree-redesign.spec.ts` 8; with the updated family specs and 10 neighbouring specs green on a fresh DB. Full
    Playwright delegated to CI.
- **Issue #39 - edit, archive and restore Lore type fields** (P1; `feat/lore-field-lifecycle` off `dev` at `2df01fc`, #36
  and #37 merged there; committed, not merged, not pushed). One migration (`AddEntityFieldArchive`), backup format 25. ADR
  0007, 0014 and 0043 amendments.
  - Types -> Fields lists the active fields (kind, Required/Optional, link target, Canon meaning) with Edit and a menu of
    Archive and Delete; Add field opens the drawer on request. The drawer edits name, kind (locked while values exist),
    options, link target (Any, one type, one group; a new link field picks one), meaning, default text, Required.
  - Archive keeps the row, id and every value (Trash too); `EntityTypeResponse.Fields` is active only, `ArchivedFields`
    apart. Entry saves, restored versions and accepted suggestions replace only active values; archive/restore bump the
    holders' entry versions so a stale form or suggestion is refused instead of dropping restored values.
  - Restore rechecks links and Required; a required field missing on live entries comes back only via explicit
    "Restore as optional". Optional to Required is refused while live entries lack a value. Delete only with no values.
  - Archived links still block type/group delete, group leave and retype; an entry with archived values cannot retype.
    Canon lifespan, CANON-FIELD-001, timeline years, unplaced-years count and Lore filters read active fields only.
  - Fix found on the way: adding an option while editing a field threw a concurrency error (EF updated a new row).
  - Review fixes: field edits versioned (`expectedVersion`, 409 `entity_field_changed`, archive/restore bump; the drawer keeps
    the draft and offers the saved settings or Keep my changes); a field or choice an older version records cannot be
    deleted (409 `entity_field_in_history` / `entity_field_option_in_history`). Migration `AddEntityFieldVersion`. ADR
    0013 and 0043 amendments.
  - History consistency: kind change refused while older versions hold values (409 `entity_field_kind_locked`); a revision
    restore refused while its archived-field values differ from the entry's (409 `entity_revision_archived_field`).
- **Issue 38 - compact MCP consent card** (`improve/mcp-oauth-consent` off `dev` at `80db857`; committed, not merged,
  not pushed). Frontend only: `/connect/authorize` drops the sign-in plate for a centred card (max 32rem); Approve/Deny
  stick to the screen's foot when the viewport is at least 34rem tall. Consent copy, form fields, antiforgery and OAuth
  untouched; Login/Register/Invitation keep `AuthLayout`. Playwright `mcp-connect` +2 (10); with 3 neighbours 49/49.
- **Roadmap task 049 - MCP V1** (GitHub issue 7; `feat/lorex-mcp-v1` off `dev` at `ac39b23`; committed, not merged, not
  pushed). One migration (`AddMcpConnections`: OpenIddict's four tables + `McpConnections`), backup unchanged (account-level
  state, never in a universe backup). ADR 0046 (new); 0005 amendment.
  - An outside AI app (Claude, ChatGPT, any Streamable HTTP + OAuth 2.1 MCP client) reads **one universe**, as one member,
    read-only, at `{origin}/mcp/universes/{id}` - also its RFC 8707 resource. Origin `Mcp:Origin`, else
    `PublicSite:Origin`; unset = off. **DEV is off until the owner sets `Mcp__Origin`** (runbook).
  - OpenIddict 7.7.2 is the authorization server and validator (code + PKCE S256, refresh rotation with replay revocation,
    reference tokens hashed with Data Protection payloads, RFC 9207 `iss`); the MCP C# SDK 2.2.0 serves stateless
    Streamable HTTP. Clients by CIMD (SSRF-held fetch) or DCR (rate-limited); HTTPS or loopback redirects only.
  - Consent at `/connect/authorize` behind the existing sign-in; approve/deny posted back same-site; unverified and
    device-only warnings. Every request and refresh re-checks the connection and `Read` access, so revoke, removal and
    deletion stop at once. Ten read-only tools over `UniverseReader`; prose only on request, in exact bounded chunks.
  - UI: Connect to AI on the universe's Overview (the top bar stays the search's); Profile, Connected apps with
    Disconnect. Pinned `System.Security.Cryptography.Pkcs` and `.Xml` to 10.0.13 (OpenIddict's Data Protection reference
    brought 10.0.11, CVE-2026-84008).
  - Review fixes (2026-10-19): without an origin no OAuth/MCP endpoint is mapped (registration included); consent posts
    need an antiforgery token from `/api/oauth/consent-token`; CIMD caching honours no-store, no-cache and max-age=0.
  - Tests: API 1653/1653; 6 skipped (opt-in OpenAI smoke; untracked local Groq diagnostics). 87 new MCP tests in 8 files,
    incl. the official MCP SDK client doing its own OAuth discovery, DCR and CIMD; 15 earlier migration walks taught the
    new indexes in `LaterSchema`; matrix +1 route.
    Playwright `mcp-connect.spec.ts` 8; with 7 neighbouring specs 64/64 after the review fixes. Before them: with 14 neighbouring specs on a fresh DB 113/114, the one `global-navigation`
    focus test lost under load, green 42/42 alone x3. Full Playwright not run locally; delegated to GitHub Actions.
  - Not yet tried against a live Claude or ChatGPT: needs a public HTTPS origin (DEV with `Mcp__Origin`).
- **Roadmap task 048 - Interactive Writing Workspace V1** (GitHub issue 6; `feat/interactive-writing-workspace-v1`
  off `dev` at `b14fbf0`; merged into `dev` at `b6f0850`). Frontend only: no API, schema or backup change. ADR 0024
  amendment.
  - Manuscript tool row gains **Lore** (icon only on a phone), opening `LoreContext`: the shared `.drawer` modal, a side
    sheet over the writing on a desktop and the full width on a phone. Lists the scene's linked lore, searches the
    universe's lore (the scene picker's `entities?search=`), previews an entry in place (summary, aliases, non-empty
    fields, up to 8 relationships, Open entry). Owner/Editor link and unlink; others read only.
  - Link/unlink = the scene's own `PUT` with the stored scene and only `entityIds` changed, naming the page's version.
    409 `scene_changed`: nothing written, the story is read again, author retries. Nothing shown linked until the API
    answers. The prose, its recovery copy, Ctrl+S and the leave guard are untouched.
  - `renderFact` moved from `EntityPage` to `lore/facts.ts` for the preview.
  - Tests: Playwright `lore-context.spec.ts` 6; with 11 neighbouring specs 70/70 (against the running dev servers).
    No backend change, so API tests not run. Full suite delegated to GitHub Actions.
  - Out of scope, tracked apart: `@` mentions / inline references (issue 31), lore variants (issue 30).
- **Roadmap task 047 - universe AI assistant V1** (GitHub issue 5; `feat/universe-ai-assistant-v1` off `dev` at `3510ccd`;
  committed, not merged, not pushed). No migration, backup unchanged. ADR 0045 (new); 0031 amendment. Task 046 (Global
  Quick Find) skipped: the existing search bar already covers it.
  - Strictly read-only, `Read` access (owner, Editor, Reviewer, Viewer); outsiders 404 before any read or model call; no
    public route. `GET/POST /api/universes/{id}/assistant` (status, one question). Nothing stored; the browser keeps the
    conversation while the universe is open and sends its last 6 messages.
  - Shared read layer `Features/Reading/UniverseReader` over the screens' own queries: the bar's search, extracted beneath
    its route as `UniverseSearchEndpoints.RunAsync` (bar unchanged; the reader searches no ideas, drops world rules), the
    timeline feed as `TimelineFeed.ReadAsync`, and the entry, story, scene, moment and relationship loaders. Never ideas,
    comments, suggestions, history, Trash, accounts or images.
  - Eight read-only tools; ids parsed and read through the request's universe; invented tools `unknown_tool`. Answer =
    JSON segments recorded/inference/suggestion/note citing ids; a source counts only if read this question, titled by
    LoreX; recorded with no source shown as inference; anything else 502.
  - Limits: 6 tool steps, 10 tools, 10k chars a result, 40k in all, question 1,000, history 6 x 1,500, 3,000 output
    tokens a step, 90 s, 20 questions per account per 10 minutes (429 `assistant_rate_limited`). Closing cancels.
  - Provider boundary `IAssistantProvider`: `Assistant:Provider` = `OpenAI` (Responses API, OpenAI 2.14.0, `store: false`;
    `Assistant:OpenAI:ApiKey` + `:Model` required, no defaults, secret outside the repo), `Fake` (Development, Playwright),
    unset = 503 `assistant_unavailable`, nothing else affected. Relevant universe content goes to the configured provider.
  - UI: an Assistant button beside the search (icon on a phone), drawer with static starting points, labelled parts,
    source links, retry and not-set-up states. Non-streaming.
  - Follow-up (same branch): stateless reasoning - every request asks `include: reasoning.encrypted_content` and every
    returned item goes back unchanged; `insufficient_quota` 429 is `assistant_failed`, not busy. Long prose: `get_lore` /
    `get_scene` take `find`, the search index's own 64-token `snippet` of that row (no new index). Provider tests over a
    stub transport; opt-in live smoke `AssistantOpenAISmokeTests` (skipped unless `LOREX_ASSISTANT_SMOKE_MODEL` +
    `OPENAI_API_KEY`). **Blocker:** the live smoke reached OpenAI (key valid; the request accepted by
    `responses/input_tokens` for `gpt-5.4-mini` and `gpt-4.1-mini`) but every Responses call answered 429
    `insufficient_quota`. No deployment model chosen yet.
  - Tests: API 1485 -> 1509 (`AssistantTests` 23, `AssistantUnconfiguredTests` 1, matrix +2 routes). Playwright
    `universe-assistant.spec.ts` 5; focused + 26 neighbouring specs on a fresh DB: 182/183, the one a `Lorex could not be
    reached` on universe creation in `manuscript.spec.ts` under four workers, green 3/3 alone. Full suite not run locally;
    delegated to GitHub Actions.
- **Roadmap task 045 - suggested changes** (`feat/suggested-changes` off `dev` at `d312bf3`; merged into `dev` at
  `3510ccd`). One migration (`AddSuggestedChanges`), backup stays **22**. ADR 0044 (new); 0041 amendment.
  - Capabilities `SuggestChanges` (owner, Editor, Reviewer) and `ResolveSuggestedChanges` (owner, Editor); reading is `Read`.
  - `SuggestedChanges`: one of entry/story/scene (cascading keys, check constraint), `BaseVersion`, `Before`/`Proposed` as
    JSON of the feature's own snapshot records (`EntrySuggestion`... with `SuggestedFieldValue`, `SuggestedLore`,
    `SuggestedDate` - never API response types), status, raw proposer/resolver ids. Lists: `state=open|decided`, 20 a
    page newest first, `before` cursor (time, id); the drawer reads one page of each and offers Show more.
  - Propose = the target's own `PUT` body to `.../suggestions`: only the save's own checks and normalisation (extracted:
    entry `CheckEntryAsync`/`NormalizedAliases`/`NormalizedTags`/`PrepareFieldValuesAsync`, scene `CheckAsync`, the three
    `Changed` 409s), never the save path: same 409 (`entity_changed`...), validation and 404; empty = 400
    `suggestion_unchanged`; the suggestion row is the only write (a test fails any other write command).
  - Accept = `Proposed` replayed through the same path (entry under the Canon gate) as the resolver over `BaseVersion`, one
    transaction: history author = resolver, version +1 once. Target saved since = 409 `suggestion_target_changed` (no
    merge, no force; `targetChanged` derived). Decided = 409 `suggestion_resolved`. Reject touches nothing else.
  - Trash hides (404), restore returns, permanent delete cascades; no backup. Entry/story/scene forms only: article and
    manuscript prose deferred.
  - UI: the review button is now **Review** (Comments | Suggestions tabs; suggestions read only when their tab opens). Each
    suggestion: author, time, a caution once the content changed, fields "Before"/"Suggested" (`ChangeList`), Accept/Reject.
    Reviewer: "Suggest changes" where Edit stands (entry, icon alone below 640px) and in the story/scene menus; everyone who
    can suggest: Review > Suggestions > Suggest changes. The same forms in suggest mode ("Send suggestion"); a refused send
    keeps the work through `EditConflict`. Owner/Editor menus unchanged.
  - Tests: API 1462 -> 1485 (`SuggestionTests` 21, `SuggestionMigrationTests` 2 incl. a real-file accept race; matrix +8
    routes). Playwright `suggested-changes.spec.ts` 4 (review-comments and collaboration moved to "Review" and the new
    Reviewer line); focused + 13 neighbouring specs on a fresh DB, two workers: 66/66. Full suite not run locally;
    delegated to GitHub Actions.
- **Fix: entry tools on a phone** (`fix/entry-tools-phone-wrap` off `dev` at `a832393`). CI red since 043:
  `review-comments.spec.ts` "the entry menu wrapped under Edit" at 390px on Linux font metrics (Private, Edit, Family tree,
  ⋯ overflowed). Family tree is now its icon alone below 640px, still named, like Comments. Reproduced locally with a
  forced wide font (wrapped before, one line after at 390 and 360px).
  Also the CI flake in `ideas-workspace.spec.ts` (flaky in 043.5 and 044): it pressed Back once the API had the body but
  before the page knew its save landed, so the leave guard kept the editor. It now waits for the page's `Saved`; 50/50.
- **Roadmap task 044 - concurrent edit protection** (`feat/concurrent-edit-protection` off `dev` at `5cfb34f`; committed, not
  merged, not pushed). One migration (`AddContentEditVersions`), backup stays **22**. ADR 0043 (new); 0027, 0028 amendments.
  - Server-owned integer `Version` on `Entities`, `EntityArticles`, `Stories`, `Scenes`, `SceneManuscripts` (existing rows 1;
    no article/manuscript row = 0). Reads carry `version`; entry/story/scene `PUT`, article/manuscript `PUT` and entry,
    article, manuscript history restores send `expectedVersion` (replaces `expectedUpdatedAt`). Wrong or missing = 409
    `entity_changed` / `entity_article_changed` / `story_changed` / `scene_changed` / `scene_manuscript_changed` +
    `currentVersion`, nothing written, only after the access gate and the live lookup.
  - Advanced once per write that changes what the form edits; unchanged saves keep it. Scene: also a move to another chapter,
    a chapter sent to the Trash, a Trash restore without its chapter. Entry: not picture, article, relationships, Trash.
  - UI: `EditConflict` keeps unsaved work, reviews the latest on request (fields "Saved now"/"Yours", or whole text), then
    Keep my changes (save again yourself) or Use the latest version (asked). "Save mine over it" is gone. One-click status
    and entry history restore read again and say so.
  - Not covered (ADR 0043): world rules, ideas, calendar keep their `updatedAt` checks; moments, relationships, chapters,
    plot, types have none.
  - Tests: API 1449 -> 1462 (`ConcurrentEditTests` 12, `ContentEditVersionMigrationTests` 1; ~70 call sites now name a
    version via `VersionTestClient`). Playwright `concurrent-editing.spec.ts` 2; focused + neighbours on a fresh DB, two
    workers: 126/126. Full suite not run locally; delegated to GitHub Actions.
- **043.5 - PWA branding and launch** (interstitial, not a roadmap number; `feat/pwa-branded-launch` off `dev` at
  `0959b0b`; committed, not merged, not pushed). No backend, schema or backup change. ADR 0017 amendment.
  - New owner mark is `assets/brand/lorex-icon.png`; every icon, favicon and the in-app `brand-mark.png` re-rendered.
    Maskable and Apple grounds now black; maskable padding 22% (safe zone measured in `pwa.spec.ts`).
  - Manifest `background_color` `#000000` (`theme_color` unchanged). Worker keeps `.webp` root files per build.
  - Launch layer in `index.html` (installed window, once per window): black, `launch-logo.webp` resolves in, lifts
    down and fades (~1.1 s; fade only under reduced motion); `src/lib/launch.ts` waits for no `.session-pending`; CSS
    failsafe at 10 s. Browser tabs unchanged.
  - Tests: `launch.spec.ts` 4, `pwa.spec.ts` +1 and black grounds; focused + neighbours 87/87. Full suite not run
    locally; delegated to GitHub Actions.
- **Roadmap task 043 - review comments** (`feat/comments-review-layer` off `dev` at `89d1abd`; merged into `dev` at
  `0959b0b`). One migration (`AddCommentThreads`), backup stays **22**. ADR 0041 amendment.
  - Capabilities `Comment` (owner, Editor, Reviewer) and `ResolveComments` (owner, Editor); reading is `Read` (Viewer too).
  - `CommentThreads` (exactly one of entry/story/scene, cascading keys, check constraint; resolved at/by) and `Comments`
    (raw author id, plain trimmed body <= 4,000, time). Whole-subject only; no edit/delete, mentions, anchors or realtime.
  - 9 routes under the universe; threads reached only through a live subject of that universe; Trash hides them (404)
    and a restore brings them back; permanent delete and universe delete cascade. Resolved threads refuse replies (409).
  - API names people by username only (null = unknown account). Backup carries no comments.
  - UI: `ReviewComments` - a "Comments" button after the entry's views, in the story's facts line (not on the Manuscript
    view) and in each scene's tool row; icon alone below 640px on the entry and scene rows. No count: nothing is read
    until the drawer opens (one GET), so a page of many scenes asks for none. The moment drawer (full width on phones):
    new comment, Open and folded Resolved threads, Reply, Resolve/Reopen by capability. Phone manuscript head: tools
    beside the location line, title full width. Reviewer role hint: "Can read and comment. Cannot edit content."
  - Deferred: open counts (would need a batch read), notifications, mentions, edit/delete, anchors, activity feed,
    comments in backups.
  - Tests: API 1437 -> 1449 (`CommentTests` 11, `CommentMigrationTests` 1, matrix +9 routes). Playwright
    `review-comments.spec.ts` 2 (no comments read before the drawer opens; phone rows); focused + neighbours on a fresh DB,
    two workers: 82/82; after the lazy-load follow-up 65/68 - the review spec's own two read counts (fixed, then 2/2)
    and one known Vite lazy-module blank in `collaboration.spec.ts`, green 3/3 alone. Full suite not run locally;
    delegated to GitHub Actions.
- **Roadmap task 042 - attribution in history** (`feat/attribution-activity-history` off `dev` at `af44810`; merged into
  `dev` at `89d1abd`). One migration (`AddRevisionActors`), backup stays **22**. ADR 0041 amendment.
  - Entry, article and manuscript versions record `ActorUserId` (raw id, no FK, nullable, nothing backfilled) on every
    write that makes one: create, mass create, edit, picture, version restore. Kind/number/time stay the action.
  - History lists (owner + Editor, unchanged) carry `actorName` = username, read live in the same query; no id or email.
    Null = not recorded (legacy, backup restore, vanished account); rows read "by name" or "author not recorded".
  - Backup carries no author (ADR 0041); restored versions name no one.
  - Deferred: Trash/restore-from-Trash attribution (they write no version), universe activity feed, notifications.
  - Tests: API 1437/1437 (`RevisionAttributionTests` 8, `RevisionActorMigrationTests` 1). Playwright: collaboration +1,
    history asserts its author. Focused 12/12, neighbours 55/55, fresh DB, two workers. Full suite
    not run locally; delegated to GitHub Actions.
- **Product refinement 040 - account storage quotas** (`claude/dreamy-dirac-u8i6eh` off `dev` at `9c42bbe`; committed and
  pushed, not merged). One migration (`AddAccountStorageQuota`), backup stays **22**. ADR 0042 (new); 0019, 0032, 0041 amendments.
  - `LorexUser.StorageQuotaBytes`, 1 GiB for every account (column default for existing, initializer for new); never
    unlimited, no route changes it. Usage = `SUM(EntityImages.ByteSize)` over universes the account owns, Trash included;
    thumbnails, artwork, profile photos and orphaned objects never count. Editor uploads count against the owner.
  - Upload judged by growth (new original - old). Growth <= 0 always allowed, even over the allowance; growth > 0 needs
    stored + held + growth <= allowance, else 409 `storage_quota_exceeded` (owner and collaborator wording, no numbers).
  - `StorageReservations` holds growth in one short IMMEDIATE transaction before the bucket; consumed in the commit;
    released on every failure; lapses after 15 min and a lapsed hold is re-checked at the commit. Restore holds its
    entry pictures the same way. Upload commit now refuses (409 `image_changed`) if the picture changed meanwhile.
  - Review correction: permanent universe delete reads its pictures' and artwork's stored keys in the delete transaction
    and sweeps them after the commit (it never swept before: a quota bypass). Sweep failure = logged litter, usage stays
    freed. An upload whose entry or universe went meanwhile answers 404 and sweeps its own objects.
  - `GET /api/profile/storage` (one query at any size); Profile > Storage: "X used of Y", meter, full state in words.
  - Deferred: billing, plans, admin allowance route, per-universe quotas, other media, thumbnail charging, bucket
    reconciliation of orphaned objects.
- **Product refinement 039 - custom calendars** (`feat/custom-chronology-calendar` off `dev` at `ce4c416`; committed, not
  merged, not pushed). One migration (`AddChronologyCalendars`), backup **22**. ADR 0022 (main), 0009, 0014, 0024 amendments.
  - Simple dates stay the default (month 1-12, day 1-31, every existing universe untouched). Custom calendar = a
    `ChronologyCalendars` row (one per universe in V1) with ordered months (name, short name, 1-1000 days, 1-100 months).
    Eras and calendar are orthogonal. Dates name a month by id (`StartMonthId`/`EndMonthId`, `Scenes.MonthId`); rename and
    reorder rewrite nothing. Order: `ChronologyPoint` month rank = position + 1, same rank in listing and feed SQL.
  - `PUT`/`DELETE .../chronology/calendar`, beside the eras' save. On: simple month N -> Nth month, atomic, refused if any
    date does not fit. Edit: whole list; removing a used month, shrinking below a used day, or a reorder that reverses a
    range is refused. Off: back to position numbers, refused past 12 months / 31 days.
  - UI: Chronology > Calendar (Simple dates / Custom calendar, month rows with Earlier/Later/Remove); month select and
    month-bounded day in the moment and scene forms; dates read `17 Emberrise · TA 401`.
  - Migration adds the scene/moment month columns natively (no `Scenes` rebuild, so its search triggers stay); rollback
    rebuilds `Scenes` by hand and puts the triggers back.
  - Deferred: several calendars, conversion, leap/intercalary days, weekdays, seasons, a chronology-aware Lore date field
    (the Gregorian `Date` field is untouched), month-precision birth/death.
- **Product refinement 038 - unified Timeline** (`feat/unified-timeline` off `dev` at `8916b36`, merged into `dev` at
  `ce4c416`). One migration (`AddTimelineEntryStories`), backup **21**. ADR 0009, 0014, 0022, 0024 amendments.
  - Timeline = one read view: moments (stored), live dated scenes and live entries' birth/death years (read live, never
    copied). One world order (era, signed year, month, day), never narrative order. `GET .../timeline/items`: UNION ALL,
    filtered and paged in SQL, 5-7 commands at any size, no manuscript read.
  - Story timeline = `/timeline?story=`: its dated scenes + moments linked via `TimelineEntryStories`. Births/deaths are
    universe-only. "View on timeline" on the story's facts line and ⋯ menu. Moment editor gains Stories.
  - Not projected: Age, Gregorian Date fields (wait for a calendar model), plot arcs/beats, manuscripts.
- **Product refinement 037 - Ideas workspace** (`feat/ideas-workspace-expansion` off `dev` at `c60d534`, merged into
  `dev` at `8916b36`). No schema, migration or backup change (backup **20**). ADR 0030 amendment.
  - One account-owned idea, three views: All, a universe's, and a story's (`/stories/:storyId/ideas`, a fourth story
    view, owner only via `keepIdeas`). Story scope = explicit reference to the story or its scene, arc or beat; one row
    per idea; filtered in SQL before count and page (`GET /api/ideas?universeId=&storyId=`, 404 for any story not live in
    an owned universe). All 2, universe 2, story 3 commands at 1/12/50 ideas.
  - Quick capture on every live list: one line -> title, empty body, through the ordinary create; story capture adds one
    direct story reference. `IdeasBrowser` takes an `IdeasScope`; rows open in the universe's editor, Back returns.
  - Deferred: conversions (Idea -> Lore/Story/Scene), rich text, checklists, images, diagrams, tags, collaboration.
- **Product correction 036 - entity-reference target types** (`fix/entity-reference-target-type` off `dev` at
  `2c7c8f1`, merged into `dev` at `c60d534`). One migration (`AddEntityReferenceTargetType`), backup **20**. ADR 0007 and 0014
  amendments.
  - A link field may be limited to one type: `EntityFieldDefinitions.TargetEntityTypeId` (nullable, keyed to the type,
    exact type only; null = "Any Lore type", an explicit choice). Existing link fields migrate open; nothing is inferred
    from names.
  - Held by the API: entry saves (one batched read of linked entries and their types), Lore filters (400 for another type),
    narrowing a field that holds other types' links (409), deleting a targeted type (409), backup validation and restore
    (target remapped to the restored type; v19 restores open).
  - Types: "Allowed type" on add and on each link field. The entry form's link control is now the shared `EntityPicker`
    (searches, restricted by `entityTypeId`), as is the 034 filter editor's.
  - Testing policy from here: local focused + neighbouring E2E only; CI on `dev` runs the full Playwright suite.
- **Product refinement 035 - Family Tree discovery** (`feat/family-tree-discovery`, merged into `dev` at `2c7c8f1`).
  No schema, migration, table or backup change (backup **19**). ADR 0035 amendment.
  - The bare Family Tree opens on the families already recorded: connected groups of live entries joined by any
    family-meaning link (undirected), offered when a member's type is enabled, counted whole, opened at the enabled member
    with the most family neighbours. A projection only: no Family table, id or name.
  - `GET .../family-tree/families?q=&page=&pageSize=` (Read, 12 a page, at most 40): three queries at any size, grouping
    and search in memory over every family link. `/family-tree?q=&page=`; "Browse families" on a tree; "Find a character"
    keeps the eligible-only picker as the second way in. The two-generation tree is unchanged.
  - Family Tree E2E specs moved to `makeTestPassword()`.
  - Deferred: Quick Create of a missing relative, unlimited genealogy, family names, public family trees; a stored family
    index if a universe's family links ever make the in-memory grouping slow.
- **Performance correction - universe artwork loading** (`fix/universe-artwork-loading`, merged into `dev` at
  `817d9a4`). No schema, migration, index or backup change (backup **19**). ADR 0036 amendment.
  - Measured cause: cards and the workspace asked `GET .../artwork` after rendering, so the fallback showed for a round
    trip even with the image cached, and the list cost one request and two queries per owned card.
  - `UniverseSummary`/`UniverseDetail` now carry `artwork` (`{ assetId, cardId }`, owner only, null = none), joined into
    the existing queries: list still 2 commands at any size, detail still 2. Browsing never calls `GET .../artwork`;
    `useUniverseArtwork` is gone and the shell holds the ids, which Publish replaces directly.
  - Universes page: only typing in the search waits (150 ms); first load, paging, archive filter, retry and Back ask at once.
  - Deferred: the list's owner-or-member filter scans `Universes` (query shape, not an index); the private card read's
    role query and row check could be one query; R2 latency and HTTP/2 on DEV unmeasured.
- **Product refinement 034 - Lore custom-field filters** (`feat/lore-custom-field-filters`, merged into `dev` at
  `01b2634`). No schema, migration or backup change (backup **19**).
  - A type's entries narrowed by its own fields: text, number, yes or no, choose one, choose several, linked entry. ANDed,
    at most 10, in the address (`field=<id>:<op>:<value>`), filtered in the database before count and paging; a missing
    value never matches. Date deferred. ADR 0007 amendment.
- **Product refinement 033 - app version, build-derived cache, public footer** (`feat/app-version-cache-footer` off `dev`
  at `e167a92`; committed, not merged, not pushed). No schema, migration, backend or backup change (backup **19**).
  - One version: `src/Lorex.Web/package.json`, now `0.1.0`; Vite writes it and a build id into the bundle, read only via
    `src/lib/buildInfo.ts`. Shown as "LoreX v0.1.0" in the home footer and at the foot of the account menu.
  - `CACHE_VERSION` is gone: the worker is registered as `/sw.js?build=<id>` and names its cache after the build, so
    every deployment drops the last cache. Nothing to bump by hand. ADR 0017 amendment.
  - Home footer: brand, Product links (Explore; Create account and Log in, or My workspace), year and version. No
    Community or Legal group until Lorex has a real destination for one.
- **Product refinement 032 - product copy humanization** (`feat/product-copy-humanization` off `dev` at `afe7b7f`;
  committed, not merged, not pushed). No schema, migration or backup change (backup **19**).
  - **Copy rule, standing:** any change to user-facing text goes through the `humanizer` skill. No spaced em dash in
    visible copy; a bare `—` stays only as the empty-value glyph (custom field values, history, blank year inputs).
  - Compound tab titles join with `|`, most specific first: `Overview | Hollowmere | Lorex`, `Salt Warden | Glass Ebb |
    Lorex` (client `useDocumentTitle` and server `PageMetadata`, kept in step per ADR 0038). Home: `Lorex | Build
    connected fictional universes`. Chapter and arc labels: `Chapter 2: Ashes`, `Arc 1: Fall of the King`.
  - E2E: `makeTestPassword()` (`tests/Lorex.E2E/specs/support/account.ts`) generates throwaway passwords at run time;
    the landing spec uses it. The other specs still carry the old literal; move them over when touched. GitGuardian's
    historical alert is a test-credential false positive, handled outside the repository; history was not rewritten.
- **Product refinement 031 - public Lorex landing page** (`feat/public-landing-page` off `dev` at `a3f7922`; committed,
  not merged, not pushed). `/` is Lorex's home, no longer a redirect (client route and server `FrontendHosting`);
  `/explore` unchanged. No schema, migration or backup change (backup **19**). `PUBLIC_PORTAL.md` section 23; ADR 0038
  amendment (0036, visual contract: brand notes).
  - Brand -> `/` everywhere ("Lorex – Home": portal bar, rail L, My workspace bar, sign-in plate). Explore a named link
    on every width (phone: the bar's second row, beside the search). Unknown public address -> `/`; `/app/*` -> `/app`.
    The installed app still opens `/explore` (manifest untouched).
  - Home (`pages/LandingPage.tsx`): hero on the owner's citadel painting, veiled; Lorex in four live numbers
    (correction `fix: replace landing screenshot with live metrics`: the workspace screenshot, its four WebPs and its
    capture script removed); Build, Connect, Write; up to four real public worlds (`pageSize=4`, two on a phone, empty
    and failed states); trust; session-aware last call; home-only footer. No search on `/`. Home's Log in, Create account
    and Start building carry no return path, so they land in `/app`. No pricing, trial or AI copy; no invented number.
  - Server head for `/`: "Lorex — Build connected fictional universes", canonical `/`, indexable (a query ->
    `noindex,follow`); `/` first in the sitemap.
  - `GET /api/public/stats` (anonymous, `no-cache`): `{ creators, universes, publishedWorlds, privateWorlds }` - accounts,
    universe rows (archived included), `PublicationRules.Public`, the difference; three COUNTs, nothing else exposed.
  - CSS 178.1 -> 189.0 KB (gzip 31.9 -> 33.5); main JS +0.8 KB; landing chunk 11.0 KB; no new dependency.
  - Tests: API 1304/1304 (`SeoTests`: home head, sitemap; `PublicStatsTests` 4). Playwright 380 -> 401 (`landing.spec.ts`
    21); explore, global-navigation, mobile, public-reading and workspace-settings moved to brand -> `/`. After the
    correction: focused 21/21, neighbours 105/105, Linux/DejaVu 57/57; full run, fresh database, two workers, retries 0:
    **401/401**, 18.7 min. (First cut: 397/398, one known dev-server blank `/register`, green 3/3 alone.)
- **UI polish pass, pre-031 - image-reference visual system** (`feat/ui-polish-image-reference` off `dev` at `bf83e05`,
  merged into `dev` at `a3f7922`). Presentation only: no route, API, schema, migration or backup change (backup **19**).
  Contract section 22. Owner kept the current palette; references used for atmosphere, hierarchy and composition only.
  - Atmosphere layer behind the head of every universe screen and My workspace: the world's artwork card for its owner
    (artwork is a Publish read, ADR 0041 - collaborators never ask), else Lorex's own `assets/atmosphere-citadel.webp`;
    sign-in/invitation plate carries `assets/atmosphere-ridge.webp`. Owner's landing images as WebP q60 (163/196 KB).
  - Editorial type: page/document titles on `clamp()`, `.titlerule` under an entry's and Overview's title,
    `.sectionrule` group headings; article prose in the display face. Cards (world, entry, doorway) share one DNA; world
    cards show the owner's artwork or the world's colour; Overview doorways get medallions, Lore leads World at double
    width. Entry form parts, invite form, Types and collaborator lists on single quiet panels; type editor grouped
    Identity / Hierarchy / Behaviour; tabs and current links take the accent rule.
  - CSS 164.7 -> 177.4 KB minified (gzip 29.2 -> 31.7 KB); no new dependency; `src/universes/artwork.ts` new.
  - Tests: no new spec; Playwright stays 380, API untouched (no backend change, suite not rerun). Focused 190 + neighbours
    32 green (one real catch fixed: the current sidebar section kept its tinted ground). Linux/DejaVu batch 97/97. Full run,
    fresh database, two workers, retries 0: **378/380**, 18.2 min - `type-reorder.spec.ts` met a blank `/register` and
    `universe-search.spec.ts` "The search could not be reached" (the known dev-server signatures), each green 3/3 alone.
- **Product refinement 030 - invitations and collaborator management** (`feat/collaborator-invitations` off `dev` at
  `98e47f6`: `402bfa2`, then the review correction; merged into `dev` at `bf83e05`). ADR 0041 amended; 0014, 0030 notes.
  Migration `AddUniverseInvitations` (regenerated with `TargetUserId`, one migration); backup stays **19**.
  - Invitations target an email (Identity `NormalizedEmail`); same 201 and fields whether an account exists, no user
    search. Pending only (accept/decline/revoke delete), one per universe + address (409 `invitation_pending` names it),
    30-day `InvitationLimits.Lifetime`, lapsed ones ignored and replaced. No email is sent.
  - **Unverified email is never permission** (review correction). An account holding the address at invite time is bound
    privately (`TargetUserId`): only it lists it in My workspace and accepts by id. Anything else needs the link,
    `/invite/{token}` - a Data Protection claim token (`InvitationClaims`, purpose `Lorex.UniverseInvitation.Claim.v1`,
    invitation id + address) - plus a matching email. An account registered later with the address is offered nothing.
    Bad/forged token 404, other account 403, expired 410; revoke, expiry, accept, decline end every token.
  - Owner-only `ManageCollaborators`: `.../collaborators` (username, role, joined; no member email), role change, removal
    (content untouched, person becomes 404), pending role change, revoke.
  - **An Editor's restore never publishes** (review correction): entry, story, scene (outline and manuscript) and arc come
    back private when restored without `Publish`, enforced on the server; a private story hides all its parts. Owner
    restore unchanged. Editor Trash restores without the publication question and says so.
  - Frontend: Settings → Collaborators; My workspace Invitations (bound only); `/invite/:token` page (signed out says
    nothing private, register/sign in return to it); "Shared · Role" on cards, sidebar and Overview. Role-aware UI via
    `universes/access.ts` (presentation only): Viewer/Reviewer read-only everywhere (read-only chronology, rule and
    manuscript views); Editor without permanent delete, Publish, Settings; Trash/Publish/Settings/Ideas out of nav and
    "not available" by address. Idea universe picker owned-only.
  - Tests: API 1271 -> **1300/1300** (`CollaboratorInvitationTests` 18, `InvitationClaimTests` 5,
    `EditorRestorePublicationTests` 4, `UniverseInvitationMigrationTests` 2 incl. real-file races, matrix catalog +6
    routes). Playwright 370 -> 380 (`collaboration.spec.ts` 10; Settings tab pins to five). Final full run, fresh database,
    two workers, retries 0: **379/380**, 17.3 min - `workspace-settings.spec.ts` colour test met a blank page (the known
    dev-server signature), green 3/3 alone. Linux/DejaVu batch (collaboration, universes, workspace-settings) 26/26. Release
    build clean apart from the existing CA1859, no pending model changes.
- **Product refinement 029 - collaboration authorization foundation** (`feat/universe-collaboration-foundation` off `dev`
  at `c58e718`, merged into `dev` at `98e47f6`). Security/data foundation only: no invitations, collaborator UI,
  membership routes, comments, attribution or realtime. ADR 0041 (supersedes 0006's access rule); 0014, 0030, 0032 amended.
  - `UniverseMemberships` (`AddUniverseMemberships`): key `(UniverseId, UserId)`, `Role` 1-3 by check constraint (Owner is
    never stored - `Universe.OwnerId` stays the one owner), timestamps, both FKs cascade, `UserId` index. Additive; no row
    written or rewritten. Rows exist only through tests until invitations.
  - `Features/Universes/UniverseAccess.cs` replaces `LoreAccess`: role (owner > membership > none, one query), named
    capabilities (`Read`, `EditContent`, `ManageTrash`, `ManageHistory`, `PermanentlyDelete`, `ManageUniverse`,
    `Publish`, `Backup`), `DenyAsync` - 404 without access, 403 `universe_permission_denied` without the capability. All ~150
    routes under a universe gated; Ideas stay owner-only on purpose.
  - Editor: content, types, media, Canon evaluate/dismiss, Trash + restore, history. Owner only: erase from Trash, universe
    settings/archive/delete, every publication route, artwork, export. Reviewer = Viewer = read live content.
  - Universe list/detail: owned + member universes, `accessRole` (numeric enum, TS `UniverseRole`); nothing about others.
    Backup stays **19**, carries no membership; restore owned by the restorer, no membership.
  - Tests: API 1251 -> 1271 (`UniverseAccessMatrixTests` 4 - a hand catalog of every universe route x every role, failing
    on an uncatalogued route; `UniverseCollaborationTests` 15; `UniverseMembershipMigrationTests` 1). `LaterSchema` knows
    the new table. Playwright: no new spec (no collaboration UI); full run on a fresh database, two workers, retries 0:
    **370/370** first time, 16.9 min. Release build clean apart from the existing CA1859, no pending model changes.
- **Product refinement 028 - Lore categories** (`feat/lore-category-hierarchy` off `dev` at `19e4cff`, merged into `dev`
  at `c58e718`). Frontend only; the `ParentId` hierarchy (022) already held the taxonomy. No migration, backup **19**.
  ADR 0007 amended.
  - `TypeSwitcher`: top-level types only; a chosen type that holds others opens an inset row ("All Runes", then its
    subtypes); deeper levels add rows. Phone: Category menu + Filters, then one menu per level. Cards, filters, Select,
    pagination, `?type=<id>` addresses unchanged.
  - Bare Lore: "Choose a category to browse your lore." + New entry (still no entry read). Empty category: "No entries in
    this category yet." + its create. Search placeholder "Search <type>"; New label keeps the name as written.
  - Tests: Playwright 365 -> 370 (`lore-categories.spec.ts`, 5); nested-types, type-filter, types-and-trash,
    lore-type-browser, type-reorder and `support/lore.ts` moved to the category rows and menus.
- **Product refinement 027 - type drag reorder and stable Lore controls** (`feat/type-drag-reorder-lore-controls` off `dev`
  at `75517d7`, merged into `dev` at `19e4cff`). No migration, backup stays **19**. ADR 0007 amended.
  - Lore: Select (and Items per page) left the types' row for the list's controls (`lore__controls`: filters, then
    `lore__resultactions`), so the type links no longer re-wrap between a type with entries and one without. Phone: Filters
    folds search and status only; Select keeps its own row.
  - Types: `POST .../entity-types/{id}/reorder` `{index, parentId}` - absolute place among current siblings, one transaction,
    400 `index` out of range, 409 `entity_type_parent_changed` if the parent moved; shares `PlaceAmongSiblingsAsync` with
    `move`. From 641px a grip (`TypeReorderHandle`, `@dnd-kit/core` 6.3.1, mouse only) drags among siblings only, one
    request per drop, optimistic with rollback; keyboard lift/arrows/drop/Escape on the grip; Move up/down in the row menu.
    640 and under: no grip, Up/Down unchanged. `ActionMenu` hidden items were already skipped (025).
  - Tests: API 1247 -> 1251 (`NestedTypeTests.Reorder.cs`, 4). Playwright 349 -> 365 (`type-reorder.spec.ts` 10,
    `lore-controls.spec.ts` 6); nested-types' Up/Down test runs at 640px; type-filter's layout pins moved with Select.
- **Tooling refinement 026 - two Playwright workers in CI** (`chore/ci-playwright-parallelism` off `dev` at `7b9c219`,
  committed, not merged, not pushed). No product code. E2E was the CI critical path (~34 of ~36 minutes) at one worker.
  - `ci.yml` E2E step sets `LOREX_E2E_WORKERS=2` and `LOREX_E2E_DB=${{ runner.temp }}/lorex-e2e.db`; `playwright.config.ts`
    lets a valid `LOREX_E2E_WORKERS` win in CI too (unset: CI 1, local Playwright's default). Retries (2) and the whole suite
    unchanged; one job, one report.
  - Proof, fresh DB, 2 workers, retries 0, API logging every status: write-heavy 105/105, full 348/349 in 15m59s (one blank
    `/register` - dev-server flake - green 3/3 alone); 0 `database is locked`, 0 5xx. Shards considered and not taken
    (`tests/Lorex.E2E/README.md`). Remote speed-up unproven until the next GitHub run.
- **Product refinement 025 - Lore type browser restore and Add child** (`feat/lore-type-browser-child-ux` off `dev` at
  `ee10cb9`, committed, not merged, not pushed). Frontend only; no migration, backup stays **19**. ADR 0007 amended.
  - Lore: 022's chooser and inline tree (`TypeTree.tsx`, `useOpenBranches.ts`, `lore__choose`, `typetree`/`typechooser` CSS)
    deleted; pre-022 `TypeSwitcher` restored (wrapped row from 641px, menu on a phone), types in tree preorder, **no All**.
    Bare `/lore`: nothing current, menu "Choose type", no entry read, no cards/skeleton/filters/Select/panel. Branch
    browsing, path crumb (root crumb test id `lore-path-root`), unknown-id drop unchanged. No types at all: one notice line.
  - Types: every row has **Add child** (quiet text button beside Up/Down; in the row's More menu at 640px and under) opening
    `TypeDialog` with that parent preselected and editable; title "New child type", "Inside …"; notice "Created “X” inside
    “Y”."; focus back on the row's Add child. Family Tree still creation-only, nothing inherited.
  - `ActionMenu` skips items a layout hides (`display: none`) for first focus and arrow keys.
  - Tests: Playwright 341 -> 349 (`lore-type-browser.spec.ts`, 8); nested-types, type-filter, types-and-trash, lore,
    mass-create, text-direction and `support/lore.ts` back on the row/menu.
- **Product refinement 024 - global navigation and wayfinding** (`feat/global-navigation-wayfinding` off `dev` at
  `b6cc948`, committed, not merged, not pushed). Frontend only: no migration, backup stays **19**. Hierarchy and rules:
  `docs/public-portal/PUBLIC_PORTAL.md` 21.1; ADR 0036 amended.
  - `WorkspaceLayout`: one layout route and bar for `/app`, `/app/profile`, `/app/ideas...` (three copied headers gone):
    brand, "My workspace", Universes / Ideas `NavLink` tabs, Explore, account; two rows under 40rem, Explore then only in
    the account menu. Not over a universe.
  - Words: Explore (not "Explore worlds"/"Portal") for the public side, My workspace, Universes, All universes, Profile.
    No outward arrows on same-tab links. Brand everywhere -> `/explore`, named "Lorex – Explore"; rail `L` on a 40px target.
  - `AccountMenu` gains Go to (My workspace, Ideas, Explore) before Profile, Theme, Sign out; email breaks at @ and dots.
  - Universe sidebar is one `<nav aria-label="Universe">` holding All universes and the sections.
  - Titles: shells own them (`lib/useDocumentTitle`): "Universes | Lorex", "Lore — Hollowmere | Lorex". `RouteFocus` moves
    focus to the new `main` on a change of place only.
  - Tests: Playwright 327 -> 341 (`global-navigation.spec.ts`, 14); full run 341/341, fresh DB, 2 workers, 0 retries.
  - Not done: publishing copy still says "public portal" in prose (Publish, Settings, Profile notes, a section purpose).
- **Product refinement 023 - bulk permanent Trash deletion** (`feat/bulk-trash-permanent-delete` off `dev` at `bc0833e`,
  committed, not merged, not pushed). No migration; backup stays **19**. ADR 0015 amended (contract), 0029 and 0033 pointers.
  - `POST .../trash/bulk-delete` `{ items: [{ kind, id }] }`: owner 404 first; 1-100 items, known kind, non-empty id, no
    `(kind, id)` twice, else 400 keyed `items[i]...`; then every row resolved (exact kind, universe, marker) inside the
    transaction before any write - one stale row = 409 `trash_selection_changed`, nothing written. 200
    `{ deleted, erasedEntryIds, erasedSceneIds }`; `deleted` = selected rows, parent-cascaded ones included.
  - One plan for single routes and bulk (`TrashPermanentDelete.PlanAsync`): by set, parents first; overlap (story + own
    scene/chapter/arc/beat, arc + beat) valid; a chapter still takes no scene. Entries: references, emptied moment details,
    findings forgotten; one `RecordAsync` reconcile per batch (plain transaction when no entry). Images swept after commit.
    Single-route contracts unchanged.
  - Trash **Select** as Lore's: page-scoped, rows are checkbox labels, row actions hidden, Select page / Clear selection /
    Done, red **Delete permanently (N)** (only red control), one question in place of the bar (rows by kind + `<bdi>` name,
    one consequence line per selected kind, "This cannot be undone.", red final + Cancel, Esc). Success: "N items were
    permanently deleted.", selection off, focus to message, page clamped. 409: nothing deleted, selection dropped, list read
    again. Other failure: question and selection kept, plain error. Drafts dropped from response ids only, after success.
  - Tests: API 1232 -> 1247 (`TrashPermanentDeleteTests.Bulk.cs`, 15). Playwright 321 -> 327 (`trash-bulk-delete.spec.ts`, 6);
    shared fixtures moved to `specs/support/trash.ts`.
  - Not done (owner decisions): Empty Trash, bulk Restore, cross-page selection, retention.
- **Product refinement 022 - nested Lore types** (`feat/nested-lore-types` off `dev` at `b259ccd`, committed, not merged, not
  pushed). Migration `AddEntityTypeHierarchy`; backup format **19**. ADR 0007, 0014 and 0032 amended.
  - `EntityTypes.ParentId` (null = root), any depth, no privileged root; organisation only - nothing inherited (fields,
    required, icon, accent, Family Tree, Canon). Names stay unique per universe. Entries keep one exact type.
  - Same universe and not-itself enforced by triggers, plus a trigger refusing to delete a type with children (except inside
    its universe's own delete). **Not a foreign key, deliberately**: SQLite adds one by rebuilding `EntityTypes`, which moved
    it first in a universe delete's cascade order and the entries' RESTRICT key then refused every universe delete (seen in
    tests, raw SQL and endpoint alike). Additive migration instead; rollback drops triggers, index, column natively.
  - Cycles refused by API (409 `entity_type_parent_cycle`) and backup validation, by graph walk with visited sets
    (`EntityTypeHierarchy`, `lore/typeTree.ts`); no depth cap anywhere.
  - `DisplayOrder` = place among direct siblings. New type last among its siblings; reparent moves the subtree last among
    new siblings and closes the old gap; `POST .../entity-types/{id}/move` `{direction}` swaps one place and renumbers the group
    1..n, transactional (first-up/last-down = unchanged 200). Request `displayOrder` now ignored. List in preorder.
  - Request `parent` wrapper: absent keeps parent (old clients safe), `{id:null}` root. Response `parentId`. `entityCount` still
    the type's own. Delete blocked by entries and/or children, `childCount`, words.
  - Lore: **no All**. No type chosen = nothing read or listed, filters/Select hidden (the chooser and inline tree were
    replaced by the restored type row in 025); unknown type id dropped from the address. A type shows its branch (`includeDescendants=true`, resolved
    server-side; `entityTypeId` alone stays exact). One "Type" disclosure on every width with the nested lists; ancestors
    opened and named in the header path. Entry crumb "Lore" now goes to the entry's type. Mass create returns to no-type with
    its count. New entry / Mass create selects in tree order with path labels. Types screen: nested rows (1.25rem a level,
    capped at 6; 0.75rem capped at 4 on a phone), Up/Down per row, Parent type on New and Edit (self and descendants not
    offered); Family Tree still New-only, no Family Tree block on rows.
  - Backup 19: `parentId`, types in preorder; v1-18 restore flat; missing/self/looped parents refused before writing;
    restore writes types as roots then nests them in the same transaction (the insert trigger checks parents row by row).
  - Tests: API 1217 -> 1232 (`NestedTypeTests` 14, `NestedTypeMigrationTests` 1; the rich round-trip world now nests two
    levels). Playwright 316 -> 321 (`nested-types.spec.ts` 5); type-filter, types-and-trash and every spec that browsed
    "All" now choose a type (`specs/support/lore.ts`).
  - Not done: field inheritance (intentional), drag-and-drop ordering (intentional), bulk permanent Trash deletion (done in 023).
- **Product refinement 021 - permanent Trash deletion** (`feat/trash-permanent-delete` off `dev` at `7988e88`, merged into
  `dev`, then `fix/trash-mobile-action-overflow`; `dev` at `b259ccd`). No migration, no backup format change. ADR 0015, 0029 and 0033 amended. **Move to Trash is not
  Delete permanently**: every ordinary delete (and `bulk-trash`) still only marks; erasing exists only for a row already in the
  Trash.
  - Typed routes, as for restore: `DELETE .../trash/{entityId}` and `.../trash/stories|chapters|scenes|plot-arcs|plot-beats|world-rules/{id}`,
    204 - except a story's, 200 `TrashErasedStory { id, erasedSceneIds }` (every scene it held, live or binned alone). Owner first, row through its universe, `DeletedAt != null` required; live, missing, other universe's or account's id
    = 404, nothing written. `Features/Trash/TrashPermanentDelete.cs`.
  - The schema's cascades are the ownership graph: one `DELETE` on the row. Story takes chapters, scenes, manuscripts and
    versions, arcs, beats, links and idea references - including its own rows listed in the Trash separately; arc takes its
    beats (a separately binned one too); chapter takes no scene (they went to Unchaptered when it was binned). FTS indexes
    follow by their delete triggers (fire on cascades - tested).
  - Entry, explicitly: other entries' reference values to it removed (never left empty), moment details whose only part it
    was removed, every Canon finding naming it or its relationships forgotten; inside `RecordAsync` (reconciled, not gated).
    Image keys read first, objects swept after commit via `EntityImageEndpoints.SweepAsync`; a failed sweep is logged orphaned
    media, a failed DB delete sweeps nothing. A type/field used only by the erased entry becomes deletable naturally.
  - Rule: its check cascades; findings naming it forgotten; no reconcile (a binned rule is not checked).
  - Trash UI: Restore, then quiet text **Delete permanently…** (danger ink only on hover/focus). Asks in the row, as Settings'
    universe delete does: "Permanently delete the <kind> “<name>”?", kind-specific consequence, "This cannot be undone.",
    red **Delete permanently** + Cancel. Focus to the panel; Esc/Cancel back to the trigger; success removes the row(s),
    "“X” was permanently deleted." focused; failure keeps row and panel with a plain error; one request however many clicks;
    nothing else in the list can start meanwhile. A restore-blocked row can still be deleted. Emptied page steps back (in
    `load`, for restore too). After the server answers, this device's recovery copies of exactly what went are dropped by
    scope - an entry's article, a scene's manuscript, every erased story scene's manuscript; nothing else, never before
    success, best effort (a storage failure never undoes the delete).
  - Lede: "Everything here can be restored with everything it held, until you choose to delete it permanently."
  - Not done (owner decisions): Empty Trash, retention. (Bulk permanent delete and Trash multi-select since 023.) Other entries' saved
    versions keep the erased entry's id and name, as for a deleted option or era.
  - Tests: API 1200 -> 1217 (`TrashPermanentDeleteTests`, 17). Playwright 309 -> 316 (`trash-permanent-delete.spec.ts`, 7). Full run
    315/315 before the story-draft follow-up; that follow-up ran focused and neighbouring specs only.
- **Product refinement 020 - type management, the deletion fix, bulk Trash** (`feat/type-management-and-bulk-delete` off
  `dev` at `1165f67`, merged into `dev` at `7988e88`). No migration, no backup format change. ADR 0007 and 0015 amended.
  - **The deletion bug** was the reseed: every read of the type list filled in any missing starter *name*, so deleting an
    emptied Location succeeded (204) and the refresh put a new, empty Location back - no error to show. The entry's move to
    Kingdom was clean (type id changed, Location's field values replaced). Now the starters are written once, at universe
    creation, and a read never writes: a deleted or renamed starter, or every type deleted, stays that way (a new entry in a
    typeless world says so). The read-time fill dated from Phase 004, for Phase 003 universes; no backfill owed. A type any entry uses, in Lore or only in the Trash, is still refused, now in
    words: "Location can't be deleted because 2 entries still use it, 1 of them in the Trash. ..." (409
    `entity_type_in_use`, with counts; the list carries `trashedEntityCount`).
  - Types rows: picture, name, "N entries, M in the Trash", **Edit**, **Fields**, and ⋯ **Delete type**. No permanent
    Family Tree switch or Icon button. Delete of an unused type asks (`window.confirm`); of a used one explains under the
    row with "Show its entries in Lore" / "Open the Trash", no confirmation, nothing sent.
  - One drawer for New type (name, icon, Family Tree) and Edit type (name and icon only - Family Tree is the first of a
    type's constraints, which wait for their own surface). An edit sends back description, colour, order and Family Tree as
    stored; renames keep the id. The Family Tree page no longer points at a switch the Types screen does not offer.
  - Icon picker: every choice is a chip with its picture and its name on screen; chosen by edge, weight and a tick; radios.
    31 keys (+14: tree, flame, skull, scroll, star, moon, globe, landmark, house, swords, coins, flask, wand, languages), none
    renamed. Uploaded icons deferred.
  - Lore's types wrap onto rows above 640px - no sideways scroll, fades or scroll-into-view code; the phone keeps its Type menu.
  - Lore **Select**: cards become their checkbox's label; Select page, Clear selection, count, **Move N to Trash** (asks,
    says nothing is erased, names up to five), Done. Page-scoped: another page, filter, type or size drops the selection
    for good. `POST .../entities/bulk-trash` (`{ entityIds }`, 1-100): checked whole, then `TrashCoreAsync` per entry in one
    Canon `RecordAsync`; a failure moves none. "N entries moved to the Trash." with a link; an emptied page falls back.
- **Product refinement 019 - mass create lore** (`feat/mass-create-lore` off `dev` at `b4c9380`, merged into `dev` at
  `1165f67`). "I have 40 names. Put them in Lorex." No migration, no backup format change. ADR 0012 amended (a batch is one
  candidate).
  - Lore's header: **Mass create** (secondary, icon-only on a phone) beside **New entry** (primary). One page inside the
    workspace, `lore/mass-create?type=<id>`: Default type (the type Lore was on, else the first; a type with required fields
    is passed over and says why), Default status (Idea), a paste box, the rows, one sticky **Create N entries**. No wizard.
  - A paste into the empty box becomes rows at once: one name per line (blank lines skipped, cells trimmed, spelling
    kept), or tab-separated **Type, Name, Status** from a spreadsheet (header skipped; exact matches ignoring case;
    unknowns kept and marked on their row, never guessed). Two columns, or mixed shapes, are refused and the paste kept.
    Commas are part of a name. Typed text: Add to list or Ctrl+Enter.
  - Rows: Name, Type, Status, Remove; Add row. Defaults apply to new rows only; **Apply to all rows** is the explicit
    rewrite. Same type + name twice in the batch is a warning, never a refusal - names are not unique, and the universe's
    entries are not compared. Unready rows make Create `aria-disabled`; pressing it focuses the first problem. At 640px and
    under each row stacks: name, then type, status, Remove.
  - `POST .../entities/bulk` - `{ entries: [{ entityTypeId, name, canonStatus }] }`, 1-100 rows, 201 with the created ids.
    Checked whole first (ownership, name, status, type in this universe, required fields) and refused keyed by row
    (`entries[3].name`); then one promotion-gate run creates every row through `CreateEntryAsync`, the single create's own
    path, so each entry is indexed and gets its own Created version. A failure anywhere rolls back every row. Cap 100:
    ~0.2 s for 40, ~0.6 s for 100 in the test host, all under SQLite's one writer.
  - Success returns to unfiltered Lore with "Created N entries." (said once). A refused or failed create keeps every row;
    the leave guard asks while rows or pasted text are unsaved, and not after a create.
- **Product refinement 018 - chronology date periods** (`feat/chronology-date-periods` off `dev` at `cb3b084`, merged into
  `dev` at `b4c9380`). Product language and editor UX only: no migration, no backup format change, no API contract change.
  ADR 0022 amended.
  - Authors see **date periods** (a named stretch of a world's timeline with its own year numbers); code, tables, API, backup
    and `chronology_era_in_use` keep "era". Chronology page: "Choose how dates are written and ordered in this universe", a
    Date periods `h2`, plain numbered years as the empty state with its own Add date period; per period Name, Short label
    (optional), Years count Up from 1 / Down to 1 with its run (`1 → 2 → 3 → …` no set end, `… → 3 → 2 → 1`), Write dates as
    `TA 10` / `10 TA`; the order as a line of names; Earlier/Later keep focus (`aria-disabled`) and announce the move; an
    in-use Remove stays focusable and says why; unplaced dates are said to be kept and unguessed, with a timeline link.
  - The old `previewYears(eras, [120, 1])` ("BF 120 … AF 120") was a hard-coded display sample, never stored or validated,
    and read as a 120-year limit. Removed; nothing draws a range. Periods are unbounded (TA 3018, TA 100000 tested).
  - Pickers say Date period / Starts in period / Ends in period / Choose a date period (timeline, scene, lore year); the
    plain-year moment label is "Year label" and says it orders nothing; API, Canon-free validation, restore and revision
    messages say date period.
- **Product refinement 017 - workspace editing flow** (`fix/workspace-editing-flow` off `dev` at `ea7af47`, merged into
  `dev` at `cb3b084`). Frontend only: no API, schema, migration or backup change.
  - A new idea, once created, returns to its list (`replace`, so Back never reopens the finished form) with "Created “…”" in
    the list's notice: `/app/ideas`, or the universe's Ideas while it still belongs there, otherwise `/app/ideas`. A failed
    create stays with everything written. An existing idea still saves in place.
  - Explicit save is one button (`SaveAction`): the verb (Save changes / Create idea / Create rule / Save chronology), quiet and
    `aria-disabled` (keeps the focus) when nothing is unsaved; Saving…; ✓ Saved for 2 s; quiet again - never a "Saved" label
    beside it. One visually hidden status per editor says the same (`*-status` test ids); the duplicate "Saved." announcements
    are gone. Idea, World Rule, Manuscript and Chronology; drafts, conflicts, recovery, Ctrl+S and Canon gating untouched.
  - Sidebar, phone sheet and Overview: Lore, Family Tree, Timeline, **Chronology, World Rules** (one list, `sections.ts`).
- **Product refinement 016 - family tree semantics, type capability, Types tabs** (`feat/family-tree-type-semantics` off
  `feat/public-story-reading` at `fc42280` - `dev` + 015 - committed, not merged, not pushed). ADR 0040 (0035 amended, two
  statements superseded; 0014 amended). Migration `AddEntityTypeFamilyTreeEligibility`; backup format **18**.
  - `EntityTypes.FamilyTreeEligible`, author-set, seeded true only on the starter Character. Migration and pre-18 backups turn
    it on only for the untouched starter Character (name, description, icon `character`, colour `#4f6bd6` all as seeded);
    everything else stays off. Never read from a name or icon.
  - Offered by type: the tree's pickers (`entities?familyTreeEligible=true`) and the entry's Family tree action. Legacy kept:
    any live entry's tree opens and says when its type is not enabled; `EntityDetail.hasFamilyConnections` keeps the action.
  - `RelationshipFamilySemantic.NonStructuralFamily` (3): listed as *Other family connections* in the kind's own readings,
    never walked - no parent, sibling, grandparent, circle or `CANON-FAMILY-001`. Symmetric kinds may carry it; parents only
    via `RelationshipFamilySemantics.Parent`. Same integer column, same relationships.
  - Family Tree: *New family relationship kind* dialog (ordinary relation kind route) in the connection form and the no-kinds
    state; the new kind is chosen at once, no reload. Parent kinds ask which side; other kinds offer their two readings.
  - Types: three tabs in `?tab=` (`lore`, `relations`, `events`), pushed so Back/Forward walk them (Settings still replaces; shared
    `QueryTabList`/`useQueryTab`);
    `+ New type` dialog (name, icon, Family Tree); each type's Family Tree switch saves on choosing.
  - Not done: Canon constraints from the tree's dialog (set under Relation Kinds), the Relation Kinds tab reusing that dialog.
- **Product refinement 015 - public story reading and attribution** (`feat/public-story-reading` off `dev` at `9c403ff`,
  committed, not merged, not pushed). ADR 0039; `PUBLIC_PORTAL.md` section 22. Migration `AddStoryContentPublication`;
  backup format **17**.
  - A story's parts are published one by one, beside where they are written, on the units that exist: a scene's outline
    (title + summary, `Scenes.Visibility`), a scene's prose (`Scenes.ManuscriptVisibility`, pill in the manuscript save bar)
    and a plot arc with its beats (`PlotArcs.Visibility`, on purpose only). All Private by default and after the upgrade.
    Pills say Private / Selected / Public against the story's own state; owner routes `.../scenes/{id}/publish`,
    `.../scenes/{id}/manuscript/publish`, `.../plot-arcs/{id}/publish` (and `unpublish`).
  - Readable only while universe, story and part are public (`PublicScenes`, `PublicManuscripts`, `PublicPlotArcs`, each
    holding `PublicStories`); a private parent hides and clears nothing. Trash hides; restore brings the selection back.
  - `/worlds/{w}/stories/{s}` is a reader: `PublicStoryDetail` (manuscript, scenes, plot) in the workspace's reading order,
    only non-empty sections, no chapter titles or numbers, no ids, notes, counts or premise. No new routes or slugs.
  - Publish page: *Publish world* / *Make private* (danger ink) is the `PageHeader` action; the Status section keeps the
    checklist and confirmations; publishing while incomplete shows and focuses what is missing.
  - Attribution: "This universe is based on someone else's work" -> `Universes.OriginalCreator` (required, 120) and
    `OriginalWork` (200), cleared when unticked. Portal: "Based on works by X · Work", "Curated on LoreX by <author>", an
    unofficial note; Explore card "Based on works by X" + "curated by". The creator is never a link or a profile. Explore's
    `q` matches creator and work. Backup 17 carries it; v1-16 restore as original worlds; no version carries any selection.
  - LOTR pilot fixture (`lorex-lotr-fellowship-pilot.zip`, v16, untracked, not committed) restored cleanly on a scratch
    database and used for manual QA only. Its data has "NazgÃ»l" double-encoded - in the fixture, not Lorex.
  - Not done: public chapter headings, a per-scene reader address, a Trash restore question for a selected scene or arc.
- **Lore pager centred on CI's 360px** (`fix/lore-pagination-ci-centering` off `dev` at `9c403ff`, committed, not merged,
  not pushed). Deploy DEV #58 failed E2E only, identically on all three attempts: `lore-pagination.spec.ts`, light 360
  page 1, centre 8.47px off. **The UI was wrong, not the test**: the pager's `1fr auto 1fr` side tracks have an `auto`
  minimum, and in CI's DejaVu "Previous" with its arrow is 117px against a 109px half, so its track grew and the position
  moved right. Reproduced to the digit in Playwright's Linux image with DejaVu (`tests/Lorex.E2E/README.md`). Fixed in
  CSS: `minmax(0, 1fr) auto minmax(0, 1fr)` makes the halves equal by construction, and a container query (pager at most
  22rem) drops the decorative arrows so the words stay inside their halves - Lore's is the only pager with arrows; every
  pager gets the equal tracks. Spec now also checks 1536, 1024, 820 and a middle page, and that neither button reaches the
  position. Measured after, Linux/DejaVu and Windows: 0px at 390 and 360, both themes, pages 1, 2, 4. Full Playwright on a
  fresh database, two workers, retries 0: run 1 262/263 - `canon.spec.ts` review test met a wholly blank entry page (the
  known dev-server blank, no app shell mounted; green 3/3 alone); run 2 **263/263**, 12.8 min. Test count unchanged.
- **One workspace shell, Lore pagination** (`fix/workspace-shell-and-lore-pagination` off `dev` at `bcb3291`, committed,
  not merged, not pushed). Publish and Settings left their centred column: every universe page now starts at the same
  place with the same `PageHeader`; Settings' tabs sit in the header's slot, and only their forms keep a 46rem left-aligned
  column. Lore: the grid's cards are 16.5rem minimum (four columns at 1536, five at 1920); **Items per page** 12/16/20/30/40,
  kept in the browser, back to page one on change, a page past the end clamped to the last; the shared pager is three
  fixed slots with the position truly centred. Publish says "LoreX". No API or backend change (the API already clamps to
  50). Design contract §21.2-21.3.
- **Workspace page layout consistency** (`fix/workspace-page-layout-consistency` off `dev` at `b50337e`, committed, not
  merged, not pushed). Chronology had kept Settings' centred 46rem column; it now sits in the worldbuilding shell like
  World Rules - `.canvas` + `PageHeader`, title and lede left, **Add era** as the header's primary action (the in-content
  button removed; the new era's name takes the focus), the editor and Save below. Save shows only when there is something
  to save or eras exist. Audit: every other section already shared the shell; Publish and Settings keep their column on
  purpose. Design contract §21.2. No logic, backend or migration change.
- **014 follow-up - sidebar grouping, Chronology, theme control** (`feat/workspace-ia-follow-up` off `dev` at `e9fa972`,
  committed, not merged, not pushed). Presentation and routing only; no backend, no migration.
  - The sidebar is worldbuilding - Overview; Lore, Family Tree, Timeline, World Rules, Chronology; Stories, Ideas; Canon,
    Types - then, under a rule, upkeep: Trash, Publish, Settings (a full-width row at the foot of the phone's sheet).
  - **Chronology** left Settings for a section of its own at `/app/universes/{id}/chronology`, after World Rules: the same
    editor (`ChronologyEditor`, renamed from `ChronologySettings`), save, preview, refusals and leave guard, under the
    page's own heading. Settings is four tabs: General, Appearance, Data, Advanced. `?tab=chronology` is not redirected -
    it existed for a day on DEV only, and an unknown tab opens General.
  - The account menu's **theme control** is one segmented control of two equal halves on a faint ink-tint track, the
    chosen half lifted and ringed; no dark well, no layout shift when pressed.
- **UI refinement 014 - workspace navigation, Settings and Publish, PWA front door** (`feat/workspace-navigation-settings`
  off `dev` at `9908b83`; merged into `dev` at `e9fa972`). No backend change, no migration.
  - **Brand -> `/explore`** everywhere it is drawn (portal bar, rail "L", universes/ideas/profile headers, sign-in plate).
    "All universes" is now also at the head of the phone's Sections sheet, since the rail's L no longer goes there.
  - **Publish** is its own page at `/app/universes/{id}/publish`, in the sidebar just above Settings: status, checklist,
    publish / make private with their confirmations, public details, artwork, author (shown, edited on the Profile), and
    how many entries and stories readers can see (the public listings' own totals). Settings no longer holds any of it.
  - **Settings** was five tabs - General, Appearance, Chronology, Data, Advanced (four since the follow-up) - in a centred 46rem column; `?tab=`
    replaced, not pushed; panels mounted and hidden so drafts and leave guards survive. Archive and delete in Advanced;
    the 012 archive-while-public warning intact, now pointing at Publish.
  - **A universe's colour** is the author's own: picker + `#rrggbb`, or none. The palette is gone; stored colours kept.
  - **The installed PWA opened the workspace or Login because the service worker cached `/manifest.webmanifest`**
    (cache-first, `v3`), so browsers that ran Lorex before 011 kept the old `start_url: /app`. Fixed: the worker never
    touches the manifest and is `v4` (old cache deleted on activate); the client catch-all now lands on `/explore`.
    `start_url` `/explore` and `id` `/app` unchanged. ADR 0017 amendment; device checklist in the DEV runbook. Not
    verified on an installed device here.
- **UI refinement 013 - unified theme** (`feat/unified-theme-system` off `dev` at `f081ec1`, committed, not merged, not
  pushed). One Lorex theme, Light or Dark, for the portal and the workspace at once: `html[data-theme]`, set before the
  first paint by an inline bootstrap in `index.html` (saved choice in `localStorage['lorex-theme']`, else the system's,
  followed live until a choice), changed by `lib/theme.ts`. Chosen in the account menu, the signed-out portal's
  Appearance menu and the Profile. Workspace dark = the existing dark tokens, now on the attribute; portal dark
  unchanged; a new portal light (parchment, graphite, pictures fading to paper). No backend, no migration.
  `PUBLIC_PORTAL.md` section 20, design contract section 20.
- **Public portal roadmap 008-012 complete.** 008 publication foundation, 009 Explore Worlds, 010 content publishing
  controls, 011 public universe experience - all merged; **012** final polish, SEO, performance and safety on
  `feat/final-product-polish`, committed, not merged, not pushed. See Public portal below and
  `docs/public-portal/PUBLIC_PORTAL.md`.
- **Entry images** (`feat/entity-images-r2`, merged into `dev`). An entry may carry one picture:
  uploaded through the API, decoded and thumbnailed server-side, stored as two objects in one
  private Cloudflare R2 bucket, and served back only through an authenticated owner-scoped Lorex
  route. ADR 0019.
  - **Live-DEV fixes** (`fix/entity-image-r2-cropper`, merged into `dev`). R2 refused every
    upload (`STREAMING-AWS4-HMAC-SHA256-PAYLOAD not implemented`): PutObject now sets
    `DisablePayloadSigning` and `DisableDefaultChecksumValidation`, pinned on the request and the
    wire by `R2MediaObjectStoreTests`; SDK failures are a 503 problem, never a raw exception. The
    thumbnail is now the square the author frames in a cropper (`react-easy-crop`); the browser
    sends fractions, the server cuts. "Edit thumbnail" reframes from the stored original and never
    touches it. The crop is persisted and exported as `image.crop`. ADR 0019 amendment, ADR 0014.
  - **Backup is an archive.** Format version 3: the download is `lorex-<slug>-<date>.zip`
    holding `backup.json` plus `media/entities/{entityId}/original.{ext}`. Originals only -
    thumbnails are derived and regenerated. No object key, bucket, endpoint or URL is in the
    file, so a backup does not depend on R2 surviving. A media object that cannot be read fails
    the export loudly rather than thinning it. ADR 0014.
  - **History records an image change; a restore does not put a picture back.** Superseded
    objects are still deleted, so nothing historical is retained and an old version has no bytes
    to restore. Setting, replacing and removing each write a version flagged `Image`, and the
    history screen states the limit. ADR 0013, ADR 0019.
- **Lore visual polish** (`feat/lore-visual-polish`, merged into `dev`). Two owner requests from
  live testing. The type bar's sideways scrolling caused a CI failure (`fix/type-filter-mobile-e2e`,
  merged) and is now replaced by wrapping rows (`fix/type-filter-wrap`, merged).
  - **"Fit full image" withdrawn** (`fix/thumbnail-crop-only`, merged). A
    thumbnail is one square crop again, always covered by the picture. Migration
    `RemoveEntityImageFramingMode` drops the column; a row that was fitted reads as the centred
    square, but its stored thumbnail stays letterboxed until its author uses "Edit thumbnail".
    A stale client's `framing` field and a v3 backup's `image.framing` are ignored. ADR 0019, 0014.
  - **The Lore type filter is a row of icon chips.** Data-driven from the universe's types,
    `aria-pressed`, wrapping onto as many rows as the width needs. A type's icon is the existing
    `EntityType.Icon` column, now a key from a closed set the API enforces, chosen on the Types
    screen and never inferred from a name. Starter types keep their seeded keys. New web
    dependency `lucide-react`. ADR 0020.
  - **Every workspace screen fills the content column** (`fix/lore-desktop-width`,
    `fix/lore-full-width-actions` and `fix/center-workspace-canvas` merged, then
    `fix/full-width-workspace`, merged into `dev` at `34646c0`). `.canvas` is its padding and nothing
    else: the 60rem cap, the centring that existed only for that cap, and the Lore-only
    `canvas--full` modifier with its route check are all gone. Readability is local where it
    matters - the article and editor surface at 62ch, a summary at 58ch, a settings section at
    34rem - so prose stays readable without a page-level wall. Common Lore and entry actions carry
    a decorative Lucide icon beside their unchanged label (`ActionIcon`, `.button--icon`).
- **Profile screen** (`feat/profile-page`, merged into `dev`). The signed-in account has a
  screen of its own at `/app/profile` - a user-level route beside the universe browser, not a
  section of a world - wearing the same bar. Under the circle are the username, the email, how many
  universes the account owns and the account id, and a line saying that is all Lorex keeps. The
  account is reached from the global chrome - see the account menu below.
  - **The circle holds a real photo.** `ProfileImages` is its own table keyed by the account, on
    the entry image's proven path: upload, frame a 1:1 square, edit that square from the stored
    original, replace, remove. Objects live at `users/{userId}/profile/{assetId}/...` - ids only,
    and deliberately not under `universes/`. Ownership is the session and nothing else: no route
    carries a user id, so another account's photo is not a request that can be made. No photo is
    still the monogram. ADR 0021.
  - **One upload gate now, for both pictures.** `EntityImageProcessing` moved to
    `Features/Media/ImagePreparation.cs` unchanged in behaviour, so the formats, the 8 MB ceiling,
    the orientation rule and the crop arithmetic cannot drift between a portrait and an avatar.
    `EntityImageCrop` stays as the lore wire and v3 backup shape and converts to `Media.ImageCrop`
    in a line. The same `ImageCropDialog` frames both.
  - **A universe backup still holds no account data.** Format version 3 is untouched: no `users/`
    entry, no account id, no asset id. Pinned by a test.
- **Account menu and upload progress** (`fix/profile-account-menu-progress`, merged into `dev`
  at `f3b11de`). Four owner notes from live DEV.
  - **The account is global chrome, not a universe section.** Profile is gone from the beige
    sidebar; one `AccountMenu` - a circular avatar opening onto the username, the email, View
    profile and Sign out - sits at the foot of the black rail, and the same component replaced the
    loose username and Sign out button in the universes header. The rail's mark and accent seal
    stay a pair, so the avatar is bottom-anchored rather than tucked under the "L"; on a narrow
    screen the rail is the sticky bar and the same node lands at its right-hand end, so there is no
    second account UI on a phone. `/app/profile` is unchanged. ADR 0021.
  - **One avatar for every place that draws one.** `ProfileImageProvider` holds the signed-in
    account's photo and every write reports its result there, so the rail, the folded bar, the
    header and the Profile screen agree without a reload and without four reads of one row. Its own
    provider, not a field on the auth context: media, not identity.
  - **A save says which half of the wait it is in.** The browser's bytes are a determinate
    progress bar with a real `aria-valuenow`; the moment the last byte is out it becomes an
    indeterminate bar plus "Processing photo…", because 100% uploaded is not saved. A reframe
    sends no file and says "Updating photo…" with no percentage. The cropper goes `inert` while a
    save is in flight and a second press cannot start a second upload. This needed
    `XMLHttpRequest` - `fetch` cannot report upload progress - so `src/lib/upload.ts` is that one
    exception, behind a helper that fails as the same `ApiError`; `apiFetch` is untouched.
  - **Both object writes now overlap, and the body is not spooled to disk.** Measured first: the
    server's own work on a 4 MB phone photo is 190-310 ms locally, and the dominant cost is moving
    the original twice over the network. So the two R2 writes that had no order between them run
    together, the post-commit sweep does too, and the form reader no longer writes the body to a
    temporary file only for the handler to read it back. Every failure guarantee is unchanged and
    both interleavings are tested, as is the overlap itself. ADR 0019 amendment. **It does not make
    a slow uplink fast** - that is what the progress bar is for.
- **Universe chronology** (`feat/universe-chronology`, merged into `dev`). Owner-requested
  feature after Phase 1 stabilization; unnumbered because numbering is paused and `023` is reserved
  (branching.md). A universe may name ordered eras, and Timeline, declared birth/death years and the
  chronology rules share one comparison. ADR 0022.
  - `ChronologyEras` rows owned by the universe: name, short label, order, direction, label position.
    No eras is the plain reckoning, unchanged in every respect. Settings replaces the whole list in
    one gated `PUT`, with a preview; an era anything is dated in cannot be removed (409).
  - Inside an era a year is whole and counts from 1 - no year 0. Plain years keep 0 and negatives.
  - Timeline entries carry start/end era ids; a birth or death year carries its era as metadata on
    the Number. `ChronologyPoint` is the one comparison, and the listing's SQL order is held to it.
  - Years written before a universe named eras are never reinterpreted: listed apart as having no
    era yet, ignored by Canon, and given one on their next save.
  - Backup format version 4 carries the eras and every era reference. ADR 0014.
- **Relationship Canon constraints** (`feat/relationship-canon-constraints`, merged into `dev`).
  Owner-requested, unnumbered. A relation kind may say which end must be older and bound
  the gap between the two birth years; Canon Integrity checks Canon links against that. Nothing is
  inferred from a kind's name. ADR 0023.
  - Typed columns on `RelationshipTypes` - `AgeOrder`, `MinAgeDifferenceYears`,
    `MaxAgeDifferenceYears` - defaulting to no rule. The API's `canonConstraints` group, left out of
    an update, keeps what is stored. A symmetric kind may bound a gap but not name an older end; a
    minimum above the maximum is refused, never swapped.
  - `CANON-REL-002` (order) and `CANON-REL-003` (gap), both Medium, so nothing is refused: a breaking
    link, a breaking birth year and a rule existing links already break are all saved and reported on
    the write. Equal years, missing or unplaced years, non-Canon ends and unmeasurable gaps stand down.
  - The gap is `UniverseChronology.YearsBetween`: the signed difference inside one era or the plain
    reckoning, `a + b - 1` from a countdown era into the ascending era after it, unknown otherwise.
  - Edited inside the relation kind form on the Types screen. Backup stays version 4, additively.
- **DEV deploys unblocked** (`fix/ci-mobile-story-workspace` from `dev` `9e8c187`, committed, not merged, not pushed).
  Deploy DEV #27-#34 (content recovery onwards) never deployed: CI's End to end job failed one test every run, identically
  on all three attempts - `story-workspace.spec.ts` "prose at 390px", editor top 649.7, then 653 against 644. Not flaky, not
  SQLite, not the workflow. Content recovery put a third tool, "Manuscript history", in the manuscript's tool row; at 390px
  the three labels need 387px of a 350px column, so the row wrapped and pushed the text box 30px down. Windows fonts hid it
  (632.6, a second row too, but 11px under the line); CI's DejaVu did not.
  - Below 640px that tool reads "History" and keeps its whole accessible name, so the row keeps one line. Editor top at
    390px under CI's fonts 653 -> 622.8; the spec now also asserts the three tools share a line under their full names.
  - CI's geometry is reproducible locally: `tests/Lorex.E2E/README.md`. Workflows unchanged; Deploy still needs Validate.
- **Maintenance pass** (`chore/overnight-maintenance` from `dev` `91629ba`, merged into `dev` at `9e8c187`). No new
  product behaviour, no migration, no backup change. Five fixes, each measured:
  - **Every page route is fetched when it is first opened.** One 1,064 kB script became an entry of 318 kB and a chunk
    per screen; `/login` now downloads 322 kB where it downloaded 1,064 kB, and Vite's large-chunk warning is gone. The
    rich-text editor is the whole reason: it is 438 kB and lives on one screen. `UniverseWorkspace` and its overview stay
    imported directly - splitting the chrome would only mean fetching the frame before the frame can say what to fetch.
  - Each screen sits behind **its own keyed `Suspense`**. Without the key React holds the outgoing screen while the next
    one is fetched, which kept a left editor mounted past the moment its author answered "yes, leave" - a second, empty
    browser prompt, caught by `content-recovery.spec.ts`. Screens that are one component over several addresses share a
    key, so an entry, a story and an idea keep their state exactly as before.
  - **The Types screen no longer reports the read it cancelled itself.** Under `StrictMode` the first effect's abort set
    "The types could not be loaded." on every development open, above a list that had loaded. The whole repository was
    audited for the pattern; this was the only one. Pinned by `lore.spec.ts`.
  - **A database failure is classified before it is translated** (`Data/DatabaseFailures.cs`, 28 catch sites). See Baseline.
  - `lore.spec.ts` typed into the article editor without waiting for it to hold the caret, losing the first words of a
    run in 3 of 40 repeats before the split and 9 of 40 after it, 0 of 80 once it waits the way every other spec does.
- **Phase 4 - World Rules & Family Trees - COMPLETE** (owner-sequenced, unnumbered branches): 1. World Rules - merged.
  2. Timeline-based Canon validation - merged. 3. Family Trees - merged.
- **Phase 4 - Family Trees** (`feat/family-trees` from `dev` `02118ca`, merged into `dev` at `91629ba`). Phase 4's last
  feature: family connections an author records explicitly, and the relatives that follow from them. ADR 0035 (ADR 0008, 0014,
  0023, 0032 amended).
  - `RelationshipTypes.FamilySemantic`: `None` | `BiologicalParent` | `AdoptiveParent`, on the stored direction - source parent,
    target child. Never inferred from a kind's name, in any language; refused on a symmetric kind, and on turning one symmetric
    beneath a meaning. Independent of the Canon constraints beside it; `familySemantic` left out of a save keeps what is stored.
  - `GET .../family-tree/{entityId}`: parents, grandparents, siblings, children, grandchildren, `generationsEachWay` 2 and no
    depth parameter. At most five queries whatever the family's size (pinned at 40 relatives). Derived per read, never stored:
    a sibling is two parent links sharing a parent. Ids only - no name, alias, tag, entry type, date, story or prose is read.
  - Each relative carries the link paths that make it one, so a card can say *Shares Mara — biological for both*. **No full or
    half sibling**: one recorded parent claims nothing about a parent nobody wrote down. Any number of parents; no Character type
    and no personhood test anywhere.
  - Circles: traversal is bounded by construction, circles among the links a tree read come back in `loops` (Tarjan, explicit
    stack), and `CANON-FAMILY-001` Medium reports one per circle of Canon links between Canon live entries, fingerprinted over
    those links as a set. Nothing is refused, rewritten or deleted.
  - Trash and Canon follow what relationships already do: a link is read only while both ends are live, a trashed entry has no
    tree (404) and restoring brings the connection back whole; each link and entry shows its own Canon status, and a Draft link
    is drawn faintly and named in words.
  - Backup format **14**: `relationshipTypes[].familySemantic` by name. A v13 reader would drop the meaning of every link and
    must not guess it back from a name - the line ADR 0023's constraints sat on the other side of. Importer 1-14; before 14 none
    even if carried. Migration `AddRelationshipFamilySemantics`: one additive column, native `DROP COLUMN` on the way down.
  - Web: `Family Tree` after Lore, at `/family-tree/{entityId}` - the entry in focus is in the address. Generation rows in plain
    React and CSS with the lines measured from the cards in one `aria-hidden` SVG (solid biological, dashed adoptive, faded
    non-Canon); every position is also written on the card, so the keyboard and a screen reader read the same tree. Contained
    sideways scrolling on a phone, never the page. Family meaning is set on the Types screen; "Add family connection" writes an
    ordinary relationship; every entry page offers "Family tree".
  - Owner manual pass: `docs/testing/phase4-family-trees-manual-test.md`.
- **Phase 4 - Timeline rule validation** (`feat/timeline-rule-validation` from `dev` `3508baf`, merged into `dev` at `02118ca`).
  The first checkable World Rule pattern: at most N Canon moments of one event kind by one method per participant. ADR
  0034 (ADR 0010, 0012, 0014, 0032, 0033 amended).
  - Explicit only: a rule's stored check and moments' stored details. No title, description, linked entry, story, manuscript or
    idea is read; tests use invented names.
  - `ValidationTerms` (event kind | method, universe-owned, name unique per kind case-insensitively; identity is the id) at
    `/validation-terms`: list with usage, create, rename (reconciled for wording), delete refused 409 `validation_term_in_use` while a
    rule (Trash included) or moment names it. Created in place from the rule editor and moment drawer; renamed/deleted on Types.
  - `WorldRuleValidations` (one per rule: kind, event kind, method, limit 1-10,000) saved with the rule under its stale-save 409;
    `validation` left out keeps, `None` removes. `TimelineEntryValidations` (event kind, method, participant - each optional; SET NULL
    participant; a trashed participant kept, never newly chosen); left out keeps, all-null removes. Moments stay last-write-wins.
  - Count (`WorldRuleOccurrences`, two queries per universe): explicit different term = other event; non-Canon not counted; Canon
    missing a part or with participant in Trash = uncounted; group by participant id. Rule detail's derived `check`: Checked /
    Incomplete (names uncounted moments, never "holds") / CannotCheck (a stored row that cannot run; never passes).
  - `CANON-WORLD-001` Medium, one per rule + participant over the limit; subjects rule (`CanonSubjectKind.WorldRule`), participant,
    each moment. Fingerprint: rule, event kind, method, participant + moments as a set (`CanonFinding.UnorderedFrom`, so the set
    survives restore). A third moment is a new finding. Canon links rule, entry and `timeline?moment={id}` (opens the drawer).
  - Reconciled: timeline writes (already), rule create/update/delete/restore only with a check, term rename. Rule in Trash checks
    nothing; participant in Trash leaks nothing.
  - Backup format **13**: `validationTerms`, `worldRules[].validation`, `timelineEntries[].validation`; v12 reader would drop authored
    names and recorded facts silently. Importer 1-13; before 13 none even if carried; ids remapped; dismissals re-applied.
  - Migration `AddRuleValidation`: three new tables, nothing rebuilt, triggers untouched.
  - Fixed on the way: Canon finding explanation and subjects did not wrap a long unbroken word on a phone; EntityPicker's Change left
    the focus on nothing (now the search box).
  - Owner manual pass: `docs/testing/phase4-timeline-rule-validation-manual-test.md`.
- **Phase 4 - World Rules** (`feat/world-rules` from `dev` `db13011`, merged into `dev` at `3508baf`). Explicit
  statements about how one universe works, as their own domain - not lore. ADR 0033 (ADR 0014, 0029, 0031, 0032 amended).
  - `WorldRules` (universe cascade): title 200 trimmed, plain description 10,000 exact, Trash marker. No priority, order,
    category, tag or enabled flag; listed by title. Words never read for meaning: no Canon, lore, timeline, story or idea write,
    pinned by a test whose rules say "Canon: Arlen is dead".
  - `/api/universes/{u}/world-rules`: paged list (240-char excerpt), create, read, whole save with stale 409 `world_rule_changed`
    (no token is stale), unchanged save writes nothing, delete into the Trash. Restore: `.../trash/world-rules/{id}/restore`.
    Ownership 404 first; a rule only through its own universe.
  - Trash: seventh kind `WorldRule`, waits for nothing, no Canon gate. No saved versions, no recovered draft (a short form).
  - Search: `WorldRuleSearchIndex` (FTS5, 3 triggers); kind 8 "World rule", title / planning tiers, opens `world-rules/{id}`.
    At most 15 queries and 45 results.
  - Backup format **12**: `payload.worldRules`, live first, Trash marked; v11 reader would drop rules silently. Importer 1-12,
    before 12 none even if carried; validated, new ids, markers and moments kept, preview counts.
  - Web: sidebar World Rules after Timeline; list, editor (Save and Ctrl/Cmd+S, stale choice, leave guard, Delete), Trash row,
    search result, restore preview line. Nothing on screen claims validation.
  - Canon unchanged here; step 2 attached checks by the rule id (above).
  - Owner manual pass: `docs/testing/phase4-world-rules-manual-test.md`.
- **Phase 3 - Authoring, Ideas & Recovery - COMPLETE** (owner-sequenced, unnumbered branches): lore articles, content recovery,
  ideas, persistent top search bar, Backup Import / Restore - all merged.
- **Phase 3 - Backup restore** (`feat/backup-restore` from `dev` `2f3d1c5`, merged into `dev` at `db13011`). Backup ->
  validate -> restore as a **new** universe; no overwrite, no merge. ADR 0032 (ADR 0014, 0010 amended).
  - `PUT /api/backups/validate` streams the raw file to a staging folder, validates, answers a preview (server-counted) and a
    256-bit token; `POST /api/backups/restore` takes token + name, validates the kept file again, restores; `DELETE` discards.
    Token per account (another account's = unknown = expired, one 404), one waiting upload per account, 16 / 2 GB total, 30 min,
    in-memory map (restart = choose file again). Double submit 409.
  - Hostile archive: never extracted; unsafe/absolute/`..`/backslash/link/duplicate entries refused; end record counted before
    ZipArchive; exact-size bounded reads (bombs, lying headers); 512 MB file, 1 GB decompressed, 128 MB document, 8 MB picture,
    5,001 entries, 1M rows, depth 32, no duplicate JSON properties. Version read before shape: newer = `backup_version_unsupported`.
  - Structural validation only: unique ids, references in the file by explicit kind, enums, column bounds, unique indexes, live
    orders, semantic on Number, relation constraints, era years, article documents (no `javascript:` links), colours, pictures at
    Lorex's own path decoded by the upload gate, no unnamed files. 20 issues listed, rest counted. No semantic inference.
  - Versions 1-11 restore (1-2 bare JSON, 3+ zip): project by version, then normalize as the migrations did (article -> row + v1,
    manuscript v1, icons, Unchaptered, live orders renumbered). `BackupFormatSupport.MaxVersion` test-held to `CurrentVersion`.
    **Format stayed version 11** (12 since World Rules). No export gap found; `EntityImage.UploadedAt` is not authored and becomes restore time.
  - Every id new (`RestoreIdentity`); history's recorded ids translated consistently. Universe and ideas owned by the restoring
    account; no account data. Rows written directly, not replayed: no fabricated versions; Trash markers, history, ideas (deleted
    kept, references rewritten) exactly as backed up; unassigned ideas and drafts never.
  - Pictures first under new-universe keys (original + thumbnail recut from its crop), then one transaction (rows, lore index,
    Canon); any failure rolls back and sweeps only attempted keys; upload waits for retry. `CanonFinding.FingerprintIds`: dismissals
    re-applied by fingerprinting restored findings over their backup ids. Story/manuscript/idea indexes by triggers.
  - Web: Restore backup beside New universe (`?restore`), linked from Settings; `RestoreBackup` panel - file, upload %, checking,
    preview with counts and name, refusal with issues, restoring; focus to headings/name, status/alert regions.
  - Measured worst case (78 MB document, ~145k rows, 30 pictures): validate ~4.5 s, restore ~20 s, ~15 s of it the SQLite write.
  - Owner manual pass: `docs/testing/phase3-backup-restore-manual-test.md`.
- **Phase 3 - Universe search** (`feat/universe-search` from `dev` `95687ba`, merged into `dev` at `2f3d1c5`). "A search
  bar on top that allows to enter anything", scoped to the current universe. ADR 0031.
  - Searches lore (name, aliases, summary, article), stories (title, premise), chapters, scenes, arcs, beats (title, summary or
    description, notes), saved manuscripts, and the account's live ideas of that universe (title, body). Live content only - a
    child of something in the Trash is out; archived entries out as in Lore. Never unassigned ideas, other universes, the
    Trash, versions or recovered drafts. Keyword search with the lore search's tokenizing; not AI. Lore search unchanged.
  - `GET /api/universes/{id}/search?q=`: ownership 404 first; one query per kind, at most 5 each (`hasMore`), ordered by where
    the words were found (title, then planning text, then prose), merged in that tier then a fixed kind order - no score
    compared across indexes; 16-word excerpts as text runs. Thirteen queries fixed; 10-40 ms on the 25 MB dev database.
  - Indexes: lore's `EntitySearchIndex` plus three FTS5 tables (`StorySearchIndex`, `SceneManuscriptSearchIndex`,
    `IdeaSearchIndex`) kept in step by 21 SQLite triggers (plain text, every write path and cascade) and filled by the
    migration. Derived: text only, live-ness by join. U+E000/U+E001 written as spaces in every index copy - ADR 0028's marker
    limitation closed. No backup change: version 11 stands.
  - Web: `UniverseSearch` above every universe screen (a 36px row on a phone, 44px under touch), APG combobox with listbox,
    debounce and abort, results only for the current text, empty/failure/retry, leave guard before a result opens another page.
    Deep links: entry (`#article` for an article match), Scenes `#chapter-`/`#scene-`, Plot `#arc-`/`#beat-`, manuscript,
    universe idea. Story page now one per story (keyed). Sidebar's greyed "Search" removed. The manuscript's narrow-screen
    outline disclosure names the scene on one line, so its text box keeps the Phase 2 first-screen promise under the bar.
  - Owner manual pass: `docs/testing/phase3-universe-search-manual-test.md`.
- **Phase 3 - Ideas** (`feat/ideas` from `dev` `33da348`, merged into `dev` at `95687ba`). Possibilities kept apart from
  lore, owned by the account. ADR 0030.
  - `Ideas`: owner (cascade), optional `UniverseId` (`SET NULL`), title 200, plain body 20,000, `DeletedAt`; no status, tag,
    folder or order - newest update first. Five reference join tables (entry, story, scene, arc, beat), cascading both sides.
    Never lore: no entry, relationship, moment, story, Canon, finding or revision write, pinned by a test (its words reach only
    the universe search's own derived index, ADR 0031).
  - `/api/ideas`: account-scoped list (`universeId` | `unassigned`, `deleted`, `search`, paged, 240-char excerpt), create,
    read, whole save with stale 409 `idea_changed` (no token is stale too), delete to Recently deleted, restore, and
    `reference-targets` for the picker. Another account's idea, universe or content is a 404 or refused in not-found words.
  - References: explicit kind, own universe only, none without a universe; changing universe and references is one save; a
    target in the Trash stays, marked, never newly chosen. No saved versions.
  - Universe delete: one transaction deletes its ideas' references, unassigns them and moves `UpdatedAt`, then deletes the
    universe. Words kept, nothing reattached.
  - Web: `/app/ideas` (from the universes bar, account frame) and the universe sidebar's Ideas section - one `IdeasBrowser` and
    one `IdeaEditor`. Picker drawer, leave guard, recovered drafts (`kind: 'idea'`; existing ideas account-scoped with no
    universe, new ideas per start place). Trash and Settings point to Recently deleted / say ideas survive.
  - Backup format version 11: `payload.ideas` for the universe's ideas, deleted marked, references by kind and id. **Unassigned
    ideas are in no universe backup** - no account export exists. ADR 0014.
  - Owner manual pass: `docs/testing/phase3-ideas-manual-test.md`.
- **Phase 3 - Content recovery** (`feat/content-recovery` from `dev` `0784fac`, merged into `dev` at `33da348`). Three
  recoveries kept apart - saved versions, a Trash for story content, recovered drafts of unsaved writing. ADR 0029.
  - Manuscript versions: `SceneManuscriptRevisions`, the whole text per changing save (`Created|Edited|Restored`); a save that
    changes nothing writes nothing (ADR 0027 amended). `.../manuscript/revisions`, `/{id}`, `/{id}/restore` naming
    `expectedUpdatedAt`, stale 409 `scene_manuscript_changed`. The migration makes each manuscript its version 1.
  - Story Trash: `DeletedAt` on stories, chapters, scenes, arcs, beats - deleting marks, superseding ADR 0024-0026's permanent
    deletes. Order indexes are partial on live rows. A chapter delete still moves its scenes to Unchaptered; a trashed chapter
    holds none and restores empty and last. Restores append; a parent in the Trash refuses with 409 `trash_parent_in_trash`,
    never attaching elsewhere. A beat keeps its hidden link to a trashed scene. One Trash lists six kinds, typed restores.
  - Recovered drafts: IndexedDB `lorex-recovery`, keyed account/universe/kind/id, article and manuscript editors only; never
    sent to the API or a backup, never destroyed by sign-out, never offered to another account. Recover loads it as unsaved
    (Save still required, stale check intact); a failed, stale or orphaned save and a closed tab keep it; a matching save,
    Discard, Done, Load the saved version and leaving by choice let it go.
  - Backup format version 10: `deletedAt` markers and `manuscript.revisions`. ADR 0014.
  - Owner manual pass: `docs/testing/phase3-content-recovery-manual-test.md`.
- **Phase 3 - Lore articles** (`feat/lore-articles`, merged into `dev` at `0784fac`). The owner authorized Phase 3;
  this is its first feature. Entries already had a Tiptap article; the owner kept that format (no plain-text conversion,
  2026-09-13) and it gained everything else. ADR 0028.
  - `EntityArticles` (one per entry; `Entities.Content` dropped) and `EntityArticleRevisions`, its own history. Own route
    `.../entities/{id}/article`, `/revisions`, `/revisions/{id}/restore`; stale save 409 `entity_article_changed`. Entry
    routes, listings, Trash and entry history carry no article.
  - **Merge-readiness fixes** (ADR 0028 amendment). An entry `POST`/`PUT` still carrying `content` - any value, any case -
    is refused whole: 400 `entity_article_moved`, after ownership, before any write. Browser Back/Forward now ask about
    unsaved writing: the app runs on a data router (one catch-all route around the unchanged routes) and
    `HistoryLeaveGuard` holds history moves while a leave question stands. The manuscript gains it too.
  - A save touches the article, its version, search and the entry's `UpdatedAt` - no Canon gate, field, relationship,
    timeline or entry revision. No status of its own: it follows the entry's Canon state.
  - Entry revisions no longer copy the article and a restore never applies it. Versions recorded before keep their copy,
    read-only and labelled; the migration makes each article version 1 of its own history.
  - Search reads the row and returns `articleExcerpt` (FTS5 snippet: 16 words, 240 characters, page ids only, article
    matches only), drawn as text with `<mark>`. Backup format version 9 (`articleUpdatedAt`, `articleRevisions`; revision
    `content` re-meant). ADR 0014, 0016, 0013 amended.
  - Entry page: an Article section - Write/Edit article, Save and Ctrl/Cmd+S (focus in the article), status, conflict
    choice, failure and gone-entry messages that keep the text, the leave guard with Sign out, Done asks; one editor at a
    time; Article history on request. A new entry writes its article once created. Search cards show the excerpt.
  - Fixed on the way: a narrow-screen `.entry__layout` `1fr` column let one long unbroken word widen the whole entry page
    past the screen (now `minmax(0, 1fr)`); the refocus after Save held Tiptap's StrictMode-destroyed instance.
  - Owner manual pass: `docs/testing/phase3-lore-article-manual-test.md`. Backup Import / Restore is Phase 3's last feature.
- **Phase 2 Story - COMPLETE** (owner-sequenced, unnumbered branches). Implemented scope: Stories, Chapters,
  Scenes, Plot Arcs / Beats, Scene Manuscript. ADR 0024-0027. Deferred Story work is listed under Deferred, apart
  from this: none of it is a Phase 2 gap.
  1. Story / Scene foundation - merged.
  2. Story chapters - merged.
  3. Plot arcs / beats - merged.
  4. Scene manuscript - merged.
  5. Story workspace integration / Phase 2 closeout - merged.
  6. Owner acceptance - owner-managed, `docs/testing/phase2-story-manual-test.md`.
- **Story workspace integration / Phase 2 closeout** (`feat/story-phase2-closeout`, merged into `dev`). Polish and hardening across the
  four features, reviewed as one product against a 24-scene story. No new subsystem, no API, schema or backup change.
  - One short header for Scenes, Plot and Manuscript: title and facts, the premise on Scenes only, and one bar holding
    the views and Edit/Delete story - icon-only below 640px, still named. At 390px the first scene and the manuscript
    text box are on the first screen; before, the header filled it.
  - Each view opens with its own tools, or with one empty state holding one way to begin: a new story leads to a scene,
    and Plot points back to Scenes. A story or story list that cannot be read says so in one wording with Try again; a
    failed re-read keeps the story on screen, marked stale, instead of unmounting prose being written.
  - Write on every scene card opens its manuscript; Show in Scenes, the manuscript's new Lore row and the plot chips lead
    back out. A link to a scene or beat scrolls to it, focuses it and marks it for a moment. Scene and beat tools say
    whose they are; story drawers hand the focus back to their opener. `SceneContext` draws a scene's date, point of
    view, lore and beats the same on its card and its manuscript page.
  - The leave guard also asks on Sign out, the one in-app way out that is a button (`confirmLeaving`). Back/Forward was
    left uncaught then; Phase 3 catches it (ADR 0028 amendment).
  - "Arc" everywhere; no "plot arc" left on screen.
  - `StoryPhaseIntegrityTests` walks the whole ownership graph in one universe and proves a full story workflow changes
    no lore, relationship, timeline, revision, Canon finding or search result. `story-workspace.spec.ts` covers the
    cross-view journey, unsaved prose, deep links, focus and the first screen from 390px to 1920px.
  - A local `has-pending-model-changes` that fails naming `wwwroot` is a stale `bin/Release` static web assets manifest
    from a local publish rehearsal, not the repository: CI's clean checkout never has it. `dotnet clean -c Release`
    clears it. Runbook troubleshooting.
- **Story & Scene foundation** (`feat/story-scene-foundation`, merged into `dev`). The first
  Story-layer feature; owner-requested, unnumbered. Lore is what is true; a story is how an author tells
  something with it. ADR 0024.
  - Universe -> Story (title, premise, status `Planning|Drafting|Complete`) -> Scene (title, summary,
    notes, narrative `SortOrder`, optional point of view, optional position in the world, linked
    entries through `SceneEntityLinks`). Stories sit in the universe sidebar after Timeline.
  - **Narrative order is not chronology.** Order is contiguous and unique per story: appended on
    create, closed on delete, moved only by a whole-order `PUT .../scenes/order`. A scene's
    `ChronologyValue` (era, year, month, day) is shown on it and never orders, groups or refuses
    anything. The story page reorders with Move up / Move down; focus follows the scene.
  - References, not copies: names, types and portraits are read from the lore on every request, two
    queries per story. A trashed entry stays on its scene, marked, and cannot be newly chosen. An entry
    row deleted for good clears the point of view and drops the link; nothing deletes a scene.
  - No Canon finding, timeline entry, relationship, search hit or revision comes from a story. Deleting
    a story or scene was permanent; content recovery sends it to the Trash (ADR 0029). Year checks and the era row are
    now shared with the timeline (`ChronologyPointValidation`, `ChronologyPointFields`); an era a scene uses cannot be
    removed.
  - Backup format version 5 carries stories: a version 4 reader would drop them silently. ADR 0014.
  - The sidebar stays text-only: the Lucide icon asked for would have been the only one in it.
- **Story chapters** (`feat/story-chapters`, merged into `dev`). Optional structure between story and scene. ADR 0025.
  - `Chapters` (title, summary, notes, order) owned by the story. `Scenes.ChapterId` nullable: null is
    Unchaptered, never a fake chapter row. Scenes stay the unit; a move keeps the same row and everything
    on it.
  - Scene order is now per container - one chapter, or Unchaptered - via two filtered unique indexes
    (a unique index treats nulls as distinct, so one index would not guard Unchaptered). No story-wide
    scene order once chapters exist. Chronology still orders nothing.
  - Chapter order: append, `PUT .../chapters/order`. Scenes: `PUT .../scenes/order` names its container;
    `PUT .../scenes/{id}/position` moves within or across; an edit naming another chapter moves it last
    there. All one transaction, park-then-place.
  - Deleting a chapter moves its scenes, in order, to the end of Unchaptered, then deletes it - since content recovery,
    into the Trash (ADR 0029). FK is `NO ACTION`, so a delete that skipped the move is refused rather than corrupting
    order.
  - The number ("Chapter 3") is the position, never stored. Story read is still a fixed query count,
    pinned by a test at 10 chapters x 100 scenes.
  - Migration `AddStoryChapters`: every existing scene Unchaptered with its order untouched; rollback
    flattens into reading order and discards chapters. Backup format version 6: a v5 reader would lose
    chapter text and misread per-chapter `sortOrder`. ADR 0014.
  - Story page: Unchaptered shown only while it holds a scene; modest chapter headings; Move up/down stay
    in the container; "Move to…" disclosure; Chapter field in the scene form. No drag, no collapse.
- **Story plot** (`feat/story-plot-arcs-beats`, merged into `dev`). What the author means to develop, apart from lore (true) and
  structure (shown, in order). ADR 0026.
  - `PlotArcs` (story-owned) -> `PlotBeats` (arc-owned): title, description, notes, order. No status. Beat <-> scene
    and beat <-> entry are join rows cascading from both sides - references, so no plot delete reaches a scene,
    chapter or entry, and a deleted scene or entry row takes only its link. Same story / same universe checked on
    write, refused alike; a trashed entry stays marked and cannot be newly linked.
  - Arc order per story, beat order per arc: append, gap-close, whole-order `PUT`, park-then-place. An edit naming
    another arc moves a beat last there. No stored number. Scene order, chapters and chronology never move a beat.
  - `GET .../plot-arcs` is its own fixed-query read, pinned at 5 arcs x 10 beats x 250 links; `StoryDetail` is
    unchanged. No Canon, timeline or lore change from any plot write.
  - The story page gained a Plot view (`.../plot`) beside Scenes (`/stories/:id`), one header. Arc headings,
    beat rows with wrapping Scenes/Lore chips, a scene picker grouped by chapter with a filter, and a read-only Plot
    row on each scene card linking back. No sidebar entry; the greyed "Plot" placeholder is gone from it.
  - Backup format version 7: a v6 reader would lose arc and beat text and every link. ADR 0014.
- **Scene manuscript** (`feat/story-scene-manuscript`, merged into `dev`). The prose itself, apart from a scene's planning. ADR 0027.
  - `SceneManuscripts`: `SceneId` key and FK (cascade), `Content` unbounded text, `UpdatedAt`. No column or navigation on
    `Scene`, so reorders, moves and the story read never load prose. No row until the first save; `""` is a valid save.
  - Plain text stored exactly - no trim, Markdown or HTML. `GET`/`PUT .../scenes/{id}/manuscript` is the only route that
    carries it; a test holds story, scene, chapter and plot reads to the same length around a 400k-character save.
  - Bound 1,000,000 characters (`StoryLimits.ManuscriptMaxLength`, mirrored client-side). A save names the `updatedAt` it
    was written over; a mismatch is 409 `scene_manuscript_changed`, nothing written, and the author chooses keep or load.
  - Updates the story's `UpdatedAt`, not the scene's. No Canon, timeline, lore, plot link or search from prose.
  - Third story view, Manuscript, at `/stories/:id/manuscript/:sceneId?`: chapter-aware outline of links, plain textarea at
    46rem, explicit Save and Ctrl/Cmd+S, sticky save bar, Edit scene reuses the scene drawer. At 1100px and below the outline
    folds into a disclosure. `useLeaveGuard` asks before a link or page unload drops unsaved prose; Back/Forward too since ADR 0028's amendment.
  - Backup format version 8: a v7 reader would lose every word. ADR 0014.

## Stabilization pass 001 - real-world UX

Not a phase. AI work is not active. Lorex is being used to migrate a real world into it, and what that
turns up is fixed here. Branch `fix/entity-detail-and-relationship-integrity`, off `dev` at `d1f04ca`.
Two issues, both from actual use; the owner's testing log lives outside this repository.

- **UX-001 - the entry page reads as one record.** Hierarchy and routing, no schema, API, Canon, backup or
  search change. ADR 0028's amendment is authoritative.
  - One header: "Lore / Character" as metadata above the title, the Canon control at its far end, then the
    name, aliases and summary. Under it one bar - the entry's views on the left, Edit, Family tree and Move
    to Trash on the right, the Trash one quiet and turning danger-coloured only under the pointer. All of it
    above the article, so all of it is on screen unscrolled at 390px and 1440px however long the entry grows.
  - Three addresses: `/lore/{id}` (Article, the default), `/lore/{id}/relations`, `/lore/{id}/history`. Routed
    links with `aria-current="page"`, not a tablist. Every existing deep link lands where it did. No stored
    "selected view" anywhere - it is in the address and nowhere else.
  - The two histories stay two: the article's own is under the article, on the Article view; History is the
    entry's structured versions and still says so.
  - `useLeaveGuard` already watched every same-origin link, so the views are guarded with no new code: one
    question per departure, the text kept when the author stays. While the article is being written the entry's
    tools step aside, as they always have, so Move to Trash - the one way out that is not a link - cannot be
    taken with unsaved writing behind it.
  - The picture is centred in the article's column, shrink-wrapped by its own border, bounded by
    `max-height: min(22rem, 45vh)`. Only maxima, so a small picture is shown at its own size. Space is still
    reserved before it loads, from the `width`/`height` attributes rather than from a fixed band. No picture,
    no plate.
- **BUG-001 - a relationship is stored once.** The same biological parent link could be recorded twice, once in
  Relations and once from the family tree, and the tree then showed the same child twice. ADR 0008's amendment
  is authoritative.
  - Identity: `UniverseId` + `RelationshipTypeId` + `SourceEntityId` + `TargetEntityId`, by id, never by a
    kind's wording. Canon status, notes and dates describe the one link rather than telling it from another and
    are deliberately out of the key. A symmetric kind's reversed pair is the same link, because it is stored
    once for that reason.
  - Enforced on the relationship routes, creates and edits alike: 409 `relationship_already_exists`, carrying
    the id of the link already there. That is every way one is created - Relations, the family tree's Add family
    connection, and a hand-written request. Both forms already showed a refusal's own words, so the frontend
    needed no change.
  - **No unique index, deliberately.** Databases written before the rule hold duplicates their authors wrote,
    and the only way to make an index fit them is to delete those rows. Restore is the same argument: a v1-v14
    backup may carry duplicates the importer accepted, and it still restores exactly as it did, because a
    restore writes rows rather than posting to the route. The cost, bounded and stated: two creates racing each
    other can both read no duplicate and both write, on a database SQLite gives one writer.
  - Nothing is cleaned up. No migration, no backup version bump - this adds no authored field. A stored
    duplicate is still listed, editable and removable, by its author. The family tree collapses links that say
    the same thing while deriving, so it draws one line and lists one child; that is a read and deletes nothing.

## Stabilization pass 002 - authored text direction

Branch `fix/user-text-directionality`, off `dev` at `13dd9a9`. Presentation only: no API, schema, backup, search or
route change. Found in Pass 001's visual check: the entry title declared no direction, so an Arabic or Hebrew title was
laid out left to right - worst when mixed with Latin, numbers or brackets: "آكرون — 12 / Wright" drew its number at the
far end. The same gap was on every title older than universe search.

- **The rule:** whatever an author titled or named is isolated in a `<bdi>` inside the element that lays it out. It reads
  in its own direction while the header, card or row keeps Lorex's left-to-right layout, so an RTL title sits exactly
  where any title sits. `dir="auto"` on the element itself only where a `<bdi>` cannot do it: title and name fields, and
  an element that cuts its text with an ellipsis, so that its end is what is cut. `NameList` isolates each alias of
  "also known as …" - left alone, two RTL aliases ran together and swapped places.
- Applied to entries (header, card, history, relations, pickers), universes, stories, chapters, scenes, arcs, beats, lore
  and plot chips, the manuscript's title and outline, moments and their cast, entry types, relation kinds and event kinds,
  the Trash, ideas and Canon subjects. The earlier `dir="auto"` on World Rules, family tree names, event kinds and the
  restore preview gave the whole box the direction, which pushed an RTL name to its far side; they isolate the same way
  now. Search results keep theirs: their titles are line-clamped.
- **Seen and not changed:** summaries, descriptions, the article, the manuscript and lines built as one string - all
  fixed in Pass 003 below. Still open: `confirm()` prompts, native `<select>` options and token chips.
- `text-direction.spec.ts`: five tests, each failing on the code before the fix.

## Stabilization pass 003 - authored prose direction

Branch `fix/authored-prose-directionality`, off `dev` at `7186fa5`. Presentation only: no API, schema, backup, search,
route or stored-text change. Pass 002's owed task: prose inherited Lorex's left to right, so an Arabic summary's full stop
sat on the wrong side and "آكرون — 12 / Wright قال: نعم!" threw its number to the far end.

- **Prose is laid out paragraph by paragraph:** `unicode-bidi: plaintext`, one rule in `styles.css`, on every
  `textarea`, on `.prose`, and on the article's paragraphs and headings (editor, read view, history, recovery - all one
  ProseMirror surface). Each paragraph takes the direction of its own first letter and aligns to that side; nothing of
  Lorex's moves. `dir="auto"` was measured first and rejected: it decides once, from the first paragraph, so an Arabic
  paragraph after an English one still read left to right. On a textarea the two are the same thing - the UA gives
  `textarea[dir=auto]` exactly this rule. The TipTap schema, extensions and stored JSON are untouched.
- `.prose` marks summaries, premises, descriptions, notes, excerpts, fact values, and the manuscript and idea previews.
- **Sentences of Lorex's that name something** isolate the name, as Pass 002 isolates titles: `ContainerName` ("Chapter 1 —
  <bdi>…</bdi>", the manuscript's where-line, its outline, the scene picker, Move to…), `Quoted` beside `NameList`
  ("Ideas in “…”", the Ideas lede and notices, the Trash's rows and outcomes, the World Rules notice, a term's rename
  label), a relation kind's reading and a moment's validation line - which had wrapped the whole sentence in `dir="auto"`.
  Visually hidden announcements are left as strings.
- **Limits seen after the fix:** a list's bullet and a quote's rule stay on Lorex's left while an RTL item or quote is
  right-aligned - CSS cannot turn the block without knowing the text's direction, and a stored direction was out of scope.
  An empty paragraph starts left to right until its first letter is typed. The server's idea and rule excerpts join
  paragraphs into one, so the first letter decides a mixed excerpt.
- `text-direction.spec.ts`: five more tests - summary, article written and read, lists and quotes, the manuscript, a
  composed sentence, and prose on a phone - each failing on the code before the fix.

## Design refactor

Owner-sequenced visual redesign in seven tasks. Presentation only throughout: no route, API, schema, backup, search or
Canon change; the Lore list gains query parameters in 003 and nothing else touches a URL.

- **001 - Audit and direction** (`design/visual-system-audit` off `dev` at `379bd8b`, committed, not merged, not
  pushed). 31 screens of the running app at 1440, 1024, 820 and 390, light and dark, on a seeded world. The contract is
  `docs/design/LOREX_VISUAL_REFACTOR.md`: problems measured in the live app, principles, tokens with checked contrast,
  components (and those rejected), cards, actions, responsive and accessibility rules, before/after, and the plan.
  Documentation only; no runtime code changed, so no suite was run.
- **002 - App shell and shared foundation** (`refactor/app-shell-shared-components` off `dev` at `0da0faf`, committed,
  not merged, not pushed). Presentation only: no route, API, schema, backup, search, Canon or auth change.
  - Tokens: the contract's section 9.3 sheet in `styles.css` - three surfaces rising lighter in both schemes
    (`--raised` new), `--border-control` (3:1) on every control edge, washes, shadows, 6/10px radii, type and space
    scales, control heights, motion, layers, `--gutter` per width. Dark primary is `#d6d0c5`, not the ink.
  - Shell: sidebar grouped by spacing (front page, world, writing, upkeep, settings), a Lucide icon per section,
    current = accent wash + universe-accent bar + `aria-current`, inside `<nav aria-label="Universe sections">`; 13.5rem
    below 1280px; the phone sheet reads down two columns, groups whole, 44px rows. The universe name is no longer an
    `h1`: every screen's title is. Sections live in `src/universes/sections.ts`.
  - `SkipLink` once above the routes, landing on each layout's `main`. `ActionMenu` (AccountMenu now built on it),
    `PageHeader` (Stories, Timeline, World Rules, Ideas, Family Tree, Canon, Trash, Types, Settings, Overview),
    `StatusBadge` (cards, relations, moments, family nodes, stories), `EmptyState` (Stories, World Rules, Trash).
    Button family and `.iconbutton`; boxed fields; `.segmented` as a track; `.views` shared by entry and story;
    `.listrow`, `.callout`, `.actionbar`, `.skeleton`, `.cardgrid` defined for 003-006.
  - Overview is a contents page of doorways, no counts, no feed; "Your lore will appear here." is gone.
  - Owner decisions (contract section 18): phone type control "Type ▾"; Overview without counts; soft corners;
    labelled thumb-reachable create. Scratch seed and capture scripts were not committed: a durable visual seed
    helper was judged not worth its upkeep yet.
- **003 - Lore browsing** (`refactor/lore-browsing` off `dev` at `22e2128`, committed, not merged, not pushed).
  Presentation and client routing only: no API, schema, backup or search change.
  - The address holds where Lore is: `lore?type=<id>&status=&q=&page=`. Type and page push, filter and status
    replace; an unknown type id is All. Back from an entry lands on its type; the entry's type crumb links there;
    `lore/new?type=<id>` starts a new entry in that type.
  - `TypeSwitcher` replaces `TypeFilterBar`: links with `aria-current`, one scrolling row from 641px, a labelled
    "Type" `ActionMenu` on a phone. The `h1` is the type's name under a "Lore" crumb; create reads "New {type}".
  - `EntityCard` rebuilt on `EntityTile` and `StatusBadge`: 88px square (64 on a phone), the type's icon on its tint
    when there is no picture, name, aliases, type, status, two lines of summary; no stripe, no tags. Skeletons after
    300ms, a danger callout with Try again, and two empty states (nothing in this type / nothing matches).
  - Two search boxes explained: the shell's universe search jumps anywhere; Lore's own field narrows this list. It is
    now "Filter entries" with a filter icon, in one row with a status `.segmented`; on a phone both fold behind
    "Filters". Create sits at the bottom edge on a phone. First card: 437 -> 307px at 1440, ~713 -> 260px at 390.
  - Also fixed: on a phone the sticky bar stretched to fill a short page.
- **004 - Entity experience** (`refactor/entity-experience` off `dev` at `665892a`, committed, not merged, not pushed).
  Presentation only: no API, schema, backup, image, article or relationship change.
  - Header: "Lore / [icon] Type" (the type links to its Lore list by id), the Canon control as a quiet track with
    glyphs, the name at the document size. The bar: views; Edit, Family tree, and ⋯ holding Move to Trash.
  - The picture is the original, placed by its own proportions - beside the article with the facts for portrait and
    square, above it for landscape - and "View full image" opens `ImageViewer`, a native modal dialog showing it
    whole (Escape, Close, surround, Tab kept inside, focus returned). Cards keep the thumbnail.
  - Article: a quiet empty panel with Write the article; lists no longer a blank line apart. Relations grouped under
    their reading with type tiles, Edit and Remove in each row's ⋯. History without italics, dates in the margin.
  - The form takes the page: sections, and a sticky bar that says whether anything changed, Cancel before Save.
  - Seen, not changed: the entry form has no leave guard of its own - the article editor does, and it still holds.
- **004 follow-up - entry form leave guard** (`fix/entity-edit-unsaved-guard` off `dev` at `e26fe86`, committed, not
  merged, not pushed). The entry form, new and edit, now calls the existing `useLeaveGuard` - no new mechanism, `leaveGuard.ts`
  untouched - so links, Sign out, search results, Back/Forward (`HistoryLeaveGuard`) and reload/close ask while it is
  dirty. Dirty is the form against what is stored (a new entry: against the blank form), compared as the save would send
  it, so a change put back reads clean; a new entry's accepted picture counts, an existing entry's is already written.
  Leaving discards and closes the form; Cancel asks once, only when dirty. Six tests in `entity-page.spec.ts`.
- **005 - Story workspace** (`refactor/story-workspace` off `dev` at `18cd48b`, committed, not merged, not pushed).
  Presentation only: no route, API, schema, backup, Story, Plot or manuscript semantics changed.
  - Every row is one direct verb and ⋯: a scene Write, a chapter Add scene, an arc Add beat, a beat Edit beat; edits,
    moves (only those possible), Move to each chapter and Delete last live in the row's `ActionMenu`, and the focus
    returns to it after a move. Scenes view 59 -> 17 buttons, Plot 47 -> 22.
  - Header on `PageHeader`: the title is the `h1`, the facts its lede, the views and one story ⋯ (Edit, Delete) on one
    line; headings run h1 story, h2 view, h3 chapter or arc, h4 scene or beat. The Stories list opens from anywhere on a row.
  - Manuscript: a one-line header, History beside the scene title, Edit scene and Show in Scenes in ⋯, the planning
    behind "Scene details" on a phone. Prose above Save at 390x844: about 247 -> 433px.
  - Creating sits at the thumb on a phone (New scene, New arc), as Lore's does. `ActionMenu` no longer claims
    `aria-haspopup`: it is a disclosure.
  - Seen, not changed: the five story drawers (story, chapter, scene, arc, beat) have no leave guard; adding one is
    five forms and their tests, so it is a follow-up. Short right-to-left `.prose` paragraphs sit at the right of a
    62ch measure rather than of the column - the shared prose rule, not the story's.
- **005 follow-up - story drawer leave guards** (`fix/story-drawer-unsaved-guards` off `dev` at `a8156bd`, committed, not
  merged, not pushed). The story, chapter, scene, arc and beat drawers call the existing `useLeaveGuard` through
  `lib/drawerGuard.ts` - `leaveGuard.ts` untouched. Dirty is the save payload against the one the drawer opened on (id
  lists as sets), so a change put back is clean. Back, Forward, reload and close ask while dirty; leaving closes the
  drawer. Cancel, Escape and the backdrop ask once to discard. Escape is taken on its key press: Chrome refused a second
  prevented `cancel` in a row and closed the dialog under a form still held and guarded. The drawers are modal, so the
  sidebar and views cannot be reached while one is open, and one editor cannot replace another.
- **006 - Worldbuilding workspaces** (`refactor/worldbuilding-workspaces` off `dev` at `4b44269`, committed, not
  merged, not pushed). Presentation, plus two leave guards: no route, API, schema, backup, chronology, family, Canon or
  Trash semantics changed.
  - Timeline: a moment's title opens its drawer; one quiet ⋯ (Edit moment, Delete moment) that no longer hides until
    hovered; the kind word only where no date line says it; an era named where its years begin; the year never broken
    on a phone. One word throughout: "New moment", "Create moment", and "moments" on Settings' era counts.
  - The moment drawer now asks before a draft goes (`useDrawerGuard`); `FamilyLinkForm` asks too, and a tree node or the
    picker opening another family goes through `confirmLeaving`. The idea and rule editors were already guarded.
  - Ideas and World Rules: Delete moved from beside Save to a ⋯ beside the title; rows open from anywhere (`.rowlink`).
  - Family Tree: `EntityTile` thumbnails; the focal status a `StatusBadge`; the relation before the type on a card; the
    generation names pinned while a wide tree scrolls; on a phone the generations stack with no lines, the focus first,
    nothing clipped and nothing sideways; the circle a warning callout rather than an error.
  - Canon's empty state claims only that the checks have nothing open; Trash's lede is two lines and Restore has an icon.
  - Seen, not changed: Settings' era editor (out of scope) has no leave guard; short right-to-left excerpts sit at the
    right of a 70ch measure (the shared `.prose` limitation); Trash's type dots are unexplained - 007.
- **007 - Product-wide polish and consistency** (`refactor/product-wide-polish` off `dev` at `9237246`, committed, not
  merged, not pushed). Presentation, plus three leave guards: no route, API, schema, backup, search or Canon change.
  - Guards: Settings' era editor, a universe's details (Settings and New universe) and the relation form now call the
    existing `useLeaveGuard` (Cancel/Discard ask once, put-back reads clean, a failed save keeps draft and question).
    Settings no longer opens with the focus in the universe's name. No known silent authored-draft loss remains.
  - Buttons: `.button--quiet` retired - 77 callers to `.button--secondary`, row tools to `--secondary`/`--text` with
    `.button--sm`; every button is 44px under a finger; dead `button--icon` class dropped. `.kinds` (ink-filled
    squares) replaced by `.segmented`.
  - Shared language: scene lore, beats and the timeline cast share one `.lorechip` (type icon in the type's ink); a
    scene's point of view is an `EntityTile`, and `EntityPortrait` is deleted. Trash rows show a type or kind tile
    (decorative) with the kind as a word in the facts; the unexplained dots are gone. Every left-stripe message panel
    (form errors, conflicts, recovery, cautions, Canon refusal, rule check, Canon's rule note) is the callout shape.
    Uppercase letter-spaced labels and chrome italics retired (search panel and picker group headings kept). Idea and
    rule titles are `.field__input--title`. Drawers on tokens. Twelve inline empty/not-found blocks now `EmptyState`.
  - Headings: Timeline, Family Tree, Types and Canon no longer skip from h1 to h3.
  - Right-to-left: `.prose` is `width: fit-content`, so a short RTL summary sits under its title, not mid-page.
  - `styles.css` 8,565 -> 8,402 lines; the contract is closed as built (section 19).
- **The original design refactor 001-007 is complete.**
- `design/` is not a type `branching.md` lists; 001 used it because the owner named the branch. 002 uses `refactor/`.

## Public portal

A public, read-only discovery experience beside the workspace, in the same application. ADR 0036 is authoritative;
`docs/public-portal/PUBLIC_PORTAL.md` is the working reference.

- **008 - Publication foundation** - done: `959fe07` + `6cf5101`, merged into `dev` at `2b74f26`; Deploy DEV #48 green.
  - Every universe private by default - the migration `AddUniversePublication` publishes nothing and copies nothing.
    `POST .../publish` refuses until summary, category, a genre, artwork and the owner's public name exist, mints the
    slug once and sets `publishedAt` once; `.../unpublish` is immediate. While public nothing required can be removed.
  - Public details: a public summary (never the description), one category (8), one to three genres (12, flags).
    Author: `PublicDisplayName` on the account, set on the Profile, read live.
  - Artwork: `UniverseArtworks`, original plus a 16:10 card (960 wide) cut by the shared upload gate; only the card is
    public, only while public, `no-cache` + ETag.
  - Anonymous API `/api/public/universes` (list, `/{slug}`, card): one predicate, an eight-member allow-list, private
    and missing alike 404. Nothing inside a universe is readable.
  - Web: Settings' Public portal section (guarded details form, artwork, checklist, inline confirmations); public name
    on the Profile; `/explore` and `/worlds/:slug` under `PublicLayout`, outside the guards and the workspace chrome;
    "Explore worlds" in the universes header. The leave guard now asks one question when several forms are dirty.
  - Backup format **15**: public details and artwork, never visibility, slug, date or author. Restores are private.
  - Minor 007 polish (drawer button order, repeated Moment label, Settings danger styling, 200% zoom, loading/error
    states) is held for 012.
  - Archived public universes stay public: the public predicate ignores archive state. An owner question for later;
    009 follows the predicate exactly.
- **009 - Explore Worlds portal** - done: `e47c1c7` + `c789b3a`, merged into `dev` at `72c50eb`; Deploy DEV #49 green.
  `PUBLIC_PORTAL.md` sections 12-14. The public list filters (`category`, `genre`, `q`, `sort`) inside the one predicate;
  `/explore` in the owner's portal layout; `/` opens Explore; Log in and Create account return to the public page they
  were chosen on (`auth/returnPath.ts`). Debt for 012: the 2.37 MB hero PNG (a derivative needs the owner's approval),
  and "Show more" pages not in the address.
- **010 - Content publishing controls** - done: `e77393f`, merged into `dev` at `33b191c`; Deploy DEV #50 green. Entries
  and stories are published one by one (`ContentVisibility`, `PublicSlug`, `PublishedAt`); public only while selected, out
  of the Trash and in a public universe (`PublicLore` / `PublicStories`); owner routes `.../publish|unpublish`; anonymous
  listings `/lore`, `/stories` and the entry's thumbnail. ADR 0036 amended; `PUBLIC_PORTAL.md` section 15.
- **011 - Public universe experience** - done: `ed3c6f9`, merged into `dev` at `181941c`; Deploy DEV #51 green. ADR 0036
  amended, ADR 0037 new; `PUBLIC_PORTAL.md` section 16.
  - Pages under `PublicLayout`: `/worlds/:slug` (hero from the public card - crisp at its own size, blurred behind - with
    category, name, author link, genres, summary; published lore and stories, Show more; empty state), an entry's page
    (type, name, lead, square, article), a story's landing page (title, public summary, author, date, its world), and
    `/authors/:slug`. One not-found page for every hidden thing; load failures say so with Try again.
  - API: `GET .../lore/{loreSlug}` (`PublicLoreDetail` = listing + reader `article`: non-absolute links unwrapped, `h1`
    demoted), `GET .../stories/{storySlug}` (`PublicStory`), `/api/public/authors/{slug}` and its avatar,
    `?author=` on the universe list, `authorSlug` on `PublicUniverse` (nine members).
  - Story `PublicSummary` (300): saved on `PUT .../stories/{id}/publication` from a guarded drawer in the publication
    panel; required to publish, not removable while selected, never from the premise. `PublicStories` requires it, so a
    010 story selected without one stays selected and hidden, and says why.
  - Author identity (ADR 0037): `AspNetUsers.PublicAuthorSlug`, minted at first publication from the public name
    (`author` fallback), kept for good; `PublicAuthorBackfill` mints it at startup for accounts public before 011; the
    universe predicate requires it. Resolves only with a public universe. Photo: `ProfileImages.IsPublic`, off by default,
    off again on replace, only the 320 square served; the Profile gets "Author page" with the toggle. `/app/profile`
    stays the workspace.
  - Owner bridge: `GET /api/universes/by-address/{slug}?lore=&story=`, owner-only; "Edit this world" and "Edit in
    workspace" for the owner alone. Explore cards: the name stretched over the card, the author a second link.
  - Front door: manifest `start_url` `/explore` (`id` stays `/app`). Migration `AddPublicReading`; backup format 16.
  - Not built: owner preview of a private universe. Public story prose: built in 015 (ADR 0039).

- **012 - Final polish and hardening** (`feat/final-product-polish` off `dev` at `181941c`, committed, not merged, not
  pushed). ADR 0038 new; `PUBLIC_PORTAL.md` section 19. No migration, no backup change.
  - SEO: the API writes each public page's head into the shell (title, description from public text only, robots,
    canonical, Open Graph, `twitter:card`); hidden/missing public addresses are a noindex 404; workspace and sign-in
    `noindex,nofollow`; Explore's search states `noindex,follow`, canonical `/explore`; `/` redirects to `/explore`.
    `/robots.txt` and `/sitemap.xml` from the public predicates, per request. Origin from `PublicSite:Origin` +
    `AllowIndexing` (default off - DEV is shut out), never `Host`. Body still client-rendered.
  - Trash: `TrashItem.publication` (None/Hidden/Visible); restoring a selected entry or story asks first - Restore and
    publish / Restore as private / Cancel - with copy true to the universe's visibility.
  - Archive of a public universe asks ("It stays public", Make it private first); archived + public says "Still public."
    Archive and publication stay separate by policy.
  - One action order (primary first) now also in the entry form and article bars; new-item drawers lose the repeated
    "A new …" eyebrow; Settings' delete is a ruled danger panel, confirmations take and return focus; network failures
    in words; zone-less API timestamps read as UTC on the client.
  - Explore hero delivered as WebP 250,016 bytes (PNG 2,370,934 kept untouched as fallback).
  - Service worker unchanged: it already refuses `/api`, navigations, non-`GET` and cross-origin.
  - Open, not blocking: "Show more" pages not in the address; public hero sharpness bounded by the 960 card; no owner
    preview of a private universe; account-wide search.

## Baseline

- **1200 API integration tests, 309 Playwright tests** (020 correction: seeding moved out of the read, Family Tree off Edit -
  +5 API (creation seeds; a deleted starter and every type deleted stay gone; Family Tree kept through an edit, true and
  false), -1 (the empty-universe reseed test), +1 Playwright (every type deleted); API **1200/1200**; affected specs 60/61,
  the one loss `canon.spec.ts` review screen timing out on an untouched Relations step, green 3/3 alone; no second full run.
  020: +11 `TypeManagementTests`, +8 `BulkTrashTests`, +1 gate test
  (a bulk move resolves its conflict); +9 in `types-and-trash.spec.ts`; `type-filter`, `family-tree-semantics`, `canon` and
  `lore` specs moved to the Types editor, the wrapped types row and the new dialog ids; two API wording pins moved to the new
  refusal. API **1196/1196**. Full Playwright on a fresh database, two workers, retries 0, one run: **308/308**, 14.3 min.
  Release build clean apart from the existing CA1859, no pending model changes.) Before it, 1176 / 299 (019: +19 in `MassCreateTests`, +1 in `CanonPromotionGateTests`
  (a batch beside a High conflict); +12 in `mass-create.spec.ts`, pasting through the real clipboard. API **1176/1176**. Full
  Playwright on a fresh database, two workers, retries 0, one run: **299/299**, 14.8 min; a two-line hardening edit landed
  during it (a send guard, a 400 fallback message), so `mass-create.spec.ts` was rerun alone after it, 12/12. Release build
  clean apart from the existing CA1859, no pending model changes.) Before it, 1156 / 287 (018: +6 API in `TimelineChronologyTests` - unbounded period years,
  rename, reorder, turn-around, year 0 worded - plus in-use wording/code pins; +4 in `chronology-date-periods.spec.ts`; era
  wording pins moved to date periods. API **1156/1156**. Full Playwright on a fresh database, two workers, retries 0, one run:
  **286/287**, 14.3 min - `timeline.spec.ts` "an edit moves a moment…" met "Lorex could not be reached" on its listing fetch
  (API/dev-server contention; plain years, no period code), green 3/3 alone; no second full run. Release build clean apart
  from the existing CA1859 in `StoryContentPublicationTests.cs`, no pending model changes.) Before it, 1150 / 283 (017: +7 in `editing-flow.spec.ts`, idea specs moved to create -> list,
  one announcer pin moved to the save status; no API change, API suite not rerun. Full Playwright on a fresh database, two
  workers, retries 0: runs 1-3 each lost one or two tests to Vite failing to serve a lazy page ("Failed to fetch dynamically
  imported module" - `IdeaPage.tsx` once, `TimelinePage.tsx` three times), each green 3/3 alone; run 4 **283/283**, 14.1 min.)
  Before it, 1150 / 275 (016: +13 API - 12 `FamilyTreeTypeSemanticsTests`, 1
  `EntityTypeFamilyTreeMigrationTests` - and +7 in `family-tree-semantics.spec.ts`; format pins 17 -> 18; specs moved to the Types
  tabs and the New type dialog. API **1150/1150**. Full Playwright on a fresh database, two workers, retries 0: run 1 273/275 -
  two `restore.spec.ts` format pins, fixed; run 2 274/275 - `rule-validation.spec.ts` met "Lorex could not be reached"
  (dev-server/API contention, green 3/3 alone); run 3 **275/275**, 13.7 min. Release build clean, no pending model changes.)
  Before it, 1137 / 268 (015: +13 API - 6 `StoryContentPublicationTests`, 5
  `UniverseAttributionTests`, 1 `StoryContentPublicationMigrationTests`, 1 version-17 case - and +5 in
  `story-publishing.spec.ts`; format pins moved 16 -> 17, allow-lists gained the attribution and the arc's `visibility`, three
  copy pins updated. API **1137/1137** (run 1 was 1136/1137: `PlotArcEndpointTests` pinned the arc's keys, updated). Full Playwright on a fresh database **268/268** first time, one invocation, two workers, retries 0, 13.1 min.
  Release build clean, no pending model changes. Before it, 1124 / 263 (shell + pagination: +4 in `lore-pagination.spec.ts`; full Playwright
  on a fresh database **263/263**, one invocation, two workers, retries 0, 12.7 min; API **1124/1124**. Three earlier
  complete runs were not green: the first lost `publishing.spec.ts` to its own stale "Lorex portal" wording (updated to
  "LoreX"); the next two lost one test each to the dev server - a blank `/register`, and Vite failing to serve
  `TimelinePage.tsx` in a second tab of a test whose first tab had rendered it - both green 3/3 alone). Before it, 1124 / 259 (layout consistency: +1 in `workspace-settings.spec.ts`; full Playwright
  on a fresh database **259/259** first time, one invocation, two workers, retries 0, 12.1 min; API **1124/1124**). Before it, 1124 / 258 (014 follow-up: +2 in `workspace-settings.spec.ts`; specs moved to
  Chronology's own address; API **1124/1124**; full Playwright on a fresh database **258/258** first time, one invocation, two workers, retries 0, 11.8 min). Before it, 1124 / 256 (014: +8 in `workspace-settings.spec.ts`, +1 in `pwa.spec.ts`; no API
  change; API **1124/1124**, Release build clean, no pending model changes; full Playwright on a fresh database **256/256**, one invocation, two workers, retries 0, 11.1 min. The first complete run was
  253/256, all three caused by 014 and fixed in the tests: two `lore.spec.ts` steps clicked the first link named like
  "Lore" - now the rail's brand, "Lorex - explore worlds" - and are exact now; `explore.spec.ts`'s forged-return test
  expected an unknown same-origin path to fall into `/app`, which now lands on Explore - the property it guards, never
  leaving the origin, is unchanged).
  Before it, 1124 / 247 (013: +7 in `theme.spec.ts`, no API change; API **1124/1124**,
  Release build clean, no pending model changes; full Playwright on a fresh database **247/247**, one invocation, two workers, retries 0, 10.8 min. Four earlier complete
  runs were not green, and are recorded: the first 244/247 - `pwa.spec.ts` and `shell.spec.ts` pinned the old two
  theme-color metas and the account menu without the theme buttons (updated), and `entity-page.spec.ts`'s Back test,
  green 3/3 alone; then three runs of 246/247, each a different test outside 013's code and green 3/3 alone: a
  sign-up whose `/register` never showed its form, Vite failing to serve `TimelinePage.tsx`
  ("Failed to fetch dynamically imported module"), and a world-rule conflict reload - the dev-server contention
  recorded below). Before it, 1124 / 240 (012: +13 API in `SeoTests`, +11 in `final-polish.spec.ts`;
  API **1124/1124**, Release build clean, no pending model changes; full Playwright on a fresh database
  **240/240**, one invocation, two workers, retries 0, 10.4 min. The first full run was 239/240:
  `entity-page.spec.ts` still pinned 004's Cancel-before-Save order, which 012 deliberately changed; updated, then the
  complete rerun above). Before it, 1111 API, 229 Playwright (Public reading 011: +18 API - 7 `PublicReadingTests`, 8
  `PublicAuthorTests`, 1 `PublicReadingMigrationTests`, 1 story-summary backup test, 1 version-16 case - and +7 in
  `public-reading.spec.ts`; 010's and 008's tests updated for the story summary rule, `authorSlug` and format 16). 011:
  API **1111/1111**, Release build clean, no pending model changes; full Playwright on a fresh database **229/229**, one
  invocation, two workers, retries 0, 10.2 min. The first full run was 226/229: two `restore.spec.ts` tests still pinned
  format 15 (fixed to 16), and one `manuscript.spec.ts` measure test lost to load, green alone. Before it, 010: 1093 API,
  222 Playwright (+16 API - 13 in
  `ContentPublicationTests`, 2 in `ContentPublicationBackupTests`, 1 in `ContentPublicationMigrationTests` - and +5 in
  `content-publishing.spec.ts`). 010: API **1093/1093**, Release build clean, no pending model changes; full Playwright on
  a fresh database **222/222**, one invocation, two workers, retries 0, 9.8 min. An earlier full run the same way was
  221/222: `story-drawers.spec.ts` met a blank `/register` (a dev-server module that never arrived - the known host
  flake, in a spec 010 does not touch), green alone, then the complete rerun above. Before it, 009: 1077 API, 217
  Playwright (+24 API in `PublicExploreQueryTests`, +13 in `explore.spec.ts`); 009 follow-up full run **217/217**, one
  invocation, two workers, retries 0, 9.6 min. 009:
  **212/212** the same way. Before it, 008: +54 API, +4 Playwright, API 1053/1053 twice. Playwright for 008: full run on a fresh database **204/204**, one invocation, two workers, retries 0. An
  earlier run at the default eight workers lost six tests to host and dev-server resource pressure (blank pages, Vite
  failing to serve a module) in specs 008 does not touch; not a regression. Design refactor 007's full run on a fresh database:
  **200/200** first time (196 plus `polish.spec.ts`'s four). 006's runs lost one test each to known infrastructure (a
  `/register` timeout, Vite `ERR_CONNECTION_REFUSED`) before 196/196; 005's drawer guards lost two to Vite cold dynamic
  imports before passing. No backend change since, so the API suite and Release build were not rerun.
  Earlier phases' runs had the same shape: a rotating one to four specs lost in parallel, each green alone - the
  contention below, not the feature. No frontend unit runner exists; the web checks are `typecheck`, `lint`,
  `format:check` and `build`. The E2E
  project has no format script of its own - its specs are held to the `src/Lorex.Web` Prettier settings, and
  Prettier has to be pointed at that config explicitly. CI runs all of it.
- The test host no longer migrates itself, so every API test boots through the same startup path a
  deployment uses.
- **The SQLite contention is the database, not the worker count** (measured on `chore/overnight-maintenance`,
  16 logical processors, so eight browsers). Against a database the suite builds for itself, all 155 passed three runs
  out of three with nothing logged about a locked database. Against a copy of the long-lived development one, two runs
  out of two lost tests and logged `SQLite Error 5`, and running the same suite at four workers logged it just as
  often - two more tests lost, at 1.7x the wall clock. So the worker count is left at Playwright's default and `LOREX_E2E_DB` - new, and the knob that
  actually matters - points a run at a database of its own. `LOREX_E2E_WORKERS` exists for a machine that wants telling.
  Numbers: `tests/Lorex.E2E/README.md`.
  - The mechanism, from the API log: a write's commit throws `database is locked` at once rather than after the
    provider's retry, and is answered as a 500. Once, the throw came from `SqliteConnection.Deactivate()` as the
    connection went back to the pool, and every later rent of that handle then failed to open with `unable to
    delete/modify collation sequence due to active statements` - one lock poisoning a pooled connection. Known, not
    fixed: fixing it is a persistence decision, which is Phase 023's.
  - It is **no longer reported as a false 409**. An endpoint that translated every `DbUpdateException` into its own
    refusal now translates only the constraint it was written for - `Data/DatabaseFailures.cs` - so a locked database
    fails as a failure instead of telling the author a free name is taken.
- Under a full parallel Playwright run, `auth.spec.ts` "rejects a wrong password" intermittently
  times out (it navigates to `/login` without awaiting sign-out).
- 39 migrations, latest `AddUniverseInvitations` (030) - one additive table, `DROP TABLE` rollback;
  `UniverseInvitationMigrationTests`. Before it, `AddUniverseMemberships` (029) - one additive table, nothing copied, `DROP TABLE` rollback;
  `UniverseMembershipMigrationTests` walks it on a file. Before it, `AddEntityTypeHierarchy` (nested types). Before that,
  `AddEntityTypeFamilyTreeEligibility` - one additive column, `EntityTypes.FamilyTreeEligible`
  (false), then on for the untouched starter Character only; native `DROP COLUMN` rollback;
  `EntityTypeFamilyTreeMigrationTests` walks it on a file. Before it, `AddStoryContentPublication` - additive: `Scenes.Visibility`, `Scenes.ManuscriptVisibility`,
  `PlotArcs.Visibility` (0, Private), `Universes.OriginalCreator`/`OriginalWork` (null); nothing public after the upgrade;
  native `DROP COLUMN` rollback; `StoryContentPublicationMigrationTests` walks it on a file. Before it, `AddPublicReading` - additive: `Stories.PublicSummary`, `ProfileImages.IsPublic` (false),
  `AspNetUsers.PublicAuthorSlug` with a unique index; nothing copied or made public; native `DROP COLUMN` rollback;
  `PublicReadingMigrationTests` walks it on a file and through the startup backfill. Before it, `AddContentPublication` -
  additive: three columns each on `Entities` and `Stories`
  (`Visibility` default Private, `PublicSlug`, `PublishedAt`) and a unique `(UniverseId, PublicSlug)` index on each; the
  rollback uses native `DROP COLUMN`. `ContentPublicationMigrationTests` walks it on a file under a public universe. Before
  it, `AddUniversePublication` - additive: six columns on `Universes` (`Visibility` default Private),
  `AspNetUsers.PublicDisplayName`, `UniverseArtworks`, two indexes; the rollback uses native `DROP COLUMN`.
  `UniversePublicationMigrationTests` walks it on a file. Before it, `AddRelationshipFamilySemantics` - one additive column on `RelationshipTypes`, defaulting to no family
  meaning; the rollback uses SQLite's native `DROP COLUMN` so nothing that points at the table is rebuilt under it.
  `FamilySemanticMigrationTests` walks it down and up on a file over kinds called parent, mother and father, and reads every
  trigger and index back. Before it, `AddRuleValidation` - additive: `ValidationTerms`, `WorldRuleValidations`,
  `TimelineEntryValidations`;
  nothing rebuilt. `RuleValidationMigrationTests` walks it down and up on a file and reads every trigger back. Before it,
  `AddWorldRules` - additive: `WorldRules`, its FTS5 index and three triggers; no existing table rebuilt.
  `WorldRuleMigrationTests` walks it down and up on a file and reads every search trigger back. Before it, `AddUniverseSearchIndex` - raw SQL: three FTS5 tables filled from existing rows, 21 triggers, and the
  lore index rows holding a marker character removed for the backfill; the snapshot gains two keyless match types.
  `UniverseSearchMigrationTests` walks it down and up on a file and reads every trigger back. Before it, `AddIdeas` - additive:
  `Ideas` and five reference tables; `IdeaMigrationTests` walks it down and up and deletes a universe row under it. Before that, `AddContentRecovery` - `DeletedAt` on five story tables, their order indexes
  recreated partial on live rows, and `SceneManuscriptRevisions` with each manuscript as its version 1. Its rollback drops the columns with
  SQLite's native `DROP COLUMN`, as `AddEntityArticles` did for `Entities.Content` (EF Core's table rebuild loses what it
  cannot see, such as the FTS delete trigger), and discards the Trash, what is in it and every manuscript's history.
  `ContentRecoveryMigrationTests` walks it down and up over stories on a file; `EntityArticleMigrationTests` still walks
  the articles move.
  Every migration since `AddUniverseChronology` has a `*MigrationTests` walk on a file. `has-pending-model-changes` reports
  none. `AddEntitySearchIndex` is raw SQL - an FTS5 table and its trigger - invisible to the pending check either way.
- No automated test reaches Cloudflare and none can: the API host registers an in-process object
  store, Playwright runs against `Media:Provider=InMemory`, and the R2 adapter tests answer the SDK
  from an in-process HTTP handler. That covers profile photos too - they use the same store.
- Ten rules in `src/Lorex.Api/Features/CanonIntegrity/Rules/`: three structural (Medium), three
  chronological (High), which compare across named eras, two relationship constraints (Medium), one world rule check
  (Medium) and one family circle (Medium). Behaviour: ADR 0010, 0011, 0012, 0022, 0023, 0034, 0035.

## Remote

`origin` = https://github.com/luisfpires18/lorex.git (private). `dev` tracks `origin/dev` and is
the GitHub default branch. `master` is reconciled and published; `dev` -> `master` merges happen
only when the owner asks.

## Tooling trial

Four tasks measured; the agreed number is complete and **the verdict is owed** - see Deferred.
RTK and Graphify judged independently. Nothing since Phase 022 was a trial task, and neither
tool has changed the picture.

- RTK: `rtk gain` 18.9%, drifting slightly down. The pattern is unchanged and now well evidenced:
  almost every command is compound, piped or a heredoc, which the wrapper bypasses by design, so
  only `git status`, `git diff` and a handful of `rtk grep` calls ever reach the filter. The one
  category that filters well - a passing `dotnet build`, 87% - is also the one whose output was
  never worth much. Correctness record still clean; no `rtk proxy` rerun has been needed, ever.
- Graphify: unused again. Targeted `Grep` and `Read` over `SYSTEMS.md`-named files answered every
  question, including for a feature that touched nine new files across two features.

## Deferred / owner decisions

- **Phase 023 - Production Hardening / PostgreSQL.** Deferred, not scheduled. It owns the
  production key store, a real database and backup story, and the search rewrite SQLite-only
  FTS5 forces (ADR 0016). ADR 0018 lists what the DEV topology deliberately does not solve.
- **Azure DEV and R2 are owner-created and live** - live DEV testing is what found the R2 upload
  bug. Nothing in this repository creates or changes either. Steps:
  `docs/deployment/azure-dev.md`, `docs/deployment/cloudflare-r2.md`.
- **Full security audit.** Relationships, timeline and Canon Integrity each had a focused check
  backed by tests. Outstanding: rate limiting, header/cookie hardening, dependency review, auth.
- **Date period tooling** (eras in code). Cross-period order is solved only for a universe with date periods;
  free-text year labels on plain years still order nothing and still stand the rules down. Years written
  before periods are given one entry by entry - no bulk assignment - and removing a period needs its
  dates moved first, with no reassignment tool. Finite period ranges, month names, calendars and conversion:
  not started. ADR 0022 (amended 018).
- **`Age`** is declarable but read by nothing until a structured reference year exists. ADR 0011.
- **Story work deferred past Phase 2** - later work, not Phase 2 gaps: acts and volumes, rich text, saved versions of
  anything in a story but its manuscript, drag-and-drop, collaboration, manuscript export, and AI. Also: collapsing chapters, bulk scene moves, Story-vs-Lore checks, pre-era scene years in Settings; a plot
  status, beat chronology, editing beats from a scene, board or graph views; autosave, word counts, a "has prose" marker on
  scene cards (it needs a flag the story read can give without reading prose). ADR 0024-0027, 0029.
- **Lore article work deferred** - later, not gaps: plain text or Markdown, wiki links and backlinks, version diffs and
  pruning, restoring article text held in pre-ADR-0028 entry versions from the screen, autosave, word counts. ADR 0028.
- **Unified Timeline deferred (038)** - not gaps: custom calendars and month names, a "show on timeline" option and wording
  for custom (Gregorian) Date fields, dates on plot arcs, beats or manuscripts, births and deaths on a story's timeline (no
  explicit relation yet; Story Bible later), a public timeline, the participant filter in the address.
- **Ideas deferred** - not gaps: promoting an idea (AI proposals are Phase 5), statuses, tags, collections, rich text, wiki
  links, saved versions, cross-universe references, permanent delete, an account export for unassigned ideas. ADR 0030.
- **Universe search deferred** - not gaps: **account-wide search is an unsettled owner decision**; unassigned ideas in any bar;
  AI, semantic or fuzzy search, substring matching; a command palette, results page, filters, saved searches, history; timeline,
  Canon, types and Trash search; highlighting the match inside an opened article or manuscript; a pinned bar. ADR 0031.
- **Backup restore deferred** - not gaps: restoring over or merging into a universe, partial/selective restore, account-wide
  backup, scheduled/cloud backups, encryption, import from other tools, repair by hand or AI, a background job or resumable
  upload. ADR 0032.
- **World Rules deferred** - later: the node/tree rule builder (owner idea, undecided), an enabled state if checks prove they need
  one. Not planned: reading rule prose for meaning, a DSL, AI over rules, priorities/categories/tags, saved versions, permanent
  delete. ADR 0033.
- **Timeline rule validation deferred** - not gaps: any second pattern, conditions/operators/AND-OR, actions, priorities, rule
  dependencies, simulation; a Canon diagnostic category for "cannot check"; term descriptions, hierarchies, merging, scoping a
  method to an event kind, bulk-assigning moment details; stale-save protection for moments; restore-preview counts for terms and
  checks. A check is only as complete as the details authors record, and says so. ADR 0034.
- **Content recovery deferred** - not gaps: recovered drafts for forms, drafts synced across browsers or devices, merging a
  draft into a newer save, a restored chapter taking back the scenes it held. ADR 0029.
- **Relationship life-state constraints** (an end alive at the link's date) wait for dated
  relationships: `StartDate`/`EndDate` are real-world timestamps, not chronology points. A birth-year
  gap across eras of unrecorded length waits for era lengths. ADR 0023.
- **Tooling trial verdict.** `docs/tooling/agent-tooling-trial.md` holds the evidence. Keep /
  conditional / remove is the owner's call, per tool.
- **ImageSharp's licence.** `SixLabors.ImageSharp` is under the Six Labors Split License - free
  for personal use and for organisations under $1M revenue, which is true of Lorex today. Worth
  revisiting if that ever stops being true. ADR 0019.
- **Collaboration, after 030** (ADR 0041) - not gaps: outbound email delivery of invitations (the link and model are
  ready for it), notifications, comment mentions/editing/anchors (comments done in 043), prose suggestions for articles and manuscripts, open-suggestion counts, replies on a suggestion (suggestions done in 045),
  trashed/restored-by and an activity feed (version authors done in 042), version checks for moments, relationships, chapters and plot (044 covers entries, articles, stories, scenes, manuscripts), ownership transfer, public
  collaborator credit; a collaborator's idea pointing into a shared universe; the public page's workspace link for
  members. An Editor restoring a previously public item from the Trash brings back the owner's selection as it was.
- **MCP (049, ADR 0046).** Owner step: set `Mcp__Origin` on DEV and connect Claude or ChatGPT once (runbook). Later, not
  gaps: any write through MCP (issue 32), AI-assisted import (issue 17), pre-registered clients, custom-scheme redirects,
  a LoreX-styled page for the requests OpenIddict refuses before trusting a redirect.
- **Permanent deletion.** Deferred by Phase 019, so nothing removes an entry - or, since content recovery, a story,
  chapter, scene, arc or beat - for good short of deleting the universe. Two dead ends follow: a type used only by trashed
  entries cannot be deleted until the entry is restored, moved to another type and trashed again (ADR 0015), and an era a
  trashed scene is dated in cannot be removed until the scene is restored and re-dated (ADR 0029).

## Blockers

None. Follow-ups, not blocking:

- Search - lore and universe alike - matches whole words and prefixes, so the substring hits `LIKE` used to give are gone -
  ADR 0016 argues the trade. Search is SQLite-only (FTS5 tables and triggers) and will be redesigned when PostgreSQL
  arrives (ADR 0031). A migration that rebuilds a story, manuscript, idea or world rule table must recreate its search
  triggers; `UniverseSearchMigrationTests` and `WorldRuleMigrationTests` fail if one is missing.
- Orphaned media objects are swept best-effort and never retried. A delete that fails after the
  database has committed logs a warning naming the key and leaves the object; the entry is
  correct either way. ADR 0019 argues the trade.
- Ideas with no universe have no file-level backup: a universe backup cannot truthfully hold them and no account export
  exists. The database is their only copy. ADR 0030.
- A very large restore holds SQLite's one writer for its write (~15 s at ~145k rows), so saves in that moment meet the known
  contention. Realistic universes write in well under a second. ADR 0032.
- A backup archive is assembled whole in memory before it is sent, so that a missing image can be
  refused rather than truncated. Bounded by 8 MB per picture; worth revisiting only if a world
  ever holds enough media to matter. ADR 0014.
- Restoring a revision does not put back the picture that version had, and cannot: the objects
  were deleted when it was superseded. History records the change and the screen says so.
  ADR 0013.
- The DEV topology's accepted costs, all in ADR 0018 and the runbook: SQLite lives on an SMB
  share with one writer, a redeploy is a short outage, Data Protection keys are unencrypted at
  rest, there is no automated backup, and a rollback cannot undo a migration. Production needs a
  real key store and a real database story; neither is Phase 022's business.