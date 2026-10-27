# ADR 0005 - Cookie sessions over token auth

Status: accepted (2026-09-06)

## Context

LorEvolve is one API and one first-party SPA served from the same origin. A token scheme
would mean storing a credential somewhere JavaScript can read it, plus refresh handling,
for no gain at this shape.

## Decision

ASP.NET Core Identity with the application cookie. `LorEvolveUser` derives from
`IdentityUser` and adds nothing: Id, UserName and Email already come from Identity.

The cookie is HttpOnly, `SameSite=Strict`, Secure in Production and `SameAsRequest`
elsewhere so development and the test host can run plain HTTP. It slides over seven
days. Cookie protection is framework-managed; there is no signing secret to hold.

Because the API is called by fetch, the cookie handler answers 401 and 403 rather than
redirecting to a login page that does not exist server-side.

Sign-in accepts a username or an email in one field. Failures always return the same
response, and an unknown identifier still pays for a password verification, so neither
the body nor the timing says whether an account exists. Registration necessarily
reports that a username or email is taken.

## Consequences

- No token storage, no refresh flow, and CSRF is covered by `SameSite=Strict` plus
  JSON-only endpoints rather than by antiforgery tokens.
- Endpoints are anonymous unless they call `RequireAuthorization()`. There is no
  fallback policy, so new authenticated endpoints must opt in.
- Data Protection keys are in memory by default, so sessions do not survive a restart.
  Production needs a persisted key ring; that is a deployment concern, not a code one.
- A move to a third-party or mobile client later would need a token surface added
  alongside this one.

## Amendment (2026-10-19, ADR 0046)

The token surface foreseen above now exists, beside the cookie and for one purpose: an outside AI app reading one
universe over MCP. OpenIddict issues OAuth 2.1 tokens only to apps a signed-in person approves; the cookie session is
unchanged and is never an MCP credential, and a token is never a session.
