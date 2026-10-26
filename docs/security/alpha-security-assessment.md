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
  (-wmxv) cannot be reached. The three Highs are a histogram-equalization filter and TIFF encoders LoreX never calls.
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
