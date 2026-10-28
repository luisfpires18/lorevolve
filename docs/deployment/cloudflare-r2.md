# Cloudflare R2 - owner setup

Entry images live in one private R2 bucket. Nothing in this repository creates it: the bucket,
the API token and the App Service settings are owner steps, exactly like the Azure resources in
[azure-dev.md](azure-dev.md).

Until the steps below are done, LorEvolve still runs. Every image route answers
`503 Image storage is unavailable.` and no entry can be given a picture. Nothing else is
affected.

**Database backups use a different bucket and a different token** (issue #54, ADR 0064): never point
`DatabaseBackup__R2__*` at this bucket or reuse this token, so a backup key can read no live picture and the media key no
backup. Setup: [../recovery/database-backups.md](../recovery/database-backups.md).

**No secret belongs in this repository.** Not in `appsettings*.json`, not in a workflow file,
not in this document. Every value below is entered in the Cloudflare dashboard, in
`dotnet user-secrets`, or in App Service configuration.

## What is stored, and where

Two objects per image, under one prefix per asset. Two kinds of image live here - an entry's
picture and an account's profile photo - under two top-level prefixes that never overlap:

```
universes/{universeId}/entities/{entityId}/primary/{assetId}/original.{jpg|png|webp}
universes/{universeId}/entities/{entityId}/primary/{assetId}/thumbnail-{thumbnailId}.webp

users/{userId}/profile/{assetId}/original.{jpg|png|webp}
users/{userId}/profile/{assetId}/thumbnail-{thumbnailId}.webp
```

A profile photo is account data and is deliberately not under `universes/`, so no per-world rule
or bulk operation can sweep it up with authored lore. It is otherwise the same in every respect:
the same accepted formats and limits, the same server-cut square, the same write ordering, and the
same private-bucket, served-only-by-LorEvolve rule. [ADR 0021](../architecture/decisions/0021-profile-photo.md).

Ids only - no username, no email, no world name, no entry name. R2 has no folders; the slashes
are a key prefix the console happens to draw as a tree. `{assetId}` is new for every upload and
`{thumbnailId}` for every thumbnail, so nothing is ever written over an object that is still live.
A picture stored before thumbnails had their own id keeps `thumbnail.webp`.

The original is the author's file, untouched, and is what the entry's page shows. The thumbnail
is the square the author chose in the cropper, cut from the original by the API. Choosing a new
square ("Edit thumbnail") writes a new `thumbnail-{thumbnailId}.webp` and then deletes the old one;
it never uploads, rewrites or deletes the original.

Why the bucket is private and stays private: [ADR 0019](../architecture/decisions/0019-entity-primary-image.md).

## 1. Create the bucket

Cloudflare dashboard -> **R2** -> **Create bucket**.

- **Name**: `lorevolve-media-dev` (any name works; it goes in `Media__R2__Bucket`).
- **Location**: automatic, or the hint nearest the App Service region.
- **Public access**: leave **disabled**. Do not connect a custom domain and do not enable the
  `r2.dev` development URL. LorEvolve serves every image through its own authenticated route, so a
  public URL would only be a way around the ownership check.
- **CORS**: none. The browser never talks to R2 - the API does.

Note the **Account ID** shown on the R2 overview page. The S3 endpoint is
`https://{AccountId}.r2.cloudflarestorage.com`.

## 2. Create an API token

R2 -> **Manage R2 API Tokens** -> **Create API token**.

- **Permissions**: **Object Read & Write**.
- **Specify bucket**: the one bucket created above. Not "all buckets".
- **TTL**: whatever the owner is willing to rotate on.

Cloudflare shows an **Access Key ID** and a **Secret Access Key** once. They are the two
secrets. Store them in a password manager; they are never committed.

## 3. Configure the application

Four settings, plus the provider switch.

| Key | Value | Secret |
| --- | --- | --- |
| `Media:Provider` | `R2` | no |
| `Media:R2:AccountId` | Cloudflare account id | no |
| `Media:R2:Bucket` | bucket name | no |
| `Media:R2:AccessKeyId` | from step 2 | **yes** |
| `Media:R2:SecretAccessKey` | from step 2 | **yes** |

`Media:R2:ServiceUrl` is optional and overrides the endpoint built from `AccountId`. It exists
for a jurisdiction-specific endpoint and is normally left unset.

If `Media:Provider` is `R2` but any of bucket, access key or secret is missing, the host starts
and every image route answers 503. That is deliberate: a deployment that lost its credentials
must not quietly fall back to storing images somewhere they will disappear.

### Azure App Service

Configuration -> **Environment variables** -> Application settings. Double underscores, because
that is how App Service maps a name onto a configuration path:

```
Media__Provider          = R2
Media__R2__AccountId     = <account id>
Media__R2__Bucket        = lorevolve-media-dev
Media__R2__AccessKeyId   = <access key id>
Media__R2__SecretAccessKey = <secret access key>
```

`appsettings.AzureDev.json` already sets `Media:Provider` to `R2`, so in practice only the four
below it have to be added. Mark the two credentials as slot-independent only if slots are ever
introduced; today there is one slot.

The setting is **not** in `infra/main.bicep`, and deliberately: putting a secret in a Bicep
parameter puts it in a deployment history that is readable to anyone with access to the
resource group.

### Local development

`appsettings.Development.json` sets `Media:Provider` to `InMemory`, so uploads work out of the
box with no account, no bucket and no credential. Images are held by the running process and
are lost when it restarts. That is the right default for writing code and for the Playwright
suite, and it is not a bug.

To exercise the real thing locally, use user secrets - never the committed settings file:

```bash
dotnet user-secrets --project src/LorEvolve.Api set "Media:Provider" "R2"
```

```bash
dotnet user-secrets --project src/LorEvolve.Api set "Media:R2:AccountId" "<account id>"
```

```bash
dotnet user-secrets --project src/LorEvolve.Api set "Media:R2:Bucket" "lorevolve-media-dev"
```

```bash
dotnet user-secrets --project src/LorEvolve.Api set "Media:R2:AccessKeyId" "<access key id>"
```

```bash
dotnet user-secrets --project src/LorEvolve.Api set "Media:R2:SecretAccessKey" "<secret access key>"
```

Undo it with `dotnet user-secrets --project src/LorEvolve.Api clear`.

### Tests

Automated tests never reach Cloudflare and cannot be made to. The API test host registers its
own in-process store, and the Playwright suite runs against the Development configuration above.
No credential is needed to run either.

## 4. Check it

With the settings in place, sign in, open any entry, and add an image. Then:

- The R2 bucket shows two objects under
  `universes/.../entities/.../primary/.../`.
- Editing the thumbnail swaps the `thumbnail-*.webp` object for a new one and leaves
  `original.*` exactly as it was.
- Replacing the image adds a new `{assetId}` prefix and removes the previous one.
- Removing the image empties the entry's prefix.

Then add a photo on `/app/profile`. The same four checks hold under `users/.../profile/.../`,
where "Edit photo" is the reframe and "Remove photo" empties the prefix.

If an upload answers `503 Image storage is unavailable.` with the provider configured, the API log
has an `Image storage failed during upload` error carrying R2's own message. The provider's
wording never reaches the browser.

### R2 and AWSSDK.S3: two upload flags that must stay

R2 does not implement S3's streaming payload signatures. Without two per-request flags, AWSSDK.S3
sends a PutObject body as `aws-chunked` and R2 refuses every upload with
`STREAMING-AWS4-HMAC-SHA256-PAYLOAD not implemented` - the error the first live DEV upload hit.
`R2MediaObjectStore.PutAsync` sets, as Cloudflare's .NET guide does:

- `DisablePayloadSigning = true` (still SigV4-signed; body sent as `UNSIGNED-PAYLOAD`, HTTPS only)
- `DisableDefaultChecksumValidation = true` (no trailing checksum)

The client-level `RequestChecksumCalculation = WHEN_REQUIRED` in `MediaSetup` is not a substitute.
`R2MediaObjectStoreTests` fails if either flag disappears, including after an SDK upgrade. Nothing
about credentials, the bucket or App Service settings changes for this.

## Costs and limits

R2 charges for stored bytes and for operations, and **not** for egress. LorEvolve's read path is
server-mediated, so every image view is one `GetObject`; at one picture per entry, on a
single-owner product, the class-B operation count is not a figure worth budgeting for.

Uploads are capped at 8 MB and 24 megapixels by the API, so an entry's two objects are bounded.

## Limitations, stated plainly

- **Orphans are swept best-effort, not guaranteed.** If deleting a superseded object fails after
  the database has committed, the new image stays the entry's image and the old pair is left in
  the bucket with a warning logged against its key. Nothing retries it. At this scale the cost of
  an orphan is a few hundred kilobytes; the cost of a retry queue is a subsystem.
- **There is no lifecycle rule on the bucket.** Do not add one that expires objects: the database
  is the only record of which objects are live, and an expiry would silently break entries.
- **Replacing or removing a picture deletes the one it superseded.** Nothing historical is kept,
  so the bucket holds at most two objects per entry - the live original and its thumbnail.

## What this bucket is not

**It is not where a backup lives.** `GET /api/universes/{id}/export` hands the owner a ZIP
holding `backup.json` and every entry's original image beside it, so a backup keeps working if
this bucket is emptied, misconfigured or deleted. Thumbnails are not in it: they are derived, and
`backup.json` carries each picture's chosen square (`image.crop`) so an importer regenerates the
same thumbnail from the original. Nothing in the file names the bucket, the endpoint, an object key
or a URL. ADR 0014.

If an object a backup needs cannot be read, the export fails with `backup_media_missing` and
names the entry. It does not hand over a smaller archive.

**A backup holds no profile photo.** The archive is one world's authored data, and an account's
photo is neither authored nor part of a world - nothing under `users/` is exported, and no account
id or asset id appears in `backup.json`. Losing this bucket loses every avatar with no way to
restore one; its owner still has the file they uploaded. ADR 0021.

**It is not a history of anything.** A revision records that an entry's picture changed, never
which picture it was, because the superseded objects are gone. Restoring an old version leaves
the entry's current image untouched, and the history screen says so. ADR 0013, ADR 0019.
