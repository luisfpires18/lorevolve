# ADR 0038 - Public pages carry server-rendered metadata from the public predicates, on a configured origin

Status: accepted (2026-09-28)

## Context

Task 012 makes the public portal findable: search engines and link previews should see a public world, entry, story or
author page as what it is. LorEvolve is one React application rendered in the browser. The API serves the built
`index.html` for every client route, so a crawler or preview bot that runs no JavaScript saw one generic head - "LorEvolve" -
on every address, and even a rendering crawler saw no canonical address. Changing `document.title` in React would not
reach those readers. A framework migration (server rendering, a static site generator) is out of proportion for a head.

Two further constraints. The canonical address, `og:url` and `og:image` must be absolute, and `AllowedHosts` is `*`: a URL
built from the request's `Host` header can be forged into a page a cache keeps. And a DEV deployment must not invite
crawlers or name a production origin.

## Decision

**The server writes each page's head into the shell.** `index.html` holds a block between `<!-- lorevolve:head -->` and
`<!-- /lorevolve:head -->`. The API's fallback (`FrontendHosting`) reads the template once and, per request, replaces that block
from `PageMetadataResolver`: title, description, robots, canonical, Open Graph and `twitter:card`. The body stays the empty
shell; content is still fetched by the app from `/api/public`. The app also sets the same title while navigating
(`useDocumentTitle`, `src/lib/`, which the workspace's shells now also use - refinement 024). Nothing else of the head changes on client navigation - crawlers load each address fresh.

**The public predicates decide, and only public text is read.** `/worlds/{slug}`, `/lore/{slug}`, `/stories/{slug}` and
`/authors/{slug}` resolve through `PublicationRules.Public`, `PublicLore` and `PublicStories` - the queries the public API
reads. A universe's description is its public summary; an entry's is its lead (else "Type in World, on LorEvolve."); a
story's is its public summary, never its premise; an author's is "Name, creator on LorEvolve. Worlds: …" and nothing
invented. Pictures are the public derivatives the API already serves (card, entry thumbnail, a photo only if shown),
else the static `icon-512.png`. Private, trashed, incomplete and missing addresses are one **404** with a generic
`noindex` head that names nothing. Everything else - workspace, sign-in, profile, unknown paths - is `noindex,nofollow`
with `X-Robots-Tag` to match. Every API response says `X-Robots-Tag: noindex`. `/` redirected to `/explore` until 031
(amendment below).

**Explore has one canonical.** `/explore` is indexable; any search or filter state is `noindex,follow` with its canonical
at `/explore`, so arbitrary combinations are never indexed but the worlds they link to are reachable.

**The origin is configured, never read from the request.** `PublicSite:Origin` (an absolute http(s) origin, no path;
malformed fails startup) and `PublicSite:AllowIndexing` (default false). Without an origin no absolute URL is emitted.
Without both, `robots.txt` disallows everything, every page is `noindex`, and `/sitemap.xml` is 404. Production sets both
as App Service settings (`PublicSite__Origin`, `PublicSite__AllowIndexing`); DEV sets neither and stays out of indexes.
Development points both at `http://localhost:5173` and sets `Frontend:ShellPath` to the source `index.html`, so the head
can be checked over HTTP on the API port.

**Sitemap and robots are generated per request.** `/sitemap.xml` lists `/explore`, every public universe, every
effective-public entry and story, and every author with a public universe - addresses only, no ids, no API or workspace
paths - built fresh on each request with `no-cache`, so an unpublished item is absent from the next read. One file, capped
at the protocol's 50,000 addresses. `robots.txt` allows `/explore`, `/worlds/`, `/authors/` and `/api/public/` (so a
rendering crawler can draw a page and a preview can fetch its picture) and disallows `/api/`, `/app`, `/login`,
`/register`.

## Consequences

- Link previews and non-rendering crawlers get correct titles, descriptions, canonical addresses and pictures. The page
  body is still client-rendered: a crawler that runs no JavaScript sees the head, not the article. That is stated, not
  hidden; full server rendering is not planned.
- Every shell request for a public address costs one or two small indexed queries. Nothing is cached in the process, so
  there is no stale head after an unpublish - but a head a third party (search engine, preview cache) already copied is
  theirs until they recrawl. Authorization, not robots or noindex, remains what protects private data.
- A metadata lookup that fails serves the generic head with a 200 rather than failing the shell; the app then reports its
  own load failure.
- No schema change. No structured data (schema.org): the pages do not map cleanly enough to be worth a guess.

## Amendment (2026-10-04, Product refinement 031) - LorEvolve's home is a page

- `/` is no longer redirected to `/explore` by the server (`FrontendHosting`) or the client: it is the app shell like
  any other page, with its own head from `PageMetadataResolver` - "LorEvolve — Build connected fictional universes", a fixed
  description LorEvolve writes, canonical `/`, `index,follow` (a query string makes it `noindex,follow` with the same
  canonical, as Explore's), Open Graph with the static icon. `/` is the sitemap's first address. `robots.txt` already
  allowed it. No new metadata mechanism.
