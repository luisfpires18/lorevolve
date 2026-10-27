# First-alpha security and privacy assessment (issue #33)

The pre-alpha gate before #34. Two passes: an **initial assessment** of the shipped alpha surfaces (this file, part 1),
and a **final targeted regression** after #11 (portability and recovery) and #54 (automated SQLite backups) land
(part 2, below). Third-party import (#17) is post-alpha and out of scope.

Severities are for the intended alpha: a small number of invited creators on the one DEV App Service
(ADR 0018). **Critical** - unauthenticated takeover or bulk private-data exposure. **High** - one account reaches
another's private universe, an account, or a privileged action. **Medium** - abuse, DoS or a privacy gap that needs
an account and does not cross a universe boundary, or a missing defence-in-depth layer. **Low/Info** - hardening.

## Part 1 - Initial assessment (2026-10-26)

### Baseline and method

| Item | Value |
| --- | --- |
| Branch audited | `dev` at `c1721c5`, then `feat/pre-alpha-recovery-security` |
| Earlier input | read-only audit of `dev` at `b149158` (2026-10-23), kept outside the repo; every one of its findings was re-checked against `c1721c5`, not copied |
| Surfaces added since | #40 Admin workspace, #32/#45 MCP write proposals, #59 MCP schema/definition/progression/picture proposals and friendly URLs, #52/#53 maps, private notes (#23), knowledge (#15) |
| Method | targeted code reading of every trust boundary below; route-by-route check that each handler calls `UniverseAccess`; existing behaviour tests run as evidence; dependency advisories (`dotnet list package --vulnerable --include-transitive`, `npm audit`) |
| Not done | anything against DEV (no writes, no live pentest), Azure/R2/provider dashboards - listed under owner checks |

Evidence run on this branch: 464 security-relevant API tests passed (admin, provisioning, MCP OAuth/scope/proposal/
image/alias, AI changes and media, access matrix, collaboration, invitations, restore archive safety, private notes,
maps, uploads, auth, publication, assistant limits, storage quota, headers).

### Findings

| ID | Sev. | Status | Boundary | Finding |
| --- | --- | --- | --- | --- |
| H-1 | **High** | **Fixed** `6a20a90` | Collaboration | Invitation bound to whichever account held the unverified email at invite time |
| M-1 | Medium | Open, owner decision | Uploads | ImageSharp 3.1.12 advisories; one still reachable |
| M-2 | Medium | Open, blocked | Auth | No throttling on login and registration beyond per-account lockout |
| M-3 | Medium | Open | AI cost / storage | Allowances are per account and in memory; open registration multiplies them |
| M-4 | Medium | **Fixed in part** `1cd6c8a` | Browser | No global security headers |
| M-5 | Medium | Open | Sessions | No password change/reset, sign-out-everywhere or account deletion |
| M-6 | Medium | Open | AI disclosure | A Viewer can send an owner's private universe to an AI provider; no in-assistant disclosure or owner switch |
| L-1..L-11 | Low/Info | See table | - | Hardening |

#### H-1 - Invitation binds to an unverified email holder - Fixed

- **Evidence.** On `c1721c5`, `CollaboratorEndpoints.cs` looked up the account whose normalized email matched the invited
  address and stored it as `UniverseInvitation.TargetUserId`; `InvitationEndpoints.cs` listed such invitations at
  `GET /api/invitations` and accepted them by id. Registration verifies no email (`AuthEndpoints.RegisterAsync`). The fix
  had been written on 2026-10-23 (`fix/invitation-link-only`) but never merged.
- **Exploit.** Register `victim@x` first; when the owner invites that address, accept it from My workspace with no link and
  get Viewer..Editor on a private universe. The owner's screen is identical either way. Requires guessing who will be
  invited; no other precondition.
- **Mitigation.** Every invitation is link-only: claim needs the Data-Protection-signed token and a matching email. The
  bound routes and My workspace's Invitations section are gone; migration `DropInvitationTargetUser` drops the column.
- **Regression tests.** `InvitationClaimTests` (account registered before and after the invite gets nothing without the
  link; the owner cannot tell), `UniverseInvitationMigrationTests.Dropping_the_binding_keeps_pending_invitations_and_only_the_link_claims_them`.
- **Residual.** Email is still unverified: whoever holds the link *and* registers the invited address can claim it. The
  link is the secret; owners must send it privately. Low.

#### M-1 - ImageSharp 3.1.12 advisories

- **Evidence.** `dotnet list package --vulnerable`: GHSA-j3p4, -j9gm, -jjfr (High), -gwg2, -wmxv (Moderate); fixed only in
  4.1.2+, whose Release build needs a Six Labors licence key, so `dev` reverted to 3.1.12 by owner decision (STATE.md).
- **Reachability now.** `ImagePreparation.Decoding` registers only the JPEG, PNG and WebP decoders, so the BigTIFF loop
  (-wmxv) cannot be reached, nor can GHSA-v76p (High, tiled fax TIFF heap overflow; listed 2026-10-07, found by the
  2026-10-26 audit; fixed in 3.2.0 / 4.1.1). The three Highs are a histogram-equalization filter and TIFF encoders
  LoreX never calls.
  **-gwg2 (ICC CLUT allocation) is reachable** by any signed-in account uploading a JPEG/PNG/WebP with a crafted ICC
  profile: memory spike, possibly a process restart on the one instance. `SkipMetadata` would avoid ICC parsing but
  also loses the EXIF orientation uploads rely on.
- **Exploitability.** Needs an account (open registration). Availability only; no data crosses a boundary.
- **Mitigation.** Owner decision: obtain the 4.x licence key and upgrade (one line in `Directory.Packages.props`; the
  upgrade was already proven green on `a7f5e99`), or accept for alpha with invite-only registration.
- **Residual if accepted.** Medium, availability.

#### M-2 - No authentication throttling - blocked on a runtime fact

- **Evidence.** The only rate limiter is MCP client registration (`McpSetup.cs`). Login has Identity lockout (5 failures,
  5 minutes, `AuthSetup.cs`); registration has none.
- **Exposure.** Password spraying at one guess per account per lockout window; holding a known account locked out;
  scripted registration (feeds M-3).
- **Why not fixed here.** A per-IP limiter needs the client address, and `ProxyHeaders.cs` deliberately does not honour
  `X-Forwarded-For`, so behind App Service every request may share the front end's address. A limiter partitioned on
  that is one global bucket - an attacker could then lock *everyone* out of sign-in, which is worse than today.
- **Proposed follow-up.** Owner checks what `HttpContext.Connection.RemoteIpAddress` is on DEV; then honour App Service's
  `X-Forwarded-For` (or `X-Client-IP`) from the known front end and add a per-IP fixed window on `/api/auth/*`, plus
  invite-only registration for alpha.
- **Residual.** Medium. Mitigated for alpha by a small invited population and lockout.

#### M-3 - Cost and storage abuse scales with free accounts

- **Evidence.** `AssistantAllowance` is 20 questions / 10 minutes per account, in process memory; storage is 1 GiB per
  account (ADR 0042); AI change media quarantine is 64 MB per account and not counted (ADR 0062). No global daily budget.
- **Mitigation (owner, outside code).** Hard spend limits at the AI provider; keep the assistant off or on Groq's free
  tier; invite-only registration. **Follow-up:** a global daily question budget with a kill switch.
- **Residual.** Medium, cost/availability.

#### M-4 - Missing security headers - fixed in part

- **Before.** Only `/connect` and `/oauth` set `X-Frame-Options`/`frame-ancestors`; only image responses set `nosniff`.
- **Fix.** `Hosting/SecurityHeaders.cs`: every response (success, refusal, miss and the exception handler's 500) carries
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, and
  `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'`; HSTS outside Development.
  `SecurityHeadersTests` covers all four answers.
- **Residual.** No `script-src`: `index.html` carries inline scripts and a style block that need hashes first. Low while
  no XSS sink exists (no `dangerouslySetInnerHTML`/`innerHTML` in the client; link schemes validated on write).

#### M-5 - Session and account lifecycle

- **Evidence.** `AuthEndpoints` has register, login, logout and me only; the cookie is a 7-day sliding persistent session.
  Logout does not rotate the security stamp. (Blocking an account does rotate it - #40 - so an Admin can end a stolen
  session on request.)
- **Follow-up.** Password change that rotates the stamp, sign-out-everywhere, a documented manual account-deletion
  procedure for alpha, a reset flow once email exists.
- **Residual.** Medium.

#### M-6 - Third-party AI disclosure and owner control

- **Evidence.** The assistant needs `Read` only (`AssistantEndpoints.cs`); any member with `Read` may connect an MCP app;
  `UniverseAssistant.tsx` names no provider (Connect to AI does disclose).
- **Exposure.** A collaborator can send the owner's unpublished universe to OpenAI/Groq or any MCP client. Not an
  escalation (they can read it anyway) but an undisclosed processor transfer.
- **Mitigation for alpha.** Tell testers in the invitation which providers receive content (deployment assumption).
  **Follow-up:** in-assistant disclosure naming the provider; per-universe owner switch for Assistant and MCP.
- **Residual.** Medium (privacy).

#### Low / informational

| ID | Finding | Status |
| --- | --- | --- |
| L-1 | Registration says "already registered" for a username or email (login does not) | Open, Low |
| L-2 | Invitation token in the URL path | Mitigated: `Referrer-Policy: same-origin` (M-4); App Service HTTP-log retention is an owner check |
| L-3 | Uploaded originals keep EXIF/GPS for members and backups (public derivatives are stripped) | Open, Low; tell testers |
| L-4 | MCP client registration is one global 30/min bucket; consent shows a self-asserted client name | Accepted for alpha |
| L-5 | Password policy 8 chars, digit + lowercase, no breached-password check | Open, Low |
| L-6 | `/api/public/stats` reveals account and private-universe counts | Owner decision |
| L-7 | Data Protection key ring unencrypted on `/home/data/keys` | Documented DEV limitation (ADR 0018) |
| L-8 | `vite`, `source-map-js` advisories | Dev/CI only; `npm audit --omit=dev` is clean |
| L-9 | Restore staging limits are global, not per account | Open, Low |
| L-10 | Assistant allowance resets on restart | Covered by M-3 |
| L-11 | Production source maps are deployed (`vite.config.ts` `sourcemap: true`) | Info: no secret in the client; owner decision |

### Controls verified (no finding)

- **Universe boundary.** One gate (`UniverseAccess`), no access = 404, too little = 403, role read per request so removal
  and downgrade apply at the next call. `UniverseAccessMatrixTests` fails when a universe route is not classified.
  Maps, knowledge, private notes, comments and AI-change media scope every child id by the route's universe.
- **Private notes.** `PrivateNotes` is the owner's alone; notes are absent from search, revisions, assistant and MCP, and
  present only in the owner's backup.
- **#40 Admin.** `/api/admin/*` requires `PlatformAdmin`, re-read from the database per request; only Members can be
  blocked (no self/last-admin lockout); block rotates the stamp, revokes MCP connections and writes the audit row in one
  transaction; a unique index allows one Admin; responses carry counts and usernames, never content or email.
- **MCP OAuth (#32/#45/#59).** PKCE S256; opaque reference tokens; every call re-checks connection, client, subject,
  universe, block and role; a token for one universe never passes another's address (either spelling); propose needs
  the scope *and* the connection's tick *and* a role that may stage, re-read at each call; schema needs a second tick;
  nothing commits without a person with `EditContent` approving in LoreX; proposal size and count capped.
- **AI change pictures.** Uploaded on the review page by an `EditContent` member, decoded by the upload gate, quarantined
  without FKs, readable by reviewers or the proposer only, swept hourly.
- **Publishing.** Every public query goes through `PublicationRules`; maps have no public route; a trashed chapter holds no
  scene (ADR 0029), so it hides nothing public.
- **Uploads.** 8 MB, 10,000 px sides, 24 MP, one frame, JPEG/PNG/WebP decoders only, derivatives re-encoded without
  metadata, `nosniff`.
- **Restore.** Size, entry-count, path, depth and record bounds; `..`, absolute paths and symlinks refused; staging bound
  to the uploading account.
- **Errors and logs.** Unhandled failures answer RFC 7807 with a trace id and nothing else; no log message carries an
  email, password, token or claim.
- **CSRF.** Session cookie `HttpOnly`, `Secure` (deployed), `SameSite=Strict`; mutations take JSON bodies; the OAuth
  consent decision also requires antiforgery.
- **Secrets.** None in committed configuration; provider, R2 and admin settings are App Service settings.

### Owner / runtime checks (cannot be verified from the repository)

1. App Service: `httpsOnly`, minimum TLS 1.2, FTP and SCM basic-auth publishing off, one instance, HTTP-log retention.
2. `curl -sI https://<host>/` shows the M-4 headers and HSTS.
3. What `RemoteIpAddress` is behind App Service (unblocks M-2).
4. AI provider hard spend limit and data-retention terms; whether the assistant and `Mcp__Origin` are on.
5. Media R2 bucket private (no public bucket, no `r2.dev`), its token scoped to that bucket.
6. `PlatformAdmin__OwnerUserId` set to the owner's id.

### Initial gate verdict

No known Critical. The one High (H-1) is fixed on this branch. Mediums M-1..M-6 are open with the mitigations and
follow-ups above and need the owner's acceptance for alpha. Part 2 re-checks the boundaries #11 and #54 change.

## Part 2 - Final targeted regression after #11 and #54 (2026-10-26)

Scope: the boundaries `526e994`/`6b9b624` (#11 readable export, recovery drill) and `5dfa4f4` (#54 database backups)
changed or connect to, re-attacked rather than re-read: export and restore authorization and isolation, private media,
R2 credentials and permissions, backup object access, retention, restore privilege, failure logs, and the Admin, MCP,
upload and map controls they touch.

### Findings in the new work

| ID | Sev. | Status | Boundary | Finding |
| --- | --- | --- | --- | --- |
| R-1 | Medium | **Fixed** `6b9b624` | Readable export | Date-period and month labels and manuscript prose reached the Markdown unescaped, so a collaborator could plant a `[x](javascript:...)` link or image that a viewer renders when the owner opens their export |
| R-2 | Low | **Fixed** (final regression commit) | Backup host | The snapshot's working folder took the temp folder's default permissions; it holds the whole database (password hashes) for the seconds of a run |
| R-3 | Low | Open, owner step | R2 backups | The backup token must be able to write, and R2 cannot grant write without delete: a leaked token or a compromised process could delete backups |
| R-4 | Low | Open | Backup host | A process killed mid-run leaves its snapshot in the container's temp folder until the container restarts (container-local, owner-only) |
| R-5 | Info | Accepted | Admin | Admin's status shows object keys, sizes and SHA-256s - metadata only, Admin only |

**R-1.** Evidence: `Year`/`Date` appended era and month names raw; `Manuscript` escaped only `<`. Exploit: an Editor names a
date period `Age [z](javascript:alert(5))` or writes link syntax in a scene; the owner downloads the readable export and
opens it in a Markdown viewer that follows links. Needs an Editor and a viewer that allows the scheme. Fix: every date
helper escapes its labels; prose escapes `\ [ ] < >`. Test: `UniverseRecoveryTests.The_readable_export_neutralises_unsafe_links_and_markup_written_into_content`
now plants all three and asserts no page holds an unescaped `javascript:` target or a raw tag. Residual: none known.

**R-2.** Fix: `DatabaseSnapshot.CreatePrivateDirectory` creates the run folder and the drill target 0700 on Unix; on Windows
the user's own temp folder's ACL applies. Test: `DatabaseBackupTests.The_working_folder_is_the_owner_s_alone` (asserts the
mode where the platform has one; CI runs Linux). Residual: Low - App Service's `/tmp` is already container-local.

**R-3.** Mitigation (runbook step 2): an R2 bucket lock on `lorex-db/` for 7 days, shorter than the 30-day window pruning
uses; the token is scoped to the one backup bucket and never shared with media. Residual: Low once the lock exists.

**R-4.** Residual: Low. The next run uses a new folder; a restart clears `/tmp`. A start-up sweep of stale run folders is a
small follow-up if this is ever seen.

### Re-checked, no finding

| Boundary | What was tried | Evidence |
| --- | --- | --- |
| Readable export authorization | Editor, Reviewer, Viewer, stranger, anonymous | `UniverseAccessMatrixTests` (route classified Own: 403 members, 404 stranger); `UniverseRecoveryTests` (401 anonymous) |
| Cross-universe isolation | Export renders one payload built for the route's universe; links resolve inside it | `UniverseBackupBuilder` scoping (existing `A_backup_never_reaches_into_another_universes_media`); readable pages come from the same payload |
| Private notes | Only the owner can download either file; notes appear only there | Same gate as the backup (ADR 0056, 0063) |
| Private media | The readable export writes only originals its live pages show, by key from the snapshot; trashed pictures and thumbnails stay out | `UniverseRecoveryTests` (exactly 4 originals, trashed relic absent) |
| Unsafe article links | `javascript:` stored before validation | Not emitted as a link (`SafeHref`), tested |
| Backup object access | Any route returning backup bytes, a signed URL or a manifest's contents beyond metadata | None exists; `/api/admin/database-backups` is Admin only and returns metadata (`DatabaseBackupTests`: 401 anonymous, 403 member for GET and POST) |
| R2 credentials | Secret in status, logs or errors | Status describes the bucket name only; errors are `status + error code`; tested with a secret value |
| Misconfiguration | Half-set R2 settings, a path-like environment name | A stated problem, no store, no fallback (`An_r2_target_needs_every_setting_and_never_describes_its_secret`) |
| Partial uploads | Corrupted read-back, refused manifest, interrupted run | No manifest, object removed, reason reported (`A_run_that_cannot_verify_its_upload_...`) |
| Overlap | Second run while one runs | Refused (`Runs_never_overlap_...`) |
| Retention | Deleting another environment's or too-recent backups; pruning after a failure | Own prefix only, policy only, never after a failure (`Retention_keeps_...`) |
| Restore privilege | Writing over the live database from the drill; restoring a newer schema | Refused (`The_restore_drill_proves_a_backup_...`, `The_drill_brings_an_older_schema_forward_...`); production restore needs Azure and R2 access, nothing inside LoreX grants it |
| Failure logs | Keys, connection strings or secrets in log messages | Messages carry keys and reasons only; the exception is logged as the provider raised it (no credential in AWS SDK exceptions) |
| CSRF on Run now | Cross-site POST | `SameSite=Strict` session; `azurewebsites.net` is a public suffix, so other sites there are cross-site |
| Security headers | New routes | Global middleware (`SecurityHeadersTests`) |
| Admin, MCP, uploads, maps | Touched only by reading (export) and by the database snapshot | Access matrix, MCP, upload and map suites re-run green (below) |

### Evidence on the branch tip

- Full API suite at `5dfa4f4`: 1995 passed, 1 skipped (the live OpenAI smoke test), 0 failed; then `DatabaseBackupTests`
  10/10 with the R-2 change.
- Release build of the solution; `dotnet ef migrations has-pending-model-changes`: none.
- Web: typecheck, lint (0 errors), Prettier, unit tests 8/8, production build.
- E2E on a fresh database with the branch's own API and Vite: admin-workspace, export, restore, workspace-settings,
  collaboration, mcp-connect, entity-image, public-reading, explore, pwa, auth, maps, smoke - 91 passed; earlier on the
  branch, export/restore/collaboration/settings and every spec whose invitation helper H-1 changed - 107 passed.
  Full Playwright suite not run locally; delegated to GitHub Actions by project workflow.
- Response headers checked on a running host: `nosniff`, `X-Frame-Options: DENY`, the CSP and `Referrer-Policy` present.
- Local restore drill of a 63.6 MB WAL database (runbook): passed; R2 and DEV not exercised.

### Final gate verdict

No known Critical or High is open. H-1 (High) and R-1 (Medium, found in this regression) are fixed with regression tests;
M-4 is fixed in part. Open for the owner's acceptance before #34: M-1 (ImageSharp licence decision), M-2 (blocked on the
App Service client-address check), M-3, M-5, M-6, the Low items, R-3 (bucket lock) and the runtime checks of Part 1.
#33 is ready for the #34 go/no-go **on the condition** that the owner accepts those residual risks and completes the
runtime checks; LoreX should not be called ready while H-level work is unmerged, and none of this branch is merged.
