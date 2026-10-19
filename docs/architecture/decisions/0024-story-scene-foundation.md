# ADR 0024 - A story is authored narrative that references lore, told in its own order

Status: accepted (2026-09-13), amended 2026-09-13 (chapters, ADR 0025: scene order is now per chapter or
Unchaptered), amended 2026-09-14 (deleting moves to the Trash - ADR 0029), amended 2026-09-14 (universe search - ADR 0031), amended 2026-10-19 (Lore Context, task 048)

## Context

Everything Lorex holds so far is lore: what is true about a world. Entries, relationships, the
timeline and the chronology all make claims, and Canon Integrity checks them against each other.

Authors also tell stories with a world, and a story is a different kind of thing. It may be a draft,
hypothetical, nonlinear, an alternate take or unfinished. It opens where the author chooses - often
on the aftermath, before flashing back - and it is about lore without being a source of it.

Three shapes were available. Store stories as lore - an Event entity per scene, or a timeline entry
per scene - which would make every draft a fact, feed Canon Integrity with things nobody claimed, and
order scenes by when they happen rather than by how they are told. Build a manuscript tool, which is
a different product. Or add a small, separate narrative layer that points at lore and asserts nothing.

## Decision

**Lore and Story are separate domains.** `Features/Stories` owns `Stories`, `Scenes` and
`SceneEntityLinks`. `LoreEntity`, `TimelineEntry` and `LoreRelationship` gain nothing and know
nothing about stories.

**Universe -> Story -> Scene.** A story belongs to a universe (cascade); a scene belongs to a story
(cascade). A story is a title, an optional premise and a status. A scene is a title, an optional
summary (what happens) and optional notes (the author's planning), a place in the telling, an
optional point of view, an optional position in the world and any number of linked entries. No
acts, chapters, beats or prose. The scene's identity is its own id, not its position, so a grouping
layer could later sit between story and scene without replacing it.

**Status is closed and small:** `Planning`, `Drafting`, `Complete`, stored as an integer like
`CanonStatus`. It describes the telling and never truth.

**Narrative order and chronology are two different things, and never conflated.**

- `Scene.SortOrder` is the order a story is told in: contiguous from 0 and unique per story, enforced
  by an index. A new scene is appended; deleting one closes the gap; only
  `PUT .../scenes/order` moves one, and it must name every scene in the story exactly once. A move
  parks the scenes at negative positions and then places them, inside one transaction - the same
  technique era reordering uses. *Since ADR 0025 all of this holds per container - one chapter, or
  Unchaptered - rather than per story, the order route names its container, and a position route moves a
  scene between containers.*
- A scene's chronology is where it happens in the world. It is optional, it is shown on the scene,
  and nothing reads it to order, group, validate or warn. A scene placed before the scene told ahead
  of it is valid: nonlinear stories are valid. The API and the client both hold this in tests.

**Scene chronology is the universe's chronology.** A scene stores `EraId`, `Year`, `Month`, `Day`,
carried on the wire as the shared `ChronologyValue` - not the timeline's date contract, whose date
kinds, ranges and free-text era label describe what a moment claims about itself. The same rules
apply as to any year: plain signed years on a universe without eras, a year from 1 inside one of its
eras on a universe with them, and a plain year written before the eras is shown apart until given
one (ADR 0022). The checks are `ChronologyPointValidation`, now shared with the timeline so a year is
refused in the same words everywhere; the client writes every scene date through
`chronology/format.ts` and picks eras with the one `ChronologyPointFields` component the timeline
drawer also uses. The era foreign key is `NO ACTION`, and removing an era a scene is placed in is
refused like any other era in use.

**Lore references are references, never copies.** `Scene.PovEntityId` and `SceneEntityLinks` point at
entries in the same universe, re-resolved on every write; a foreign or unknown id is refused without
saying whether it exists elsewhere. The name, type, icon and portrait shown for a reference are read
from the entry on every request - two queries for a whole story, not one per scene - so an edit to
the lore shows in every scene at once. A link means only "relevant to this scene": not present, not
alive, not taking part. Any entry may be the point of view; Lorex does not decide from a type's name
that only characters have one. The point of view need not also be linked.

**The Trash follows ADR 0015's rule.** A scene's point of view and links are sent back whole on every
save, so they are marked rather than hidden: kept, reported with `isTrashed`, shown named and unlinked.
A write keeps a trashed entry the scene already holds, and refuses one newly chosen. If an entry row
were ever deleted for good - today only by deleting its universe - the point of view clears
(`SET NULL`, as for an entity-reference value) and the link goes (`CASCADE`, as for a timeline
participation). No foreign key lets an entry delete a scene.

**A scene never becomes Canon.** Story writes run neither the promotion gate nor reconciliation. They
create no Canon finding, no timeline entry and no relationship, change no entry and infer nothing.
Pointing at an entry, a year or an era is ordinary data integrity, not a Canon rule.

**Deleting is permanent and scoped.** Deleting a story deletes its scenes and their links; deleting a
scene deletes its links. Neither touches the lore. There is no Trash for stories - ADR 0015 keeps the
Trash for lore entries, the one thing whose removal destroyed work others depended on - and the client
confirms both deletions.

**A backup carries stories, and that is format version 5** (ADR 0014). Stories are authored work; a
reader that ignored them would restore a world with every story silently missing.

## Deferred

- Acts, sequences, beats and arcs; multiple points of view per scene. (Chapters: ADR 0025. Plot arcs and
  beats: ADR 0026, which links to scenes without giving a scene any column.)
- Manuscript prose (since decided in ADR 0027: plain text, on a route of its own), rich text, Markdown, word counts,
  writing goals, comments, export to documents.
- Story or scene revision history. ADR 0013's snapshots are shaped around an entry - its fields,
  options, tags and references - and extending them is not a side effect of stories being editable.
- Story search. Lore search means lore (ADR 0016); a second result domain is its own decision.
- Explicit Story-versus-Lore checks, and any way of promoting something written in a story into lore.
- A Trash, or an undo, for stories and scenes.
- Drag-and-drop reordering. Move up and Move down work from a keyboard, a screen reader and a phone,
  and the order route already takes a whole sequence, so a drag gesture is client work only.

## Consequences

- A story is read in one request: the story, its scenes with their link ids, and one read of every
  entry any scene references.
- The story list is unpaged, like a type list. Paging is the first change if a universe ever holds
  enough stories to notice.
- Settings counts scenes placed in each era and refuses to remove one they use. It does not yet count
  scenes whose plain year predates the eras; the story page marks each as having no era yet.
- Two appends racing for the last place in one story both reach for the same position; the unique
  index holds and the second is answered 409 `story_scene_order_changed`, with nothing written.
- The migration only creates tables, so an existing database gains empty ones and nothing else.
  `StoryMigrationTests` walks it down and back up over real lore on a file and reads the delete
  actions back from SQLite.

## Amendment - the Trash (2026-09-14)

"Deleting is permanent and scoped" is superseded, and the deferred "A Trash, or an undo, for stories and scenes" is done in
part. ADR 0029: deleting a story or a scene marks it (`DeletedAt`) and moves it to the universe's Trash - a story with its
chapters, scenes, prose and plot untouched beneath it, a scene with its prose, saved versions and links - and one restore
brings either back whole. Scene order is unique among live scenes; a restored scene is appended to its container. Only deleting
the universe removes a story for good. Lore is untouched either way, as before.

## Amendment - universe search (2026-09-14)

The deferred "Story search" is done, and the rule that no search hit comes from a story is superseded for the universe's
search bar only (ADR 0031): a story's title and premise, and a scene's title, summary and notes, are searched there, over an
index of their own kept in step by triggers. The Lore search still means lore and finds nothing a story holds. A story is
still never Canon, a moment or a relationship, and nothing reads its words for meaning.

## Amendment - scenes on the timeline (2026-10-05, refinement 038)

"Nothing in a story becomes a timeline moment" still holds for what is stored: no scene ever creates or changes a
`TimelineEntry`. But a live scene with a world date is now shown on the universe's timeline, read from the scene on every
request (ADR 0009 amendment), with its story and chapter as context and no Canon status. Its date is still edited only on
the scene, and its narrative order still never orders anything chronological. A moment may be linked to the stories it
matters to; that link belongs to the moment.

## Amendment - a scene's custom month (2026-10-06, refinement 039)

On a universe with a custom calendar (ADR 0022 amendment) a scene's date names its month by id (`Scenes.MonthId`, no-action
key, `ChronologyValue.MonthId`), validated by the same shared point check as a moment: a day runs to that month's length.
There is no scene-only calendar logic. Turning the calendar on or off converts scenes in the Trash too, so a restored scene
keeps a meaningful date. Scene chronology has no revision history (only manuscripts do), so nothing in a history snapshot
holds a month id.

## Amendment - Lore Context (2026-10-19, task 048)

The manuscript gains a Lore drawer that links and unlinks entries on the open scene. It writes the same
`SceneEntityLinks` through the scene's own `PUT`, not a route of its own: the client sends the scene exactly as
stored, with only `entityIds` changed, and the `expectedVersion` the page holds (ADR 0043). That save already
dedupes ids, reads them inside the universe, refuses newly linking a trashed entry and needs `EditContent`, so a
link endpoint would only repeat it. A refused stale save is never retried for the author: the story is read again
and they choose again. The prose is not involved; its own route and version are untouched.

Search is the scene form picker's `entities?search=` (ADR 0016), the preview the entry's and its relationships'
own reads. No new index, read model or permission.
