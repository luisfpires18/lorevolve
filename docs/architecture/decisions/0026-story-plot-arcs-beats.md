# ADR 0026 - Plot is planning: arcs of beats that point at scenes and lore and own neither

Status: accepted (2026-09-13), amended 2026-09-14 (arcs and beats go to the Trash - ADR 0029), amended 2026-09-14 (universe
search - ADR 0031)

## Context

A story has structure - chapters, and scenes in order inside them (ADR 0024, ADR 0025) - and it references
lore. What an author also tracks while writing is intent: the threads they mean to develop ("Fall of the
King", "Mira's Betrayal") and the steps each goes through. Those steps do not line up with the structure. One
thread runs across several chapters and Unchaptered scenes, one chapter carries several threads or none, and a
planned step may have no scene yet.

Four shapes were available. Free-text plot notes on the story, which describe and structure nothing. An arc id
on a chapter or a beat id on a scene, which allows one thread per chapter and one step per scene and makes the
structure own the plot. Plot as lore - an Event entry or a timeline moment per beat - which turns planning into
fact and feeds Canon Integrity. Or a small structured layer inside the story: arcs of beats, pointing at scenes
and entries through many-to-many references.

## Decision

**Plot is a third layer, apart from lore and from story structure.** Lore is what is true; chapters and scenes
are what the story shows and in what order; plot is what the author intends to develop across that telling.
`PlotArcs`, `PlotBeats`, `PlotBeatScenes` and `PlotBeatEntities` live in `Features/Stories`. `Scene`, `Chapter`
and `LoreEntity` gain no column: there is no arc id on a chapter and no beat id on a scene.

**Story -> PlotArc -> PlotBeat is ownership.** An arc belongs to a story (cascade) and a beat to an arc
(cascade). Each is a title, an optional description, optional notes, a `SortOrder` and timestamps, all plain
text. Neither has a status: a Planned / Active / Complete would be workflow nothing in the product reads yet, so
it waits until something does.

**Beat -> Scene and Beat -> Entry are references.** Each is a join row with a composite key, so a pair exists
once, and a repeated id in a request links once. Both foreign keys of each join cascade, which is exactly what
makes them references: deleting a beat removes its link rows; deleting a scene, or an entry row, removes only
its link rows; and no delete of any plot row can reach a scene, a chapter or an entry. A beat with no link is
valid - planned work not yet placed - and a scene may carry beats from any number of arcs. A scene link holds
the scene's id and nothing else, so a scene moved to another chapter, reordered or re-dated is still linked.
Scenes must be of the same story and entries of the same universe, checked on every write and refused in the
same words whoever's the foreign id is. The database does not carry a story id on the join; holding "same
story" is the API's job, as "same universe" already is for a scene's lore.

**A link means only "relevant to this beat".** Not present, not the cause, not the point of view, not changed
by it. LorEvolve infers nothing from titles either: there is no protagonist, romance or mystery arc.

**The Trash follows ADR 0015, as scenes do (ADR 0024).** An entry linked and later trashed stays on the beat,
reported with `isTrashed`, shown named and unlinked; the form sends it back and the write keeps it; a trashed
entry newly chosen is refused. The lore reference is one projection, `StoryLoreReferences`, now shared by scenes
and beats; a scene's response is unchanged.

**Three orders, never one.** Arcs are ordered per story and beats per arc, each contiguous from 0 and unique by
index: appended on create, closed on delete, rewritten only by a whole-order `PUT`, parked at negative positions
and then placed in one transaction. Neither is derived from, checked against or reordered by scene order,
chapter order or chronology, and nothing in the plot reorders a scene. A beat's scenes are listed in the story's
current reading order - a presentation of where they are now, not a stored order.

**A beat moves between arcs by an edit.** An update naming another arc of the story moves the beat last there
and closes the gap behind it, in one transaction, keeping its id and every link. Leaving the arc out keeps it
where it is - a beat always has one. There is no separate position route: Move up and Move down inside an arc,
plus the edit, cover it without a second surface.

**No stored numbers.** "Arc 2" and beat 3 are positions plus one, drawn on screen. Neither the API nor a backup
carries one, and the titles stay exactly what the author wrote.

**Ownership is never an id alone.** `GET`/`POST .../stories/{s}/plot-arcs`, `GET`/`PUT`/`DELETE
.../plot-arcs/{a}`, `PUT .../plot-arcs/order`, `POST .../plot-arcs/{a}/beats`, `PUT .../plot-arcs/{a}/beats/order`
and `GET`/`PUT`/`DELETE .../plot-beats/{b}`. A beat is addressed through its story rather than its arc, so a move
between arcs does not change its address. Every route proves universe ownership, then the story in the universe,
then the arc or beat in the story; anything reached through another story or universe answers as missing.

**The plot is its own read, in a fixed number of queries.** `GET .../plot-arcs` returns every arc with its beats,
their scene ids and their resolved lore: ownership, the arcs, the beats, the scene links, the lore links and one
read of the entries named. A test holds a plot of fifty beats and two hundred and fifty links to the same count
as one beat. `StoryDetail` is untouched; a scene does not carry its beats on the wire, and the client draws them
from the plot read it already holds.

**Plot creates no Canon.** No gate, no reconciliation, no finding, no timeline entry, no relationship and no
change to an entry. A beat called "The King dies" gives no one a death year; that stays planning text until the
author edits the lore. Nothing promotes plot into lore.

**No manuscript here.** A description and notes are planning text. Prose is the next Story feature.

**Deleting is permanent and scoped.** Deleting an arc removes its beats and their links, never a scene, chapter
or entry, and the confirmation says so. Deleting a beat removes its links. Deleting a scene removes its links and
leaves every beat in place. Deleting a chapter moves its scenes as ADR 0025 says, and their links go with the
scenes. Trashing an entry deletes nothing. Deleting a story or a universe takes its plot with it.

**A backup carries plot, and that is format version 7** (ADR 0014).

**The plot is a view of the story, not a destination.** The story page has two views under one header: Scenes at
the story's own address and Plot at `.../plot`, two plain links marked `aria-current`, both reading the same
story and plot once. Nothing is added to the universe sidebar, and the greyed "Plot" it listed among sections not
built yet is removed, because plot now exists and lives in a story. An arc is a heading and a rule - "Arc 2 — Fall of
the King" - with its description and tools; its beats are rows beneath it with a number, a title, a description,
wrapping Scenes and Lore chips, and Move up, Move down, Edit and Delete. A beat's scene chip opens that scene on
the Scenes view; a scene card shows a read-only Plot row whose chips lead back to each beat. The beat form has a
title, an arc when there is more than one, a description, notes, a scene picker - labelled checkboxes grouped by
chapter with a title filter - and the existing entry picker. No drag-and-drop, board, timeline or colour-coding.

## Deferred

- A status for arcs or beats, and any workflow built on one.
- Editing a scene's beats from the scene; drag-and-drop; a position route for beats; bulk moves.
- Chronology on arcs or beats, and anything derived from their scenes' dates - a plot timeline, beats sorted by
  when their scenes happen.
- Graph, board, mind-map or other visual planning.
- Typed arcs (character, romance, mystery) and any meaning on a link (appears, causes, point of view).
- Plot search, history and a Trash, with the rest of ADR 0024's deferrals.
- Story-versus-Lore checks, and any promotion of plot into lore.

## Consequences

- Migration `AddStoryPlotArcsAndBeats` only creates four tables and their indexes, so an existing database gains
  an empty plot and nothing else. Rolling back drops them and touches no story. `PlotMigrationTests` walks it down
  and up over a real story in chapters on a file, and reads every delete action, index and key back from SQLite.
- Two appends racing for the last place in one story or one arc both reach for it; the unique index holds and the
  second is a 409 `story_plot_order_changed` with nothing written. A beat linking a scene deleted a moment earlier
  fails its foreign key and is the same 409.
- A plot write updates the story's `UpdatedAt`, and editing an arc or a beat updates its own too. A reorder or a
  move updates only the story's, as ADR 0025 already treats a move.

## Amendment - the Trash (2026-09-14)

Deleting an arc or a beat is no longer permanent (ADR 0029). An arc is marked and goes to the Trash with its beats and links
untouched beneath it; a beat goes with its links. Each comes back last in its order, and a beat waits while its arc or story is
in the Trash. Arc and beat order are unique among live rows. A beat's link to a scene in the Trash is kept and hidden - the plot
read leaves it out, a beat save keeps it whatever it sends, and it returns with the scene - and a scene in the Trash cannot be
newly linked. Still no plot delete reaches a scene, a chapter or an entry.

## Amendment - universe search (2026-09-14)

The deferred "Plot search" is done (ADR 0031): an arc's and a beat's title, description and notes are searched by the
universe's search bar, and a result opens the Plot view at the arc or beat. A beat inside an arc in the Trash is not found.
Nothing about plot's meaning, links or order changes.

## Amendment (2026-10-25, Issue #48): moving between plan, writing and chronology

Verified first, on code and on the owner's DEV story: a beat holds its scenes (`PlotBeatScenes`, many to many, cascading
from both sides), a scene holds no beat, a scene owns its manuscript and may carry one world date, and a moment links to
stories (`TimelineEntryStories`), never to a scene or a beat. Beat order, scene order and world order stay three orders.

On those links only - no new link, route or field:

- A beat's linked scene keeps its chip to the Scenes view (title, chapter) and gains a Manuscript link beside it.
- A dated scene's date, on its card and above its manuscript, opens the story's timeline (`/timeline?story=`), where the
  scene sits among the story's dated scenes and moments in world order; the timeline already led back to the manuscript
  and the beat.
- Above a manuscript, a scene no beat links says so with Open Plot when the story plans beats, and nothing when it plans
  none: a scene needs no beat.
- The universe sidebar, phone sheet and Overview list Timeline after Stories, before Ideas (owner request). Its route,
  active state and access are unchanged; Chronology stays with the world, after Family Tree.

Not done, needs a decision: linking a scene to a beat from the scene (the beat form is the one editor of that link), and
any moment to scene or moment to beat link.
