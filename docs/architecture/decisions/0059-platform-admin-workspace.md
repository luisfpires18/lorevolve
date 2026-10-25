# ADR 0059 - An account has a platform role; an Admin may block a Member, and reads only what LoreX records

Status: accepted (2026-10-25). Issue #40, `feat/admin-workspace`.

## Context

The owner needs to run LoreX itself before the first external alpha: see the accounts, block one that abuses the
service, and read figures about the service that are true. Until now every account was alike, and nothing but a
universe role (ADR 0041) said what an account could do. Sessions are Identity cookies (ADR 0005) that Identity
revalidates every 30 minutes; MCP connections are OpenIddict authorizations bound to `McpConnections` (ADR 0046).

The audit of what is recorded found: accounts carry no creation date and no sign-in time; universes and memberships
carry `CreatedAt`; storage is summed from picture rows (ADR 0042); MCP connections carry `CreatedAt` and `LastUsedAt`;
the assistant's question count is held in process memory only (ADR 0045); there is no request or error telemetry.

## Decision

**A platform role, apart from every universe role.** `LorexUser.PlatformRole`, `Member` (0) or `Admin` (1), every
existing and new account a Member. It grants nothing in any universe: an Admin reads another account's universe exactly
as any non-member does - not at all.

**Admin is granted from the server's configuration, by immutable id.** `PlatformAdmin:OwnerUserId`
(`PlatformAdmin__OwnerUserId`) names one account id; a hosted service, after the schema, makes that account Admin with
one conditional update. Safe to repeat; an id that names no account grants nothing and logs a warning; it never demotes.
No username, email or display name is ever matched, and no route grants, changes or removes the role. Revoking it is a
database change by the owner, and it bites at the next request.

**The role is read live.** `/api/admin/*` requires the `PlatformAdmin` policy, whose handler reads the role and the
block from the database on every request, before the body is bound. `/api/auth/me` says `isAdmin` only so the client
can offer the entry; the `/admin` route guard is courtesy.

**A session is checked on every request.** The cookie's `OnValidatePrincipal` looks the account up by key (tagged
`lorex:session-check`): gone, blocked, or a security stamp other than the cookie's, and the session is rejected and
signed out. Identity's own validator still runs after it. This is the one per-request query every signed-in request
now pays.

**Block and unblock, Members only.** `POST /api/admin/users/{id}/block|unblock` with a required reason (1-500
characters). Block is one conditional update - Member, not blocked - that sets `BlockedAt` and rotates the security
stamp; in the same transaction every MCP connection of the account is revoked through `ConnectedAppEndpoints.RevokeAsync`,
and an `AdminAuditRecords` row is written. Unblock clears `BlockedAt` only: sessions and connections stay ended. An Admin
account is never a target, so no Admin can lock out themselves or the last Admin, and two racing actions apply once
(the loser gets 409 `admin_state_changed`). Sign-in checks the password first, then the block (403 `account_blocked`),
so only the password's holder learns of it. The MCP gate refuses a blocked account too.

**The audit record.** `AdminAuditRecords`: actor id, target id, action, reason, UTC time. Plain ids, no foreign keys, so
it outlives either account; append-only, read only through an account's Admin details. No email, token, stamp or Lore
content.

**Figures: only what is recorded.** `GET /api/admin/overview`, counted at request time, Admin only, aggregates only (no
row loaded, no universe content read):

| Figure | Source and aggregation | Time |
| --- | --- | --- |
| Accounts | `COUNT(AspNetUsers)` | now |
| Admins | `COUNT` where `PlatformRole = Admin` | now |
| Blocked accounts | `COUNT` where `BlockedAt` is set | now |
| Universes | `COUNT(Universes)`, archived included | now |
| Public universes | `COUNT` where `Visibility = Public` | now |
| Collaborations | `COUNT(UniverseMemberships)` | now |
| Stored pictures | `SUM(EntityImages.ByteSize) + SUM(EntityAppearanceImages.ByteSize)`, Trash included (ADR 0042's measure) | now |
| Connected AI apps | `COUNT(McpConnections)` | now |
| Universes created per month | `Universes.CreatedAt` grouped by UTC year and month, last six months, empty months as 0; deleted universes are gone | UTC |

Update cadence: none stored - every figure is computed when the page opens. **Not tracked yet**, shown as such and never
estimated: new accounts over time, active users, last sign-in, account creation date, requests and errors, AI usage and
cost, subscriptions. An account's details add its universe counts (owned, shared - never names), storage (ADR 0042's
`UsageAsync`) and connected-app count.

**Privacy of the list.** The Users grid and details carry id, username, chosen public name, role and block state. No
email, and no profile photo - ADR 0021 keeps a photo out of anyone else's view, so cards show the monogram.

## Consequences

- One extra indexed read per signed-in request. The tests that count a read's queries ignore it by its tag.
- A block is immediate for sessions and MCP; a blocked author's public universes stay public. Whether a block should also
  withdraw published work is an owner decision, not taken here.
- Role assignment, other account actions, impersonation, deletion, billing and a tracing product are out of scope.
- Metrics that are not recorded need instrumentation first (#40 follow-up); nothing here estimates them.
