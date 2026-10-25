# ADR 0057 - A knowledge record is an author's statement that one actor knows one thing from one scene, and nothing is inferred

Status: accepted (2026-10-25). GitHub issue 15. Amends ADR 0014 (backup version 33) and ADR 0024 (a story's order is what
a continuity reading follows).

## Context

Characters act on what they should not yet know. Issue 15 asks for a way to record who knows what and from when, so an
author can see a continuity slip - a secret acted on before its reveal - without Lorex becoming a second maintenance
system. The owner's initial model (2026-10-24): any member reads records, whoever edits content changes them; never
public, never read by the assistant or MCP; every record names a scene unless it is known from the start; no anchor to a
timeline moment; distinct from perspective and belief (issue 16); Lorex never infers Canon or invents a fact from a record.

## Decision

**One record, one statement.** `KnowledgeRecords` - universe, knower (an entry), optional subject (another entry), the
statement in the author's words (up to 1,000 characters), the scene it is learnt in or `KnownFromStart`, created and
updated. The knower is any live entry whatever its type, because worlds have gods, guilds and ships that know things. The
subject is optional because much knowledge is about no one entry in particular, and never the knower. The database holds
the anchor rule (`CK_KnowledgeRecords_Anchor`: a scene or known from the start, never both or neither).

**Nothing is derived.** No record is written by a scene's lore links, a relationship, a field, a mention or the prose, and
a record writes nothing back: no lore, Canon status, relationship, scene link or timeline moment changes. What the list
*reads* is the whole of the continuity help in V1, and it reads only facts already stored: the order the stories tell
(ADR 0024: Unchaptered first, then chapters in order, then each container's scenes in order - known from the start comes
before every scene), whether the knower is in the anchoring scene's lore or its point of view (`knower_not_in_scene`),
and whether the scene, knower or subject is in the Trash. An author who sees "knows X since scene 7" listed above "knows Y
since scene 3" has the continuity reading the issue asks for, with no tagging beyond the records they chose to write.

**Lives with what it names.** Erasing the knower, the scene (so its story, so the universe) takes the record; erasing the
subject leaves the record about nobody (`SET NULL`). The Trash takes nothing and hides nothing: a record whose scene,
knower or subject is binned is listed and marked, and a save may keep such an id while it may not newly choose one.
Records have no Trash and no saved versions: they are small, re-sayable annotations, removed for good after a
confirmation. *(Ceiling: if records prove precious, a Trash kind as for relationships, ADR 0048.)*

**Routes.** `GET /api/universes/{u}/knowledge` (`Read`; `knowerId`, `subjectId`, `sceneId`, `storyId` narrow it),
`POST`, `PUT /{id}`, `DELETE /{id}` (`EditContent`). Every id must be a live entry or scene of this universe, else a 400
naming the field - never a 404 that would say whether an id exists elsewhere. No concurrency version: a record is one
sentence, and the last save wins as for moments and relationships (ADR 0043's scope is unchanged).

**Not public, not for AI, by construction.** Its own table; no projection of an entry, a scene or a story carries it; the
public routes, `UniverseReader` (assistant and MCP), search indexes and AI proposals never read it.

**On screen.** A Knowledge section under the entry's Relations view - a fifth view does not fit the entry's bar on a
phone, and knowledge is what this entry has with others: what the entry knows, grouped under "Known from the start" and
then each story, in reading order, with the issues as marks; then who knows about the entry. A drawer form picks the
other entry, takes the statement, and chooses a story then a scene in reading order, or known from the start.

**In the owner's backup** since format 33 (ADR 0014 amendment): every record by id, remapped on restore. A version 32 or
older file restores with none.

## Consequences

- Not done, on purpose: knowledge on a scene's own page or in the Lore Context drawer (the writing workspace is complete,
  #6); a "who knows what by this scene" reading per scene; group or faction knowledge spreading to members; partial or
  mistaken knowledge (issue 16); a timeline-moment anchor; records about stories or moments; a Trash or history.
- Permanently deleting a story erases every record anchored to its scenes, with the scenes. The Trash does not.
