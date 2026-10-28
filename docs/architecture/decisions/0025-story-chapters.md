# ADR 0025 - A chapter is optional structure; a scene's order is its place inside its chapter

Status: accepted (2026-09-13), amended 2026-09-14 (a chapter goes to the Trash holding no scene - ADR 0029)

## Context

ADR 0024 gave a story one flat, author-ordered list of scenes and deferred every grouping layer. It
also made a scene's identity its own id rather than its position, so that a layer could later sit
between story and scene without replacing it.

Authors group scenes into chapters. Not every author does, and not from the start: a story is often
drafted as loose scenes and shaped later. So the question was never only "chapters or not", but how a
chapter can exist without forcing chapter-based writing on anyone.

Three shapes were available. A free-text chapter label on each scene would group nothing that can be
ordered, renamed once or described. A required chapter - with every story given a default one, and
every existing scene migrated into it - would make the grouping mandatory, put a row in the database
that no author wrote, and turn "not in a chapter yet" into a chapter called "Unchaptered". Or a real,
optional chapter entity, with a scene that may belong to one or to none.

## Decision

**A chapter is an optional grouping of a story's scenes.** `Chapter` belongs to its story (cascade):
a title, an optional summary, optional notes, a `SortOrder`, and timestamps. All plain text. A chapter
has no prose, no rich text, no chronology, no point of view, no lore links and no Canon state - those
belong to scenes, to a later manuscript, or to lore.

**Unchaptered is a null, not a row.** `Scene.ChapterId` is nullable, and null means the scene is
Unchaptered. No chapter named "Unchaptered" exists anywhere: it is a place on the story page and a word
in the API's documentation. A story may have no chapters at all, and then it reads exactly as it did
before chapters existed. Scenes remain the story's fundamental unit; a scene moved between chapters is
the same row, keeping its id, text, point of view, chronology and links.

**Two orders, both manual, neither chronology.**

- Chapters are ordered per story: contiguous from 0, unique, by index.
- Scenes are ordered per *container* - one chapter, or the story's Unchaptered scenes - contiguous
  from 0 and unique there. Once a story has chapters there is no single scene order across it; the
  story reads Unchaptered first, then chapter by chapter, each in its own order.
- Neither is derived from, checked against or reordered by any scene's chronology. A chapter may hold
  a scene in AF 100, then BF 20, then AF 2. Nothing validates chronology across a chapter.

**The uniqueness is two filtered indexes.** `(StoryId, SortOrder) WHERE ChapterId IS NULL` and
`(ChapterId, SortOrder) WHERE ChapterId IS NOT NULL`, plus a plain `StoryId` index for reads of a whole
story. One unique index over `(StoryId, ChapterId, SortOrder)` would have looked equivalent and guarded
nothing that matters: SQLite, like PostgreSQL, treats every null as distinct in a unique index, so
Unchaptered - the container every existing scene is in - would have had no guard at all.

**Every structural write is explicit, and one transaction.**

- Creating a chapter appends it. Creating a scene appends it to the container its request names.
- `PUT .../chapters/order` replaces the whole chapter order: every chapter of the story, once.
- `PUT .../scenes/order` replaces one container's order. It names the container with `chapterId`
  and must list exactly that container's scenes - a scene from another chapter of the same story is
  refused, never pulled across.
- `PUT .../scenes/{id}/position` moves one scene to a position in a container - its own, another
  chapter, or Unchaptered - renumbering both sides. Position null appends.
- Updating a scene with a different `chapterId` is a move, not an assignment: the old container closes
  up and the scene is told last in the new one. Naming the chapter it is already in leaves its place.
- Deleting a scene closes the gap in its own container only.
- All of them park the rows they renumber at distinct negative positions and then place them - across
  both containers of a move at once - because SQLite checks a unique index row by row (ADR 0024).

**`chapterId` null means Unchaptered wherever a scene is described**, in requests and responses alike.
The scene request is the whole scene, so a request that leaves `chapterId` out means Unchaptered, the
same rule the point of view already follows. The one older request shape still accepted, a scene order
with no `chapterId`, now means Unchaptered: identical to its old meaning for a story with no chapters,
and refused - not guessed at - for a story that has some.

**Ownership is never a chapter id alone.** Every chapter route proves universe ownership, then finds
the story in that universe, then the chapter in that story; a chapter id reached through another story
answers as missing. A `chapterId` inside a scene request is resolved inside the same story, and a foreign
or unknown one is refused with the same words whoever's it is.

**A chapter's number is its position, and is never stored.** "Chapter 3" is `SortOrder + 1`, drawn on
screen. The title holds only what the author wrote, so reordering renumbers every chapter and changes
no word. The API carries no number, and neither does a backup.

**Deleting a chapter never deletes a scene.** In one transaction, the chapter's scenes move to the end
of Unchaptered in their order, Unchaptered is renumbered, the chapter goes, and the chapters after it
close up. `Scenes.ChapterId` is `NO ACTION`, deliberately not `SET NULL`: a bare set-null would drop the
scenes into Unchaptered still holding their old positions, colliding with the scenes already there. So
the database refuses a chapter delete that skipped the move rather than corrupting the order. Checked at
the end of the statement, it still lets deleting a story or a universe cascade through chapters and
scenes together. Nothing about an entry - trashed, or deleted for good - reaches a chapter, a scene or a
story.

**No Canon, search, history or Trash.** Chapters create no finding, run no gate, are not searched, have
no revisions and are deleted for good, exactly like the stories and scenes around them (ADR 0024).

**The story read stays a fixed handful of queries**: ownership, the story, its chapters, its scenes
with their link ids - ordered by container through a join, so no chapter is read per scene - and one
read of every entry referenced. A test holds a story of ten chapters and a hundred scenes to the same
count as a story of one scene. Nothing is cached.

**A backup carries chapters, and that is format version 6** (ADR 0014).

**The story page stays the authoring hub.** No chapter has a route of its own. Unchaptered is a quiet
holding area, drawn only while it holds a scene; "Move to…" still offers it as a destination, so it is
never needed as an empty drop target. A chapter is a modest heading - "Chapter 2 — Ashes" - with its
summary, its tools and its scenes, and a rule rather than a box. Move up and Move down stay inside a
scene's chapter; "Move to…" is a small disclosure of plain buttons, not a select that acts on change,
because a closed select changes value on each arrow key in some browsers. The scene form has a Chapter
field. The delete confirmation says the chapter will be removed and its scenes moved to Unchaptered.

## Deferred

- Acts, parts, volumes and books; nested chapters. A chapter belongs to a story and nothing sits
  between them, so any of these is its own decision about a second grouping level.
- Beats and plot arcs - since decided in ADR 0026, which puts no arc on a chapter.
- Manuscript prose for a scene - since decided in ADR 0027 - and anything like it for a chapter.
- Drag-and-drop. The order and position routes already take what a drag would send.
- Collapsing chapters on the page, and bulk moves of several scenes at once.
- Chapter-level point of view, chronology or status.
- Story search, chapter history and a Trash, with the rest of ADR 0024's deferrals.

## Consequences

- Migration `AddStoryChapters` creates `Chapters`, adds the nullable `Scenes.ChapterId` - SQLite rebuilds
  `Scenes` to add its foreign key, keeping every row, and `SceneEntityLinks` keeps pointing at it - and
  swaps the story-wide order index for the two filtered ones. Every existing scene becomes Unchaptered
  with its `SortOrder` untouched, which is already a valid Unchaptered order; no authored data is
  rewritten and no chapter is invented.
- Rolling back discards the chapters and gives every scene its place in the whole story as it read:
  Unchaptered first, then chapter by chapter. It drops the filtered indexes and computes the positions
  into a table of their own before writing any, because an update counting the rows it changes would
  read some already changed. `ChapterMigrationTests` walks it down and up over real stories on a file.
- Two chapters appended to one story at once both reach for the last place; the unique index holds and
  the second is a 409 `story_chapter_order_changed` with nothing written. A scene appended to a chapter
  deleted a moment earlier fails its foreign key and is the existing 409 `story_scene_order_changed`.
  Reorders, moves and deletes each run in one transaction and serialise on SQLite's single writer.
- A move or reorder updates the story's `UpdatedAt`, not the scene's: where a scene is told is the
  story's structure, as ADR 0024's reorder already treated it. Editing a scene into another chapter is an
  edit, and updates both.

## Amendment - the Trash (2026-09-14)

Deleting a chapter still never deletes a scene, and still moves every live scene, in order, to the end of Unchaptered first.
The chapter is then marked and goes to the Trash (ADR 0029) instead of being removed. A scene already in the Trash leaves the
chapter too, so a chapter in the Trash holds no scene; restoring it brings back its title, summary and notes, last among the
story's chapters, and moves no scene back into it - its scenes stay wherever the author has put them since. Chapter order is
unique among live chapters. `Scenes.ChapterId` stays `NO ACTION`.
