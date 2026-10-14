# ADR 0044 - A suggestion is bound to the version it was made over, and is accepted only through the target's own save

Status: accepted (2026-10-14). Roadmap task 045.

## Context

A Reviewer reads and comments (ADR 0041 amendment, 043) and cannot edit. Reviews often end in "change this to that", and a
comment cannot carry that change in a form anyone can apply. Collaboration needs a way to propose an edit to an entry, a
story or a scene that writes nothing until someone allowed to edit decides on it.

Two existing rules shape the answer. Every write to those three forms goes through one path per kind - validation, the
Canon gate for entries (ADR 0012), history and its author for entries (ADR 0013, 042), scene moves between chapters - and
every such save names the version it was written over, refused when that version is no longer stored (ADR 0043). A second
path that wrote accepted values into the same rows would have to repeat all of it and would drift.

## Decision

**A suggestion is review metadata, never content.** `SuggestedChanges`: exactly one of entry, story or scene by three
nullable cascading keys (`CK_SuggestedChanges_Target`), `BaseVersion`, `Before` and `Proposed`, `Status` (Open, Accepted,
Rejected; `CK_SuggestedChanges_Status`), the proposer's raw account id and time, and the resolver's id and time. No
universe column: it is reached only through a live target of the universe named, like a comment thread. Account ids have
no foreign key, as for comments and versions (042, 043); answers carry usernames only, null for an account that is gone.

**A proposal is the target's own save request.** `POST .../entities|stories/{id}|stories/{id}/scenes/{id}/suggestions`
takes the exact body of that target's `PUT`, `expectedVersion` included. Inside one IMMEDIATE transaction the server reads
the target, then runs the ordinary write path inside a savepoint that is always rolled back: a wrong or missing version is
refused with the save's own 409 (`entity_changed`, `story_changed`, `scene_changed`), invalid values with the save's own
validation, a trashed or foreign target with 404. What the write path answers is what it would have stored; a proposal
the path would not count as a change (its version would not move) is refused, 400 `suggestion_unchanged`. Nothing but
the suggestion is written: no field, no version, no history, no search index, no Canon reconciliation.

**What is stored.** `Before` and `Proposed` are JSON of one explicit snapshot record per kind - `EntrySuggestion`,
`StorySuggestion`, `SceneSuggestion` - holding exactly what that form edits, as the read path returns it (names beside
ids). Both come from the server, never from the client. They are complete snapshots of the form rather than a list of
changed fields on purpose: with the version bound below, the stored `Proposed` replayed through the write path is
exactly "the stored form plus these changes", so applying one needs no merge code and no field-by-field executor. A
snapshot is read only through its record; nothing reflects JSON property names onto entities, and a member the request
contract does not declare never reaches it (over-posting is the save contract's own protection).

**Bound to its version.** `BaseVersion` is the target's version when it was made. While the target still holds it,
`Before` is what is stored. Once anything saves the target, the suggestion is out of date: it stays readable and can be
rejected, and an accept is refused, 409 `suggestion_target_changed`, with nothing written. There is no merge, no rebase
and no forced accept - for the owner either. Being out of date is derived (`BaseVersion` against the target's version,
answered as `targetChanged` while open), never written onto sibling suggestions.

**Accepting is the ordinary save, by the resolver.** `POST .../suggestions/{id}/accept` (owner, Editor) runs, in one
transaction - the Canon gate's for an entry, as its edit is - the open-status check, the version check, then the target's
own write path with `Proposed` as the request over `BaseVersion` and the resolver as the actor, then marks it Accepted with
resolver and time. Validation runs again (lore trashed meanwhile, a field definition gone); any refusal leaves the
suggestion open and the target as it was. History names the resolver as the author of the edit; the suggestion keeps the
proposer. A second accept or reject finds it decided and is refused, 409 `suggestion_resolved`; SQLite's IMMEDIATE
transactions serialise the race. `.../reject` marks it Rejected and touches nothing else.

**Permissions.** `SuggestChanges` (owner, Editor, Reviewer) and `ResolveSuggestedChanges` (owner, Editor) in
`UniverseAccess`; reading is `Read`, so a Viewer reads suggestions as they read comments. A Reviewer still has no write to
content.

**Lifecycle and backups.** The Trash hides a target's suggestions (404) and a restore brings them back; an accept against a
trashed target is 404. A permanent delete of the target or the universe cascades. Backups carry none (format stays 22),
like comments: they are private review metadata about accounts.

**Scope.** Entry, story and scene forms. Not articles or manuscripts: a prose proposal needs a text-diff and review
experience of its own, and is deferred.

## Consequences

- A new form-backed target needs only its write path to be callable inside a caller's transaction, a snapshot record and
  two routes. Any write that becomes part of a form's save path is automatically part of acceptance; nothing is
  duplicated to keep in step.
- The unchanged-proposal check is the write path's own judgement of a change (the version): a proposal is empty exactly
  when the same save would leave the version alone.
- Proposing costs one rolled-back write: the same work as a save, and on an entry the article-free update path, but no
  Canon sweep. A proposal that would introduce a High Canon conflict is accepted as a suggestion and refused at accept.
- Snapshots hold the whole form, so a suggestion on an entry with many fields stores those fields twice. Bounded by the
  form; nothing grows with history.
- A suggestion made over an older version is never applied, even when the intervening save touched a different field.
  The resolver rejects it or makes the change by hand; the proposer can suggest again over the latest.
- A schema change that does not move the target's version (a field definition removed) leaves a suggestion acceptable in
  appearance; its accept is then refused by validation.
