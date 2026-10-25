# ADR 0019 - An entry has one image, held in a private bucket and served by Lorex

Status: accepted (2026-09-10). The two decisions it left open were taken the same day; see Consequences.
Amended 2026-09-11 after live DEV testing: the author chooses the thumbnail's square, and R2 uploads need two
per-request SDK flags. See "Amendment: owner-framed thumbnails and R2 uploads". Amended again the same day:
a "Fit full image" thumbnail mode was added and withdrawn. See the last amendment.

## Context

An entry could carry a picture, and until now nothing in Lorex could hold one. SQLite is the
only store the product has, and it is the wrong place for image bytes: it is one file on one
share (ADR 0018), every backup and every read would carry the blobs, and the row that a card
projection touches would stop being small.

So this is the first time Lorex has two stores that must agree, and that - not resizing - is the
part worth deciding carefully. Object storage and a relational database cannot be committed
together. Whatever is built has to say what happens when one of them succeeds and the other does
not, and the answer has to be one an author would accept.

ADR 0014's premise is affected. It argued for a single JSON backup partly on the grounds that
"media is not in the product". It is now, and ADR 0014 has been amended: version 3 of the format
is an archive carrying the originals.

## Decision

**One primary image, in its own table, keyed by the entry.** `EntityImages.EntityId` is both the
primary key and the foreign key, so "at most one" is a constraint rather than something every
write path has to remember. It cascades with the entry, which is why the Trash needs no special
case: trashing sets `LoreEntity.DeletedAt` and deletes nothing (ADR 0015), so the association
survives untouched and a restore reconnects it with nothing to rebuild.

The row holds identifiers, never a URL: asset id, both object keys, the decoded content type,
the original's dimensions and byte size, the author's filename as a label, and when it was
uploaded. The keys are stored as written rather than recomputed from the convention, so changing
the convention later cannot orphan objects that already exist.

**Keys are ids and nothing else.**

```
universes/{universeId}/entities/{entityId}/primary/{assetId}/original.{ext}
universes/{universeId}/entities/{entityId}/primary/{assetId}/thumbnail-{thumbnailId}.webp
```

(`thumbnail-{thumbnailId}` since the amendment; a picture stored before it keeps `thumbnail.webp`,
because the row stores the key it was written under.)

No username, no email, no world name, no entry name. A bucket listing is a disclosure surface
even on a private bucket, and names are authored content. It also means renaming a world or a
character moves nothing.

**`{assetId}` is new for every upload, replacements included.** Nothing is ever written over the
pair that is currently live. That single rule is what makes the replacement flow safe and what
makes a served URL immutable.

**Uploads are mediated by the API; they do not go to R2 from the browser.** A presigned PUT
would take the server out of the write path, but the server is the thing that decides whether a
file is an image at all - by decoding it, not by reading its name - and the thing that makes the
thumbnail. Handing both to the client would mean trusting the client with both. It would also
mean opening CORS on the bucket.

**Reads are an authenticated Lorex route, not a presigned URL.** Both were viable for a private
bucket. A presigned URL turns the URL itself into the credential: it survives in history and in
anything the author pastes it into, it cannot be withdrawn before it expires, and it has to be
reissued and threaded back into every `img` tag as it does.
`GET /api/universes/{u}/entities/{e}/image/{assetId}/original` (and `.../thumbnail/{thumbnailId}`
since the amendment) instead proves ownership through
the same `LoreAccess` check as every other lore read (ADR 0006), streams the object, and points
at nothing outside Lorex. The cost is bandwidth the product already pays for everything else it
serves. For a single-owner world with one picture per entry, that is not a trade worth making
the other way.

Because the asset id is in the path and is never reused, the response is
`Cache-Control: private, max-age=31536000, immutable` - honest, because those bytes cannot change
under that URL - plus `X-Content-Type-Options: nosniff`. `private` keeps it out of any shared
cache, and the route is under `/api`, which the service worker refuses outright (ADR 0017), so a
private picture never reaches the app-shell cache.

**A replacement is ordered so the working image is never the thing at risk.**

1. Mint a new asset id.
2. Write the new original, then the new thumbnail.
3. Move the database association, and commit.
4. Only then delete the previous pair.

A failure before the commit leaves the entry pointing at the image it had, whole, and the new
objects - which nothing references - are swept. A failure after the commit leaves the new image
active with two objects to clean up. What cannot happen is the database naming objects that are
gone. Removal is the same ordering in reverse: clear the association, commit, then delete.

Sweeping is best-effort and never fails the request. A key that will not delete is logged with
its key and left. There is no retry queue: at one image per entry the cost of an orphan is a few
hundred kilobytes, and the cost of a queue is a subsystem.

**What is accepted, and what is refused.** JPEG, PNG and WebP, decided by decoding the bytes -
the filename is a label and the browser's content type is a claim. At most 8 MB, at most 10,000
pixels on a side, and at most 24 megapixels, checked from the header before anything decodes the
pixels, because only a pixel-count check sees a decompression bomb coming. One frame. Empty and
truncated files are refused with a sentence that says what to do about it.

**SVG is refused.** It is a document format with scripting and external references in it, not a
picture, and making one safe means writing and maintaining a sanitiser - a project of its own,
with a long history of bypasses. It also has no pixels to resample, so the thumbnail path could
not treat it like the others. Refusing it is one line; sanitising it would be a phase.

**The thumbnail is generated server-side, 320px square, WebP.** Originally centre-cropped; the
author now chooses the square - see the amendment below. The lore grid
lays cards out at a 17.5rem minimum and draws the portrait at well under half that, so 320
leaves room for a high-density screen without storing a second near-full-size copy. Crop rather
than fit, because the card slot is a fixed square and letterboxing every non-square image would
put grey bars on the most-scrolled screen in the product. It never enlarges: an image already
smaller than the target is cropped square at its own resolution. EXIF orientation is applied
before metadata is dropped, and the thumbnail carries no EXIF, IPTC or XMP - no camera, and in
particular no GPS. The original is stored exactly as uploaded, metadata included, because it is
the author's own file, is served only to them, and re-encoding it would lose fidelity for
nothing.

**Two dependencies, both justified.** `SixLabors.ImageSharp` decodes and resizes: it is fully
managed, so there is no native asset to carry onto a Linux App Service and no per-RID build, and
Windows development and Linux deployment behave identically. Its licence is the Six Labors Split
License, which is free for personal use and for organisations under $1M revenue - true of Lorex
today, and worth revisiting if that ever changes. `AWSSDK.S3` (Apache-2.0) speaks R2's
S3-compatible API; hand-rolling SigV4 would be a few hundred lines of security-critical crypto
to avoid a well-maintained package.

**Storage is behind a three-method interface, and not one method more.** `IMediaObjectStore` puts
one object, gets one object and deletes one object. No listing, no copy, no multipart, no bucket
management, no lifecycle - because nothing in the product wants any of it. It exists so tests
never reach Cloudflare, not so a second provider could be slotted in. Three implementations: R2,
in-memory (local development and Playwright), and one that fails every call with a 503 when
nothing is configured. There is no silent fallback: a deployment that lost its credentials must
not quietly start storing images in a dictionary.

**A new entry's picture waits for the entry.** Object keys are built from the entry's id, so
there is nowhere to put a file before the create call comes back. The editor holds it in the
browser and shows it from an object URL; the upload follows the create. Nothing is written to
the bucket before there is an entry for it to belong to, so an abandoned form leaves nothing
behind - and no temporary path is invented that nobody would come back to clean up.

## Consequences

- **A backup carries the originals, so it stays lossless.** ADR 0014 moved to version 3: the
  download is a ZIP holding `backup.json` plus `media/entities/{entityId}/original.{ext}`, and it
  does not depend on this bucket - or any bucket - still being there. Only the original travels;
  the thumbnail is regenerated, because it is derived from the original by a fixed recipe and a
  second copy would be one more thing to keep in step. An object the store cannot produce fails
  the export loudly rather than thinning it. No object key, bucket, endpoint or URL is in the
  file: they describe this installation, not the picture.
- **Superseded objects are still deleted, and revision restore still does not restore an image.**
  Nothing historical is retained - a replacement or a removal cleans the previous original and
  thumbnail exactly as described above, and that was chosen over keeping every version's picture
  forever, which would grow storage without bound and needs a cleanup story tied to a history
  pruning design that does not exist. What follows is that an old version cannot put back bytes
  that are gone, so it does not pretend to: restoring leaves the entry's current picture alone.
  The change itself *is* recorded - setting, replacing and removing an image each write a version
  flagged `Image` (ADR 0013) - so history is truthful about what an author did, and the history
  screen states the limit rather than leaving it to be discovered.
- **The image is not lore the Canon rules read.** No rule looks at it, so setting one is not
  gated by the promotion gate (ADR 0012) and is not a revision-worthy write. The entry's
  `UpdatedAt` is left alone for the same reason the Trash marker leaves it alone: it says when
  the lore was last authored, and the image carries its own `UploadedAt`.
- **Two stores can disagree, and one direction is handled.** A row naming an object the bucket no
  longer holds answers 404 - not a 500, and without saying which store was missing it. The
  reverse, an object nothing names, is an orphan and is invisible to the product.
- **Nothing about Cloudflare reaches a response.** Not the provider, not the endpoint, not a
  credential, and not an object key: a key is an internal address and belongs in the database and
  the log. Contracts carry the asset id and the picture's shape, and the client composes the
  route from them.
- **No Cloudflare resource is created by this repository.** Bucket, token and App Service settings
  are owner steps: `docs/deployment/cloudflare-r2.md`.
- **Permanent deletion is still deferred** (ADR 0015), so no route hard-deletes an entry and
  nothing needs to clean up a hard-deleted entry's objects. When one arrives it will have to,
  and the cascade on `EntityImages` covers the row but not the bucket.

## Amendment: owner-framed thumbnails and R2 uploads (2026-09-11)

Live testing on Azure DEV found two things the original decision got wrong.

### The author chooses the thumbnail's square

A centred square is the right answer for almost no portrait. The original stays exactly as
uploaded and is what the entry's page shows, whole; the thumbnail is a square of it that the
author picks in a cropper (`react-easy-crop`, MIT, one small dependency - drag, pinch or wheel
zoom, and a focusable square that moves with the arrow keys).

**The browser chooses, the server cuts.** The client sends four fractions - `x`, `y`, `width`,
`height` of the original - worked out from whole pixels of the picture's own size, never a
position on the screen and never a rendered thumbnail. The server decodes the original, puts each
edge on the nearest pixel, and cuts and scales the square itself. A crop off the picture, empty,
unreadable or more than a pixel (or 1%) from square is refused with a validation problem, never
stretched. No crop at all still means the centred square.

**Fractions of the picture as displayed.** Orientation is decided by what browsers draw, because
that is the picture the author frames: EXIF orientation is applied for JPEG and PNG, and ignored
for WebP. That split was checked against Chromium rather than assumed - it rotates a tagged JPEG
and PNG and draws a tagged WebP as stored, while ImageSharp would rotate all three. Stored `Width`
and `Height` are the displayed dimensions for the same reason.

**The crop is persisted.** `CropX`, `CropY`, `CropWidth`, `CropHeight` - fractions, all set or all
null. It is the one part of the thumbnail that cannot be derived: with it the cropper reopens where
the author left it, a backup preserves the choice, and a thumbnail can be regenerated from the
original alone. Null only for a picture stored before this amendment, whose thumbnail is the
centred square. A backup carries it as `image.crop` (ADR 0014); the thumbnail's bytes still never
travel.

**Replacing is one request.** Pick a file, frame it, confirm: the file and its crop go up together,
so nothing is uploaded until the framing is confirmed, and Cancel costs nothing. The replacement
ordering above is unchanged.

**Reframing never touches the original.** `PUT .../image/thumbnail` carries the asset id the
author framed and the crop. The server reads the original back from the store - it is not
uploaded again - and:

1. Mints a new thumbnail id and writes the new thumbnail under it.
2. Moves the row in one conditional statement that only matches if the asset *and* the thumbnail
   are still the ones that were read, recording an `Image` version in the same transaction.
3. Only after that commit deletes the old thumbnail.

The original's key, bytes and object are never written, moved or deleted. A failure before the
commit leaves the working thumbnail live and sweeps the new one; a replacement or another framing
that landed first wins, and this one answers 409 `image_changed` rather than putting a square of
one picture on another. A missing original answers 409 `image_original_unavailable`. The thumbnail
id is in the thumbnail's route, so a reframed thumbnail is a new URL and the immutable cache
header stays honest. Nothing historical is kept: the superseded thumbnail is deleted, and a
revision restore still leaves the current picture - framing included - alone.

### R2 needs two per-request flags on every upload

The first live upload failed with `STREAMING-AWS4-HMAC-SHA256-PAYLOAD not implemented`. AWSSDK.S3
streams a PutObject body as a signed `aws-chunked` payload (or trails a checksum after it); S3
accepts that and R2 does not. The client-level `RequestChecksumCalculation = WHEN_REQUIRED` does
not prevent it. Cloudflare's .NET guide sets both of these on every PutObject, and so does
`R2MediaObjectStore`:

- `DisablePayloadSigning = true` - the request is still SigV4-signed, the body is declared
  `UNSIGNED-PAYLOAD`. The SDK only allows this over HTTPS, which the R2 endpoint always is, so
  body integrity rests on TLS.
- `DisableDefaultChecksumValidation = true` - no trailing checksum turning the body back into a
  chunked stream.

The SDK was kept: nothing else about it was wrong. The requirement is pinned by adapter tests that
assert both flags on the request and, through a real SDK client configured exactly as a deployment
is, that the wire carries `UNSIGNED-PAYLOAD` and no streaming or chunked marker - a test that fails
with the live error's own header value if either flag is removed.

**Storage failures are a 503 in Lorex's words.** Every SDK, network or timeout failure leaves the
adapter as `MediaStorageFailedException`, and every image route and the export answer it with the
same 503 problem the unconfigured store already produced. The provider's message is logged, never
returned. A write that fails part-way sweeps what it may have written.

## Amendment: Fit full image, tried and withdrawn (2026-09-11)

For a day a thumbnail could also fit the whole picture inside the square, letterboxed on a transparent
margin, chosen with a `Crop` | `Fit full image` switch and recorded as `EntityImage.Framing`. On cards
it only produced empty space around a small picture, so it was withdrawn and the decision above - crop,
not fit - stands without an alternative. A thumbnail is one square crop, chosen in the cropper, always
covered by the picture: zoom stops where the picture just covers the square, and the square cannot be
moved off it. The original is untouched, and "Edit thumbnail" recrops from it exactly as described in
the previous amendment.

**Nothing was kept for it.** Migration `RemoveEntityImageFramingMode` drops the column, and the mode
is gone from the contracts, the processing and the client; no code path can make a fitted thumbnail.
Every row stays valid: a cropped picture keeps its square, and one that was fitted has no crop, which
means the centred square - what "Edit thumbnail" opens on and what a backup regenerates. The one thing
a migration cannot reach is the bucket, so a thumbnail that was fitted keeps showing the whole picture
until its author crops it again.

**Old requests and old backups still read.** A client from that day that sends `framing` has the field
ignored and its crop applied; a reframing that asked for a fit had no crop, and is refused as any
reframing without a square is. A version 3 backup written that day may carry `image.framing`; readers
ignore the member (ADR 0014), so it needs no version bump.

## Amendment: the pair is written at once, and the body is not spooled (2026-09-12)

Status: accepted

Live DEV made the wait on an upload obvious, and measuring it said where it goes: the original's
bytes crossing the network twice - the browser to Lorex, then Lorex to R2 - plus one bounded piece
of CPU. Decoding a 4 MB phone photo, cutting the square and encoding it took 190-310 ms on a
development machine, a multiple of that on an F1's shared core, and neither the format gate nor the
server-side thumbnail is negotiable. So the only latency the code could actually give back was the
latency it was spending on order that does not exist.

**The two new objects are written concurrently.** They were written one after the other: two round
trips to a bucket on the other side of the internet for work with no dependency between them. Both
are fully prepared in memory before either is written, under an asset id nothing is using, and
neither can be read by anything until the association moves - so `MediaObjectWrites.PutAllAsync`
starts both and waits for both.

**The failure contract is unchanged, because it was already written for this.** The sequential
version's catch blocks say "the original may well have landed before the thumbnail did not", and
sweep every key they were writing; a delete of an object that was never written succeeds.
Concurrency only widens which of the two might be the one that landed, which no caller assumed.
`MediaStorageUnavailableException` keeps its stronger meaning - nothing was attempted, nothing to
sweep - and is only reported when *every* write failed that way; one write failing for any other
reason is reported as a failure, so the caller sweeps. Both interleavings are pinned by tests, as
is the overlap itself: the test store holds each write open until the other has started, so a
return to sequential writes fails rather than passes quietly.

**The superseded pair is swept concurrently too**, after the commit, exactly as before.

**The request body is no longer spooled to a temporary file.** The form reader writes any section
over 64 KB to disk; both upload handlers then read the whole thing back into memory anyway, because
the bytes are needed three times - to identify, to decode and to store. Raising the threshold past
the upload limit takes that write-and-read-back off the path and holds no more memory than the
handler already held.

**What this does not do.** It does not make a slow uplink fast. On a photo of a few megabytes the
dominant term is the browser sending the original, and after that Lorex sending it on; overlapping
the thumbnail saves a round trip and the thumbnail's own transfer, which is the smaller half. The
honest answer to "why does saving a photo feel slow" is that it is moving a few megabytes twice
over a home connection to a shared-core App Service - so the wait is also *reported* now, rather
than hidden behind one word. Nothing here weakens the format gate, the server-cut thumbnail, the
preserved original, the private bucket or the ordering.

## Amendment: account storage (2026-10-06, ADR 0042)

`ByteSize` - the original as received, unchanged in meaning - is what an account's storage counts, for the universe's
owner; the thumbnail never counts. An upload that adds bytes holds them (`StorageReservations`) before the pair is written
and consumes the hold in the commit; a full owner's upload is refused with 409 `storage_quota_exceeded` before the bucket
is touched. The commit now re-reads the entry's picture and moves only if it is still the one the upload replaced (409
`image_changed` otherwise), and the superseded pair it sweeps is the one the row named at the commit. Reframe, read and
remove are untouched by the allowance.

## Amendment (2026-10-25, issue 56, ADR 0046)

An MCP client reads an entry's picture through its connection's gate: `get_lore_image` streams the object out of the same
store and hands the bytes over inline as an image block. If that client does not visibly render the block, the tool also
offers the canonical LoreX page as a fallback. That URL is an app route, not a media URL; it still requires sign-in and
current universe access, and no presigned or public media URL is returned. The preview it is given by default is derived
on demand from the original by the upload gate's decoders, fitted within 1024 pixels, metadata stripped; the original
goes out only when asked for and only up to 4 MB. Nothing here changes what is stored.
