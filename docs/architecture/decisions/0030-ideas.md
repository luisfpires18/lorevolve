# ADR 0030 - Ideas are account-owned possibilities, optionally about one universe, and never lore

Status: accepted (2026-09-14), amended 2026-09-14 (universe search - ADR 0031)

## Context

Phase 3's third feature gives an author somewhere to keep possibilities - "Maybe this city floats", "What if Mira betrays
Arlen?", "Explore a religion based on forgotten memories" - apart from what is true in a world. Lore is what is true, a
story is how something is told, a plot is what an author means to develop. None of them is the right home for "maybe".

The hard constraint is ownership. Everything authored in Lorex so far lives inside a universe (ADR 0006), and a universe's
deletion, Trash and backup all assume it. An idea often exists before any world does, or outlives one, so it cannot be
forced into a universe - and a hidden "ideas universe" would be ownership faked.

This is not a proposal or approval workflow, a task tracker or an AI feature. An AI proposal and review flow is Phase 5.

## Decision

**An idea is a possibility, and never becomes anything else by itself.** Saving, deleting or restoring one never creates
or changes an entry, a relationship, a timeline moment, a story, scene or plot, Canon, a Canon finding, a revision or the
search index. Nothing reads its text for meaning, and nothing offers to promote it. `IdeaReferenceTests` reads the whole
lore and story graph back unchanged around a full idea workflow whose text says "Canon: Arlen is dead".

### The model

- `Ideas`: `Id`, `OwnerId` (the account, cascading), `UniverseId` (nullable, `SET NULL`), `Title` (required, trimmed, 200
  characters), `Body` (plain text stored exactly, `""` for none, 20,000 characters), `CreatedAt`, `UpdatedAt`, `DeletedAt`.
- Deliberately nothing else: no status, approval, priority, due date, assignee, progress, colour, tag, folder, collection or
  manual order. Lists are most recently updated first, so nothing needs organising.
- Indexes lead with the account (`OwnerId, DeletedAt, UpdatedAt`) and with the universe (`UniverseId, DeletedAt, UpdatedAt`),
  the second serving the foreign key too.

### Ownership

**The account first, always.** Every route starts from the session and finds an idea by its id and its owner together, so
another account's idea - assigned or not - is a 404, indistinguishable from one that does not exist. A universe association
is checked against the same account and is never what grants access. Another account's universe, or content in one, is
refused in the same words as one that does not exist.

### Universe association

`UniverseId` is optional. An unassigned idea belongs to its account directly; an assigned one still belongs to its account
and additionally names one of that account's universes. The association is chosen explicitly and never inferred; nothing
attaches an idea to a universe on its own.

### References

An idea may point at existing content of **its own universe**: a lore entry, a story, a scene, a plot arc or a plot beat. An
article is not a target - it belongs to its entry - and neither is a manuscript, which belongs to its scene.

- **Five join tables**, one per kind (`IdeaEntityReferences`, `IdeaStoryReferences`, `IdeaSceneReferences`,
  `IdeaPlotArcReferences`, `IdeaPlotBeatReferences`): composite keys, an index on the target, and a cascade from both sides.
  This is the shape a scene's and a beat's links already have (ADR 0024, ADR 0026), and it keeps the foreign keys real: a
  target deleted for good takes only the reference with it, never the idea. A single polymorphic table would have had to
  enforce by hand what the schema enforces here.
- **The kind is explicit** on every request (`{ kind, id }`) and validated against that kind's table, inside the idea's
  universe. A scene's id named as a story is refused, never reinterpreted.
- **References need a universe.** An unassigned idea holds none. A save carries the universe and the references together, so
  changing the universe and the references is one save checked as one: references from another universe are refused, never
  dropped quietly. The editor asks before changing the universe of an idea that references something, and takes the
  references out of the unsaved idea in plain sight.
- **References copy nothing and mean nothing.** Names are read from the targets on every request; no backlink, relationship
  or graph is created.
- **The Trash.** A target in the Trash - or a scene, arc or beat whose story or arc is there - stays referenced and is shown
  marked ("In the Trash"), not as a link, because the Trash keeps what points at it (ADR 0015, ADR 0029). The form sends it
  back whole, so a save keeps it; it cannot be newly chosen, and the picker never offers it. Restoring the target makes the
  reference live again without anything touching the idea.
- **The picker** (`GET /api/ideas/reference-targets?universeId&kind&search`) offers live content of one kind, by name, at most
  30, owner-gated through the universe. Archived entries are not offered, as the lore pickers offer none.

### Deletion and recovery

**Deleted, not destroyed**, by a `DeletedAt` marker as everywhere else. A deleted idea leaves every list and route, keeps its
association and references, and waits in the Ideas feature's own **Recently deleted** view - globally, or filtered to one
universe inside it - with Restore. Deleting twice is refused as missing. The universe Trash does not list ideas, because an
unassigned idea has no universe to be listed in; it points to Recently deleted instead. No second recovery centre.

### Deleting a universe

**Ideas outlive the universe.** The universe delete route, in its own transaction, first deletes every reference held by the
universe's ideas - their targets are about to be deleted - then sets those ideas' `UniverseId` to null and moves their
`UpdatedAt`, then deletes the universe. Title, body and creation date are untouched; deleted ideas are released the same
way; nothing is attached to another universe. Moving `UpdatedAt` makes a window still holding the old association a stale
save rather than a save naming a universe that is gone. The schema holds the same line for any path that skips the route:
`SET NULL` on the association and the reference tables' cascades - `IdeaMigrationTests` deletes a universe row directly
and reads it back.

### Unsaved writing

The idea editor keeps a recovery copy of unsaved writing in the browser (ADR 0029's IndexedDB store, `kind: 'idea'`), with
the same lifecycle: offered, never applied; Recover restores it as unsaved; a failed, stale or orphaned save keeps it; a
matching save, Discard, Load the saved version and leaving by choice let it go; never another account's. The copy holds
title, body, universe and references.

- **Scoped to the account, not to a universe.** An existing idea's copy is keyed account / no universe / `idea` / id, so it
  survives the deletion of the universe the idea was in, as the idea does. `DraftScope.universeId` became nullable for this;
  a copy with no universe is not in the per-universe index, so a universe deletion never lets it go.
- **A new idea's copy** is keyed per place it was started: `new` globally, and `new` under the universe when started inside
  one - so a draft started in one universe is never offered in another. That one goes with its universe, like article and
  manuscript copies.
- A copy naming a universe that no longer exists is recovered unassigned, without references, and says so.
- No server-side draft table.

### Stale writes

A save names the `updatedAt` it was written over; a mismatch - or none - is 409 `idea_changed` with the stored
`updatedAt`, and nothing is written. The author chooses "Save mine over it" or "Load the saved version". A save that would
change nothing writes nothing and keeps the list order.

### No saved versions

Ideas keep no revision history. ADR 0029 reserves saved versions for long-form prose; an idea is protected against the
losses that actually happen to it - deletion by Recently deleted, unsaved edits by the recovery copy.

### Screens

- **Globally**, at `/app/ideas`, reached from the universes screen's bar without opening a world, in the same account-level
  frame as the Profile screen. The Show filter narrows to "No universe" or one universe; each row says which in words; a
  Filter box matches title or body. Filters live in the address.
- **Inside a universe**, the sidebar's greyed "Ideas" placeholder is now the Ideas section: the same list and editor, limited
  to that universe's ideas, where a new idea starts in the universe (and may be taken out of it). "All your ideas" leads out.
- **The editor**: Title, Body (plain textarea - not the article editor), Universe, References (kind in a word, a link to the
  target, context, Remove), Save and Ctrl/Cmd+S, Delete idea, the leave guard for links, Back/Forward and Sign out.
- Settings says ideas are kept when the universe is deleted, and what a backup holds.

### API

`GET /api/ideas` (`universeId` or `unassigned`, `deleted`, `search`, `page`, `pageSize` - asking for both filters is
refused), `POST /api/ideas`, `GET /api/ideas/{id}`, `PUT /api/ideas/{id}`, `DELETE /api/ideas/{id}`,
`POST /api/ideas/{id}/restore`, `GET /api/ideas/reference-targets`. A list row carries a 240-character excerpt and a
reference count, never the body; the idea itself carries the body and its references resolved in at most one query per
kind.

### Backup format version 11

Ideas that belong to a universe are authored data about it, so its backup carries them: `payload.ideas`, live ones first,
each by title then id - `id`, `title`, `body`, `createdAt`, `updatedAt`, `deletedAt`, and `references` as `{ kind, id }`
sorted by kind then id, pointing inside the same file. Deleted ideas travel marked, as ADR 0029's Trash does.

It is a bump by ADR 0014's test: an idea's title and body are authored text, and a version 10 reader would parse the file and
restore the universe with every idea about it silently gone. A file at version 10 or earlier has no `ideas`, which means
none.

**Unassigned ideas are not in any universe backup, and the product says so.** They are the account's, not a world's, and a
universe backup is not an account export (ADR 0014, ADR 0021). Putting them in one arbitrary universe's file would be false;
putting them in every file would duplicate them. So today they are protected by the database alone. An account-level export
is not built here; that limitation stands until one is.

**A future importer** gives each idea to the importing account, associates it with the universe being restored, re-creates
each reference whose target is in the file with its kind, restores `deletedAt` as it is, and never turns an idea into lore or
attaches it to any other universe. Recovery copies are never in a backup: they were never saved.

### Search, later

The persistent search bar (Phase 3's next feature) is scoped to the current universe, and may include that universe's ideas
as a clearly labelled result type. The groundwork is only what the list already has: `universeId` plus `search` over title
and body. No cross-domain index is built here, and account-wide search is not planned.

## Deliberately unsupported

- Promoting an idea into lore, a story or Canon; a proposal or approval flow; statuses, priorities, due dates, checklists,
  boards, tags, folders, collections, favourites or manual order.
- Rich text in an idea; wiki links or backlinks; a relationship graph; references across universes; an article or a
  manuscript as a target.
- Saved versions of an idea; permanent deletion of an idea (with task 023's permanent-delete work).
- An account-level backup that would carry unassigned ideas; importing ideas (Backup Import / Restore, Phase 3's last step).
- Sharing or collaboration.

## Consequences

- Lorex now holds authored data outside universes: `Ideas` is the first account-owned table of writing. Any future account
  deletion takes an account's ideas with it (`OwnerId` cascades).
- A universe delete is now a transaction that writes to the account's ideas before it removes the universe.
- Unassigned ideas have no file-level backup until an account export exists.
- A reference to content deleted for good disappears without a trace on the idea; today only a universe deletion does that.
- Two tabs writing the same unsaved idea share one recovery copy; the last to keep it wins, as ADR 0029 accepted.

## Amendment - universe search (2026-09-14)

"Search, later" is done (ADR 0031). The universe's search bar finds the account's live ideas that belong to that universe,
by title or body, as Idea results opening the idea in the universe's Ideas. An unassigned idea, another universe's idea and a
deleted idea are never results, and a recovery copy is never searched. Saving an idea now also writes its words to
`IdeaSearchIndex` - through a trigger, a derived copy, never read back as the idea - so "never ... the search index" above
holds for lore's index and not for this one. Still no lore, story, Canon or revision is touched. The global Ideas list
keeps its own filter; account-wide search is not settled.

A universe's Ideas open only that universe's ideas. An address `/app/universes/{u}/ideas/{id}` naming one of the account's
ideas that belongs to another universe, or to none, shows nothing of it - "This idea is not in …" with a link to open it in
all ideas; another account's idea, or none, is the existing "not here". An idea moved out while open keeps its notice, and a
new idea started in a universe but saved to another, or to none, opens among all ideas.

## Amendment - collaboration (2026-10-02, ADR 0041)

Ideas stay the account's. Being a member of someone else's universe shares nobody's ideas: lists, reads and universe search
return the caller's own only. An idea may still be assigned to, and point into, only a universe its author **owns**; letting
a collaborator's idea point into a shared universe would widen what an idea can see, and is left as a follow-up.

Since refinement 030 the universe picker of an idea offers only universes the account owns, so a shared universe is never
offered where it would be refused, and Ideas is not a section of a universe shared with the account.

## Amendment - Ideas workspace: three scopes and quick capture (2026-10-05, refinement 037)

Still **one** idea: account-owned (`OwnerId` the boundary), an optional universe, a title, a plain-text body, explicit
references. All ideas, a universe's ideas and a story's ideas are three views of it, never three kinds. No `Idea.StoryId`,
no new table, no migration; backup stays version **20**.

- **All** (`/app/ideas`): every live idea of the account, in a universe or none. **Universe**
  (`/app/universes/{u}/ideas`): `UniverseId == u`. **Story** (`/app/universes/{u}/stories/{s}/ideas`, a fourth view of
  the story page beside Scenes, Plot and Manuscript): the universe's ideas with at least one explicit reference to the
  story, to one of its scenes or arcs, or to a beat of one of its arcs. A direct story reference is not required. One
  idea is one row however many of the story's parts it names; an idea naming two stories is in both. Only references
  decide: never a title, a body or a name in either. A reference to a part since put in the Trash still counts.
- `GET /api/ideas?universeId=&storyId=`: `storyId` without `universeId` is 400; a story that is not live in a universe
  the caller owns is 404, alike for missing, binned, another universe's, another account's and a collaborator's. The
  filter is one EXISTS per reference kind, applied before the count and the page, and composes with search (title and
  body) and `deleted`. References survive a soft delete, so a story's Recently deleted works by the same rule and a
  restore brings the idea back to the same story. Command count per page: all 2, universe 2, story 3, at 1, 12 or 50
  matching ideas.
- **Quick capture** on every live list: one line, Enter (never while an input method is composing), the ordinary
  `POST /api/ideas` with the line as the title and an empty body. All: no universe, no references. Universe: the
  universe. Story: the universe and one direct story reference, which is what places it in the story's list. A blank
  line is refused before it is sent; the server stays the judge; a failure keeps the words; a second Enter while the
  first is on its way is ignored.
- The story's Ideas view is offered only with `keepIdeas` (the owner). A collaborator is offered no view and, by
  address, sees "not available" and asks nothing. Ideas are not collaborative.
- A story's idea opens in the one editor at `/app/universes/{u}/ideas/{id}`; Back returns to the story's list with its
  search and page, which live in the address.

Still deliberately unsupported: promotion or conversion to lore, a story or a scene; rich text, Markdown, checklists;
images; diagrams or canvases; tags, folders, statuses, priorities; autosave; sharing; any classification by content.

## Amendment - idea boards (2026-10-27, ADR 0066)

"Boards" and "diagrams or canvases" are lifted from the unsupported lists above: an account-owned board of notes, ideas and
entries, one system shown in all ideas and in a universe's Ideas, never lore. Everything else here stands. See ADR 0066.
