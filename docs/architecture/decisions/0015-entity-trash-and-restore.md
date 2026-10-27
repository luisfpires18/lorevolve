# ADR 0015 - An entry is trashed by a marker, and nothing that points at it is destroyed

Status: accepted (2026-09-09), amended 2026-09-14 (the Trash also holds story content - ADR 0029)

## Context

`DELETE /api/universes/{id}/entities/{entityId}` removed a row. Because the schema is honest
about what depends on an entry, that one row took a great deal with it: its aliases, its tags,
its stored values, its whole revision history (ADR 0013 made `EntityId` a cascading key and
said Trash was a later concern - this is it), every relationship it stood at either end of, and
every timeline participation naming it. References held by *other* entries were set to null.

None of that was recoverable, and the confirmation said so. It is the only place in LorEvolve where
one click destroys a large amount of authored work. Universe deletion is the other, and it is
already gated behind archiving.

The hard part is not hiding a row. It is deciding what happens to everything that points at one.

## Decision

**Only lore entries are trashable.** Everything else the API deletes is either one small row a
deliberate action removed (a relationship, a moment), a derived record nothing authors (a Canon
conflict - ADR 0010), or a configuration object whose deletion is already refused while anything
depends on it (a type, a field, an option, a relationship type). An entry is the one thing whose
removal used to destroy work at scale, so it is the one thing with a Trash. This is not a
recycle bin for the object model.

**The Trash is a marker, not a table.** `LoreEntity.DeletedAt` is a nullable UTC timestamp; null
is live. A dedicated trash record would have to answer the same question the marker answers for
free: every dependent row is a foreign key to `Entities.Id`, so taking the row out of the table
means either cascading those away - destroying exactly the lore this ADR exists to protect - or
copying the graph into a parallel schema and replaying it, at which point a restore becomes a
rebuild that can fail halfway. With a marker there is nothing to rebuild. A timestamp rather
than a flag, because the Trash listing has to say when, and two columns that must agree is one
too many.

**Not a global query filter.** EF Core's `HasQueryFilter` follows navigations, and the reads
that must see a trashed entry (the backup, the Trash itself) and the reads that must not
(browse, search, pickers, every Canon rule) reach it through those same navigations.
`IgnoreQueryFilters` is all-or-nothing per query and could not separate them, so a filter would
be silently right in one place and silently wrong in another. Every read states which it wants.

**Nothing dependent is deleted, and one rule decides what is shown.**

> Hide what nothing rewrites. Mark what something rewrites.

| Dependency | While the entry is trashed | On restore |
| --- | --- | --- |
| Relationships (either end) | Stored; hidden from every read, and refused for edit and delete | Reappear, both readings intact |
| Timeline participation | Stored; **shown** on the moment, flagged `isTrashed` | Flag clears |
| An entity-reference value on another entry | Stored; **shown** on that entry, flagged `referencedEntityIsTrashed` | Flag clears |
| A scene's point of view or linked lore (ADR 0024, amended 2026-09-13) | Stored; **shown** on the scene, flagged `isTrashed`; kept on save, refused if newly chosen | Flag clears |
| Aliases, tags, values, article | Stored, unreachable | Come back whole |
| Revision history | Stored, unreachable | Readable again, unchanged |

The split is derived rather than arbitrary. A relationship is a row of its own that no client
posts back, so hiding it destroys nothing. A moment's participant set and an entry's field set
are both sent back **whole on every save**, so a hidden one would be deleted the next time the
author edited the date or an unrelated field. Those two are therefore shown and marked, and
their write paths deliberately still accept a trashed id - refusing it would turn any unrelated
edit into a validation failure. Discoverability is the picker's job: the entity listing never
offers a trashed entry, so a *new* reference or participation cannot be authored against one.
Creating a relationship, by contrast, does refuse a trashed end, because nothing round-trips it.

**A trashed entry contributes no facts.** Every Canon rule reads only live entries. Trashing
therefore runs through `CanonPromotionGate.RecordAsync` - reconciled, not gated - because
removing lore can only take findings away and there is nothing to refuse; findings about the
entry resolve on the trash write itself, so nothing stays actionable about lore that is not in
the world. Restoring runs through `RunAsync`, because it adds facts back and any of them can
newly contradict what was written meanwhile. A restore that would introduce a High fingerprint
the universe does not already carry is refused with the same 409 as any other write, rolled back
whole, and the entry is still in the Trash afterwards. Medium and Low block nothing (ADR 0012).

**Nothing revalidates a restore, because nothing can have gone stale.** The entry's type cannot
have been deleted (the key is `Restrict`, and a trashed entry still counts as using it - the
refusal message says the Trash counts), nor can a field definition holding one of its values or
an option one of them chose. So a restore puts back exactly the rows that were stored, and canon
is the only thing that can refuse it.

**Neither trashing nor restoring writes a revision.** They change no authored content, and ADR
0013 already says a write that changed nothing writes nothing; adding `Trashed` and `Restored`
kinds would make history an event log, which it is deliberately not. This makes two restores
worth distinguishing: **restoring from the Trash** reconstructs the stored entry and leaves the
history exactly as long as it was, while **restoring a revision** replays an older snapshot
through the ordinary update and writes a new version. Only the second is history.

**A restore never renames and never refuses on a name.** Entry names are not unique inside a
universe - the index on `(UniverseId, Name)` is not unique and never was - so a name written
while an entry sat in the Trash cannot collide with it. Both stand.

**No permanent delete.** Deferred, on the reading that a recovery phase should not ship the
thing it is recovering from. *Superseded 2026-09-30: permanent deletion exists, from the Trash only - see the amendment below.* `DELETE` keeps its route and its 204 and now means "move to Trash";
the wording throughout the client says recovery is available.

**A backup carries the Trash.** Trashed entries are authored lore the owner has not thrown away
irrecoverably, so `BackupEntity.DeletedAt` travels with them (ADR 0014). That bump is argued
there.

## Consequences

- **A type used only by trashed entries cannot be deleted, and there is no way to free it**
  except restoring the entry, moving it to another type, and trashing it again. That is the
  price of deferring permanent deletion, and it is recorded as an owner decision in `STATE.md`
  rather than papered over. The refusal names the Trash so the author is not told to move
  something invisible.
- Nothing shrinks. A universe's row count only ever grows until the universe itself is deleted,
  which is the one remaining path that still cascades an entry's history away.
- Every read of `Entities` now has to say whether it wants live rows. A new query that forgets
  is a leak of trashed lore into the world, and the suite pins the paths that exist today rather
  than the model preventing it structurally - the tradeoff taken over a query filter above.
- Tag counts and the entity listing exclude trashed entries, so the browse filter never promises
  a result it will not return. The entity type's own `entityCount` includes them, because that
  number is what the deletion refusal is about.
- A trashed entry's page, its history and its relationships all answer 404. It is not editable,
  and trashing one twice is refused rather than re-stamped, so the moment it was thrown away
  cannot be moved by a repeated click.

## Amendment - story content (2026-09-14)

"Only lore entries are trashable" no longer holds. ADR 0029 gives stories, chapters, scenes, plot arcs and beats the same
marker, because deleting any of them used to destroy prose and planning at once. The rest of this decision stands and is
reused: a marker, not a table; no global query filter; nothing dependent deleted; neither trashing nor restoring writes a
version; no permanent delete; the backup carries the Trash. What story content adds is its own - orders that hold live rows
only, restores that append, content that waits for its story or arc, and one deliberate difference from the rule above: a
beat's link to a scene in the Trash is hidden rather than marked, and kept by the server through saves no client could see it
in. The Trash listing now holds every kind, and each kind restores on its own typed route.

## Amendment - moving entries to the Trash together (2026-09-30, Product refinement 020)

`POST /api/universes/{universeId}/entities/bulk-trash` (`{ entityIds }`, 1-100) is the single move, for each entry, in one
write that is all or nothing: every id is checked to be a live entry of the universe before anything is written - unknown,
another universe's and already-trashed ids refused alike, keyed by position, so nothing is disclosed - then each is trashed
through the same `TrashCoreAsync` inside one Canon `RecordAsync`, reconciled once. A failure on any row leaves every entry
in Lore. Nothing about the marker changes: no row erased, every entry restores on its own, and a type used only by entries
in the Trash still cannot be deleted.

## Amendment - deleting permanently, from the Trash only (2026-09-30, Product refinement 021)

The deferred permanent delete now exists, and only here. **Move to Trash is not Delete permanently.** `DELETE .../entities/{id}`
(and `bulk-trash`) still only set the marker; `DELETE /api/universes/{universeId}/trash/{entityId}` erases, and finds its entry
only through its universe *with the marker set* - a live, missing or other world's id is a 404 and nothing is written. The
same typed-route rule as restore: nothing guesses what an id is. 204 on success.

What goes is what the schema already says the entry owns - its aliases, tag links, values, article and article versions,
entry versions and their rows, image row, relationships at either end, timeline participation, scene and beat links and idea
references cascade; a scene's point of view is cleared. Three things are done explicitly, because a cascade would leave them
in a state no write produces: another entry's reference value pointing at it is **removed** (a write never stores an empty
reference, so the field reads empty and a required one asks to be filled on its next save); a moment's validation details
naming it as their only part are removed, as clearing all three on a save does; and every recorded Canon finding naming it -
or a relationship that went with it - is forgotten, whatever its status. No placeholder or tombstone is kept. A tag stays
universe vocabulary, as when an edit drops it. Saved versions of *other* entries keep the id and name they recorded, as they
do for a deleted option or era; restoring such a version names the missing entry, exactly as before.

It runs inside `CanonPromotionGate.RecordAsync` - reconciled, never gated: a trashed entry contributes no facts, so erasing it
cannot add a finding, but it rewrites live rows the rules read and the conflict table must describe what is left, in the same
transaction. The image's object keys are read first; the original and thumbnail are swept after the commit through the
existing media sweep, and a sweep that fails is logged as orphaned media, never a reason to undo (ADR 0019). A failed database
delete sweeps nothing.

The consequence recorded above is closed: once the last entry using a type, field or option is erased, the ordinary reference
counts fall to zero and the type, field or option can be deleted - no special case. No migration, no backup format change: a
backup made afterwards simply does not hold what was erased; importing an older one is a backup restore, not a Trash restore.
Emptying the Trash, bulk permanent deletion and retention are still not offered. *(Bulk permanent deletion since
2026-10-01 - see the next amendment.)*

## Amendment - deleting a selection permanently (2026-10-01, Product refinement 023)

The Trash can erase several rows at once, of any mix of its seven kinds, in one request:
`POST /api/universes/{universeId}/trash/bulk-delete` with `{ items: [{ kind, id }] }`. Each row is named by its `TrashItemKind`
and id - never probed for. Owner first (another account's universe is a 404); then the shape - 1 to 100 items, each a known
kind and a non-empty id, no `(kind, id)` twice - refused as a validation problem keyed `items` / `items[3].kind`, never
truncated; then the selection itself.

**All or none, checked whole first.** Inside one transaction every selected row must resolve as exactly its kind, in this
universe, with the marker set. One that does not - live, missing, already erased, another world's, another kind's, restored in
another tab - refuses the whole request with 409 `trash_selection_changed` ("The Trash changed before these items could be
deleted. Refresh and select them again."), naming no id, and nothing is written. Only then does the plan run.

**One plan, one row or many.** The single typed routes now run the same plan with a one-row selection (`TrashPermanentDelete`
`PlanAsync`), so the two cannot drift; their contracts are unchanged (404, 204, a story's 200 `TrashErasedStory`). The plan erases
by set, parents first: entries (references to any of them removed, emptied moment details removed, findings naming them or
their relationships forgotten), stories, arcs, chapters, scenes, beats, rules (findings forgotten). **Overlap is valid**: a
story with its own separately binned scene, chapter or arc, an arc with its beat - both resolved before anything was written,
the parent's cascade satisfies the child, whose own statement then matches nothing. Request order never matters. A selected
story or arc still takes owned rows nobody selected; a selected chapter still takes none of its former scenes.

A selection holding any entry runs inside `CanonPromotionGate.RecordAsync` once for the batch - reconciled, never gated; one
with none uses a plain transaction. Every erased entry's image keys are read first and swept after the commit, best effort;
a failed sweep is logged orphaned media, a failed transaction sweeps nothing.

200 `TrashBulkErased { deleted, erasedEntryIds, erasedSceneIds }`: `deleted` counts selected rows (each once, also when a
parent's cascade took it); `erasedSceneIds` are the selected scenes plus every scene of a selected story, never a chapter's.
The client drops exactly those recovery copies - each entry's article, each scene's manuscript - after the server answers and
never on any failure.

The Trash screen's **Select** mirrors Lore's: page-scoped (another page, a reload or leaving drops it), rows become their
checkbox's label, row actions step aside, Select page / Clear selection / Done, and one red **Delete permanently (N)** that asks
once - every selected row by kind and name, each selected kind's consequence, "This cannot be undone." No migration, no
backup change. Still not offered: Empty Trash, bulk Restore, cross-page selection, retention.
