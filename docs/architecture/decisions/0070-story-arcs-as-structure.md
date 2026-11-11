# ADR 0070 - Arcs are story structure, and beats belong to scenes

Status: accepted (2026-11-11). Supersedes ADR 0026; amends ADR 0024, ADR 0025, ADR 0029, ADR 0030, ADR 0031 and ADR 0039
where they speak of plot.

## Context

ADR 0026 made plot a third layer beside structure: a story's arcs, each holding beats, each beat pointing at any number
of scenes and entries, and owning none of them. It rejected "an arc id on a chapter or a beat id on a scene" because one
thread can run across chapters and one chapter can carry several threads.

The owner writes the other way. A story is told in arcs, an arc in chapters, a chapter in scenes, and a scene is a
short list of steps - "Marcus reads the orders", "Marcus instructs Theo". The Plot view, its many-to-many links and the
separate reading of plot beside the outline were planning work nobody did; the Scenes view is where the story is
shaped. The owner asked for the layer to be refactored into the structure, chose to drop the existing plot data rather
than convert it, and chose chapter numbers that restart in each arc.

## Decision

**Story, then arcs, then chapters, then scenes, then beats.** `PlotArc` keeps its table, its order, its Trash marker
and its publication: it is now an arc of the story's structure. A chapter is in at most one arc of its own story, or in
none, through a side row (`ChapterArcs`, keyed by the chapter) rather than a column, so no table the search triggers name
is rebuilt. Both foreign keys cascade: deleting an arc for good takes only the links, and its chapters fall back to no
arc with every scene in them.

**Arcs are optional, as chapters are.** A story with no arc reads exactly as before. One with arcs reads Unchaptered
first, then the chapters in no arc, then each arc in its order with its chapters. A chapter's order stays one order
across the story (the existing chapter order route and index are unchanged); an arc reads its chapters in that order,
and a chapter's number restarts in each arc - "Arc 1, Chapter 2" - worked out on screen and in every reader, never
stored. Moving a chapter into an arc (`PUT .../chapters/{id}/arc`) puts it last there, which is last in the story; a new
chapter may start in an arc. An arc in the Trash holds no chapter while it is there: its chapters keep their link and read
as in no arc, and go back into it when it is restored.

**A beat is a scene's step.** `SceneBeats`: owned by the scene (cascade), a title and an optional note, plain text, in an
order unique inside the scene, at most 50. A scene save carries the whole list and replaces it; a save that leaves it out
keeps the beats the scene has, so a suggestion, an AI change or an older client never clears them. Changing the beats
moves the scene's edit version on (ADR 0043). Beats go to the Trash and come back with their scene. They link nothing:
the lore a scene draws on is the scene's.

**Plot beats are retired.** `PlotBeats`, `PlotBeatScenes`, `PlotBeatEntities` and `IdeaPlotBeatReferences` are dropped,
with the plot beat search triggers and rows, the Plot view and its routes, beats on the public story page, the timeline's
link to a scene's beat, the beat Trash kind and its "arc in the Trash" block, the beat search kind, the beat idea
reference kind, and the `plot_beat` AI change resource. Every retired enum value is left unused, never reused. The
migration also deletes every existing arc and its idea references, as the owner chose, and every AI change proposal that
held a beat change - whole, as the media migration's rollback did for its own resource. Rolling back recreates the plot
beat tables and triggers empty; nothing deleted comes back.

**Backup format 37.** A chapter carries `plotArcId` and a scene carries `beats`; an arc carries no beats. A file at
version 36 or earlier restores without any arc or beat - its plot arcs and beats, and an idea's references to them, are
left out - and with every chapter and scene.

**Readers.** The story read carries the arcs, each chapter's arc and each scene's beats in one request. The assistant and
MCP read a story's arcs, its chapters with their arc and number, and its scenes with their beats' titles. Search finds
arcs as before and no beats; a chapter's number in a result is its number in its arc. AI write proposals for a chapter's
arc and a scene's beats are a follow-up: until then a proposal leaves both as they are.

## Consequences

- A chapter cannot sit in two arcs, and a scene's step cannot stand for a thread across scenes. An author who wants that
  writes it in an arc's description or notes.
- Every place that numbered chapters by their story-wide position now numbers them inside their arc.
- Existing arcs on DEV and PROD are deleted by the migration; nothing else about a story changes.
