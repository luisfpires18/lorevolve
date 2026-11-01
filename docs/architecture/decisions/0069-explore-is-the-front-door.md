# ADR 0069 - Explore is the front door; the page about LorEvolve is retired

Status: accepted (2026-10-31).

## Context

From Product refinement 031 (ADR 0038 amendment) `/` was a page about LorEvolve: what it is, who it is for, how to
start, with Explore one link away at `/explore`. ADR 0068 had just stripped that page to words. The owner then asked
what the page was still for. LorEvolve is in an invite-only alpha, so the page had nothing to convert; the demo site at
demo.lorevolve.com carries the introduction; and the portal bar already holds every way in (Explore, Log in, Create
account, My workspace). The page duplicated the bar and asked for upkeep of its own: a spec of four hundred lines, a
fixed server head, a sitemap entry, special cases in the portal frame.

## Decision

**Explore is the front door, at `/`.** `PublicLayout` renders `ExplorePage` at `/`; the page itself is unchanged: no
introduction, no demo link, the catalogue as it is. Its tab title and server head stay "Explore Worlds | LorEvolve" with
Explore's fixed description; the canonical address is `/`, indexable, a search or filter state `noindex,follow` with the
same canonical.

**`/explore` stays an address and goes to `/`.** The client renders a `Navigate` to `/` with the query string kept; the
server answers `/explore` with a permanent redirect (301) to `/` plus the query, mapped in `FrontendHosting` before the
shell fallback. It leaves the sitemap and `robots.txt` (`/` needs no `Allow` line). Every link in the app points at `/`.

**The footer is shared.** The footer that stood only on the retired page (`SiteFooter`: wordmark to `/`, its one line,
Product links, `©` year, the running version) is drawn at the foot of Explore, of My workspace and of a universe's
column, from the shared tokens, so each frame dresses it in its own colours. The reading pages (a world, an entry, a
story, an author) and Admin have none. Inside the workspace the Product group holds Explore alone, since a link to the
screen you are on says nothing; and the footer's wordmark is named by its own word, so the bar's brand stays the one link
named "LorEvolve – Home" on every screen.

**The portal frame loses its special cases.** The search shows on every portal page; Log in and Create account carry
the page to come back to from everywhere; the opening animation keeps its rule (the first visit to `/` in a session)
and so plays over Explore now. The brand leads to `/` as before; its accessible name stays "LorEvolve – Home".

**The link to the demo site is the owner's own task,** outside this decision.

## Consequences

- `src/pages/LandingPage.tsx`, its `.landing*` rules, `tests/LorEvolve.E2E/specs/landing.spec.ts`, the `HomeTitle` and
  `HomeDescription` heads and `useWholeTitle`'s home-page purpose are gone. `GET /api/public/stats` (ADR 0036 amendment)
  still exists with no web consumer, as ADR 0068 left it.
- The manifest's `start_url` `/` (ADR 0017 amendment of 2026-10-29) now opens Explore; the 011 amendment's intent is
  back by another route. `id` `/app` and the worker are untouched.
- Specs that asserted the landing page now assert Explore at `/`; `global-navigation.spec.ts` carries the front-door and
  footer claims.
- Docs: `PUBLIC_PORTAL.md` section 23 describes the front door; SYSTEMS rows, ADR 0017, 0036, 0038 and 0068 carry a note.
