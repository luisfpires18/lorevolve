# ADR 0050 - An entry's progression is its own aggregate, and an era holds only what differs then

Status: accepted (2026-10-24). GitHub issue 41, under parent issue 30. Amends ADR 0014 (backup version 27), ADR 0022
(entry eras dated on the universe's chronology) and ADR 0043 (a progression save names its version).

## Context

Issue 30 asks for one Lore identity that can be read in creator-defined periods - "Saiyan Saga", "Frieza Saga" - without a
second entry per period. Issue 41 is the first part: eras, and the details that differ in each. The owner settled the rules
that existing behaviour could not (2026-10-24): an era's value comes from its own override or the entry, never from another
era; an optional field may be left empty for one era, a required one may not; there is no continuity model.

## Decision

**One aggregate beside the entry, like the article (ADR 0028).** `EntityProgression` (keyed by the entry; `Version`) holds an
entry's progression; `EntityEras` its eras in the author's order. It is read and saved on its own route,
`.../entities/{id}/progression`, as one document over the version it was read at (409 `entity_progression_changed`). The
entry's save, its revision restore, a suggestion and an AI change never read or write it, and its save writes nothing of the
entry's structured lore but `UpdatedAt`. Read: `Read`; save: `EditContent`; history and restore: `ManageHistory`.

**An era holds only overrides.** `EntityEraFieldValues` are an era's values for its entry's type's active fields, in the same
typed members an entry value uses, or `IsCleared` - no value in that era, which only an optional field may be. A field with
no row reads from the entry. Nothing is carried from one era to the next and nothing is inferred from the order: an era is
the entry plus its own overrides. Archived fields' overrides are kept and hidden like an archived field's values (Issue #39).

**Context is explicit and optional.** A span on the universe's own chronology (`ChronologySpans`: each bound optional and as
precise as written - a year alone covers the whole year), and the stories and scenes it covers (`EntityEraStories`,
`EntityEraScenes`, kept through the Trash, new links to trashed ones refused). Spans may overlap. None is derived from
another, and none is required.

**Stable ids.** Eras keep their ids through edits and reorders; a removed era takes its links and overrides. A save that
changes nothing records nothing.

**History is snapshots of the save.** Each changing save records `EntityProgressionRevisions.Snapshot`: the save's own
request, normalised, as JSON. A restore replays it through the same save (an era removed since comes back with its id), and
is refused whole (409 `entity_progression_revision_unrestorable`) unless it would be stored exactly as recorded - a field
archived or removed since, an option taken off, a story or entry gone.

**Every protection counts overrides.** Field delete, kind lock, option removal, link-target narrowing, field restore, group
leave and retyping a linked entry count era overrides as values; the Types screen's counts include them. An entry whose
eras override its fields cannot change type (409 `entity_type_change_progression`); a field an era leaves empty cannot
become required (409 `entity_field_required_cleared`); removing an era that holds an archived field's value is refused (409
`entity_era_archived_values`). Archiving or restoring a field moves the version of every progression that overrides it.
Permanently deleting an entry removes the overrides that link to it; the era then inherits.

**Chronology.** Removing a date period counts entry eras dated in it and override years in it; the custom calendar's
switch on and off converts entry eras' months, its edits count them as uses and refuse a reorder that would reverse a span.

## Consequences

- Backup version 27 carries each entry's progression (eras, links, every override, archived included, and its history); a
  restore remaps every id, those inside the history's snapshots too, giving an id a version merely recorded a fresh one.
- Public Explore is unchanged: its allow-list carries no fields or relationships, so it carries no eras either.
- Not covered, deliberately: search does not index era text; the assistant and MCP do not read eras; AI proposals and
  suggestions cannot change them; an era has no picture of its own (appearances are issue 43); no alternate continuities.
- History restores are refused rather than adapted when the world moved on (a field archived, a story in the Trash).
- A field or choice an older version of any entry's eras names cannot be deleted or change kind, as for an entry's own history
  (409 `entity_field_in_history` / `entity_field_option_in_history` / `entity_field_kind_locked`). The versions are JSON, so
  this is a text search of every era version, run only by those rare edits; the Types screen's "used in history" flag does
  not include it, and a refused delete says why.
- "Set for this era" with no value is refused (`eras[i].fields.{id}`), never stored as a blank that hides the entry's value.
- A backup is held to the same rules: a required field left empty, an override with no value or a span ending before it
  starts is refused at validation.

## Amendment (2026-10-24, Issue #18, ADR 0051)

A relationship's period may name an era. Removing that era - by a save or by restoring an older version - is refused while
any period names it, a link in the Trash included (409 `entity_era_in_relationship`).
