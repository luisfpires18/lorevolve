# Public portal

The durable decision is ADR 0036. This document is the portal's working reference: what it is for, what it may
show, and the order it is being built in.

## 1. Goals

Let visitors discover universes their authors chose to share, without ever exposing an author's private work. The
foundation (008) makes publishing explicit, complete and reversible, and gives the portal one anonymous, read-only,
allow-listed API to build on.

## 2. Workspace and portal

| | Workspace | Public portal |
| --- | --- | --- |
| Who | The signed-in owner | Anyone, signed in or not |
| Routes | `/app/...` behind `RequireAuth` | `/explore`, `/worlds/{slug}`, `/worlds/{slug}/lore/{loreSlug}`, `/worlds/{slug}/stories/{storySlug}`, `/authors/{slug}`, outside every guard |
| Layout | Rail, universe sidebar, universe search | `PublicLayout`: its own bar, none of the workspace chrome |
| API | Owner-scoped `/api/...` | `/api/public/universes...` and `/api/public/authors...`, anonymous, read-only |
| Identity | Warm editorial workbench (Design refactor 001-007) | Dark, image-led discovery and reading (Tasks 009, 011) |
| Account | `/app/profile`: email, account id, photo, public name - private | `/authors/{slug}`: public name, chosen photo, public worlds (ADR 0037) |

One React application, two layouts: the session, router and build are shared, so a signed-in visitor sees "My
workspace" in the portal bar and a signed-out one sees "Sign in" and "Create account".

## 3. Privacy model

Private by default; publication explicit at every level; allow-list only. No route infers publication, no save or
restore sets it, and no public response is an internal object with fields removed. A private universe overrides
everything inside it, and a public one publishes nothing inside it (section 15).

## 4. Universe visibility

`Private` (every universe, including every one that existed before 008) or `Public`. Changed only by
`POST /api/universes/{id}/publish` (refused until complete; mints the address the first time; sets `publishedAt`
once) and `POST /api/universes/{id}/unpublish` (immediate; keeps details, address and first publication date).
Both idempotent, owner-only. While public, nothing publishing needs can be removed - make it private first; artwork
can be replaced.

## 5. What a public universe exposes

Exactly `PublicUniverse`: `slug`, `name`, `publicSummary`, `category`, `genres`, `authorDisplayName`, `authorSlug`
(the author's page, ADR 0037), `cardImageUrl`, `publishedAt` (first publication) - none ever null - and, since 015,
`originalCreator` and `originalWork`, null for a world of its author's own (section 22).

## 6. What stays private

Everything else: the description, colour, archive state, ids, owner, username, email, audit dates, storage keys, the
original artwork, and all content - except what its author published one by one: lore entries and stories (section 15),
and inside a published story its scene outlines, scene prose and plot arcs (section 22). Fields, relationships, family
trees, chapters, notes, timeline, ideas, world rules, Canon, the Trash, history and drafts stay private whatever is
published.

## 7. Category taxonomy

One per universe: Original, Movies & TV, Games, Books, Comics, Tabletop & RPG, Audio, Other. Stored as integers
1-8 (`UniverseCategory`), null for none. Answers "what kind of property is this".

## 8. Genre taxonomy

Up to three per universe: Fantasy, Science fiction, Adventure, Horror, Mystery, Historical, Romance, Thriller,
Supernatural, Post-apocalyptic, Contemporary, Other. One bit each (`UniverseGenres`, `[Flags]`), always listed in
that order. Answers "what kind of fiction is this". No free text, no aliases. New members append a bit.

## 9. Public author identity

The account's `PublicDisplayName`, chosen on the Profile. Never filled from the username or email; up to 60
characters; no control characters or bidi overrides. Read live by the public API, so renaming it renames the author
of every published world. Required to publish; cannot be cleared while any universe is public.

Since 011 (ADR 0037) an author also has an address, `PublicAuthorSlug`, minted from the public name at first publication
(`author` fallback, `-2` on collision) and never changed after, and a page at `/authors/{slug}` that resolves only while
they have a public universe. Their photo is shown there only if they choose, per picture (section 16).

## 10. Universe artwork

One per universe (`UniverseArtworks`): the untouched original and one 16:10 card, at most 960 px wide, never
enlarged, cut on the server from the frame the author chose in the shared cropper, metadata stripped. 16:10 because
the portal card is about as tall as wide with the picture as its top five eighths. Only the card is ever public. A
hero cut for Task 011 is a new frame of the same original. The static Explore background is not universe artwork:
`src/LorEvolve.Web/src/portal/explore-worlds-background.png`, owner-approved, 1916 x 821, 2,370,934 bytes, SHA-256
`31e6995251e1145f792664fac61de586fd730f63b3f30dc7d4b8850fce5abe49`. Never edited, recompressed or converted; CSS crops
it. Vite emits it unchanged under a content-hashed name, which the service worker may cache for good. Since 012 it is
delivered as a derivative beside it, `explore-worlds-background.webp` (250,016 bytes, same 1916 x 821, PSNR 43 dB against
the PNG, made with `ffmpeg -i explore-worlds-background.png -c:v libwebp -quality 86 -compression_level 6 -preset photo`),
through `<picture>` with the untouched PNG as the fallback (section 19).

## 11. Slug model

Minted at first publication from the name: ASCII `a-z0-9-`, accents folded, other scripts are word breaks, `world`
when nothing remains, at most 60 characters, then `-2`, `-3` on collision. Unique index. Never changes after -
renames and unpublishing keep it. No manual editing yet.

## 12. Public API boundary

| Route | Answers |
| --- | --- |
| `GET /api/public/universes?page=&pageSize=&category=&genre=&q=&sort=&author=` | Public universes, 24 per page (max 48), filtered and ordered as below; `author` is an author address (011). |
| `GET /api/public/universes/{slug}` | One public universe, or 404 (private and missing alike). |
| `GET /api/public/universes/{slug}/artwork/card/{cardId}` | Its current card (WebP), ETag = card id, 304 when current, 404 otherwise. |
| `GET /api/public/universes/{slug}/lore?page=&pageSize=` | Its published lore entries (010), 24 per page (max 48). 404 unless the universe is public. |
| `GET /api/public/universes/{slug}/lore/{loreSlug}/thumbnail/{thumbnailId}` | A published entry's current square thumbnail (WebP), as the card route. |
| `GET /api/public/universes/{slug}/stories?page=&pageSize=` | Its published stories (010), as the lore listing. |
| `GET /api/public/universes/{slug}/lore/{loreSlug}` | One published entry's page (011): `PublicLoreDetail`. 404 alike for private, trashed and missing. |
| `GET /api/public/universes/{slug}/stories/{storySlug}` | One published story's page: `PublicStoryDetail` (011; its published scenes, prose and plot arcs since 015). Same 404. |
| `GET /api/public/authors/{slug}` | An author (011): `PublicAuthor`, only while they have a public universe; otherwise 404. |
| `GET /api/public/authors/{slug}/avatar/{thumbnailId}` | Their photo's current square, only if they chose to show it; as the card route. |

All `Cache-Control: no-cache`, no session needed, no cookie set.

The list query (009). Every parameter narrows the one public predicate before counting, ordering and projecting, so a
private or incomplete universe is never matched, counted or ordered, and the response is still the eight-member
allow-list.

| Parameter | Meaning |
| --- | --- |
| `category` | One category key: `original`, `movies-and-tv`, `games`, `books`, `comics`, `tabletop-and-rpg`, `audio`, `other`. Absent is all. |
| `genre` | One genre key: `fantasy`, `science-fiction`, `adventure`, `horror`, `mystery`, `historical`, `romance`, `thriller`, `supernatural`, `post-apocalyptic`, `contemporary`, `other`. Matches a universe listing it among its genres. |
| `q` | Trimmed; a parameterized `LIKE` substring of the name, the public summary, the author's public name, or (015) the original creator or work - never the description, username, email, ids or content. Case-insensitive for ASCII only (SQLite `LIKE`); wildcards are literal. At most 100 characters. Blank is no search. |
| `sort` | `recent` (default): first publication, most recent first; republishing does not move a universe. `az`: name, `NOCASE`. The slug breaks every tie, so pages never repeat or skip. |
| `page`, `pageSize` | Clamped to 1+ and 1-48, as every LorEvolve list is. |

Keys are derived from the enum names (`MoviesAndTv` -> `movies-and-tv`), exact and lower case - one spelling per
value. An unknown category, genre or sort, or a longer search, is a 400 validation problem naming each bad parameter;
nothing is reinterpreted. The web client's `publishing/types.ts` carries the same keys, and a test pins both.

## 13. Explore (009)

`/explore` answers one question - what worlds can I explore? - with one card per public universe. The layout follows
the owner's portal reference: a solid bar with the search in it, a compact panoramic band holding the title and the
category row, then a wide grid of dark card panels. Its metrics, ratings, avatars and extra nav items are not copied:
no such data or destinations exist.

- **Bar.** Brand (to LorEvolve's home since 031), Explore (marked by a rule along the bar's foot), the search, then Log in
  and Create account - or My workspace and the account menu. Below 52rem the search takes its own row; below 40rem the
  brand and the way in share the first row and Explore opens the second, beside the search. The home page has no
  search (section 23).
- **Band.** The approved panorama behind "Explore Worlds", one line of support, the category pills and the genre and
  sort selects. On a wide screen the picture is drawn 1.3x from its left edge (a CSS transform; the file is
  untouched), which carries the castle out from under the title; narrower, it is cropped at 38% 35% and shaded
  whole. A shade on the reading side and a fall into the page keep it legible. Loaded eagerly: it is above the fold.
- **Categories.** Pills: All plus the eight, each a link to Explore filtered to it, dark translucent so they read
  over the picture, the chosen one `aria-current` and filled cream. Below 52rem they scroll sideways in their own
  strip, edge to edge, rather than stacking.
- **Genre and sort.** Native selects, labelled "Genre" and "Sort by": one genre or all; Recently published or A-Z. No
  popularity, trending or rating sort exists, because no such data does.
- **Search.** In the bar, on every portal page. On Explore it is `q`: sent 300 ms after typing stops, at once on
  Enter or when emptied; earlier requests are aborted and a stale answer is never shown; starting or clearing a
  search adds a history entry, refining one replaces it. Elsewhere, Enter opens Explore with the search.
- **Address.** `q`, `category`, `genre`, `sort=az`, each omitted at its default - `/explore?category=games&genre=fantasy`.
  Back, Forward and refresh restore it; an unknown value in a hand-edited address is ignored, not an error.
- **Paging.** "Show more worlds", under "Showing 24 of 52 worlds", appends the next page, keeps the filters and drops
  any world already shown (a publish in between shifts pages by one). No infinite scroll. The loaded pages are not in
  the address; a refresh starts from the first page with the same filters. The count is also a polite status.
- **Grid.** Four across from 75rem, three from 56rem, two from 34rem, one below: steps, so a wide screen never
  shrinks the cards to fit a fifth.
- **Card.** One dark panel and one link to `/worlds/{slug}`: the author's whole 16:10 card picture across the top
  (lazy-loaded, never cropped further), fading into the panel; the name (serif, two lines, `dir="auto"`) set over the
  picture's lower edge; the genres as chips tinted per genre, the word always there; then "by" the public name (one
  line, cut with an ellipsis, full name in `title`) and the category where a streaming card puts its numbers. Every
  authored string in `<bdi>`. No summary, counts or dates. A picture that fails keeps the panel with the LorEvolve mark.
- **States.** Card-shaped skeletons while loading; "No worlds have been published yet." for an empty platform; "No
  published worlds match." with Clear search and filters; an error with Try again, never mistaken for empty.
- **Visual boundary.** Since 013 the portal follows LorEvolve's one theme (section 20): dark, as built here, or its light
  interpretation. `.portal` redefines the shared tokens inside it (so shared buttons, notices and menus draw in the
  portal's colours) plus a few `--portal-*` values; the workspace's tokens are untouched. Motion
  is a panel edge brightening and a 3% image lift on hover, the lift only without reduced motion.
- `/worlds/{slug}` keeps its 008 content inside the dark frame; the real public universe page is 011's.

## 14. Public and private navigation

The portal is the front door: `/` is LorEvolve's home (031, section 23), and `/`, `/explore` and `/worlds/{slug}` answer
without a session - directly, after a refresh, in a new browser. Signing in is a choice made from it, and it comes back:

- **Log in** and **Create account** in the portal bar pass the current page (path and query) as router state
  (`{ from }`) - the same mechanism `RequireAuth` uses. Signing in or registering returns there, not to the workspace;
  the Login and Register screens' links to each other carry it along. Signing out from the portal stays on the page.
  The home page is the exception: its Log in, Create account and Start building carry nothing, so they land in the
  workspace as any sign-in does (031).
- **My workspace** is the one way into the workspace from the portal; My workspace's bar's **Explore** (and the account
  menu's Go to on every screen) is the way back. Both are plain same-tab links - no outward arrow (refinement 024). Visibility belongs to universes; the two sides are the portal and the workspace, never "public
  mode" and "private mode".
- **Return safety.** The page travels in history state, never in the address, so no link anyone else writes can choose
  it. `auth/returnPath.ts` still checks it, since anything on the page can write history state: it resolves the value
  against the site's own origin and follows only a same-origin path that is not Login or Register itself; `//host`,
  `/\host`, tab-smuggled `//`, absolute and `javascript:` values fall back to `/app`. `RequireGuest` redirects to the
  same answer, so it cannot race a successful sign-in somewhere else.

Settings' Public portal section (status in words, public details, artwork, author, checklist, publish and make private
with inline confirmations, "View public page") is unchanged, except that since 010 its note and its publish
confirmation say that each entry and story is published from its own page. Later: "Edit this world" for an owner viewing
their own world (011).

## 15. Content publication (010)

A lore entry or a story is published on its own, by its owner, from its own page. Publishing a universe publishes none
of them; publishing one of them publishes nothing of its universe.

**Model.** `Entities` and `Stories` carry `Visibility` (`ContentVisibility`: `Private` 0 - every existing and new item -
or `Public` 1), `PublicSlug` and `PublishedAt`. Set only by `POST /api/universes/{id}/entities/{entityId}/publish` and
`/unpublish`, and the same under `/stories/{storyId}`; read by `GET .../publication`, which also says whether the
universe is public. Owner-only (401 anonymous, 404 anyone else, as every universe route), idempotent, no body. No entry
or story save binds any of the three. Publishing needs nothing the item does not always have; it mints the address and
the date the first time and keeps both through unpublishing and renames. It is not an edit: `UpdatedAt`, history and
search are untouched.

**Effective visibility.** One predicate per kind - `PublicationRules.PublicLore`, `PublicStories` - holding the universe
predicate inside it:

| Universe | Item | In the Trash | Anyone can list it |
| --- | --- | --- | --- |
| Private | Private | - | No |
| Private | Public (selected) | - | No |
| Public | Private | - | No |
| Public | Public | No | **Yes** |
| any | any | Yes | No |

**Preparing while private.** An owner may publish an item while its universe is private. It is then *selected*: the
page says "Selected" and why nothing shows yet, and it appears the moment the universe is published. Making the universe
private hides every selected item at once and clears nothing, so publishing it again brings back exactly those.

**Lore listing contract** - `PublicLoreEntry`, exactly: `slug`, `name`, `summary` (the entry's own "what this is"
lead, null when empty), `typeName`, `thumbnailUrl` (null without a picture), `publishedAt` (first publication). Its
page (011) is `PublicLoreDetail`: the same plus `article` - see section 16. Ordered
by name, case aside, then address. The summary is published because it is the entry's authored lead - shown under its
name in its own header - and the publish panel says it is listed. Never the article, fields, aliases, tags, Canon status,
relationships, history, ids or keys.

**Story listing contract** - `PublicStory`, exactly: `slug`, `title`, `publicSummary` (011), `publishedAt`. Ordered by title, case aside, then
address - the workspace's own order; stories have no order an author sets. The premise is not published: it is the
author's planning text and may give the story away, as the universe description is not. No chapter, scene, manuscript,
plot, note or status. Since 011 a story is published only with a public summary its author writes for readers
(section 16).

**Thumbnail.** The entry's existing square thumbnail (the upload gate's WebP, metadata stripped) - never the original -
through the lore predicate by both addresses and the current thumbnail id; ETag = thumbnail id, checked after
visibility, `no-cache`. It stops answering when the entry or universe goes private, the entry goes to the Trash, or the
picture is replaced, reframed or removed. No picture is fine: pictures are not required.

**Addresses.** The universe generator (section 11), falling back to `entry` or `story`, unique per universe and kind -
an entry and a story may share one. A trashed item keeps its address, so it stays taken.

**Trash and status.** Trash hides an item whatever its selection; restoring it brings the selection back, so it is
public again only if it and its universe still are. Canon status (Idea, Draft, Canon) and story status (Planning,
Drafting, Complete) are workflow, not visibility, and change nothing here. Entries have an `IsArchived` column no route
sets; publication ignores it, as it ignores a universe's archive state.

**Backup.** Format 15 is unchanged and carries no item's visibility, address or date. Every restore - any version, or a
forged file - has every entry and story private.

**UI.** On an entry, a pill before Edit; on a story, a pill in its line of facts (the story bar is full at 360px). The
pill says Private, Public or Selected, and opens a panel (the `ActionMenu` disclosure) saying what that means, what is
listed, what is not, and the one action - Publish entry/story or Make private. The panel is the confirmation.

**For 011.** Reading pages at `/worlds/{universeSlug}/lore/{loreSlug}` and `/worlds/{universeSlug}/stories/{storySlug}`,
each with its own detail DTO read through the same predicate - never the workspace DTOs. Built in 011 (section 16).
Relationships, family trees and the timeline stay private until a decision says otherwise.

## 16. Public reading (011)

What an Explore card leads to. Every page is under `PublicLayout` - the portal bar, the search (which still opens
Explore), Log in and Create account returning to this exact page, or My workspace - and answers signed in or out.

**A universe** (`/worlds/{slug}`). A cinematic hero built from the one public picture a universe has, its 16:10 card:
drawn crisp at no more than its own 960 pixels beside the title, and blurred behind the band, where the blur hides that
it is enlarged - no new derivative, and never the private original. The category, the name, "by" the author (a link to
their page), the genres and the public summary. Under it, what the author published: Lore (the entry's square or its
initial, type, name, lead) and Stories (title, public summary), each 24 at a time with Show more, in the 010 order. A
section with nothing in it is left out; with nothing at all, "No lore or stories have been published here yet." Nothing
counts or hints at anything private. Anchors to Lore and Stories only when both exist.

**An entry** (`/worlds/{slug}/lore/{loreSlug}`). A reference page: "← World / Lore", the type, the name, the entry's lead,
its public square beside a reading column (40rem), and its article, rendered by the workspace's own read-only renderer.
The API has already unwrapped every link that is not absolute http, https or mailto, and read its first-level headings
as second-level ones, so the page has one `h1`. Never its fields, aliases, tags, Canon status, relationships or history.

**A story** (`/worlds/{slug}/stories/{storySlug}`). A landing page, not a reader: its title, its public summary, "by" the
author, when it was first published, and the world it is set in. **Public summary**: `Stories.PublicSummary`, at most
300, written in the story's publication panel ("Write public summary…", a guarded drawer - "Shown to readers on the
public portal. Your premise stays private."), saved on its own route, required to publish and not removable while the
story is selected; never taken from the premise. A story selected in 010 without one stays selected and hidden, and its
panel says "needs a public summary before readers can see it". What a story's page reads beyond this is section 22.

**An author** (`/authors/{slug}`, ADR 0037). Their public name, their photo's square only if they chose to show it -
otherwise their initial in a ring - "Creator on LorEvolve", how many public worlds, and those worlds as the Explore cards (the
author's name unlinked, since it would lead here). Only while they have a public world; otherwise the same not-found
page as an address nobody holds. The address is minted from the public name at first publication and kept for good.

**Public and private profile.** `/app/profile` is the workspace's account screen and stays so: email, account id, the
photo, the public name, and now "Author page" - a link to the public page when it is live, and "Show my photo on my
author page", off by default and off again when the photo is replaced. The photo's hint says it is private unless shown.

**Cards.** An Explore card has two links and no nesting: the world's name, stretched over the whole card so the card is
still one target, and the author's name laid above it.

**Owner bridge.** Signed in as the owner, a world shows "Edit this world" and an entry or story a quiet "Edit in
workspace", from `GET /api/universes/by-address/{slug}?lore=&story=`, which answers only the owner. Nothing public names
an owner or an id; nobody else sees either link.

**Not found.** One portal page for every hidden thing - private world, private or trashed entry or story, an author
with nothing public, an address nobody held: "This page is not available. Its address may be wrong, or it is not
public." A page that fails to load says so, with Try again, and is never mistaken for missing.

**Front door.** `/` is LorEvolve's home (031); the installed app opens Explore: the manifest's `start_url` is `/explore` (its
`id` stays `/app`, the install's identity). Signed in or out, and whatever was used last, the portal comes first; My
workspace is the way in. Deep links are unaffected.

**Owner preview** of a still-private universe was planned for 011 and is not built: an owner sees the real public page
once published, and Settings' checklist before that.

## 17. Roadmap

| Task | Scope |
| --- | --- |
| 008 | Publication foundation: visibility, public metadata, artwork, slug, anonymous API, settings, privacy tests. |
| 009 | Explore Worlds portal from the owner's visual references and the approved background. |
| 010 | Explicit publishing of individual lore entries and stories: selection, addresses, listings, thumbnail, owner controls. Done. |
| 011 | Public reading: the universe page, entry and story pages, a story's public summary, author pages and photos, "Edit this world", the portal as the installed app's start. Done (owner preview not built). |
| 012 | Portal polish, accessibility, SEO and Open Graph, caching and performance, security audit, remaining 007 polish. Done (section 19). |

## 18. Non-goals

No likes, ratings, comments, follows, view counts, popularity, trending, recommendations, feeds, bookmarks or public
editing. No fake data, metrics or placeholder artwork. Author pages (011) hold a public name, a chosen photo and public
worlds - no bio, followers, contact or counts of anything private.

## 19. Final polish and hardening (012)

**Route set, final.** Public: `/explore`, `/worlds/{slug}`, `/worlds/{slug}/lore/{loreSlug}`,
`/worlds/{slug}/stories/{storySlug}`, `/authors/{slug}`, and since 031 `/` (LorEvolve's home, no longer a redirect to
`/explore`). Everything else is the workspace or sign-in and is never indexed.

**SEO (ADR 0038).** The API writes each public page's head into the shell on the server: `<title>` ("Explore Worlds |
LorEvolve", "World | LorEvolve", "Entry — World | LorEvolve", "Story — World | LorEvolve", "Author | LorEvolve"), description from public text
only (public summary; an entry's lead; a story's public summary - never the premise; "Name, creator on LorEvolve. Worlds: …"),
robots, canonical, Open Graph (`og:site_name`, `type`, `title`, `description`, `url`, `image`) and `twitter:card`.
Images are the public derivatives (card, thumbnail, a shown photo) or `icon-512.png`. Hidden and missing public addresses
are a 404 with a generic `noindex` head. Workspace, sign-in, profile and unknown paths are `noindex,nofollow`, header and
meta. **The body is still rendered in the browser**: a crawler that runs no JavaScript reads the head, not the article.
The app keeps the tab title in the same words on client navigation. No structured data.

**Indexing.** Explore itself is indexable; any `q`/`category`/`genre`/`sort` state is `noindex,follow`, canonical
`/explore`. `robots.txt` allows `/explore`, `/worlds/`, `/authors/`, `/api/public/`; disallows `/api/`, `/app`, `/login`,
`/register`; names the sitemap. `/sitemap.xml` lists Explore, public universes, effective-public entries and stories and
authors with a public world, computed per request (`no-cache`), so unpublishing removes an address from the next read. API
responses carry `X-Robots-Tag: noindex`. Robots and noindex are courtesy, never protection: authorization is.

**Origin.** `PublicSite:Origin` and `PublicSite:AllowIndexing` (default false) - configuration, never the `Host` header.
Unset (DEV today): no canonical or absolute URL, `robots.txt` disallows everything, no sitemap. Production sets
`PublicSite__Origin=https://<its host>` and `PublicSite__AllowIndexing=true` as app settings; no code change.

**Publication edge cases.**
- *Trash restore.* The Trash listing now says what a restore would do (`publication`: `None`, `Hidden`, `Visible`, from the
  same predicates). Restoring a selected entry or story asks first: in a public universe "Restoring “X” makes it public
  again - This entry was public before it was moved to the Trash…", with Restore and publish, Restore as private (restore,
  then unpublish at once) and Cancel; in a private universe (or a story without a public summary) it says it is still
  selected and readers cannot see it now, and never claims it becomes visible. No second publication state.
- *Archive.* Archive and publication stay separate: an archived public universe remains public until made private.
  Archiving a public universe asks first ("It stays public"), offers "Make it private first" (which leads to Public
  portal's own control), and an archived public universe's Settings says "Still public." Restoring from the archive
  never asks. Deleting (archived only) says a public page goes with it.

**Performance.** Explore's hero ships as WebP (250 kB, was 2.37 MB) with the PNG fallback. Cards and thumbnails were
already lazy with explicit dimensions; the hero is eager (above the fold). Page screens are split chunks; the rich-text
editor (393 kB) loads only on screens that render an article. `/assets/*` is `immutable` for a year; the shell,
manifest, icons and `sw.js` are `no-cache`. A public hero stays the 960-wide card (blurred behind): privacy over
sharpness; a larger public derivative is future image-pipeline work.

**PWA and cache.** `start_url` `/explore`, `id` `/app` (unchanged identity). The service worker caches only same-origin
`GET` build output and root static files; it never touches `/api`, navigations, non-`GET` or cross-origin requests, so no
public or private API response, picture or page is persisted by it and an unpublish is never bypassed. The browser's own
HTTP cache may hold a public picture it already fetched; `no-cache` makes it revalidate, and revalidation of something no
longer public is a 404 (visibility is checked before the 304). Verified in code and by `pwa.spec.ts`; installed-device
behaviour was not manually re-tested.

**Dates.** Timestamps are stored in UTC and serialize without a zone (`2026-09-28T10:00:00`). The client's
`parseApiDate` reads a zone-less value as UTC everywhere (`lib/dates.ts`); the API contract is unchanged.

**Polish.** One action order - primary first, then the way out, in sight and in Tab order - in drawers, inline forms,
confirmations and now the entry form and article bars too. New-item drawers no longer say "A new moment" over "New
moment". Settings' delete is a ruled danger panel with a quiet danger-ink first step and a filled last step; its
confirmations take and return focus. A network failure reads "LorEvolve could not be reached…", never the browser's words.

## 20. One theme (UI refinement 013)

LorEvolve has one appearance preference, **Light** or **Dark**, and it applies to the portal and the workspace at once. Theme
is not identity: the portal stays image-led, serif and atmospheric in both; the workspace stays the editorial workbench
in both.

- **Portal Dark** is the 009-012 portal, unchanged in look. Its translucent inks, shades, drops and glows now read RGB
  channels (`--portal-ink-rgb`, `--portal-shade-rgb`, `--portal-panel-rgb`, `--portal-accent-rgb`, `--portal-drop-rgb`,
  `--portal-glow-rgb`) instead of literals, so the same rules draw both themes.
- **Portal Light** (`:root[data-theme='light'] .portal`): warm parchment ground (`#f3eee5`), a deeper parchment bar, soft
  near-white card panels, warm graphite ink (`#1f1c18`) and muted (`#5f574b`), lines as the ink at low alpha, the
  workspace's accent and danger (they already pass on paper). Pictures fade into paper instead of into black; a card's
  fade holds more in the light so its graphite name reads over the picture's foot. The hero, cards and artwork keep their
  weight; no picture changes with the theme.
- **Where it is chosen:** the account menu (portal bar and workspace rail alike); signed out, "Appearance" beside Log in;
  and the Profile's Appearance section.
- **Stored in the browser**, not the account (no account appearance setting exists): signed in or out it is the same,
  and signing in or out never changes it. SEO is untouched: no address carries a theme, and the server-rendered head
  (section 19) does not mention it.

## 21. Front door and brand (UI refinement 014)

- **LorEvolve's brand always leads to `/`, LorEvolve's home** (031; until then `/explore`): the portal bar, the workspace rail's
  "L", My workspace's bar, and the sign-in plate. It is not context-sensitive, and its accessible name says where it
  goes: "LorEvolve – Home". Explore is always a link of its own. **My workspace** stays the deliberate way in. The universes are "All universes", at the head of the sidebar and of the
  phone's Sections sheet.
- **The installed app opens Explore**, signed in or out, whatever was used last. The cause of it opening the workspace
  or Login on real installs was the service worker keeping the pre-011 manifest (`start_url: /app`) - fixed in 014 by
  never caching the manifest and bumping the worker's cache (ADR 0017 amendment). An unknown address lands on LorEvolve's
  home (Explore before 031) rather than on the workspace's guard. Deep links - `/worlds/...`, `/authors/...`, `/app/...` - go where they
  say, `/app/...` by the sign-in rules. A device check is in the DEV runbook ("The installed app's front door").
- **Publishing moved** from Settings to its own workspace page, Publish (`/app/universes/{id}/publish`), just above
  Settings. Same API, same rules, same confirmations (section 14's "Settings' Public portal section" is now this page).

### 21.1 Global navigation and wayfinding (Product refinement 024)

The hierarchy, made visible rather than implied:

```
LorEvolve                              home, / (031)
├── Explore                        public side (PublicLayout)
└── My workspace                   signed-in side
    ├── Universes      /app        ┐ WorkspaceLayout: one bar, two tabs
    ├── Ideas          /app/ideas  ┘
    ├── Profile        /app/profile  (account menu; same bar, no tab current)
    └── a universe     /app/universes/:id  (its own rail and sidebar; up = All universes)
```

- **Words.** The public side is **Explore** wherever a person reads a destination - the portal's nav and landmark, My
  workspace's bar, the account menu. "Portal" is the architecture's word, not the screen's; "Explore worlds" is retired
  as a link. The Explore page's own heading and title stay "Explore Worlds" (ADR 0038's server head says the same). The
  signed-in side is **My workspace**; Universes is its default screen, not its synonym. Profile is **Profile**.
- **My workspace's bar** (`WorkspaceLayout`, a layout route over `/app`, `/app/profile`, `/app/ideas...`): brand, the
  caption "My workspace", Universes and Ideas as `NavLink`s (`aria-current="page"`, ink plus a rule at the bar's foot),
  Explore, the account. `<nav aria-label="My workspace">`. On a phone (40rem) two intentional rows - brand and account,
  then My workspace with its tabs - and Explore leaves the bar for the account menu. Not drawn above a universe.
- **Account menu** (one `AccountMenu`, every surface): the account, then **Go to** - My workspace (`/app`), Ideas,
  Explore - then Profile, Theme, Sign out. Ordinary links, none marked current, so it always opens on its first item.
  A long address breaks before its @ and dots, inside a panel at most 20rem wide.
- **A universe** keeps rail, seal, sidebar, search and the Sections sheet. "All universes" and the sections are one
  landmark, `<nav aria-label="Universe">`. The `L` keeps its glyph on a 40px target. Explore from a universe is the `L`
  or the account menu's Go to; no text link is added to the rail.
- **Titles.** One owner per screen: `WorkspaceLayout` ("Universes | LorEvolve", "Ideas | LorEvolve", "Profile | LorEvolve"), the
  universe shell ("Lore — Hollowmere | LorEvolve", an entry or a story still its section), portal pages their own.
- **Focus.** Changing place - portal, an account-level screen, or a universe - moves the focus to the new `main`
  (`RouteFocus`); a section, a query string, an entry or an idea within the same place does not.
- **Back** is the way to the exact deep screen left for Profile; no "return to" state is kept.

## 22. Story content and attribution (Product refinement 015, ADR 0039)

**What inside a story can be published.** Three selections on the units the Story domain already has; nothing new is
modelled and no chapter is invented.

| Part | Selected on | Readers see | Never |
| --- | --- | --- | --- |
| Scene outline | the scene's row (Scenes view) | its title and summary | notes, point of view, date, lore, beats |
| Scene prose | the manuscript's save bar | the scene's prose under its title | summary, notes, saved versions |
| Plot arc | the arc's heading (Plot view) | its title, description, and its live beats' titles and descriptions | notes, links to scenes or lore |

Each is `Private` by default and after the upgrade. Plot is published only on purpose: nothing around an arc publishes it.
Chapters, premise, status and notes are never published.

**Effective visibility.** A part is read only while its universe is public, its story is public (selected, with its public
summary, out of the Trash) and the part is selected and out of the Trash. Making the story or universe private hides every
part and clears nothing; publishing again brings back exactly the selection.

**Controls.** The same pill and panel as an entry's or story's, beside what it publishes, each saying *Private*,
*Selected* (chosen, but the story is not public) or *Public* in words, and naming what is and is not published. The story
page reads the story's own state once, so publishing the story turns every selected part Public at once. The prose pill
lives in the save bar - where the prose is kept - so it never pushes the text box down on a phone; its panel opens upward.

**The reader.** `/worlds/{slug}/stories/{storySlug}` is one reading page, no child routes and no new addresses: title,
attribution, public summary, then Manuscript (a contents list when there is more than one part; prose in a 40rem serif
column, a blank line a paragraph, a line break kept), Scenes (an ordered outline) and Plot (arcs with their beats), then
the world it is set in. Only sections with something in them are drawn, with a way to each when there are several; a story
with nothing published inside shows its summary alone and hints at nothing. Reading order is the workspace's -
Unchaptered, then each chapter in order, each by its own order - with no chapter heading or number. One `h1`, `h2` per
section, `h3` per part, scene or arc.

**Attribution.** On Publish, under Public details: *This universe is based on someone else's work*, then *Original creator
or source* (required, 120) and *Original work (optional)* (200). Unticked, both are cleared. The portal then credits:

- Universe and story pages: "Based on works by **J.R.R. Tolkien** · *The Lord of the Rings*", "Curated on LorEvolve by
  Unreally", and a quiet "Unofficial fan or reference project. Not affiliated with or endorsed by the original creator."
- Explore card: "Based on works by …" on its own line, then "curated by Unreally" with the category.
- An original world keeps "by Unreally".

The original creator is text only - never a link, account or author page; only the LorEvolve author links, to their own page.
No claim is made about whether a project is permitted.

**Publish page.** The one visibility action is the page header's: *Publish world* (primary) while private, *Make private*
(danger ink, beside *View public world*) while public. Both open the confirmation under Status; publishing while something
is missing shows what and takes the focus there. The Status section and checklist stay.

**Backup.** Format 17 carries the attribution; no version carries any selection, so every restored part is private.

**Not done:** chapter headings publicly, a per-scene reader address, and a Trash restore question for a selected scene or
arc (ADR 0039).

## 23. LorEvolve's home (Product refinement 031)

`/` is LorEvolve's own page, a route of `PublicLayout` (`pages/LandingPage.tsx`), no longer a redirect: what LorEvolve is, what it
does, who it is for, that published worlds can be read, and how to start. `/explore` is unchanged and remains where
published worlds are found.

- **Bar.** Brand (to `/`), Explore, then Appearance, Log in and Create account - or My workspace and the account menu.
  No world search on `/`: `PublicLayout` leaves `PortalSearch` out there and nowhere else. A quiet footer on `/` only
  (033): the wordmark (to `/`) and its one line; a Product group of Explore, then Create account and Log in, or My
  workspace; under a hairline `© <this year> LorEvolve` and `LorEvolve v<package version>` (`lib/buildInfo`), neither a link.
  No Community, Legal or Support group: LorEvolve has no such destination yet, and an empty heading or a made-up link would
  be worse than none.
- **Actions.** Signed out: *Start building* (`/register`) and *Explore worlds*; at the foot *Start building your
  universe* and *Log in*. Signed in: *Go to my workspace* (`/app`) and *Explore worlds*; at the foot *Open my
  workspace*. Nothing is drawn until the session is known, so neither set flashes before the other.
- **Content, all of it true today.** Hero (the owner's citadel painting under a veil of the page's ground; three
  sentences, one line each); LorEvolve in four live numbers; Build (Lore, Types, Family Tree, Timeline and Chronology, World
  Rules); Connect (three things writing once does now: relationships read from both entries and drawn in the Family
  Tree, Canon's lifespan checks, a scene's lore at hand); Write (stories, chapters, scenes, manuscripts, plot arcs and
  beats, and the media a universe can serve); Explore (up to four real public worlds); trust (private until published,
  collaborators by role, downloadable backups); a last call. No prices, trials, metrics, testimonials or AI.
- **Numbers, not a picture of a workspace** (031 correction: the Lore screenshot and its capture script are gone). On the
  hero's foot: Creators, Universes, Published worlds, Private worlds from anonymous `GET /api/public/stats`, as `en`
  numbers in full, zeros included. Creators = registered accounts (each once). Universes = universe rows (archived
  included; a deleted universe is gone). Published worlds = `PublicationRules.Public`, the portal's own predicate; an
  entry published inside a private universe counts for nothing. Private worlds = universes - published. Counts only,
  `no-cache` like the rest of the public API. No count-up; while loading quiet bars hold the row; unreadable, the row is
  left out. Never in the page's head.
- **Worlds.** `GET /api/public/universes?page=1&pageSize=4`, rendered with Explore's `WorldCard`; two on a phone. None
  published: a sentence and *Open Explore*, no placeholder card. A failed read: a sentence; Explore has them.
- **Head.** "LorEvolve — Build connected fictional universes", a fixed description, canonical `/`, `index,follow` (any query
  `noindex,follow`), Open Graph with the static icon; `/` is in the sitemap (ADR 0038 amendment).
- **Unknown addresses** outside `/app` land on `/`; under `/app` on `/app`. The installed app still opens `/explore`.
