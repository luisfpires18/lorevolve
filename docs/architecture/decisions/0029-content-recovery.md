# ADR 0029 - Content recovery: saved versions, a Trash for story content, and recovery copies of unsaved writing

Status: accepted (2026-09-14), amended 2026-09-14 (ideas keep recovery copies too, scoped to the account - ADR 0030), 2026-09-15
(world rules use the Trash - ADR 0033)

## Context

Phase 3's second feature asks LorEvolve to give authored writing back when it is lost. Writing is lost in three different ways,
and each needs a different answer:

- **Saved, then changed.** The author wants an earlier saved text back. Entries (ADR 0013) and articles (ADR 0028) already
  keep saved versions. A scene's manuscript - the longest writing in LorEvolve - kept none: every save replaced the last.
- **Deleted.** Lore entries go to a Trash (ADR 0015). Everything in a story did not: deleting a story took its chapters,
  scenes, every word of prose and its plot; deleting a scene took its prose and links; an arc took its beats; a chapter took
  its title, summary and notes. All permanent, behind a confirmation.
- **Never saved.** Saving is explicit (ADR 0027, ADR 0028). A crash, a closed tab or a dead battery between two saves lost
  everything typed since the last one; the leave guard only asks when the page is left in an orderly way.

Backup Import / Restore is a fourth, separate problem and stays the last Phase 3 feature.

## Decision

**Three recoveries, kept apart in the model, the API and the screen.**

| | Recovers | Where it lives | Where the author finds it |
| --- | --- | --- | --- |
| Saved versions | Earlier successfully saved text | Server, per item | The item's own history |
| Trash | Deleted objects, whole | Server, a marker per row | The universe's Trash |
| Recovered drafts | Writing never successfully saved | This browser only | The editor, when there is one to offer |

None of them promotes anything into Canon, reads writing for meaning, or reinterprets what the author recorded.

### The recovery matrix

| Content | Saved versions | Trash | Recovered draft |
| --- | --- | --- | --- |
| Entry (structured lore) | Entry history, ADR 0013 | Yes, ADR 0015 | No |
| Entry article | Article history, ADR 0028 | With its entry | **Yes** |
| Story | No | **Yes**, holding everything | No |
| Chapter | No | **Yes**, holding no scene | No |
| Scene (planning) | No | **Yes**, with its prose, versions and links | No |
| Scene manuscript | **Yes** | With its scene | **Yes** |
| Plot arc | No | **Yes**, with its beats | No |
| Plot beat | No | **Yes**, with its links | No |
| Idea (ADR 0030) | No | Recently deleted, in Ideas | **Yes** |
| World rule (ADR 0033) | No | **Yes**, the universe's Trash | No |

Short text and structure are deliberately not versioned: a story's title and status, a chapter's or arc's notes, a scene's
summary and every reorder, move and link change would grow a history no author asked for. They are protected against the
loss that actually happens to them - deletion - by the Trash. Their forms are short-lived drawers, not long-form editors, so
they get no recovered draft either.

### Saved versions for a manuscript

- `SceneManuscriptRevisions`: id, scene (cascading key), a number unique per scene, kind (`Created`, `Edited`, `Restored`),
  `RestoredFromRevisionId` as a raw id, `CreatedAt`, and the whole text. The article's shape (ADR 0028), apart from the
  domain: the kind enum is the story's own, so Story depends on Lore no more than it did.
- **Every save that changes the prose records the next version, and a save that changes nothing writes nothing**: no row, no
  version, no `UpdatedAt` on the manuscript or the story. That amends ADR 0027, where an identical save still wrote and moved
  both timestamps, and `""` over nothing created an empty row. The stale check still comes first, so an unchanged text written
  over an older save is refused, not answered as saved.
- `GET .../manuscript/revisions` lists newest first **with no text** (`isEmpty` says a save emptied it);
  `GET .../revisions/{id}` reads one whole; `POST .../revisions/{id}/restore` with `{ expectedUpdatedAt }` puts one back
  through the same write a save uses - refused with 409 `scene_manuscript_changed` when the prose moved on, recorded as
  `Restored` naming its source, a no-op when it would change nothing. Nothing on record is rewritten or removed. The story,
  scene, chapter and plot reads carry neither versions nor prose.
- Ownership is the manuscript's: the universe, a live story in it, a live scene in that story. A scene in the Trash keeps its
  history out of reach and brings it back with it.
- The migration makes each existing manuscript version 1 of its history, byte for byte, dated by its last save.

### The Trash for story content

**A marker, as for entries.** `DeletedAt` on `Stories`, `Chapters`, `Scenes`, `PlotArcs` and `PlotBeats`; null is live.
Only the thing deleted is marked. Nothing it holds or points at moves or is deleted, so a restore is clearing one column and
there is no graph to rebuild. Not a global query filter, for ADR 0015's reason: the backup and the Trash must see marked rows
through the same navigations the workspace must not. Every story read and write states that it wants live rows - the story,
chapter, scene, arc and beat finders, both order helpers, the story list's scene count, the plot read and the manuscript
routes - and a marked row, or anything reached through one, answers 404 like a missing one. Deleting twice is refused rather
than re-stamped.

**Orders hold live rows only.** A marked row keeps the `SortOrder` it had and holds no place: the unique order indexes are
recreated filtered on `"DeletedAt" IS NULL`, delete still closes the gap, and appends, reorders and moves see live rows only.
Plain indexes on `Chapters.StoryId`, `Scenes.ChapterId`, `PlotArcs.StoryId` and `PlotBeats.PlotArcId` serve the foreign keys
the partial indexes no longer can.

**Deleting a chapter never deletes a scene - unchanged.** Its live scenes still move, in order, to the end of Unchaptered, and
then the chapter is marked. A scene already in the Trash leaves the chapter too (its `ChapterId` is cleared), so **a chapter in
the Trash holds no scene**, and restoring one moves none: it comes back empty, last among its story's chapters. Pulling scenes
back into it would overwrite whatever the author has done with them since.

**Restores append, never insert.** A chapter or arc comes back last among its live siblings, a beat last in its arc, and a
scene last in its own chapter when that chapter is live - otherwise in Unchaptered, where a deleted chapter's scenes go. No
other row moves. Titles are not unique, so nothing is renamed. The story's `UpdatedAt` moves for a chapter, scene, arc or
beat - its structure changed - and not for a story's own trash or restore, which writes nothing in it.

**Never into something that is not there.** Content whose story is in the Trash, or a beat whose arc is, is refused with 409
`trash_parent_in_trash`, `blockedBy` (`story` or `arc`) and a detail naming it. It is never attached elsewhere, and restoring
it never pulls its container back. The Trash lists such a row with `blockedBy` so the screen can say so before anyone tries.

**A beat's link to a scene in the Trash is kept and hidden.** The plot read leaves it out, so no client can send it back -
which is exactly why a beat save keeps it whatever it sends, and it reappears with its scene. This deviates from ADR 0015's
"mark what something rewrites" deliberately: the server can preserve what the client never saw, and a marked chip would lead
nowhere a client can open. A scene in the Trash cannot be newly linked, refused in the words used for a scene that does not
exist.

**One Trash, extended.** `GET .../trash` lists every kind as `TrashItem` - `kind`, id, name, `trashedAt`, the entry's type and
Canon status for an entry, `storyId`/`storyTitle` and a beat's `plotArcId`/`plotArcTitle` for context, and `blockedBy` -
newest first, paged. Names and places only; no article, prose or notes. Only what was itself deleted is listed: what sits
inside a deleted story is not a row of its own. Six compact reads merged in memory, not a SQL union - a Trash is thrown away by
hand and stays small next to that cost. Restores are typed routes, never a guess at what an id is:
`POST .../trash/{entityId}/restore` (unchanged, gated by Canon) and `.../trash/stories|chapters|scenes|plot-arcs|plot-beats/{id}/restore`,
each answering `{ kind, id, storyId }`. Story content passes no Canon gate (ADR 0024). Every route is owner-gated through the
universe and finds its row only through that universe, so another world's id - or another account's - is a 404.

**Still no permanent delete.** Only deleting the universe removes story content for good. *(Superseded 2026-09-30 -
see the amendment on permanent deletion.)* An era a scene in the Trash is dated
in stays in use, as the chronology refusal already says ("counting anything in the Trash").

### Recovered drafts

**A recovery copy is not a save.** It never reaches the API, becomes a version, moves a timestamp, touches Canon or appears in
a backup. Saving stays explicit, and a recovered copy is only ever unsaved writing.

**IndexedDB, native, no dependency.** `lib/localDrafts.ts` keeps one record per copy in the `drafts` store of the
`lorex-recovery` database (name kept through the LorEvolve rename, ADR 0067). `localStorage` was ruled out: an article is up to 200,000 characters of document and a manuscript
up to a million, `localStorage` holds a few megabytes for the whole site, is synchronous on the main thread and fails by
throwing mid-keystroke. Each copy's reads, writes and deletes run in one queue per key, so a delete asked for after a write
lands after it.

**Scoped to the account.** The key is account id, universe id, kind (`article` or `manuscript`) and the entry or scene id, and
a record is only handed to the account it names. No credential, token or cookie is stored. **Signing out destroys nothing** -
that would defeat recovery - and another account on the same browser is never offered a copy; the owner is offered it again on
return. Anyone with the browser profile itself can read its storage, as they could its cache: that trust boundary is the
device's, not LorEvolve's.

**Lifecycle** (`lib/useLocalDraft.ts`):

- While writing differs from what is saved, the copy is kept about 700 ms after typing pauses, and at once when the page is
  hidden or the editor unmounts. When writing matches what is saved again - after a successful save, or typed back - the copy
  this editor kept is dropped. A newer copy is never dropped by an older save: anything typed while a save was in flight is
  still unsaved, so it is kept again.
- A failed save, a 409 and a gone entry or scene keep the copy: the writing is still unsaved.
- Choosing to let the writing go lets the copy go: Discard on the offer, Done without saving (article), Load the saved version
  after a conflict, and answering "leave" to the leave guard for a link, Sign out or Back/Forward (`useLeaveGuard`'s new
  `onLeave`). A copy the author explicitly left behind never comes back to be recovered.
- Leaving the page itself - reload, close, a typed address - keeps the copy. The browser's own prompt cannot say what was
  answered, and a closed tab is exactly what a copy is for.
- Deleting a universe from Settings drops that account's copies in it.
- Deleting from the Trash permanently (amendment below) drops the copies of exactly what was erased, once the server has
  answered: an entry's article, a scene's manuscript, and the manuscript of every scene an erased story held.

**Amendment (ADR 0030): ideas.** The idea editor is a third writer of recovery copies (`kind: 'idea'`), with the lifecycle
above. An idea belongs to an account, not a universe, so `universeId` in a copy's key is now nullable: an existing idea's
copy has none, and a universe deletion never lets it go. A new idea's copy is kept per place it was started - globally, or
under the universe it was started in, which does go with that universe.

**The offer.** When an article or manuscript opens with a copy:

- identical to what is saved, it is dropped without a word;
- different, the saved text is what is shown, and "Recovered draft" is offered beside it: when this device kept it, whether
  the text has been **saved again since** the copy was made (its base `updatedAt` against the current one - a copy kept later on
  this device is not therefore newer), Show the draft, Recover draft and Discard draft (confirmed). Writing waits for the choice
  - Edit article is disabled with a note, the manuscript box is read-only - so nothing typed can overwrite a copy nobody has
  seen. It also waits, at most two seconds, while the copy is being looked for.
- Recover puts the copy in the editor as unsaved changes against what is saved now; Save names the current save, so the normal
  stale protection holds from there. The offer stops; the copy stays until the writing is saved or let go.

**Storage that fails never blocks writing or saving.** A read that fails or never answers opens the editor as if there were no
copy; a write that fails shows one quiet line in the save bar while there are unsaved changes - "This device could not keep a
recovery copy of these changes. Save to keep them."

### Backup format version 10

Story content in the Trash travels, marked, and a manuscript's saved versions travel with it: `deletedAt` on story, chapter,
scene, arc and beat, and `manuscript.revisions` oldest first. It fails ADR 0014's "ignorable" test twice, like versions 2
and 9: the markers re-mean every collection in a story - membership no longer implies live, and a marked row's `sortOrder` holds
no place, so a version 9 reader would restore the Trash as content with two scenes claiming one place - and the versions are
authored text a version 9 reader would drop. Inside each ordered collection live rows come first, in order, then marked ones. A
file at version 9 or earlier has none of these members: everything in it is live and a manuscript has no versions but its text.
A future importer restores markers as they are, never places a marked row in a live order, re-creates versions with their ids
and numbers and never applies one. Recovered drafts are not in a backup: they were never saved.

### The screens

- **Article.** The offer sits above the saved article; Article history is unchanged.
- **Manuscript.** The offer sits above the text box; "Manuscript history" joins Edit scene and Show in Scenes once anything is
  saved and opens a panel under them: newest first, View in place (the text in a bounded, keyboard-scrollable region), Restore
  (confirmed) on any but the newest, disabled with a reason while there are unsaved changes or an offer.
- **Trash.** One list: each row names its kind in a word (Entry, Story, Chapter, Scene, Arc, Beat - never a colour alone), its
  name, where it was ("In “The Long Winter”", "In the arc “…” of “…”") and when; a row that must wait says why and its Restore
  is disabled. After a restore the focus moves to what happened, with a link to where the item now is.
- **Deleting.** Story, chapter, scene, arc and beat confirmations say the item goes to the Trash and can be restored; the
  chapter's still says its scenes move to Unchaptered and none is deleted.

## Deliberately unsupported

- Emptying the Trash, bulk Restore and retention. (Permanent deletion of one row exists since 2026-09-30, of a selection
  since 2026-10-01 - ADR 0015's amendment.)
- Saved versions for stories, chapters, scenes' planning, arcs and beats; versions of structure (orders, moves, links).
- Recovered drafts for the entry, story, chapter, scene, arc and beat forms.
- Syncing recovered drafts between devices or browsers, offline editing, or a list of every draft on a device.
- Diffs between versions, merging a recovered draft with a newer save, and pruning history.
- Two tabs writing the same article or manuscript unsaved share one copy; the last to keep it wins.
- Restoring a chapter with the scenes it once held, or a restored scene into a chapter other than its own.

## Consequences

- Nothing a story holds shrinks until its universe is deleted, as ADR 0015 already accepted for entries.
- Every story query must say it wants live rows; the suite pins the reads and writes that exist, not the model.
- A manuscript save that changes the text stores it twice - row and version - as an article's does.
- Rolling the migration back discards the Trash and every manuscript's history: the schema before had room for neither.
- An editor may wait up to two seconds on storage that never answers before it can be written in.
- The Trash list reads every marked row's name to page them; a union query is the first change if that ever shows.

## Amendment - world rules (2026-09-15)

World rules (ADR 0033) join the matrix as short text in a form: no saved versions, no recovered draft, and the universe's Trash
for deletion - a seventh kind of row, `WorldRule`, restored on its own typed route (`.../trash/world-rules/{id}/restore`). A rule
sits in nothing but its universe, so it never waits for anything, and its restore passes no Canon gate because a rule contributes
no facts. Still no permanent delete: only deleting the universe removes a rule for good.

## Amendment - deleting story content permanently (2026-09-30, Product refinement 021)

Every row in the Trash can be deleted for good on its kind's own route - `DELETE .../trash/stories|chapters|scenes|plot-arcs|plot-beats/{id}`
- found only through its universe and only while marked; a live, missing or other world's id is a 404. One `DELETE` statement
on the row, atomic, and the schema's cascades take what it owns in that statement, the search index following through its
delete triggers:

- **A story** takes its chapters, scenes (their manuscripts, versions and lore links), arcs and beats (their links) and every
  idea reference to any of them - including rows of it that sit in the Trash on their own, which disappear from the list with
  it. Owned descendants are never preserved outside their owner.
- **A chapter** takes only itself: its scenes left it for Unchaptered when it was binned (above), so none goes, including a
  scene binned while it was in the chapter.
- **A scene** takes its manuscript and every version, its lore links, beat links and idea references. The beats stay.
- **An arc** takes its beats, including one binned before it. **A beat** takes its links. A row whose restore is blocked by its
  story or arc can still be erased on its own.

**A story's delete answers what it took.** It is the one route that erases scenes the client cannot name: it answers 200
with `TrashErasedStory` - `{ id, erasedSceneIds }`, every scene of the story, live or in the Trash on its own, read in the delete's
own transaction. Every other permanent delete answers 204. After a successful delete the Trash screen lets go of this device's
recovery copies for exactly those scenes (and for an erased scene or entry, its own), by their draft scope, never a whole
universe's: another story's manuscripts, articles and ideas are untouched. Nothing is let go before the server answers, so a
failed delete keeps every copy. Letting go is best effort like every recovery-copy write: a storage failure never undoes or
hides the delete, and a copy it could not drop is never offered, since nothing can open the scene it names.

No Canon: story content contributes no facts (ADR 0024). The Trash screen offers **Delete permanently…** after Restore on every
row, quiet text rather than a second loud button; it asks once, in the row - kind, name, what goes with it, "This cannot be
undone." - and its final button says Delete permanently. The lede now says everything can be restored until the author
deletes it permanently.

**A selection** (2026-10-01, Product refinement 023): story content can also be erased together with any other Trash kinds in
one all-or-none `POST .../trash/bulk-delete` - ADR 0015's amendment holds the contract. What a story, chapter, scene, arc or beat
takes is exactly the above, by the same plan; a selected story with its own selected scenes, chapters, arcs and beats, or an
arc with its beat, is a valid selection, not a conflict. The answer's `erasedSceneIds` - selected scenes and every scene of a
selected story - drive the same exact recovery-copy cleanup, after success only.
