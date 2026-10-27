# ADR 0032 - A backup is restored as a new universe: validated first, every id new, the account's own

Status: accepted (2026-09-14), amended 2026-09-15 (format version 12: world rules - ADR 0033)

## Context

Phase 3's last feature. Since ADR 0014 a universe exports as a versioned archive - `backup.json` plus every entry's original
picture - and eleven format versions later nothing could read one back. A backup nobody can restore is a promise with no
way to keep it.

Restoring is not saved-version history (ADR 0013, 0028, 0029), not the Trash (ADR 0015, 0029) and not a browser's recovery
copy of unsaved writing (ADR 0029). It reconstructs, from a file, the world that was exported.

The hard parts are not reading JSON. They are: a file is hostile until read; eleven versions each mean something slightly
different; every reference in the file names ids that may already exist in this installation; a world has pictures in a
store that shares no transaction with the database; and some of what a world holds is derived and must be derived again.

## Decision

### Backup -> validate -> restore as a new universe

The one model: the author uploads a backup, LorEvolve validates it and shows what it holds, the author names the universe, and
LorEvolve creates it. **There is no overwrite and no merge**: no route takes a universe id, so no request can make a restore
write into a universe that exists. Restoring the same file twice makes two universes. The primary entry point is the
universes page, beside New universe, because a restore makes a universe rather than changing one; a universe's Settings
links there.

### Two requests, and the second trusts nothing the client kept

`PUT /api/backups/validate` takes the archive as the raw request body - not a form, so it streams straight to disk, counted
as it arrives - reads and validates it, and answers with a preview and a token. `POST /api/backups/restore` takes the token
and the new name, nothing else. The preview's counts are the server's and are never sent back. The kept file is validated
again, from the start, before a row is written. `DELETE /api/backups/validate/{token}` lets the client drop one early. All
three require a signed-in account. `PUT` for the reason ADR 0019 gives: a cross-site form cannot send one.

Why keep the file rather than upload it twice: a backup can be hundreds of megabytes over the connection the upload progress
bar exists for (ADR 0019), and the restore should read exactly the bytes that were checked. The waiting upload is bounded so
it cannot become a storage service:

- The token is 256 random bits and the file's only name - no request text is ever part of a path.
- It is good for the account that uploaded it; another account's token, an expired one and a guessed one are the same 404.
- One waiting upload per account (a new one replaces the last), at most 16 and 2 GB across everyone (refused, not queued),
  30 minutes, deleted on restore, on discard, on refusal and by the next request after it expires.
- The map is in memory; a restart forgets every upload, and the next start deletes staging folders older than an hour.
  Files live under the system temp path (`Backups:RestoreStagingPath` overrides), never beside the database.
- One restore per upload at a time: a double-submitted restore is a 409 and builds nothing.

### Validation is structural, and writes nothing

Validation runs before any durable write: no row, no picture, no migration, and the upload is not rewritten. It is the same
code for both requests (`BackupArchiveReader`, `BackupValidation`).

**The archive is hostile.** Nothing is ever extracted: every entry is read into memory against a bound, so no entry name is
ever used as a path. Names are still refused when absolute, drive-lettered, backslashed, holding `.`/`..`/empty segments or
control characters, or when the entry is a symbolic link; two entries whose names differ only by case are refused. The ZIP's
end record is read first, so an archive claiming more than 5,001 entries or an 8 MB table of contents is refused before the
platform allocates an entry per line. Each entry must yield exactly its declared size - a read asks for one byte past it -
so a decompression bomb, a lying header and a truncated entry fail alike. The file's extension and the client's content type
are ignored; what it is, is decided by its bytes.

| Limit | Value | Why |
| --- | --- | --- |
| Upload | 512 MB | refused while arriving; the client checks first |
| Decompressed total | 1 GB | counted as read |
| `backup.json` | 128 MB | parsed whole, so also the parser's memory bound |
| One picture | 8 MB | the ceiling it was uploaded under (ADR 0019) |
| Entries | 5,001 | the document and 5,000 pictures |
| Rows written | 1,000,000 | across every table |
| JSON depth | 32 | LorEvolve writes about ten; duplicate properties refused |

**The version is read before the shape.** `format` and `formatVersion` are read forward-only first, so a file from a newer
LorEvolve is told it is newer (`backup_version_unsupported`) even when its payload would not parse. Versions 1-2 are a single
JSON document and 3-11 an archive; a version 3+ `backup.json` uploaded on its own is pointed back at the ZIP.

**Then the content, against what the destination already depends on - and nothing more.** Every id present, non-empty and
unique across the whole file; every reference resolving to something of the right kind in the same file (an idea's reference
kind is taken as written, never inferred); scenes and beats only within their own story; enums LorEvolve knows; text within its
column; unique indexes (type, field, option, alias and relation kind names, tag names by lower case, one field per declared
meaning, live orders per container); a declared meaning only on a Number field; a symmetric kind with no older side; eras
at most 20, years in an era from 1; months and days in range; an article - and every saved and pre-ADR-0028 copy of one - a
document `LoreContent` accepts, so a backup cannot carry a `javascript:` link into the editor; a colour that is a colour; and
every picture at exactly the path LorEvolve would have built from its entry's id, present, the size the document says, and
decoded in full by the upload gate, with its crop. An archive holding any file the document does not name is refused.

Nothing is judged for sense. No relationship is read from its name, no era guessed from a label, no Canon re-decided, no
prose read: a world that looks inconsistent is still the author's world.

Problems are collected, 20 listed and the rest counted. A root failure - not a backup, unsupported, damaged, unsafe, too
large - is one sentence. Every refusal is a problem response with a stable `code` and author-facing `issues`, never an
exception message, SQL, a path on the machine or an object key.

### One restore path: older versions normalize into the current shape

Every version LorEvolve has written restores, 1 to 11: each shape is a subset of the next and ADR 0014 records what each change
re-meant. `BackupFormatSupport.MaxVersion` is its own constant, held equal to `UniverseBackup.CurrentVersion` by a test, so
bumping the export fails until the importer is taught the new version. Two passes, then one writer:

1. **Project**: read the payload the way its version defines it. A member that version did not have is absent even if the
   file carries one - a "version 4" file holding stories was not written by LorEvolve, and what version 4 means is what is restored.
2. **Normalize**, after validation, doing to the file what each migration did to a live database: version 1 is all live;
   before 4, no eras and no relationship constraint, and an icon is kept when it is a known key after trimming and lowercasing
   and cleared otherwise (ADR 0020); before 5, no stories; version 5 scenes are Unchaptered in their order; before 9 the
   entry's `content` becomes the article's row dated as the entry was, and its version 1; before 10 nothing is in the Trash
   and each manuscript is its own version 1; before 11, no ideas. For every version, the live rows of each ordered
   collection are numbered 0, 1, 2… in the order their numbers put them - a no-op on a file LorEvolve wrote, and what keeps a gap
   from colliding with the next append.

A version newer than this build, or 0 and below, is refused as unsupported. There is no per-version database writer.

### Every id is new

A restore never reuses a source id. `RestoreIdentity` allocates a fresh id for every object in the file before anything is
written and rewrites every reference through that one map: universe, eras, types, fields, options, tags, entries, their
versions and article versions, relation kinds, relationships, moments, stories, chapters, scenes, manuscript versions, arcs,
beats and ideas; value, participant, link and reference rows; pictures get a new asset and thumbnail id. So restoring into the
account that exported the source while it still exists, restoring twice, or restoring another installation's file can never
meet an existing row, and nothing restored can point outside the new universe.

Stored history is the one place a reference need not resolve: an entry version records the ids of the field, option, era
and entry it showed (ADR 0013), with no key behind them, and the field may since have been deleted. Each such id is still
translated - to the object's new id when it is in the file, otherwise to a fresh id of its own, the same one wherever it
recurs - so history stays internally consistent and names nothing outside the restored universe. A version's
`restoredFromRevisionId` is translated the same way.

**This supersedes ADR 0014's consequence that an importer "would have to recompute" dismissal fingerprints "and should not"
renumber ids.** A dismissal is carried as a fingerprint of the ids it was about. After the rows are written, Canon Integrity
evaluates the restored universe (ADR 0010: conflicts are derived), and each finding's fingerprint is computed a second time
over the ids its records had in the backup; a finding whose original fingerprint was dismissed is dismissed again, as of when
it was. To make that possible a `CanonFinding` now carries the ids its fingerprint hashes (`FingerprintIds`), and the
fingerprint is derived from them - the same hash as before, so every stored conflict keeps its fingerprint. A dismissal whose
finding no longer arises is not kept: evaluation would have resolved it in the source the next time it ran.

### The restoring account owns it; the file grants nothing

The universe and every idea are the signed-in account's. No owner id is in a backup (ADR 0014) and none would be read. A
backup from another account or installation restores if it is structurally valid; its origin grants no authority. No account
data is restored - no profile photo, no settings, no Identity row. The new universe's name follows the universe rules (unique
per account, 120 characters); it is prefilled from the backup and, when the account already uses it, the author is asked
for another - nothing is appended. The universe's `createdAt` and `updatedAt` are the moment of the restore; everything inside
keeps the moments the backup recorded, and the universe keeps its archived flag.

### Written as rows, not replayed

The restore never goes through the endpoints a person uses. Those would record a version for every entry written, run the
promotion gate, close and reopen order gaps and reindex row by row - a fabricated history of an importer typing the world back
in. `UniverseRestore` writes the rows the backup describes, with the history the backup holds, and no restore-made version,
revision or search churn.

- **The Trash stays the Trash.** Every `deletedAt` is restored as it was; what was trashed is in the restored Trash, still
  restorable, with its prose, versions and links; nothing trashed holds a live place.
- **History is the backup's.** Entry versions, article versions and manuscript versions keep their numbers, kinds, moments and
  text; no importer entry is added.
- **Ideas** of the backed-up universe become the restoring account's ideas about the restored universe, references rewritten,
  deleted ones still in Recently deleted (ADR 0030). The file's association is what says they belong here. Ideas with no
  universe were never in a universe backup and are not created. A browser's recovery copies were never in one either.

### Pictures first, then one transaction

R2 and SQLite share no transaction, so the order is ADR 0019's. Every picture is stored first - the original exactly as it
was in the archive, and a thumbnail cut again from it with its recorded crop by the upload gate (never a carried thumbnail) -
under keys built from the new universe's and entry's ids, which nothing else can be using. Up to four at once. Only then does
one database transaction write every row, index the lore, reconcile Canon and commit. Any failure before the commit rolls the
database back and sweeps every key this restore attempted - only those, so no existing picture can be touched - and the upload
stays waiting for a retry. What cannot happen is a committed universe naming a missing picture. A process that dies between
the pictures and the commit leaves unreferenced objects under a universe id that never existed: the accepted ADR 0019 trade.

A picture whose crop was null keeps a null crop; its thumbnail is the centred square, as ever. `UploadedAt` is not in the
format and becomes the moment of the restore.

### Derived data is derived again

The lore FTS index is written from the restored entries with the index's own `ReindexAsync`; the story, manuscript and idea
indexes are filled by their triggers as the rows land (ADR 0031). No index row is ever read from a backup. Restored content is
searchable the moment the restore commits, and trashed content is not, by the same joins every search uses. Thumbnails are cut
again. Canon conflicts are evaluated again, dismissals re-applied as above.

### Synchronous, and why that is enough

Measured on a synthetic worst case - a 78 MB document, ~145,000 rows (3,000 entries each with values, aliases, four versions and
three article versions; 500 scenes with 5 KB of prose and five versions; 3,000 relationships) and 30 pictures: validation
4.3-4.9 s, restore 20 s end to end, of which the database write holds SQLite's single writer for ~15 s. A realistic universe is
two orders of magnitude smaller and restores in well under a second of writing. The request is synchronous with a busy state; no
job system. App Service's 230-second front-end limit is far above both.

## Deliberately unsupported

- Restoring over, or merging into, an existing universe; choosing parts of a backup to restore.
- An account-wide backup or restore, and so any file for ideas with no universe.
- Scheduled, recurring or cloud backups; encrypted or password-protected backups.
- Importing from other tools, repairing a backup by hand or with AI.
- A background job, resumable uploads, or progress within the server's work.

## Consequences

- The export format does not change and is still version 11: an importer is not a format change (ADR 0014).
- `CanonFinding` carries `FingerprintIds`; a new rule builds its finding from ids, never from a precomputed hash.
- A very large restore holds the one SQLite writer for its write, so other writes in that moment meet the known contention
  (STATE) - seconds, and only for a world of a size nobody has yet.
- A restart between validate and restore sends the author back to choose the file; nothing else is lost.
- The server's temporary disk must hold one upload per waiting account, up to 2 GB in total.
- Pictures in a backup restored while no object store is configured refuse the restore with a 503 after validating; a world
  without pictures restores anywhere.
- Validation decodes every picture, and a restore validates again, so each picture is decoded once per request.

## Amendment - format version 12: world rules (2026-09-15)

Format version 12 adds a universe's world rules (ADR 0033, ADR 0014), and the importer learned it in the same change:
`BackupFormatSupport.MaxVersion` is 12, still held to `UniverseBackup.CurrentVersion` by its test.

- **Versions.** Every version 1 to 12 restores. Projection: before 12 a file has no rules, even one carrying a `worldRules`
  member. Normalization: none means an empty list. A version 12 file without the member is refused as incomplete.
- **Validation.** Each rule's id is registered with every other id in the file (present, unique); its title is present and within
  200 characters, its description present and within 10,000. What a rule says is never judged.
- **Identity and writing.** Each rule gets a new id from `RestoreIdentity`, belongs to the new universe and so to the restoring
  account, and keeps `createdAt`, `updatedAt` and `deletedAt`: a rule in the Trash is in the restored Trash, restorable. The rows
  are written directly in the one transaction; the search triggers index them as they land. Twice is two independent sets.
- **The preview** counts `worldRules` and `worldRulesInTrash`; the restore screen shows a World Rules line and counts rules in
  "In the Trash".

## Amendment - format version 13: world rule checks (2026-09-15)

Format version 13 adds a universe's event kinds and methods, each rule's check and each moment's details (ADR 0034, ADR 0014), and
the importer learned it in the same change: `BackupFormatSupport.MaxVersion` is 13.

- **Versions.** Every version 1 to 13 restores. Projection: before 13 there are no terms, no check and no details, even in a file
  carrying them. Normalization: none means empty; a check of kind `None` is no check, and details with no part are none. A version
  13 file without `validationTerms` is refused as incomplete.
- **Validation.** Each term's id is registered with every other id; its kind is known, its name present and within 80 characters,
  and no two terms of one kind share a name case-insensitively. A check's kind is known, its event kind and method are terms of
  exactly those kinds in the file, and its limit is 1 to 10,000. A moment's event kind and method, when set, are terms of their kind
  in the file, and its participant an entry in the file. Nothing a name says is judged.
- **Identity and writing.** Terms get new ids from `RestoreIdentity`; every check and set of details is written with its rule's,
  moment's, terms' and participant's new ids, so none can point outside the new universe. No check state is read or written.
- **Canon.** Evaluated after the rows as ever. A world rule finding is fingerprinted over a set of moments whose ids all changed;
  `CanonFinding.UnorderedFrom` makes the translated set hash to the backup's key, so its dismissal is re-applied like any other.

## Amendment - format version 14: family meanings (2026-09-16)

Format version 14 adds the family meaning a relation kind carries (ADR 0035, ADR 0014), and the importer learned it in the same
change: `BackupFormatSupport.MaxVersion` is 14.

- **Versions.** Every version 1 to 14 restores. Projection: before 14 no kind has a family meaning, even in a file carrying one -
  and none is ever taken from what a kind is called. Normalization: none is needed; the column's absence is `None`.
- **Validation.** The meaning must be one LorEvolve knows, and a kind that reads the same from both sides may not carry one, exactly as
  it may not name an older side. Nothing a kind is called is judged.
- **Identity and writing.** The meaning travels with its kind, which already gets a new id from `RestoreIdentity`; no relationship
  row changes, because the meaning was never on one. A restored universe therefore derives the same family trees as the original,
  under ids it shares with nothing - pinned by a test that describes every relative of every entry by name on both sides.
- **Canon.** `CANON-FAMILY-001` is fingerprinted over the links that close a circle, as a set, so `CanonFinding.UnorderedFrom`
  re-applies a dismissal over the restored ids the way a world rule finding's is.

## Amendment: format 15 and publication (2026-09-27)

Importer 1-15. A restored universe is always private, with no address and no publication date, whatever the file
says - no version of the format can carry visibility (ADR 0036). Its public details are restored as authored, and its
artwork is validated through the upload gate with the 16:10 card frame, stored under the new universe's keys with the
card cut again from the recorded frame, and swept with the entries' pictures if the restore fails.

## Amendment: format 19 and nested types (2026-10-01)

A version 19 file's types must be a forest before anything is written: every `parentId` names a type of the same file,
never the type itself, and following parents always ends at a root - a missing parent is a missing reference, a self or a
loop an invalid value, all refused by validation like any other. Places among siblings are restored as stored (ties are
ordered by name, as the app orders them), so a valid file is never rearranged. Restore gives every type a new id and maps
`parentId` through the same `RestoreIdentity` as every other internal reference; the types are written as roots and then
nested in a second write of the same transaction, because the database checks a parent as each row is written and one save
does not promise parents first. Two restores of one file make two independent, identical trees. Files at version 18 and
earlier restore flat.

## Amendment: collaboration (2026-10-02, ADR 0041)

A restored universe belongs to the restoring account alone, whoever exported it and whoever could reach the original. A
restore never creates a membership and the archive holds none to restore; its answer carries `accessRole` Owner.

## Amendment: storage (2026-10-06, ADR 0042)

The entry pictures a restore writes are the restorer's storage. Their total is held before any is stored and consumed by
the transaction that writes the universe; without room the restore answers 409 `storage_quota_exceeded`, keeps nothing and
leaves the upload waiting. Artwork does not count. No allowance or hold is in a backup.

## Amendment (2026-10-25, issue 31, ADR 0058)

A restore makes one rewrite inside authored text: each well-formed manuscript mention's entry id, in the manuscript and in
every saved version, is pointed at the restored entry. An id the backup does not hold stays as it is. The backup format is
unchanged; the file still carries the prose byte for byte.
