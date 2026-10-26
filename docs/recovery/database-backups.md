# Database backups to Cloudflare R2 (issue #54)

Operator runbook for the service-wide SQLite backups. Decision and rationale: ADR 0064. The creator-side per-universe
backup and readable export are [universe-recovery.md](universe-recovery.md) (#11).

## What is protected, and what is not

| | In a database backup | Where it is recovered from |
| --- | --- | --- |
| Accounts, universes and all their content, history, collaborators, comments, AI proposals, OAuth connections, Admin records | Yes - the whole SQLite file | The backup |
| Picture **object keys** (entries, appearances, maps, artwork, profile photos, quarantined AI pictures) | Yes | The backup |
| Picture **bytes** | **No** - they live in the media R2 bucket (`Media:R2:Bucket`) | The media bucket as it is; otherwise per-universe backups (#11) |
| Data Protection key ring (`/home/data/keys`) | **No** | Not backed up: losing it signs everyone out and voids pending invitation links and MCP tokens; data is unaffected |
| Configuration and secrets | No | App Service settings |

## Facts this is built on

| Fact | Source | Status |
| --- | --- | --- |
| Live file `/home/data/lorex.db` on the Azure Files share mounted at `/home` | `appsettings.AzureDev.json`, ADR 0018 | From the repository |
| WAL journal mode | EF Core creates SQLite databases in WAL; every app-created database here reports `wal` | **Owner check**: the first DEV manifest's `provenance.sourceJournalMode` |
| One writer process (one worker, no autoscale); hosted services write from inside it | ADR 0018, `Program.cs` | From the repository |
| Safe execution point: inside that process, through SQLite's online backup API | ADR 0064 | Tested; measured locally below |

## Turning it on (owner)

1. **Bucket.** In Cloudflare R2 create a bucket per environment, for example `lorex-db-backups-dev`. Leave it private: no
   custom domain, no public `r2.dev` access. Location hint: the region nearest the App Service.
2. **Bucket lock (recommended).** Add an R2 bucket lock rule on prefix `lorex-db/` with a retention of 7 days, so a leaked
   or misused token cannot delete or overwrite the last week's backups. Keep it shorter than the 30-day window pruning
   uses.
3. **Token.** R2 > Manage API tokens > Create: permission **Object Read & Write**, **applied to that one bucket only**, no
   expiry or a rotation date you will keep. It is a different token from the media one. Note the Access Key ID and Secret.
4. **App Service settings** (never in a file, never in the repository):

   | Setting | Value |
   | --- | --- |
   | `DatabaseBackup__Enabled` | `true` |
   | `DatabaseBackup__Environment` | `dev` (letters, digits, hyphens; becomes part of every key) |
   | `DatabaseBackup__R2__AccountId` | the Cloudflare account id |
   | `DatabaseBackup__R2__Bucket` | `lorex-db-backups-dev` |
   | `DatabaseBackup__R2__AccessKeyId` | from step 3 |
   | `DatabaseBackup__R2__SecretAccessKey` | from step 3 |

   Optional: `DatabaseBackup__Interval` (default `1.00:00:00`), `DatabaseBackup__StaleAfter` (`1.02:00:00`),
   `DatabaseBackup__Automatic` (`false` = manual only), `DatabaseBackup__Retention__PruneEnabled` (see Retention).
   Saving restarts the site.
5. **Prove it.** LoreX Admin > Main > Database backups > **Run backup now**. Within seconds: "Last verified backup" shows
   a time, "Last attempt" says Succeeded. In R2 two objects appear under `lorex-db/dev/yyyy/MM/`. Open the
   `.manifest.json`: `integrityCheck` is `ok`, `sourceJournalMode` is `wal`, `schemaVersion` is the deployed migration.
6. **Prove it restores** - the drill below, from your machine, against that bucket.

A misconfigured setting never falls back to anything: Admin shows the problem in red and the log says
`Database backups are enabled but cannot run: ...`.

## Watching it

- **Admin > Main > Database backups**: last verified backup and its age (marked stale after 26 h), last attempt and its
  error with the count in a row, number kept and bytes stored, whether pruning is on. Admin only; there is no public route.
- **Logs** (App Service log stream or Log Analytics), one line each:
  `Database backup verified: <key> (...)`, `Database backup FAILED (<trigger>, N in a row): <reason>`,
  `Database backup is STALE: the last verified backup is N hours old`, `Database backups are enabled but cannot run`.
  An alert on `FAILED` or `STALE` is the owner's to configure; LoreX sends no mail.

## Retention and cost (proposal - pruning is off until the owner turns it on)

Policy: every backup younger than **30 days**, the **first backup of each month for 12 months**, and always the **newest
3**. Pruning runs only right after a backup has been uploaded and read back, never after a failure, and only within this
environment's prefix; it deletes a manifest before its object. Objects left without a manifest by an interrupted run are
deleted at once, or swept after a day.

Sizes measured: a 63.6 MB database compresses to 19.5 MB (3.3x). Policy = about 42 objects.

| Database | Per backup (gzip) | Kept (~42) | R2 storage cost |
| --- | --- | --- | --- |
| 64 MB | ~20 MB | ~0.8 GB | $0 (inside the 10 GB free tier) |
| 500 MB | ~150 MB | ~6.3 GB | $0 |
| 2 GB | ~600 MB | ~25 GB | ~$0.23/month ($0.015/GB-month above 10 GB) |

Operations: about 3,000 Class A (list every 15 minutes, two PUTs a day) and 60 Class B a month - inside the free tier.
Egress from R2 is free. **Without pruning** a 20 MB backup a day adds ~0.6 GB a month: still free for over a year, which is
why it is safe to leave off until the policy is accepted. To enable: `DatabaseBackup__Retention__PruneEnabled=true`
(and `__KeepDays`, `__KeepMonths`, `__KeepNewest` to change the numbers).

## Failure modes

| What happens | What LoreX does |
| --- | --- |
| Two runs at once (button pressed during a scheduled run) | The second is refused (409 `database_backup_running`) |
| Two processes for a moment during a deploy | Each writes its own key; nothing is overwritten |
| Upload interrupted, or the object reads back different | No manifest is written, the object is deleted (or swept), status says Failed with the reason |
| Token revoked or wrong | `Backup storage refused the request (403 AccessDenied)`, Failed, retried after an hour, stale after 26 h |
| Local disk full | `The snapshot could not be written to local disk`, temp files removed |
| Database corrupt | `The snapshot failed its integrity check: ...` - no backup is uploaded from a corrupt file |
| R2 unreachable | `Backup storage could not be reached.` |
| Backups deleted in R2 | Status shows fewer kept and, once the newest is gone, stale; a bucket lock prevents this within its window |

## Restore drill (isolated - never on the live site)

On a machine with the repository (or the published app) and the backup bucket's settings in environment variables or user
secrets - the same `DatabaseBackup__*` names, plus `Media__*` for the media check:

```bash
dotnet run --project src/Lorex.Api --no-launch-profile -- database-backup list
```

```bash
dotnet run --project src/Lorex.Api --no-launch-profile -- database-backup restore-drill --latest --target ./drill-restore --check-media
```

It downloads the newest verified backup (or `--key <manifest key>`), checks the object's SHA-256, decompresses and checks the
database's SHA-256, runs `integrity_check` and `foreign_key_check`, refuses a backup with migrations this build does not
know, applies this build's pending migrations to the copy, reads every universe whole, and with `--check-media` confirms
every picture original the database names is in the media bucket. Each step is timed; `drill-report.json` is written
beside the restored `lorex.db`. A failing check stops with `FAILED: <reason>` and exit code 1.

Then start the app on the restored copy, on another port, with its own key ring:

```bash
ConnectionStrings__LorexDb="Data Source=./drill-restore/lorex.db" DataProtection__KeyRingPath=./drill-keys dotnet run --project src/Lorex.Api --no-launch-profile --urls http://localhost:5297
```

and check `/health`, `/api/public/stats` (counts match the source), register, sign in, create and list a universe.

### Drill measured on 2026-10-26 (local machine, filesystem store)

Source: a consistent copy of a long-lived development database in WAL mode - 63.6 MB, 71 migrations (one behind this
build), 7,099 accounts, 7,183 universes, 8,631 entries.

| Step | Result | Time |
| --- | --- | --- |
| `database-backup run` (snapshot, integrity, gzip, upload, read-back, manifest) | 19.5 MB object, `sourceJournalMode: wal` | 2.0 s (6.6 s with process start) |
| Same, while another process committed 13,836 rows | Succeeded; snapshot consistent, 4,643 rows of that moment | 2.1 s |
| Drill: manifest, download + object checksum | match | 0.05 s |
| Decompress + database checksum + integrity + foreign keys | ok | 0.96 s |
| Migrations | applied 1, up to `20261026120312_DropInvitationTargetUser` | 1.28 s |
| Every universe read whole | 7,183 universes | 55.3 s |
| App started on the restored file | `/health` 200; stats 7,099 creators / 7,183 universes; register, sign in, create and list a universe; public Explore | 2.2 s to healthy |

Not measured: R2 upload and download times, the snapshot over Azure Files, and anything on DEV. `--check-media` is
covered by tests against the in-memory media store, not run against real R2.

## Restoring production (procedure - not executed)

1. Run the drill on the chosen backup first. Do not restore a backup that has not passed it.
2. `az webapp stop --name <app> --resource-group <rg>` - nothing may write while the file is replaced.
3. `az webapp ssh`: move `/home/data/lorex.db` aside (`lorex.db.before-restore-<date>`), along with any `lorex.db-wal`
   and `lorex.db-shm` (they belong to the old file and must not be applied to the new one).
4. Put the drill's restored `lorex.db` (already migrated to the running build) at `/home/data/lorex.db` - Kudu's file
   manager, or any way of writing the file while the site is stopped.
5. `az webapp start`; `/health`; Admin > Main; sign in; open a universe with pictures.
6. Everything written after the backup's `createdAt` is gone. Tell affected users.

RPO: the backup interval, 24 h (up to 25 h after a failed attempt). RTO on DEV: not measured - expected minutes (download
~20 MB, drill ~1 min for this size, stop, upload, start); measure it on the first real drill and record it here.

## Media, exactly

- A database backup restores **references** to pictures, not pictures.
- Restoring yesterday's database: pictures uploaded since are orphaned in the media bucket (wasted space, harmless);
  pictures deleted since (permanent delete from the Trash, a replaced picture) are **gone** from the bucket, and the rows that name
  them show a missing picture. `restore-drill --check-media` lists how many and which before you restore.
- If the media bucket itself is lost, only creators' per-universe backups (#11) hold originals. Nothing copies the media
  bucket automatically; an R2-to-R2 media mirror is a follow-up, not part of #54.
- Thumbnails and display copies are derived; LoreX does not re-cut them for a database restore.

## Security

- The backup bucket and token are separate from media; the token is limited to one bucket. Rotate: create a new token,
  update the two settings (restart), run a backup, revoke the old token.
- A backup holds everything in the database (password hashes, private universes, private notes, OAuth token rows).
  Whoever can read the bucket can read all of it: keep the bucket private, the token in App Service settings only, and R2
  access limited to the owner.
- Only an Admin can see backup status or start one; no route returns backup bytes, a key's contents or a signed URL.
- Restore privilege is infrastructure access (Azure + R2), not anything inside LoreX.
