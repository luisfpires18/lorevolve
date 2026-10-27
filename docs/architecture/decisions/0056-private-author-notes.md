# ADR 0056 - An entry may carry one private author note, and the owner alone may read it

Status: accepted (2026-10-24). GitHub issue 23. Amends ADR 0041 (a capability the owner alone holds), ADR 0014 (backup
version 32) and ADR 0043 (a note's save names its version).

## Context

A public or shared entry may need author-only context beside it: the reveal still to come, what the entry is really for, a
loose end. Issue 23 asks for it without a second ambiguous note system - LorEvolve already has ideas (ADR 0030, account-owned
possibilities) and review comments (ADR 0041 amendment, a conversation among members) - and with privacy that holds by
construction, not by convention. The owner decided on 2026-10-24: a dedicated permission held by the owner only; no saved
versions and no device recovery copy; the optimistic conflict check kept; notes in the owner's backup; nothing readable by
the assistant, an outside app over MCP or an AI change proposal; and no note in any public page, public API, search,
preview, error or other indirect output.

## Decision

**One note per entry, in a row of its own.** `EntityPrivateNotes` - `EntityId` as key and cascading foreign key, `Content`
(plain text, at most 20,000 characters, kept exactly), `UpdatedAt`, `Version` - with no navigation from `LoreEntity`. That
absence is the privacy mechanism: no projection of an entry - the list, the read, a revision, a suggestion, an AI
proposal, the FTS index, the public page, `UniverseReader` behind the assistant and MCP - can carry a note by accident,
because nothing but the note's own route reads the table. Nothing indexes it and nothing reads it for meaning.

**A capability the owner alone holds.** `UniverseCapability.PrivateNotes` is true for `Owner` and no other role, in the
one matrix (`UniverseAccess.Allows`). `GET` and `PUT /api/universes/{u}/entities/{id}/private-note` ask for it before
anything else: an Editor, Reviewer or Viewer gets the one 403 every capability refuses with, carrying nothing of the note;
an outsider the same 404 as for a missing universe. Then a live entry of that universe, else 404: a trashed entry's note
is kept and unreachable, like its article, and comes back with the entry. An entry erased for good takes it.

**Saved like a manuscript, with less.** `PUT { content, expectedVersion }`: null content refused (a malformed body can never
wipe a note), the bound refused, a stale or missing version refused with 409 `entity_private_note_changed` and
`currentVersion` (ADR 0043), a save that changes nothing writes nothing, an emptied note keeps its row. The entry's own
`UpdatedAt`, history, Canon findings and search are untouched: a note is about the entry, not part of it. By the owner's
decision there is no revision table and no IndexedDB recovery copy - a confidential text should live in one place - so an
unsaved note is lost with its tab, and the drawer says so by asking before it closes.

**In the owner's backup.** `BackupEntity.PrivateNote` (`content`, `updatedAt`) since format version 32 (ADR 0014
amendment). Only the owner may export (`Backup`), and a restore makes the restoring account the owner of a new universe,
so the note's reader is unchanged by the trip. A version 31 or older file restores every entry without a note, even when
it carries the member.

**On screen.** A "Private note" tool on the entry's bar beside Family tree, its icon alone on a phone, drawn for the owner
alone (the API decides regardless), opening a drawer: the note's one text box, an explicit Save with Ctrl+S, the shared conflict review,
and a sentence saying who can read it. Nothing is read until the drawer opens.

## Consequences

- Private notes are not comments, ideas, fields or article text, and none of those is changed. Duplicate (ADR 0054) copies
  no note. The security review (#33) covers the route and the backup member.
- Not done, on purpose: notes on stories, scenes or moments; Editor access; saved versions; a recovery copy; a
  word count; search within notes.
