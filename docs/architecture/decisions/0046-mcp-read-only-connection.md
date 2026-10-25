# ADR 0046 - An outside AI app reads one universe over MCP, as one member, through OAuth 2.1 issued by LoreX itself

Status: accepted (2026-10-19). Roadmap task 049 (GitHub issue 7).

## Context

Creators want Claude, ChatGPT and other AI apps to read their LoreX universe directly, between conversations, without
pasting text and without handing over their LoreX password. The Model Context Protocol (MCP) is how those apps reach
outside tools; its authorization specification (revision 2026-07-28, read for this decision) makes the MCP server an
OAuth 2.1 resource server and asks for: protected resource metadata (RFC 9728) found from a `401`, authorization server
metadata (RFC 8414 / OIDC discovery), Authorization Code with PKCE S256, resource indicators (RFC 8707) with tokens
validated for exactly their audience, issuer identification (RFC 9207), client ID metadata documents (CIMD, SHOULD) with
dynamic client registration (RFC 7591, MAY, deprecated), short-lived access tokens, rotated refresh tokens for public
clients, HTTPS everywhere but loopback redirects, exact redirect matching, and `Origin` checks on Streamable HTTP.

LoreX authenticates people with a `SameSite=Strict` cookie (ADR 0005) and has no token surface. The assistant's read layer
(`UniverseReader`, ADR 0045) already reads a universe permission-safely for a non-screen consumer. ADR 0005 foresaw that a
third-party client "would need a token surface added alongside this one".

## Decision

**Standard pieces, not a protocol of LoreX's own.** OpenIddict 7.7 (Apache-2.0, maintained, built for ASP.NET Core and EF
Core) is the authorization server and the token validator, on the one `LorexDbContext`. The official MCP C# SDK 2.2
(`ModelContextProtocol.AspNetCore`, Apache-2.0) is the Streamable HTTP server. LoreX writes only what binds them to its
accounts and universes, as small handlers inside OpenIddict's own pipeline and a gate in front of the SDK. Nothing
cryptographic is hand-written: codes, tokens, PKCE, rotation and replay detection are OpenIddict's.

**One universe per connection, named by the resource.** Each universe's MCP endpoint is
`{origin}/mcp/universes/{id}`, and that URL is also its RFC 8707 resource. The URL is an address, not a credential. The
origin is configured (`Mcp:Origin`, else `PublicSite:Origin`), never read from the `Host` header; unset, there is no MCP
and no authorization server: discovery, `/oauth/*` (registration included), the consent screen's reads, protected
resource metadata and `/mcp/*` are not mapped at all, so nothing answers without the protections an origin brings (the
registration rate limiter among them). Connected apps can still be listed and revoked. Outside Development and the test host it must be HTTPS. An authorization request must name
exactly one such resource (else `invalid_target`, sent back to the validated redirect URI); the token's audience is that
resource and nothing else; a token request may name only it again. Protected resource metadata is served per universe at
the RFC 9728 path-inserted well-known address, the same for any id, so it reveals nothing about which universes exist.

**The issuer.** The configured origin, one issuer for every universe. Discovery is served at both
`/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`, built from the configured origin. It
offers the code flow and refresh only, PKCE `S256` only, scopes `lorex.read` and `offline_access` (no `openid`: this is
not an OpenID provider), `none`, `client_secret_basic` and `client_secret_post` at the token endpoint, `iss` on every
authorization response, `client_id_metadata_document_supported`, and the registration endpoint. No JWKS: nothing issued
is a JWT.

**Clients.** Three ways, as MCP lists them:

- *Client ID metadata documents (preferred by Claude and ChatGPT).* A client id that is an HTTPS URL is fetched before
  OpenIddict looks the client up, checked, and kept as an ordinary OpenIddict application under that id. The fetch is
  SSRF-hardened: HTTPS on the default port, a DNS host (no IP literal), a path, no query, fragment or user info, the
  normal form only; every address the host resolves to must be public, and the connection is made to a checked address
  (`ConnectCallback`); no redirect, no proxy, no cookies, one 5 s deadline for the whole exchange (body included, so a
  byte-at-a-time answer is cut off), 32 KB. Fetches are rationed and refused rather than queued. Client ids never seen
  before, which anyone can make up before signing in, share one ration: 4 at once, 60 a minute
  (`Mcp:MetadataFetchesPerMinute`). Checking again a client LoreX has already accepted draws first on a ration of its
  own publishing host - 2 at once, 30 a minute (`Mcp:MetadataRechecksPerHostPerMinute`) - and then on one ceiling for all
  re-checks, 8 at once and 240 a minute (`Mcp:MetadataRechecksPerMinute`), so outbound work never grows with the number
  of hosts; a host over its own share spends none of the ceiling. Callers cannot be told apart behind App Service, so
  the per-host share is what keeps a flood of made-up ids, or one publisher's documents, from crowding out another
  publisher's clients. A known client that cannot be checked again may stand on its last document only for a grace its
  publisher allowed - a `max-age` without `no-store`, `no-cache` or `must-revalidate` - of at most that max-age and 5
  minutes; LoreX never extends it. The document's `client_id` must be its URL; it must
  name the client, list 1-10 redirect URIs each HTTPS or loopback, accept `none` at the token endpoint and the code flow.
  A document is trusted for what its publisher said: not at all for `no-store`, `no-cache` or `max-age=0` (fetched
  again on every use), else its `max-age` up to 24 h, 1 h when it says nothing; then fetched again. A revalidation that
  fails is a refusal: grace is only for a spent ration, never for a failed check. Anything wrong
  refuses the request as `invalid_client`, shown by LoreX, never redirected.
- *Dynamic client registration*, at `POST /oauth/register`, for older clients: open by design, so bounded - a 16 KB body,
  30 registrations a minute across all callers (`Mcp:RegistrationsPerMinute`), the same redirect and name rules, only the
  code and refresh grants, a secret only when asked for (hashed by OpenIddict, written out once), no RFC 7592 management.
  A registration never used for a connection is removed after a day; its id carries its issue time (Unix seconds,
  fixed-width hex) so the sweep asks the database for the old ones.
- Pre-registration is not offered in V1.

Redirect URIs are HTTPS or `http` on a loopback address: never a custom scheme (any installed program could claim it).
They match exactly, except that a loopback URI matches on any port (RFC 8252 section 7.3; Claude Code picks a free port).
Client names refuse control and direction-override characters and are at most 80 characters.

**Verified versus self-declared.** A CIMD client's host is the verified part: LoreX fetched its details from there. Its
name is still the site's own claim. A registered client vouches for nothing and the consent screen says so in a warning.
Every consent screen names the host the browser returns to, and adds a warning when every return address is on the
person's own device (MCP: localhost impersonation).

**Consent: shown, then decided, over the existing session.** A client sends the browser to `GET /oauth/authorize`,
usually from another site, so the Strict session cookie is not sent and nothing is decided there. Once OpenIddict has
validated the client, redirect URI, PKCE and scope, the request goes unchanged to the SPA's consent screen
(`/connect/authorize`, behind the existing sign-in; signing in returns to it). The screen reads `GET
/api/oauth/authorization-request` (session) for what to show, and posts the same parameters back to `/oauth/authorize`
with `lorex_decision=approve|deny` and an ASP.NET Core antiforgery token (`lorex_consent_token`) it reads from `GET
/api/oauth/consent-token` - bound to the signed-in account and to an HttpOnly, `SameSite=Strict` cookie
(`lorex.consent`). That post is same-site, carries the session, and is validated by OpenIddict and by the antiforgery
check again. `SameSite=Strict` alone stops cross-site posts; the token also stops a same-site page that rides the
session but could never read the token. Only an explicit approval by a signed-in member who can read that universe
creates anything; a post without the session, or without a valid token, goes back to the screen; deny is `access_denied`; `prompt=none` is `consent_required`. There is no remembered consent:
every connection is approved by a person. The screen and the OAuth endpoints refuse to be framed.

**What an approval makes.** A permanent OpenIddict authorization (subject = account, client, scopes `lorex.read` and
`offline_access` whatever else was asked, resource = the universe) and one `McpConnection` row binding it to the account
and the universe with cascading foreign keys. Approving the same app for the same universe again replaces the earlier
connection. V1 grants read only; a later write permission would be a new scope and a new approval.

**Tokens.** Access tokens live 15 minutes, refresh tokens 30 days sliding (rotated on every use - OpenIddict's rolling
tokens - with replay of an old one past a 30 s leeway revoking the whole chain), codes 5 minutes. Access and refresh
tokens are reference tokens: a random id the client holds, stored hashed (SHA-256), whose payload is a Data Protection
blob in the database, protected by the key ring that already protects the session cookie (ADR 0018). OpenIddict's
mandatory signing and encryption keys are ephemeral because nothing they would sign or encrypt outlives the process.
Every code exchange and refresh is checked against the live connection: it must exist and belong to that client and
account, and the account must still be able to read the universe; otherwise `invalid_grant`.

**The gate, on every MCP request.** Before the SDK sees anything: a foreign `Origin` header is refused (DNS rebinding);
the bearer token comes from the `Authorization` header only (never a query string or form, never the session cookie);
OpenIddict validates it against its live token and authorization entries; its audience must be this universe's resource;
it must carry `lorex.read` (else `403 insufficient_scope`); its connection must still exist for this account, client and
universe; and the account must be able to read the universe now (`UniverseAccess`, ADR 0041). Any failure is `401` with
`WWW-Authenticate: Bearer` naming the resource metadata and scope. So a revoke, a removed member, a deleted universe or a
token for another universe stops at the next request. "Last used" is written at most once per 5 minutes.

**Stateless MCP.** The SDK serves each request on its own (`HttpServerSessionMode.Stateless`): no session to lose on a
restart or pin to an instance, every protocol revision the SDK supports (initialize-era clients and 2026-07-28 alike), GET
and DELETE answer 405.

**The tools: ten, read-only, over `UniverseReader`.** `search_universe`, `get_universe_overview`, `get_lore_entry`,
`get_lore_relationships`, `get_story`, `get_scene`, `search_scene_manuscript`, `read_scene_manuscript`,
`get_timeline_moment`, `browse_timeline`. Annotated read-only, non-destructive, idempotent, closed-world. No tool takes a
universe: the gate sets it from the token. Ids are LoreX's own GUIDs; one from another universe, the Trash or nowhere is
`not_found` alike. Results are JSON text, bounded by the reader's limits. MCP shares no code with the assistant's
provider, conversation, allowance or models, and needs no model credentials; its reads do not count against the
assistant's 20 questions.

**Prose is read progressively.** `get_scene` carries no prose, only the manuscript's version, characters, approximate
words and tokens (characters / 4, a guide, never billing) and its chunk count. `search_scene_manuscript` returns up to 5
case-insensitive matches with 240 characters either side and exact offsets. `read_scene_manuscript` reads one scene's
exact text from an offset, 8,000 characters by default, 500-12,000 allowed, ending after the last paragraph break, line
break or space in the chunk's final fifth, never inside a surrogate pair; it returns the offsets, `isComplete`,
`nextOffset` and the manuscript version, and refuses a stale version with `manuscript_changed`. Read on from each
`nextOffset`, the chunks join back into the manuscript exactly.

**Connected apps.** `GET /api/profile/connected-apps` lists the account's own connections - app name, verified host or
none, universe, created, last used, and status (active; no access; needs reconnecting) - and never a token or a client
secret. `DELETE .../{id}` revokes the authorization and every token under it and removes the row; another account's
connection is a 404. The session and other connections are untouched. `GET /api/universes/{id}/mcp` gives a member the
URL to copy (`Read`, all four roles; outsiders 404), shown by Connect to AI, the action on the universe's Overview.

**Upkeep.** An hourly sweep revokes authorizations whose connection is gone, lets OpenIddict prune what stopped mattering
a week ago, and removes, in rounds until none are left, registrations unused for a day and metadata-document clients
with no connection (fetched again when someone connects them). OpenIddict and the MCP SDK log at Warning; OpenIddict redacts tokens, codes
and secrets in any case. No manuscript text is logged.

## Consequences

- One migration, `AddMcpConnections`: five additive tables (OpenIddict's four, `McpConnections`), nothing else touched,
  plain `DROP TABLE` rollback. Account-level authorization state: not in a universe backup and not restored; the backup
  format is unchanged.
- Every member role may connect their own app and reads exactly what `Read` allows; nobody writes through MCP. Public
  Explore visibility grants nothing here.
- Works with any client that speaks Streamable HTTP and this OAuth profile: Claude (CIMD), ChatGPT (CIMD, needs the RFC
  9207 `iss`, which is sent), Claude Code (CIMD, loopback on any port), and DCR clients with HTTPS or loopback redirects.
  Not: clients needing a custom-scheme redirect, `private_key_jwt`, pre-registered clients, the legacy HTTP+SSE
  transport, server-to-client requests (sampling, elicitation), or a browser-based client on another origin.
- Metadata re-checks trade fairness against a bound, deliberately. With callers indistinguishable behind App Service,
  any pool one party can spend another can too: a per-host share alone lets outbound work grow with the number of hosts,
  and a ceiling alone lets one publisher crowd out the rest. Both are kept. Reaching the ceiling (240 a minute) takes on
  the order of 1,200 known clients on at least 8 hosts, each a valid public document that passed the 60-a-minute
  new-client ration and was connected through LoreX consent (or it is swept within the hour), since each is checked
  again at most once per freshness (at least 5 minutes). Its effect is a delay - a known client past its
  publisher-allowed grace (at most 5 minutes) is asked to retry - never longer trust in an old document. Partitioning by
  registrable domain (a public suffix list) or reserving a share for established clients would raise that cost, not
  remove it; revisit if a real deployment ever sees contention.
- Errors OpenIddict raises while validating a request (an unknown client, a bad redirect, missing PKCE) are its plain
  error answer, never redirected and not styled as a LoreX page.
- The DEV limitations of ADR 0018 apply: SQLite's single writer (a refresh writes; "last used" writes at most every 5
  minutes per connection), and Data Protection keys unencrypted at rest - whoever can read them can read token payloads,
  as they can forge a session today. A restart keeps every connection.
- Not in V1: writes of any kind, Suggested Changes, AI-generated content or imports (issues 32, 17), cross-universe
  search, account-wide discovery, resources or prompts, a per-universe switch, rate limits on MCP reads beyond the read
  layer's bounds, and an admin view of all registrations.

## Amendment (2026-10-23, roadmap 052, ADR 0047): a separate permission to propose

V1's read grant is unchanged and still read-only. A second scope, `lorex.propose`, lets an app stage changes for a person
to review in LoreX; it never writes. Discovery, the protected resource metadata and the 401 challenge now list both scopes;
the consent screen offers proposing as its own unticked choice, only when the app asked for it and the person's role can
stage changes, and grants it only on that tick (`lorex_propose=allow`), recorded on the connection as `CanPropose`. A
refresh never widens a grant. Per-client scope permissions stay enforced: registrations list both scopes, and clients
registered before the scope existed were given it by the data-only `UpgradeMcpClientScopes` migration; consent decides. The gate passes `CanPropose` (token scope and connection both) to the tools; the three
proposal tools are hidden and refused without it. Connected Apps lists it and turns it off without disconnecting
(`DELETE /api/profile/connected-apps/{id}/proposals`). "V1 grants read only; a later write permission would be a new scope
and a new approval" - this is that scope, and it is still not a write.

## Amendment (2026-10-25, issue 31, ADR 0058)

`read_scene_manuscript` and `search_scene_manuscript` read the prose with each Lore mention as the name the author wrote,
never the token; ranges, matches and the version are over that text, so chunks still join back into exactly what was read.

## Amendment (2026-10-25, issue 56): pictures, read the same way

Two more read-only tools, over the same rows and the same object store the app reads (ADR 0019, ADR 0053), with no
second index and no new identifier. `list_lore_images` resolves a live entry of the connected universe by id or by its
exact name or alias - a name two entries answer to is refused with the candidates, never guessed - and lists its
profile picture apart from the pictures of its appearances, each appearance with exactly the forms and eras the author
ticked. An optional form, era or appearance (id or exact name; unique within an entry) narrows the list to pictures
explicitly linked to it; a form nothing was ticked for lists none, the answer says so, and the entry's portrait is
reported as the base picture and never stands in. `get_lore_image` returns one picture, by the entry's id and the
picture's id together, as an MCP image content block, an explicit Markdown fallback link to the canonical LoreX Lore or
progression page, and a text block of metadata; the page link requires sign-in and current universe access and is not a
media URL. `preview` (the default) is the whole picture fitted within 1024 pixels as WebP with no metadata, cut
from the original on demand by the upload gate's own decoders; `thumbnail` is the stored square; `original` is the
file as uploaded, only when asked for and only up to 4 MB, else refused with the preview offered.

The bytes travel inline, so no URL outlives the authorization that produced it: a revoked connection, a removed member,
a trashed entry or an id from another universe answers as every other read does. A listing names at most 100
appearance pictures. Nothing uploads, changes or deletes a picture through MCP. Whether a given client draws an image
block is the client's: the official SDK client (the tests) carries valid WebP bytes. An owner's ChatGPT test showed a
blank image tile despite the response metadata, so the tool now states that display cannot be confirmed server-side and
offers its authenticated LoreX page link as a fallback. The real ChatGPT display/fallback still requires a client smoke
test; do not treat SDK acceptance as proof of visible rendering.
