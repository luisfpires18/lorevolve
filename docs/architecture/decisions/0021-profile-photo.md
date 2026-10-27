# ADR 0021 - An account's photo is its own user-level media, on the entry image's proven path

Status: accepted (2026-09-12)

## Context

The Profile screen showed a monogram in a circle because the auth model had nothing else: `LorEvolveUser`
is a bare `IdentityUser`, with a username and an email and no picture. The owner asked for a real
photo, with the same framing, replacing and removing an entry's picture already has.

Entry images (ADR 0019) had already answered every hard question this raises: a private bucket, bytes
served only through an authenticated LorEvolve route, a server that decides what is an image by decoding
it, a square cut on the server from four fractions the browser chose, and a write ordering that
survives two stores with no transaction between them. The question was not how to do it again. It was
how much of it to reuse, and where a profile photo is genuinely *not* an entry's picture.

Three things make it not one. It belongs to a person rather than to authored lore, so it has no
universe and no owner to check; it has no history, because an account is not versioned; and it must
not appear in a universe backup, which is defined (ADR 0014) as one world's authored data.

## Decision

**The photo is its own table, keyed by the account.** `ProfileImages.UserId` is primary key and
foreign key at once, so "at most one photo" is a constraint rather than a convention, and the row
cascades with the account. Overloading `EntityImage` with a nullable entry id was rejected: that row
is keyed by an entry, cascades with an entry, is captured by revision history and is written into a
backup, so sharing it would have meant a nullable key plus an exception in the backup builder and
another in revision capture - three holes in proven code to save one table. Identity's own schema is
left alone for the same reason: a future Identity migration should not have to know about a bucket.

**The gate that accepts the bytes is shared, and nothing else is.** `EntityImageProcessing` moved to
`Features/Media/ImagePreparation.cs` unchanged in behaviour. One implementation now decides the
accepted formats (JPEG, PNG, WebP - SVG still refused outright), the 8 MB ceiling, the pixel and
side limits, the EXIF orientation rule, where a crop lands on whole pixels, and how the 320px square
is rendered. An avatar and a character portrait cannot drift apart, because there is nothing to
drift. The crop itself became `Media.ImageCrop`; `EntityImageCrop` stays as the lore wire and backup
shape, converting in a line each way, because a v3 archive's `image.crop` is published and does not
change for an internal tidy-up.

**Ownership is the session, and is not expressible any other way.** No route carries a user id, in
the path or in a body. Every one derives the account from the signed-in principal, so "read someone
else's photo" is not a request that can be made, only one that resolves to nothing. The read routes
find the row by the session's id and then check the asset and thumbnail ids in the URL against it, so
an address stops resolving the moment what it named is replaced.

**Object keys are a sibling of the entity convention, not a branch of it:**

    users/{userId}/profile/{assetId}/original.{ext}
    users/{userId}/profile/{assetId}/thumbnail-{thumbnailId}.webp

Not under `universes/`, deliberately: account media under a world's prefix would be swept up by any
future per-universe lifecycle rule or bulk export. Ids only - no username, no email, no filename. The
user id is the one segment LorEvolve did not mint itself, so it is refused into a key unless it is a
plain token. A new `{assetId}` for every upload and a new `{thumbnailId}` for every square mean
nothing is ever written over an object that is currently live.

**The write ordering is ADR 0019's, exactly** - including its 2026-09-12 amendment, so the new
original and its square are written concurrently and the superseded pair is swept concurrently.
The rest is unchanged: Both new objects are written first under ids nothing
is using; then the row moves; only after that commit is the superseded pair deleted. A failure before
the commit leaves the previous photo working and sweeps what was written; a failure after it leaves
the new photo in place with litter to log. Reframing writes a new square, moves the row only if it
still names the asset and square that were read - otherwise 409 - and never touches the original.
Removing is the reverse: the row goes first, then the objects.

**A universe backup does not contain it, and the format does not change.** No version bump, no new
archive path, nothing in `backup.json`. A backup is one world's authored data; whose account happened
to export it is not part of the world. A test pins that an archive exported by an account with a
photo holds no `users/` entry, no account id and no asset id.

**The screen does what the editor does, in the words of a profile.** The same `ImageCropDialog`,
1:1, free drag, zoom, arrow keys, the square kept inside the picture so it can never hold empty
space. The stored derivative is square; the circle is CSS, so nothing is ever cut round and the same
avatar could be shown squared off later without cutting it again.

**The account is reached from the global chrome, never from a universe's sidebar.** `/app/profile`
is the route, and one `AccountMenu` - a circular avatar that opens onto the username, the email,
View profile and Sign out - is the way to it, on the workspace's black rail and in the universes
header. The rail's mark and its accent seal are a pair, "LorEvolve" and "which world this is", so the
avatar sits at the foot of the rail rather than between them; on a narrow screen the rail is the
sticky bar and the same node lands at its right-hand end, so a phone needs no second account UI.
The beige sidebar stays what it is: this universe's sections, and an account is not one of them.

**One reading of the avatar, for every place that draws one.** `ProfileImageProvider` holds it for
the signed-in account and every write path reports its result there, so the rail, the folded bar,
the universes header and the Profile screen cannot disagree and an upload does not need a reload.
It is its own provider rather than a field on the auth context because it is media, not identity:
a different feature's endpoint, and it changes while the session does not.

## Consequences

- An account's photo is not in any export. Losing the bucket loses every avatar with no way to
  restore one from a backup, which is the correct trade for data that is neither authored nor
  irreplaceable: its owner has the original file.
- There is no history and no undo. Replacing or removing a photo deletes the objects it superseded,
  the same way a superseded entry image is deleted (ADR 0019), and for the same reason - keeping them
  would mean keeping every photo an account ever had with nothing that could ever read them.
- The photo is private to its owner's session. Nothing else in LorEvolve shows another person's avatar
  today, so there is no sharing story to get wrong; if one is ever wanted, it will need its own
  decision about who may see whom, and the read route is the single place that would change.
- Orphaned objects are swept best-effort and never retried, exactly as ADR 0019 has it: a key that
  will not delete is logged by key and left.
- Two write paths now depend on `ImagePreparation`. Changing an accepted format or a limit changes
  both at once, which is the point, and both suites cover it.

## Amendment: a photo may be shown on the public author page, by choice (2026-09-28)

The photo is private to its owner's session unless its owner chooses to show it on their public author page (ADR 0037):
`ProfileImages.IsPublic`, false by default and false again whenever the photo is replaced. Only its square is ever served
publicly, and only through the author routes, which ask on every request whether the choice is on and the author has a
public universe. The owner's own routes here are unchanged.
