# ADR 0013 - An entry's history is a full snapshot per accepted write

Status: accepted (2026-09-09), amended 2026-09-10 (an image change is recorded, never snapshotted), amended 2026-09-13
(the article keeps its own history - ADR 0028)

## Context

Authors need to see what an entry used to say and to put an old version back. Lorex is not
an audit product: nothing here is about who did what, or about proving a record was not
tampered with. The question is editorial - "what did this character look like before I
rewrote them" - and the answer has to survive the schema moving underneath it, because
types, fields and options are data an author edits at will (ADR 0007).

Two shapes were available. A change-set stores what moved and replays a chain to rebuild a
version. A snapshot stores the whole entry each time. The change-set is smaller and buys a
per-field diff for free; it also makes every version depend on every version before it, and
turns "show me version 3" into a replay that a single bad link corrupts.

## Decision

**One revision per accepted entity write, holding the whole entry.** Name, summary, article,
canon status, type, aliases, tags and every stored custom-field value. Every version is
readable and restorable on its own, with no chain to replay.

**Relational, in the same typed columns the live tables use.** `EntityRevisionFieldValue`
mirrors `EntityFieldValue` - text, number, boolean, date, option, entity reference, one row
per chosen option for a multi-select - rather than serialising the entry into a JSON
document because a snapshot happens to be easy to serialise. A history whose values are a
blob stops being queryable at exactly the moment the values are worth querying. The one JSON
that survives into a revision is the Tiptap article, which is the format the live column
already holds and which ADR 0007 already permits.

**Snapshots carry raw ids and no foreign keys into live lore, plus the text each reference
displayed at the time.** A field definition id, an option id and a referenced entity id are
stored as plain values alongside the field's name, the option's value and the referenced
entry's name. Two things follow, and both are the point:

- History cannot block schema evolution. A real key would mean a field definition that some
  old version once held could never be deleted, which would make history a ratchet on the
  author's own types.
- History cannot be rewritten by later edits. Renaming a field or an entry changes what the
  live join would say; the snapshot keeps what the author actually saw.

The single exception is the entry itself, which is a cascading foreign key. History is
history *of* an entry; when the entry goes, so does its history. Trash and recovery are a
separate concern and not part of this decision.

**Capture runs inside the write's own transaction**, after the write has been saved and
before anything is committed - which in practice means inside the transaction
`CanonPromotionGate` opened (ADR 0012). A write refused by validation, by an id that does
not resolve, or by the gate is rolled back with its revision inside it. History therefore
contains only state that was actually stored, and there is no second commit that could leave
lore and history disagreeing.

**A write that changed nothing records nothing.** The captured snapshot is compared, part by
part, with the previous revision's; an empty difference writes no row. The comparison reads
authored lore only: aliases, tags and values are compared as unordered sets of their own
content, and a field definition's name, kind or display order is deliberately excluded, so
renaming a field does not fill every entry's history with versions no author created.

**An image change is recorded, and nothing about the image is snapshotted.** A revision holds
no image bytes, no asset id and no object key. It cannot: replacing or removing a picture deletes
the objects it supersedes (ADR 0019), so a key kept here would name something that no longer
exists, and history would be lying rather than remembering. What is true and worth keeping is
that the picture moved, and when - so `EntityRevisionChange.Image` is set, and that is all.

It is the one change the snapshot comparison cannot see, which is why `CaptureAsync` takes a
flag for it: without one, an image-only write would compare equal to the version before it and
record nothing, and the history would quietly omit something the author did. Setting, replacing
and removing a picture each produce a version, and each says `the image`.

**Restoring a version therefore leaves the entry's current picture exactly where it is.** That is
a deliberate, stated boundary rather than a gap, and the history screen says so out loud - once,
under the heading and in the confirmation, and only for an entry whose history mentions a picture
at all. Making restore genuinely complete would mean retaining every superseded original for as
long as any version referred to it, which is a storage and cleanup commitment this product has
not taken; ADR 0019 records why.

**What changed is stored as coarse flags, not a diff.** `EntityRevisionChange` is a small
closed set - name, summary, article, status, type, aliases, tags, details - computed once at
capture. It tells a reader where to look. Producing a prose diff of a Tiptap document is
explicitly out of scope, and a per-field diff is a thing the reader can get by opening two
versions.

**Restore replays a snapshot through the ordinary entity update.** It is not a second write
path. The snapshot becomes an `EntityRequest` and goes through the same validation, the same
promotion gate and the same reconciliation as any other edit, and is recorded by the same
capture as the next revision, marked as a restore and naming what it came from. So a restore
that would make the universe newly self-contradictory is refused with the same 409 as any
other write, ownership is proved by the same `LoreAccess` check, and nothing already on
record is moved, rewritten or removed. History is append-only, and the only writes to it are
inserts.

**A version that names lore since deleted is refused, not partly applied.** Before the
replay, every field, option and referenced entry the snapshot names is checked against the
universe. Anything missing answers 409 with the code `revision_not_restorable` and says what
is gone. The ordinary write path would have silently dropped an unknown option id, which
would put back something the author never wrote.

## Consequences

- Reading any version is one row and its children. No replay, and a damaged version cannot
  corrupt its neighbours.
- Storage grows with the number of edits, not with their size, and an article is up to 200k
  characters. A universe edited heavily will hold more history than lore. That is accepted
  for now: it is bounded by human editing, and the lever when it matters is pruning or
  coalescing old versions, which a snapshot model supports and a chain would not.
- The article is compared as stored text. A client that re-serialised an identical Tiptap
  document differently would record a version for an edit that changed nothing visible. The
  editor produces the document deterministically, so this has not been observed; the
  cheapest fix if it ever is would be to normalise on the way in, at the existing
  `LoreContent` boundary.
- A revision reflects the entry only. Relationships and timeline participation are their own
  aggregates and are not snapshotted, so restoring a version does not restore who it was
  related to. The primary image is on that list too, for a different reason: not that it belongs
  to another aggregate, but that its bytes are gone by the time an old version could ask for
  them. All three are deliberate boundaries, not omissions.
- History is not security auditing and does not become it by growing. There is no actor, no
  IP, no read record and no universe-wide log - the model is single-owner (ADR 0006), so a
  version has exactly one possible author.
- The list endpoint returns an entry's whole history unpaged. Rows are small, and paging is
  the obvious first change if an entry ever accumulates enough versions to notice.
- A revision is captured wherever `CaptureAsync` is called, which today is entity create and
  update, and therefore also restore. As with ADR 0012's gate, a new write path records
  nothing until someone wires it - visible in one place rather than inferred.
- An entry created before this phase has no baseline. Its first edit records a version with
  no changes flagged, which reads as "first recorded version" rather than claiming the edit
  changed nothing.

## Amendment - the article keeps its own history (2026-09-13)

ADR 0028 moved the article into a row of its own with a history of its own, and that changes
three statements above.

- **A version no longer holds the article.** The snapshot is the structured entry: name,
  summary, status, type, aliases, tags and values. Capture neither reads nor compares the
  article, so a status click records a small version, never a copy of a long document. Saving
  the article records an article version, not an entry version.
- **A restore never touches the article.** The replayed request has no article member, so
  putting back an old version cannot put back - or wipe - an article saved since.
- **Versions recorded before keep what they recorded.** `EntityRevisions.Content` still holds
  the article as it read at those versions, and `Article` is still flagged on them. Both are
  read-only history: shown on the version, labelled, never compared and never applied. Every
  version recorded since has a null there, which says nothing about the article.

## Amendment - a field or choice a version records is kept (2026-10-20, Issue #39 review)

Snapshots still hold field ids and choice ids as plain data, with no key, and are never rewritten. What changed is the
other direction: the API no longer deletes what a snapshot names when the author asks it to. Permanently deleting a field
definition is refused (409 `entity_field_in_history`, with how many entries' versions use it) while any version records a
value for it, even once no entry holds one now, active or archived; removing a choice is refused (409
`entity_field_option_in_history`) while any version records it. Archiving is the way to put such a field away. Without
this, clearing a value and then deleting its field or choice made every older version naming it unrestorable. Two indexes
(`EntityRevisionFieldValues` by field and by choice, migration `AddEntityFieldVersion`) keep the checks to one index read.
A version naming an entry erased for good from the Trash, or a removed date period, is still refused on restore as before.

The same holds for a field's kind: it cannot change while any version recorded a value for the field (409
`entity_field_kind_locked`).

A version is not put back over archived fields it disagrees with. Restoring is refused (409
`entity_revision_archived_field`, with the field names) when the version's values for any archived field differ from the
values the entry keeps for it now - a value on one side only included - because a save never writes an archived field and
the restore would otherwise record a change it did not make. Nothing is written. Restoring the field first makes it an
ordinary field again, and the version then applies whole. A version whose archived values already match restores as usual.
Checked inside the promotion gate's transaction, beside the existing missing-reference check.
