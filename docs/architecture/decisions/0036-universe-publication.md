# ADR 0036 - A universe is private until its owner publishes its shell, and the portal reads only an allow-list

Status: accepted (2026-09-27)

## Context

LorEvolve has been a private workspace: every universe route is owner-scoped (ADR 0006), and nothing answers without a
session. The public portal (Tasks 008-012) adds a second experience - anonymous discovery of worlds their authors
chose to share - beside the workspace, in the same application. Task 008 is its foundation: how a universe becomes
public, what exactly a public universe exposes, how anyone reads it, and what stays private no matter what.

The risk is the usual one for a private product growing a public face: an internal object serialised with a few
properties left out, a child collection that becomes readable because its parent did, a restore or migration that
publishes by accident, a picture served from a permanent public URL that outlives the decision to share it.

## Decision

**Private by default, public only by an explicit act.** `Universes.Visibility` is `Private` (0) or `Public` (1). The
migration adds it with default 0, so every existing universe is private and bare - no summary, category, genre,
artwork, address or date is generated, and nothing is copied from the description. Visibility changes through two
owner-scoped routes only: `POST .../publish` and `POST .../unpublish`. No save binds it, no restore writes anything but
`Private`, and the backup format does not carry it.

**Publishing publishes the shell, never the content.** A public universe exposes its name, a public summary written
for the purpose (the description is never published), one category, one to three genres, a 16:10 card of its artwork,
its author's public name, its address and when it was first published. Nothing inside it - lore, stories, timeline,
ideas, rules, relationships, Canon, the Trash - is read by any public route. Content-level publishing (Task 010) will
be explicit per item, and a private universe will override it.

**A public universe is never incomplete.** Publishing refuses (400 `publication_incomplete`, errors keyed by what is
missing) until summary, category, a genre, artwork and the owner's public name all exist. While public, a save that
would remove one is refused with the way forward: the details route answers 400 `publication_required_while_public`,
removing the artwork 409 `artwork_required_while_public` (replacing it is allowed), clearing the public name 400. Each
check shares one transaction with its write; Microsoft.Data.Sqlite begins transactions `IMMEDIATE`, so a publish and a
save cannot each pass against the other's stale read. The public query repeats every requirement as a second lock: a
universe that were somehow public but incomplete is simply not public.

**One predicate, one allow-list, one anonymous API.** `PublicationRules.Public` is the only query the portal starts
from. `/api/public/universes` (list, most recently first published first), `/{slug}` and
`/{slug}/artwork/card/{cardId}` are the only anonymous routes in LorEvolve, `AllowAnonymous`, read-only. Responses are
built member by member into `PublicUniverse` (slug, name, publicSummary, category, genres, authorDisplayName,
cardImageUrl, publishedAt) - no entity is serialised, so a property added to `Universe` cannot reach it. Private and
missing are the same 404. No popularity or engagement exists and none is invented.

**Categories and genres are closed sets of stable numbers.** Category: Original, Movies & TV, Games, Books, Comics,
Tabletop & RPG, Audio, Other - numbered from 1, null for none. Genres: Fantasy, Science fiction, Adventure, Horror,
Mystery, Historical, Romance, Thriller, Supernatural, Post-apocalyptic, Contemporary, Other - one bit each in a
`[Flags]` column, at most three, always listed in that order. Labels live in the client; names in the backup.

**The author is a chosen public name on the account.** `AspNetUsers.PublicDisplayName`, set on the Profile, never
derived from the username (a login) or the email. It is read live, so renaming it renames the author of every
published world at once. Control characters and bidi overrides/isolates are refused.

**The address is minted once.** The first publish turns the name into an ASCII stem - accents folded by a table
(the host runs with invariant globalization, so there is no Unicode normalization), everything else a word break,
`world` when nothing is left, at most 60 characters cut at a word - and takes the first free of `stem`, `stem-2`,
`stem-3`. A unique index is the guarantee. Renames and unpublishing never change it. Unicode addresses were refused:
mixed direction and look-alike letters are how an address is made to read as another.

**Artwork is universe media on the profile photo's path, and only its card is ever public.** `UniverseArtworks`, keyed
by the universe: original plus a 16:10 card cut on the server by the shared upload gate (`ImageFrame.Card`, at most
960 wide, never enlarged, metadata stripped). Keys `universes/{id}/artwork/{assetId}/original.{ext}` and
`.../card-{cardId}.webp` in the same private bucket. The public card route asks the database on every request whether
the universe is public and whether this is its current card; the original is never served publicly (it may carry EXIF).
Responses are `Cache-Control: no-cache` with the card id as ETag: a browser may keep a copy but must revalidate, and a
private universe's revalidation is a 404 - checked before the 304, so the store is not read for a current card.

**One application, two layouts.** `/explore` and `/worlds/:slug` sit outside both route guards and outside the
workspace, under `PublicLayout`: signed in or out, no rail or sidebar. The workspace gains an Explore worlds link and a
Public portal section in Settings; the public page does not yet know its viewer owns it (Task 011).

## Consequences

- Backup format 15 carries the public details and artwork (authored) and never visibility, address, date or the
  author's name. Every restore is private; publishing the copy mints its own address. ADR 0014, 0032 amendments.
- Unpublishing is immediate for everything LorEvolve serves. It cannot recall what a visitor already downloaded, and a
  shared cache that ignores `no-cache` is outside LorEvolve's control; the bucket stays private and no URL is permanent.
- A slug is not reserved after deletion: a later world may take a deleted one's address. And a world colliding with a
  stem once held by a now-private world gets `-2`, which reveals the stem was taken - accepted, the world was public.
- Deleting a universe cascades its artwork row; its objects stay in the private bucket unnamed, as entry pictures do.
- No preview route yet: the planned owner preview (Task 011) renders the same allow-list from saved details through an
  authenticated owner-scoped route, never anonymously.
- An archived universe stays public; archive is the owner's list, not visibility.

## Amendment (2026-10-23, Issue #47) - an entry's pill only in a public universe

- **A private universe's entry pages show no publication pill.** `ContentPublication` renders nothing for an entry
  whose `universeIsPublic` is false; Edit leads the tools. Stories keep their pill (out of scope). The API is unchanged:
  `POST .../entities/{id}/publish` still selects an entry in a private universe, and the Trash restore question still
  offers "Restore as private" there.
- **No stored selection is rewritten.** Entries selected earlier stay selected, and `PublicationRules.PublicLore` still
  hides them until the universe is public.
- **Publishing names what comes with it.** `PublicationRules.SelectedLore` is the entry half of `PublicLore` (selected,
  out of the Trash, with address and date); `PublicLore` is now that predicate inside a public universe, the same rule as
  before. `GET /api/universes/{id}/publication/selected-lore` (owner only, `Publish` capability: a member 403, anyone else
  404) answers `{ totalCount, items: [{ id, name, typeName }] }`, by name, at most 100 named. The publish confirmation reads
  it fresh with the publication state and lists each entry with its type, says "and N more" past 100, and says plainly when
  none is selected. It reads only: neither answer to the confirmation changes a selection. Making an entry private again
  stays on its page once the world is public.

## Amendment (2026-10-05, fix/universe-artwork-loading) - the artwork's card arrives with the universe

Measured first: a card and the workspace used to paint the fallback, then ask `GET /api/universes/{id}/artwork` for
the ids, then draw the picture - one round trip late even when the image was already in the browser's cache, and one
request (two queries) per owned card on the list.

- **`UniverseSummary` and `UniverseDetail` carry `artwork`: `UniverseArtworkIdentity { assetId, cardId }` or null.**
  The two ids the owner-only card address is built from and nothing else - no key, URL, file name, frame, size or date.
  The full `UniverseArtworkRef` stays where it is managed: `PublicationState` and the artwork routes.
- **Owner-only, decided in the query.** The artwork is left-joined on its key *and* `OwnerId` being the caller - the
  same test that makes the role Owner - so for a shared universe the database returns no ids at all; nothing is read
  and dropped afterwards. Viewer, Reviewer and Editor get null, as they got no artwork before (ADR 0041). The binary route is unchanged and still checks both ids against the row.
- **Null is an answer.** For the owner it means the universe has no artwork, not "not asked yet": the shell's first ready
  render and a card's first render already draw the right thing.
- **No extra query on the reads.** A left join on the artwork's key inside the list's page query (still a count and a
  page) and the detail's read (still the access check and the read). Writes that answer with the universe - update,
  archive, unarchive, restore - read the ids in one more query; create answers null. A restore answers the artwork it
  has just stored under new ids.
- **The address versions itself.** Replacing mints both ids, reframing a new card id, so the owner's
  `private, max-age=31536000, immutable` card URL never names two pictures and needs no cache-busting.
- `GET /api/universes/{id}/artwork` remains, for managing the artwork; browsing no longer calls it. Publish's own changes
  replace the shell's ids directly. Public artwork routes are untouched.
- **Deferred:** the list's `OwnerId OR membership EXISTS` filter scans `Universes` and sorts in a temporary B-tree
  instead of using the owner index (a query-shape change, not an index); and the private card read's role query plus
  row check could become one query without weakening `UniverseAccess`. Neither causes a visible delay today.

## Amendment (2026-09-28, Task 010) - entries and stories are published one by one, and the universe overrides them

The same principle, one level down: nothing inside a universe is public because the universe is.

- **Explicit at every level.** `Entities` and `Stories` gain `Visibility` (`ContentVisibility`: `Private` 0, `Public` 1),
  `PublicSlug` and `PublishedAt`. Its own enum rather than `UniverseVisibility`, because it promises less: an item's
  `Public` is its author's selection, read only while the universe is public too. The migration
  `AddContentPublication` defaults every existing entry and story to `Private`, with no address or date - a universe
  already public comes out of it with nothing inside it published.
- **Effective visibility is both levels, in one place.** `PublicationRules.PublicLore` and `PublicStories` hold the
  universe predicate inside them, plus the item's selection, address and date and `DeletedAt IS NULL`. No caller can
  ask for an item without its universe. Private universe + public item, public universe + private item, and anything
  in the Trash are all simply not public.
- **The selection outlives the universe's state.** Making a universe private hides every selected item at the next
  read and clears nothing; publishing it again brings back exactly those. An owner may select items while the
  universe is still private. Trash hides an item whatever its selection; a restore brings it back selected, so it is
  public again only if it and its universe still are.
- **Transitions, not fields.** `POST .../entities/{id}/publish|unpublish` and `.../stories/{id}/publish|unpublish`,
  owner-scoped, idempotent, no body; `GET .../publication` reads the selection, address, date and whether the universe
  is public. No entry or story save binds any of the three. Publishing requires nothing beyond what the item always
  has - a name or title. It mints the address once and sets the date once, in one `IMMEDIATE` transaction, and does not
  touch `UpdatedAt`, history or the search index: a selection is not an edit.
- **Addresses per universe and kind.** The one generator (`PublicSlugs`): the same ASCII stem and `-n` suffixes as a
  universe's, falling back to `entry` or `story`; unique among one universe's entries (or stories) by index
  `(UniverseId, PublicSlug)`, so an entry and a story may share one. A trashed item keeps its address. Renames and
  unpublishing never change it. That index is also what the public listings read.
- **Two allow-lists, two listings, one picture.** `GET /api/public/universes/{slug}/lore` -> `PublicLoreEntry` (`slug`,
  `name`, `summary`, `typeName`, `thumbnailUrl`, `publishedAt`); `.../stories` -> `PublicStory` (`slug`, `title`,
  `publishedAt`). Both paged 24 (max 48), ordered by name or title (`NOCASE`) then address, 404 for a universe that is not
  public. The entry's summary is its authored lead ("what this is") and is listed; the story's premise is planning text
  and is not. No article, fields, aliases, tags, Canon status, relationships, history, chapters, scenes, manuscript,
  plot or notes. `.../lore/{loreSlug}/thumbnail/{thumbnailId}` serves the entry's current square thumbnail - never the
  original - through the same predicate, the thumbnail id as ETag, checked after visibility, `no-cache`.
- **Backups never carry it.** Format 15 is unchanged: no visibility, address or date for an entry or story. A restore -
  of any version, or of a forged file claiming otherwise - has every item private.
- Relationships, family trees, timeline, world rules, ideas and Canon stay private; no public detail route for an entry
  or a story exists yet. Task 011 builds reading on these contracts with its own detail DTOs.

## Amendment (2026-10-04, Product refinement 031) - four public counts

- `GET /api/public/stats` answers `{ creators, universes, publishedWorlds, privateWorlds }` for LorEvolve's home page:
  accounts, universe rows (archived included), universes passing `PublicationRules.Public`, and the difference. Counts
  only - no name, slug, id, owner or per-account figure - so it cannot be used to find or enumerate a private universe.
  `no-cache`, like every public route.

## Amendment (2026-10-01, Product refinement 024) - three frames, one vocabulary

- "One application, two layouts" is now three frames over one session and router: `PublicLayout` (Explore),
  `WorkspaceLayout` (My workspace's account-level screens: Universes, Ideas, Profile) and a universe's own shell. The
  workspace's way across is **Explore**, not "Explore worlds"; the brand still leads to `/explore` from every frame (to
  `/`, LorEvolve's home, since 031).
  Detail: `docs/public-portal/PUBLIC_PORTAL.md` 21.1. Navigation only - no API, schema or backup change.

## Amendment (2026-09-28, Task 011) - public reading: an entry's page, a story's page, and a story's public summary

- **An entry's page carries its article.** `GET /api/public/universes/{slug}/lore/{loreSlug}` -> `PublicLoreDetail`: the
  listing's members plus `article`, the stored Tiptap document with every link that is not an absolute http, https or
  mailto address unwrapped to its text (so no relative workspace link or id is published) and its first-level headings
  read as second-level ones (the page's title is its only `h1`). Rendered by the workspace's own read-only renderer, which
  builds DOM from the schema and never parses HTML. Still never the entry's fields, aliases, tags, Canon status,
  relationships, history or ids: aliases can be secret names and fields can reference private entries.
- **A story is published only with a public summary.** `Stories.PublicSummary` (at most 300), written on the story's
  publication route (`PUT .../stories/{id}/publication`) and never by a story save; publishing refuses
  (`publication_incomplete`, `publicSummary`) without it, and it cannot be removed while the story is selected. The
  premise is planning text and is never shown or copied. `PublicStories` requires the summary, so a story selected in Task
  010 without one stays selected and stays hidden until its author writes one. `PublicStory` gains `publicSummary`; a
  story's page (`.../stories/{storySlug}`) is that same allow-list - no prose, chapters, scenes, plot or notes. Publishing
  prose is a later decision about chapters and scenes, not made here.
- **Public universes name their author's address.** `PublicUniverse` gains `authorSlug` (nine members) - see ADR 0037.
- **Owners find their way back without anything public changing.** `GET /api/universes/by-address/{slug}?lore=&story=`,
  owner-scoped, answers the owner's own universe, entry and story ids; everyone else gets a 404. The portal asks it only
  when someone is signed in, and shows "Edit this world" / "Edit in workspace" to the owner alone.
- Backup format 16 carries a story's public summary; publication never. Every restore is private.

## Amendment (2026-10-29): Publish everything

- **One owner action selects everything finished.** `GET` and `POST /api/universes/{id}/publication/everything`
  (Publish capability, owner only). It selects every live Canon lore entry and every live Complete story that has a
  public summary, with that story's live scenes' outlines and manuscripts. Idea and Draft lore, Planning and Drafting
  stories, plot arcs (planning, ADR 0039) and the Trash are never touched; a Complete story without a summary is skipped
  and named. It only adds: nothing becomes private, and an item already public keeps its address and first date.
- **Explicit, still.** The Publish page offers it only while the universe is public, and only after a confirmation that
  names every entry and story it would select, read fresh from `GET`. `POST` reads the same rule again inside one
  transaction, so it applies exactly what is eligible when it runs. Per-item selection is unchanged.
