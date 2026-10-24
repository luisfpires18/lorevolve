# ADR 0042 - An account has a storage allowance, counted from the pictures it owns and held during uploads

Status: accepted (2026-10-06). Product refinement 040.

## Context

Lorex stores one picture per Lore entry in a private bucket (ADR 0019), and until now nothing limited how much an
account could put there. A limit is needed before anything else is built on storage, and it has to be one that a
future billing system can raise without changing what it means.

The audit found: `EntityImage.ByteSize` already holds the size of the original as the server received it; an image row
cascades with its entry and its universe, survives the Trash untouched, and is removed explicitly by Remove image and by
permanent deletion; thumbnails are derived and regenerated (on upload, reframe and restore); a replacement writes the new
pair before the database moves and sweeps the old pair only after the commit; a universe delete removed the rows and
left the objects in the bucket (corrected below). Universe restore (ADR 0032) also writes entry pictures - every one in the backup, into a
new universe the restorer owns - so it is a second way to add stored bytes. Storage I/O never runs inside a database
transaction, and every transaction Microsoft.Data.Sqlite begins is `IMMEDIATE`.

## Decision

**The allowance is the account's.** `LorexUser.StorageQuotaBytes`, non-null, 1 GiB (1,073,741,824 bytes) for every
account: the migration's column default for those that existed, the property's initializer for new ones
(`StorageQuota.DefaultBytes`). No value means unlimited - not zero, not `long.MaxValue` - and no route changes it. Only
something trusted on the server, such as billing one day, may raise it. A positive value is held by that one write path;
no check constraint is added, because adding one to `AspNetUsers` means rebuilding the table in SQLite.

**Storage belongs to the universe's owner.** Usage is account-wide, across every universe the account owns
(`Universe.OwnerId`), and never per universe. An Editor's upload counts against the owner, not the Editor; a universe the
account only collaborates on is not part of its storage. Who may upload is unchanged - `UniverseCapability.EditContent`
(ADR 0041). Quota and permission are separate questions.

**What counts is the original of each Lore picture.** `SUM(EntityImages.ByteSize)` over the owner's universes - live
entries and entries in the Trash alike, because a trashed entry's picture is still stored and a restore brings it back.
Not thumbnails (derived, Lorex's own cost), not objects a failed sweep left behind (no row names them, so they are
infrastructure litter, not the author's), not universe artwork, profile photos, text, backups or anything else. Usage
falls the moment a row goes: Remove image, permanent deletion of an entry, permanent deletion of a universe, a smaller
replacement.

**The database is the index.** Usage is one set-based aggregate, computed when asked: no stored counter to drift, no
listing of the bucket, no request per object. `GET /api/profile/storage` (the signed-in account only) answers
`{ usedBytes, quotaBytes, remainingBytes, loreImagesBytes }` in one query at any size; `loreImagesBytes` is the one
category today, so another can be added beside it without changing what `usedBytes` means.

**An upload is judged by what it adds.** Growth = the new original's size (the bytes the server received, never a size
the client sent) minus the original it replaces. Growth of zero or less - the same size, a smaller picture - needs no
room and is never refused, even past the allowance. Positive growth needs `stored + held + growth <= allowance`. So an
account already over its allowance (stored before the allowance shrank, say) keeps everything, reads everything, frames
and removes as before, and may replace with anything smaller; it may add nothing. The temporary overlap of old and new
objects during a replacement is implementation cost and is never charged.

**Room is held for an upload in flight.** `StorageReservations` (id, account, bytes > 0, created, expires): a row per
upload whose growth is positive, nothing else. `AccountStorage.ReserveAsync` checks the room and inserts the hold in one
short `IMMEDIATE` transaction that commits before any byte goes to the bucket, so two uploads for one account are
serialised at the check and the second sees the first's bytes as spoken for. The bucket write runs with no transaction
open. The transaction that then moves the picture calls `ConsumeAsync` before it writes, deleting the hold in the same
commit. Every failure in between - the store, the database, a refusal, a cancelled request - calls `ReleaseAsync`, which
is never cancelled and never throws. Holds are durable rows, not an in-memory lock, because a lock in one process is
nothing to another.

**A hold lapses after 15 minutes** (`StorageQuota.ReservationLifetime`) and from then counts for nothing whether or not its
row remains, so a process that dies mid-upload cannot keep an account's room. No background worker: an account's lapsed
holds are deleted the next time it reserves. A hold that lapsed before its commit is checked again inside the commit
transaction, under the writer lock, and refused if the room has gone - so a slow upload or a long restore never takes
more than the allowance.

**A replacement that raced another change loses.** The upload's commit re-reads the entry's picture and moves only if it
is still the one the growth was measured against; otherwise it answers 409 `image_changed` and, once its transaction has
been rolled back, sweeps its own objects.
The superseded objects swept after the commit are the ones the row named at the commit, so a reframe that landed
meanwhile no longer leaves its thumbnail behind.

**Restore is held the same way.** The sum of the backup's entry pictures is held for the restorer before any is stored and
consumed by the transaction that writes the universe. The artwork is not a Lore picture and does not count.

**The refusal.** 409 with `code: storage_quota_exceeded` - a conflict with the account's state, not 413, which stays the
answer for a single file that is too large. The owner is told it is their storage; anyone else is told only that this
universe has no room. Neither answer carries a number: an Editor never learns the owner's usage, allowance or what is left.

**Not universe data.** The allowance and holds are account state, so no backup carries either and none is restored.
Backup format stays 22.

## Consequences

- The Profile shows "X used of Y" and a meter, and says so in words when full. No plans, no prices, no upgrade.
- An upload that adds bytes runs six more small commands than before (the room check, the lapsed-hold cleanup, the hold,
  the entry-still-live check and the re-read of the current picture at the commit, consuming the hold) in two short
  transactions; one that adds nothing runs two more (the two commit checks). Reading storage is one command at 0, 1 or
  50 pictures.
- An allowance below what an account stores is allowed and changes nothing already stored.
- Objects a failed sweep or a crash leaves in the bucket are not counted and not reconciled. Finding them is an
  operations job, not the author's bill.
- Not done: billing, plans, add-ons, an admin route to change an allowance, per-universe quotas, sharing an allowance,
  counting thumbnails or other media, a generic file system. The next stored category adds one subquery to
  `AccountStorage` and one field to the response.

## Amendment: deleting a universe sweeps its pictures (2026-10-06, review correction)

Permanent deletion of a universe removed its `EntityImages` and `UniverseArtworks` rows by cascade and never touched the
bucket, so an owner could fill their allowance, delete the universe, get the room back and repeat, leaving every object
behind for Lorex to pay for. Usage freeing at once was right; never attempting the cleanup was not.

The delete now follows the order every picture follows. Inside its transaction, after the owner and archived checks, it
reads the exact stored keys - each entry picture's `OriginalKey` and `ThumbnailKey`, the Trash included, and the
artwork's `OriginalKey` and `CardKey` - never rebuilding them from the naming convention. It commits, and only then sweeps
those keys through the existing `MediaObjectWrites.SweepAsync` helpers (entry pictures and artwork each with their own
orphan log). Nothing is deleted from the bucket before the commit, so a failed delete leaves the universe and its objects
whole. Once committed the universe is gone whatever the sweep does: a key that will not delete is logged as litter, and
it never counts against the owner, whose usage fell with the rows. Artwork is swept here and still never counts.

Each write path cleans up only what it wrote. An upload whose bytes were in the bucket while its universe was deleted
finds at its commit that the entry is no longer live, lets the transaction go, then sweeps its own objects, gives back
its hold and answers 404; the
delete never looks for objects nobody has committed. The same check makes an upload whose entry was trashed meanwhile a
404 rather than a picture on a trashed entry.

**No object-store call while a write transaction is open.** Every transaction an upload opens does database work only and
decides an outcome; every put, get and sweep - its own cleanup after losing a race or a lapsed hold included - runs only
once that transaction has been disposed, so a slow or failing bucket never holds SQLite's single writer lock. A real-file
test pauses each such sweep and proves another connection can write meanwhile.

## Amendment (2026-10-24, Issue #43, ADR 0053)

An appearance's pictures are Lore pictures too: their originals count against the universe owner beside the entries' own
pictures, live and trashed alike, held before the bucket is touched and consumed by the commit that adds the row, exactly as an
entry picture's upload is. A gallery picture is always new bytes, so every upload holds its whole size.
