# ADR 0064 - The web process takes a daily online SQLite snapshot and keeps it, verified, in a private R2 bucket

Status: accepted (2026-10-26). GitHub issue #54 (pre-alpha reliability). Runbook: `docs/recovery/database-backups.md`.

## Context

LorEvolve keeps everything but pictures in one SQLite file (ADR 0002), on DEV at `/home/data/lorex.db` on the App Service's
Azure Files share (ADR 0018). It survives restarts and redeploys, not deletion of the App Service, a corrupting write, a
bad migration or an operator mistake. The per-universe backup (ADR 0014, #11) is the creator's tool, taken by hand; nothing
protected the service as a whole.

What the repository establishes about the live database:

- **Journal mode.** EF Core creates a new SQLite database in WAL mode; every database the app created locally reports
  `wal`, and DEV's file was created by the app's first migration. The live value is not readable from the repository, so
  every manifest now records the journal mode the app finds (`provenance.sourceJournalMode`).
- **Writers.** One App Service worker, no autoscale (ADR 0018); inside it, request handlers and hosted services
  (search backfill, AI change media sweep, MCP maintenance, admin provisioning) all write through EF from that one process.
- **Storage.** `/home` is an SMB share. SQLite's locking across processes over SMB is not to be trusted, and WAL's shared
  memory needs one host.

## Decision

**The snapshot is taken inside the web process.** A hosted service (`DatabaseBackupService`) checks every 15 minutes, after
the schema is ready, and runs a backup when the newest verified one is older than `DatabaseBackup:Interval` (24 h). It
uses the app's own connection and **SQLite's online backup API** (`SqliteConnection.BackupDatabase`), which copies a
consistent moment page by page under SQLite's locking - never a file copy that could miss the WAL or catch a torn page. A
second process (a WebJob, a GitHub runner, Kudu) would be a second SQLite user over SMB, and GitHub Actions would need the
database exposed. R2 only stores objects; it is not the scheduler.

**A run, in order** (`DatabaseBackupRunner`):

1. Snapshot to local temp disk (not `/home`), switch the copy to a rollback journal so it stands alone,
   `PRAGMA integrity_check` must answer `ok`, read the schema version from the copy's own `__EFMigrationsHistory`.
2. Gzip; SHA-256 of the database and of the gzip.
3. Upload `{prefix}/{environment}/{yyyy}/{MM}/{yyyyMMddTHHmmssZ}-{8 hex}.db.gz`.
4. Read the object back and compare size and SHA-256.
5. Only then upload the manifest beside it (`.manifest.json`) and read it back. **A manifest is what "verified" means**;
   an object without one is an interrupted run's and is deleted at once or swept a day later.

The manifest holds format and version, environment, UTC creation and verification times, trigger, app version
(informational version with commit), host, App Service site, data source path, source journal mode, schema version and
migration count, the app's expected schema, the integrity verdict, both sizes and both SHA-256s. Never a credential, a
connection string's secret, or account data beyond what is in the database itself.

**One run at a time.** A semaphore in the process; a second request is refused (409 from Admin). During the seconds of a
deploy two processes may overlap: each would write its own, separately keyed backup, which is harmless.

**Failures are loud.** Each failure is an Error log line (`Database backup FAILED ... N in a row: <reason>`), the status
counts consecutive failures, and after a failure the schedule waits an hour before retrying. While the newest verified
backup is older than `StaleAfter` (26 h) every check logs `Database backup is STALE`. Reasons are one line with no key or
secret: a storage status and error code, "local disk full or not writable", "integrity check failed", "did not read back".

**Visible to the owner, nowhere else.** `GET /api/admin/database-backups` (Admin only, ADR 0059): enabled, store
description (bucket name or folder), last verified backup with its age, stale flag, last attempt and error, verified count
and stored bytes, retention state. `POST /api/admin/database-backups/run` starts one (202). Admin > Main shows it. No public
route serves a backup, a signed URL or an object key.

**Its own bucket and its own token.** `DatabaseBackup:R2:*` is separate from `Media:R2:*`: a backup token can read no
live picture, the media token no backup. The token is an R2 API token with Object Read & Write on that one bucket - R2
offers no write-without-delete permission, which is why retention is careful and why a bucket lock is recommended.
Credentials come from App Service settings only.

**Retention, proposed and off by default.** Keep every backup younger than 30 days, the first of each month for 12 months,
and always the newest 3; delete a backup manifest first, then its object. It runs only right after a backup was verified,
never after a failure, and only inside this environment's prefix. `DatabaseBackup:Retention:PruneEnabled` turns it on
once the owner accepts the policy and its cost (runbook).

**A restore drill is a command, not a hope.** `dotnet LorEvolve.Api.dll database-backup restore-drill --target <empty folder>
--latest [--check-media]` downloads, checks both SHA-256s, `integrity_check` and `foreign_key_check`, refuses a backup
holding migrations this build does not know, applies this build's pending migrations to the copy, reads every universe
whole through `UniverseBackupBuilder`, and with `--check-media` confirms every picture original is in the media bucket. It
never writes over the configured database. `run` and `list` exist for operators and local drills.

## What it is not

- **Not a media backup.** Pictures live in the media bucket (ADR 0019); the snapshot holds their keys. Restoring the
  database to an earlier day brings back rows whose pictures were deleted since only if the bucket still holds them -
  `--check-media` names any that are gone. The per-universe backup (#11) carries originals; nothing copies the media bucket.
- **Not point-in-time.** RPO is the interval (24 h) plus up to an hour when a run fails.
- **Not client-side encrypted.** R2 encrypts at rest; transport is HTTPS. A key LorEvolve held would have to be backed up too.

## Consequences

- One more hosted service and two Admin routes; no migration, no table: the store's manifests are the record.
- `DatabaseBackup:*` settings, all off by default; nothing runs until the owner configures a bucket and a token.
- The snapshot briefly holds a read transaction on the live database (seconds for tens of MB); writers continue in WAL.
- Tests: `DatabaseBackupTests` (snapshot, manifest-last, read-back failure, refused manifest, overlap, retention, Admin
  gate, R2 settings and secret hygiene, drill with media check, tampering, older schema brought forward, newer refused).
