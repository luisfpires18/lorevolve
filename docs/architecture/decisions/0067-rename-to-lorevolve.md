# ADR 0067 - The product is LorEvolve; what was stored as Lorex is still read

Status: accepted (2026-10-27). Outside steps: done 2026-10-29 (the `TODO_rename.md` checklist is deleted; see `STATE.md`).

## Context

The owner cannot use the name Lorex. The product is renamed LorEvolve everywhere: the name people see, the code, the
repository's paths, the tooling, and in time the hosted resources. Some of the old name is not text but stored state -
in browsers, in backups people keep, in the OAuth tables AI apps depend on - and renaming that blindly would sign apps
out, orphan unsaved writing, or make an old backup unreadable.

## Decision

**One casing map, applied everywhere:** `LoreX` and `Lorex` -> `LorEvolve` (the name, and PascalCase identifiers:
`LorEvolve.Api`, `LorEvolveDbContext`, `LorEvolveUser`), `lorex` -> `lorevolve`, `LOREX` -> `LOREVOLVE` (environment
variables). The wordmark is the word itself in the book face; the split "Lore X" treatment is gone. The icon and logo
are the owner's new art (`assets/brand/`).

**Write the new name, read the old one** wherever something written before the rename is read back:

| Stored before | Read now |
| --- | --- |
| Database snapshot manifests, format `lorex-sqlite-backup` | Restored and drilled like `lorevolve-sqlite-backup` |
| Universe backups, format `lorex.universe.backup` | Validated and imported like `lorevolve.universe.backup` |
| OAuth scopes `lorex.read`, `lorex.propose` - in tokens, refresh tokens and client registrations | Registered and honoured; never issued, never in discovery |
| Client registrations `lorex-dcr-...` | Served as before; unused ones swept by maintenance |
| Metadata-document clients marked `lorex_source` | Still shown as verified until fetched again |
| `localStorage` `lorex-theme`, `lorex-lore-page-size` | Read while the new key is unset |
| Service worker caches `lorex-static-*` | Deleted on activate, as an old build's would be |

**Kept, not renamed:** the IndexedDB database `lorex-recovery`. It holds unsaved writing, and a new name would leave it
behind with nothing to read it. Hosted resource names - the GitHub repository, the Azure app and resource group, the R2
buckets, the DEV database file - change only when the owner carries out `TODO_rename.md`; until
then the configuration and runbooks name them as they are.

## Consequences

- Everyone is signed out once: the session cookie (`lorevolve.session`) and the Data Protection application name are new.
  The same change voids invitation and sign-up links sent before the deploy; they are sent again.
- Connected AI apps keep working without reconnecting. New connections only ever see the new scope names.
- Database snapshots now go under the `lorevolve-db/` key prefix. Snapshots under `lorex-db/` stay where they are and
  restore by their manifest; retention no longer sees them (`DatabaseBackup__Prefix=lorex-db` keeps the old prefix if
  that matters).
- The fallbacks are small and permanent: each names this record, and removing one is a decision of its own.
