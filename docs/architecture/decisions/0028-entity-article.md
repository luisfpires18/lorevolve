# ADR 0028 - An entry's article lives in a row of its own, with its own history, saved on its own route

Status: accepted (2026-09-13), amended 2026-09-14 (merge readiness: an entry write carrying the article is refused, and
Back and Forward ask), amended 2026-09-14 (recovered drafts - ADR 0029), amended 2026-09-14 (universe search - ADR 0031)

## Context

Phase 3 opens with long-form lore articles: the prose an author writes about an entry, beside its structured lore. The
repository already had one. Every entry carried an optional article in `Entities.Content` - a Tiptap document with
headings, bold, italic, lists, quotes and links, up to 200,000 characters - edited in the entry's whole Edit form,
indexed by search (ADR 0016), carried in every backup since version 1, and copied into every entry revision (ADR 0013).

What it lacked was what the manuscript taught (ADR 0027): the article was saved with every structured field and every
structured field with it, so two windows silently overwrote each other; the one-click Canon change re-sent the page's copy
of the article, so promoting an entry in one tab could put back an article older than one saved in another; every status
click copied the whole article into history; restoring an old version rewrote the article too; and the editor had no
explicit save state, no Ctrl+S and no protection against leaving unsaved prose.

The Phase 3 brief asked for plain text. Turning the existing documents into plain text cannot be done without losing
formatting and link addresses from lore already written, so the owner decided (2026-09-13) to keep the existing format and
give the article everything else the brief asked for.

## Decision

**Article and structured lore are different things.** The structured entry - name, summary, type, Canon status, aliases,
tags, field values - is what Lorex can compare, filter and check. The article is what the author writes about it. It is
one optional article per entry, reached by opening the entry: no second object, type, title, category or status.

**The format is kept.** The article stays the Tiptap document the editor already writes, validated structurally by
`LoreContent` (a document, bounded depth, only `http`, `https` and `mailto` links) and bounded by
`LoreLimits.ContentMaxLength` - 200,000 characters of JSON, mirrored client-side as `ARTICLE_MAX_LENGTH`. Nothing is added
to the editor. Rendering is still ProseMirror's schema building DOM nodes; no HTML is parsed from an article anywhere.

**It is a row of its own.** `EntityArticles` - `EntityId` as key and cascading foreign key, `Content`, `UpdatedAt` - in
`Features/Lore`, with no navigation from `LoreEntity`. `Entities.Content` is gone, so a structured edit, a promotion, a
trash, a restore, a picker and the backup's entity read never load an article. No row until a save writes something; a
save that clears an article keeps the row with `""`. The API has one shape either way: `content: ""`, `updatedAt: null`
when nothing was ever saved.

**Its own route, and no other payload.** `GET` and `PUT /api/universes/{u}/entities/{e}/article`; request
`{ content, expectedUpdatedAt }`, response `{ entityId, content, updatedAt }`. Ownership is proved on the universe, then a
live entry in it: an entry in the Trash, in another universe or someone else's answers 404, and validation runs after
ownership. Null `content` is refused, so a malformed body cannot wipe an article; a blank document is stored as `""`.
`EntityRequest` and `EntityDetail` no longer carry an article, and a client that still sends `content` to the entry route
is refused whole (amendment below). Listings, search results, the Trash and entry history carry none.

**No silent overwrite.** The manuscript's comparison (ADR 0027): a save names the `updatedAt` it was written over, and a
mismatch inside the write's own transaction is 409 `entity_article_changed` carrying the stored moment, with nothing
written. A save that would store exactly what is stored writes nothing and records nothing.

**What a save touches.** The article row, its next version, the search index row, and the entry's `UpdatedAt` - through a
single-column update, so the entry still sorts as recently authored and no structured value is read or written back. No
Canon gate, finding or reconciliation, relationship, timeline entry, field or entry revision.

**Canon.** The article has no status. It is exactly as settled as its entry, whose Canon control is above it, and it is
never read for meaning: "He died in 340" gives nobody a death year. Its validation is structural only and is never
presented as a check of what the prose says.

**Its own history.** `EntityArticleRevisions` - id, entry (cascading key), a number unique per entry, kind (`Created` for
the first version, `Edited`, `Restored`), `RestoredFromRevisionId` as a raw id, `CreatedAt`, and the whole document (`""`
for a save that cleared it). Every save that changes the article records the next version. `GET .../article/revisions`
lists them newest first with no text; `GET .../revisions/{id}` reads one; `POST .../revisions/{id}/restore` with
`{ expectedUpdatedAt }` puts one back through the same write - refused like any stale save, recorded as `Restored` naming
its source, and a no-op if it would change nothing. Nothing on record is rewritten or removed.

**Entry history no longer holds the article.** Revision capture neither reads nor compares it, so a status click records a
small version and never a copy of a long article. `EntityRevisionChange.Article` appears only on versions recorded before
this decision. **Restoring an entry version never touches the article**: putting back an old name cannot put back - or wipe
- an article saved since.

**Versions recorded before.** An entry version from before this decision still holds the copy of the article it recorded
(`EntityRevisions.Content`). It stays readable, labelled on the version as "the article as it read then", is never compared,
and is never applied by a restore. The migration makes the article as it stood version 1 of the article's own history, so
everything from then on is restorable there; older article states can be read in those entry versions and copied by hand,
and are not offered as article restores.

**Search.** The index keeps its shape (ADR 0016). `ReindexAsync` reads the article row; the article's save and restore
reindex inside their transaction. A search result gains `articleExcerpt`: FTS5's `snippet` over the `Article` column,
sixteen words, capped at 240 characters, computed for the page's ids only and only when the article itself matched - never
for a hit on the name, an alias or the summary. It reaches the client as runs of plain text with the matched words flagged,
drawn as React text and `<mark>`. Trash, archive, type and status filtering are unchanged, because the excerpt is only ever
cut for rows those filters returned. Story and manuscript text are still never indexed.

**Deleting.** Trashing an entry keeps its article and history untouched and unreachable; restoring it brings both back with
the same content and moment, and search follows `DeletedAt` as before. Deleting a universe, or an entry row, cascades to the
article and its versions, and the existing trigger takes the index row. No new permanent-delete workflow.

**A backup carries the article and its history, and that is format version 9** (ADR 0014).

**The entry page.** The article is a section of the entry, headed "Article":

- Reading shows the article, or "No article yet." with Write the article; Edit article opens the editor with the caret at
  the end. A new entry writes its article once it has been created.
- Writing has one sticky bar at the writing's measure: a live status (Nothing saved yet, Unsaved changes, Saving…, Saved),
  Done and Save. Ctrl+S / Cmd+S saves only while the article is open and the focus is in it, or nowhere; anywhere else, and
  while only reading, the shortcut is the browser's.
- A failed save keeps the text and the unsaved state. A stale one offers "Save mine over it" or "Load the saved version"
  after a confirmation. An entry gone meanwhile says so and keeps the text to copy. An over-long document says so before a
  save. Unsaved is measured against the document as this editor serialised it on opening, so opening an article and closing
  it is never "unsaved".
- `useLeaveGuard` asks before a link, Sign out, the browser's Back or Forward, or leaving the page drops unsaved text, and
  Done asks too (amendment below).
- One editor at a time: while the entry's form is open the article cannot be opened, and while the article is open the
  entry's actions step aside, so a phone never shows two bars at its foot. Done returns the focus to the button that opened
  the writing.
- Under the article, "Article history" opens on request: each version with when, what it was (First version, Saved, Cleared
  the article, Restored version N), View in place, and Restore. The entry's own History says the article keeps its own.
- A search card whose article matched shows the excerpt, "In the article", with the matched words marked.

**Migration `AddEntityArticles`.** Creates both tables, copies every non-blank `Entities.Content` exactly, and seeds version
1 of each (random uppercase text ids, the schema's Guid form; dated by the entry's `UpdatedAt`). Then it drops the column
with SQLite's own `ALTER TABLE ... DROP COLUMN` instead of EF Core's table rebuild, which would drop and recreate the table
every other lore table references and silently lose the search index's delete trigger. Rolling back puts the article as it
stands back on each entry (a cleared one as null) and discards the article history.

## Deferred

- Plain text, Markdown or any new formatting; wiki links, mentions and backlinks.
- Diffs between versions, pruning or coalescing history, and restoring article text held in pre-decision entry versions
  from the screen.
- Autosave, local draft recovery and broader Content Recovery.
- Word counts, collaboration, presence.
- Reading a backup back in (the last Phase 3 feature).

## Consequences

- A changing save stores the document twice - the current row and its version - bounded by explicit saves and the 200,000
  character limit. History grows with edits, as ADR 0013 already accepts.
- A search page runs three queries: the scored ids, the cards, and the excerpts.
- The excerpt's match markers are the private-use characters U+E000 and U+E001; an article that itself contains them could
  mark the wrong words in an excerpt. Display only.
- Every save sends and compares the whole document.
- A client from before this change cannot save an entry at all until it is reloaded: every entry write it makes carries
  the article member and is refused, which is the point - it is told, rather than answered as saved.
- Rolling the migration back discards article history.

## Amendment - merge readiness (2026-09-14)

Two gaps found before merge, closed without a schema, backup format or article API change.

**An entry write that still carries the article is refused.** The serializer skips members a request record does not
declare, so a client from before the move could send its article with the entry, be answered 200, and lose the article.
`EntityRequest` now declares `content` for one purpose - to see it (`LegacyContent`, a `JsonElement`, never written back
out). When the member is present at all, `POST` and `PUT .../entities` answer **400**, a validation problem with
`code: entity_article_moved`, `errors.content`, and a detail naming `.../entities/{entityId}/article`:

- Any value is refused, null included - from an old editor, null meant "clear the article" - and the member is matched
  case-insensitively, as every member is.
- It is checked after ownership, so a stranger still gets the same bare 404, and before the Canon gate or any read or write,
  so nothing is saved: not the entry, not its article, no revision, finding or timestamp.
- It is never forwarded to the article route. That write names the `updatedAt` it was written over, and a forwarded one
  could not, so it could overwrite newer prose.
- Other unknown members are still skipped, as the serializer always has. The web client sends no article member.

**Back and Forward ask too.** ADR 0027 left them uncaught because only a data router can hold a history move and put it
back. The app now runs on one: `createBrowserRouter` with a single catch-all route whose element is the existing providers
and `<Routes>`, unchanged - every route, layout and link resolves as before. `HistoryLeaveGuard`, mounted once inside it,
uses `useBlocker` for history moves only, while a `useLeaveGuard` question is standing, and asks that question through
`confirmLeaving`:

- React Router puts the held move back at once and makes it again only when the author chooses to leave. Staying changes
  no route, so the editor, its unsaved text, its state and its focus are exactly as they were, and the address never shows
  the page being left.
- Links and Sign out ask before they navigate, as before, and push or replace rather than move through history, so they are
  never held as well: every action asks once.
- A move to a page from before Lorex loaded leaves the document, and the browser's own prompt asks about that.
- The manuscript editor shares the guard and asks the same way. That supersedes ADR 0027's decision.

## Amendment - recovered drafts (2026-09-14)

The deferred "local draft recovery" is done (ADR 0029); autosave is still not. While the article is written with unsaved
changes, the browser keeps a recovery copy of the document; when the entry opens with a copy that differs from what is saved,
the saved article is shown and "Recovered draft" is offered above it - read it, recover it into the editor as unsaved changes,
or discard it. Edit article waits for that choice. Done without saving, Load the saved version, and answering "leave" to the
leave guard let the copy go, through `useLeaveGuard`'s new `onLeave`; a failed, stale or orphaned save keeps it. The article's
route, history, stale-save refusal and search are unchanged, and no copy ever reaches them.

## Amendment - universe search (2026-09-14)

An article's words are also found by the universe's search bar (ADR 0031): one result per entry, saying "In the article"
with the excerpt, opening the entry at `#article` with the focus on the Article heading. The consequence above - an
article holding U+E000 or U+E001 could mark the wrong words - is closed: the index writes those two characters as spaces,
so no author's text can be read back as a marker. "Story and manuscript text are still never indexed" is superseded for
the universe search; the Lore search is unchanged.

## Amendment - the entry's three views (2026-09-22)

Found by using Lorex to migrate a real world into it. The entry page worked and read badly: the type and the Canon
control floated above a title they did not obviously belong to, the picture sat at one edge of a band that was mostly
empty beside it, Relations and History stacked under the article so that an entry grew to whatever its author had
written, and the entry's own Edit, Family tree and Move to Trash were at the bottom of all of it. No schema, API,
Canon, backup or search change - a hierarchy fix and a routing one.

**One header, and everything that acts on the entry is in it.** "Lore / Character" as one line of metadata above the
title, the Canon control at its far end, then the name, the aliases and the summary. Under that, one bar: the entry's
views on the left and Edit, Family tree and Move to Trash on the right, quiet buttons, the Trash one quieter still and
turning to the danger colour only under the pointer. The bar sits above the article, so none of it depends on how long
the entry has grown, and all of it is on screen unscrolled at 390px and at 1440px. Canon's semantics, wording and
one-click promotion are untouched. Nothing in any of it reads the entry's type.

**Article, Relations and History are three addresses.** `/lore/{id}` is the article and stays the default, so every
existing deep link - a search result's `#article`, a family tree's Open entry, a relation's other end, a Canon finding,
a scene's lore chip, the Trash - lands exactly where it did. `/lore/{id}/relations` and `/lore/{id}/history` are the
other two. They are routed links with `aria-current="page"`, not a tablist: each one reloads, is linkable, and the
browser's Back leaves it. Nothing is shown on two views at once, and each view reads only what it needs, so the article
route no longer fetches relations and revisions nobody asked for. No new stored field: which view is open is in the
address and nowhere else.

**The domain boundary between the two histories is kept exactly.** The article's own history is still under the
article, on the Article view. History is the entry's structured versions, and still says the article keeps its own.
Neither was merged and neither learned about the other.

**The entry's form belongs to the Article view.** Edit is in the header, so it can be pressed from any of the three; it
opens the form where the details it edits are shown. While the form is open the views step aside, and while the article
is being written the entry's tools step aside - the one-editor rule above, unchanged. The consequence, which is
deliberate: Family tree and Move to Trash are not on the page while an article is being written, so the one way out of
an entry that is not a link cannot be taken with unsaved writing behind it.

**Unsaved writing is asked about exactly as it was.** `useLeaveGuard` watches every same-origin link in the capture
phase, and the views are ordinary links, so switching to Relations or History asks the same question once, keeps the
address and the text when the author stays, and lets the recovery copy go only when they choose to leave. No second
dialog, and `HistoryLeaveGuard` still holds Back and Forward.

**The picture is placed rather than banded.** It is the article's, centred in the article's column and shrink-wrapped
by its own border, bounded by `max-height: min(22rem, 45vh)` and the column's width. Only maxima are set, so a portrait
is held to a readable height, a landscape to the column, and a small picture is shown at its own size rather than blown
up. The space it will take is still reserved before it loads - from the `width` and `height` attributes it already
carried, which is what the fixed band was for. An entry with no picture has no plate at all.

## Amendment - relationships are stored once (2026-09-22)

The duplicate rule that ADR 0008 now carries is why an entry's Relations view cannot show the same connection twice,
and why the family tree draws one line where a database written before the rule holds two. Nothing about an article.

## Amendment - the version, not the moment (2026-10-14, ADR 0043)

A save and a restore now name the stored `version` (0 before the first save) as `expectedVersion`, instead of
`expectedUpdatedAt`; `updatedAt` is still read and still carried on the 409. A refused save no longer offers to write
straight over the newer text: the author reviews the latest first, then keeps their own text - which the next save names
the reviewed version over - or takes the latest. Everything else here is unchanged.
