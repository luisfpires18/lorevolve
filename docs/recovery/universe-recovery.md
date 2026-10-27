# Universe recovery: backup, restore and readable export (issue #11)

How a creator gets their world out of LorEvolve and back in, what each file holds, and where the limits are. The
operator-side database snapshots are a separate layer: [database-backups.md](database-backups.md) (issue #54).

| | Backup | Readable export |
| --- | --- | --- |
| Settings > Data | **Download backup** | **Download readable export** |
| File | `lorevolve-{world}-{yyyyMMdd}.zip` | `lorevolve-{world}-{yyyyMMdd}-readable.zip` |
| Inside | `backup.json` (format 35) + every picture's original | Markdown pages + every live picture's original |
| Restorable into LorEvolve | **Yes**, as a new universe | No - for reading and keeping |
| Who may download | The universe's owner | The universe's owner |
| Decision | ADR 0014, ADR 0032 | ADR 0063 |

Both are taken by hand, per universe, by the owner. Neither is an account export, and neither depends on the LorEvolve
database or the picture bucket surviving once it is on the creator's disk.

## What a backup holds

Every table is classified as carried, derived again on restore, or left out on purpose, and
`BackupInventoryTests` fails when a new table is not.

**Carried:** the universe (name, description, colour, archived flag, public summary, category, genres, attribution,
artwork); types with their hierarchy, icons, colours, fields, choices, sections and archived fields; semantic groups;
entries with aliases, tags, field values, article, picture and crop, private note, full history, eras, forms, abilities and
appearances with their pictures; knowledge records; relationship kinds with Canon constraints and family meaning;
relationships with their periods; date periods and the calendar; timeline moments with participants, stories and details;
event kinds and methods; world rules and their checks; stories, chapters, scenes, point of view, scene dates and lore links,
manuscripts with every saved version, plot arcs and beats; the universe's ideas; maps with their pictures, pins and scale;
dismissed Canon findings. The Trash is carried, marked.

**Derived again on restore:** thumbnails, map display copies and artwork cards (cut from the originals and the stored
crop), search indexes, Canon findings (dismissals re-applied), the MCP address.

**Left out on purpose:** accounts and the owner's id, collaborators and invitations, comments, suggestions, AI proposals and
their quarantined pictures, connected apps, storage holds, Admin records, the profile photo, whether anything is public, and
ideas that belong to no universe.

## What the readable export holds

The same snapshot, live content only, as pages: `README.md` (the universe and the contents), `lore/README.md`,
`lore/{type}/{entry}.md`, `relationships.md`, `timeline.md`, `stories/{story}/README.md`,
`stories/{story}/{NNN}-{scene}.md`, `maps/{map}.md`, `world-rules.md`, `ideas.md`. It leaves out the Trash and saved
versions (the README counts what was in the Trash). Layout and escaping rules: ADR 0063.

## Pictures

Both files carry each picture **as the original you uploaded, byte for byte**, at paths built from ids, never names, so
they do not move when something is renamed:

```
media/entities/{entry id}/original.{jpg|png|webp}
media/entities/{entry id}/appearances/{picture id}/original.{ext}
media/maps/{map id}/original.{ext}
media/universe/artwork/original.{ext}
```

The readable export holds only the pictures its pages show, at the same paths. Thumbnails and display copies are never in
either file: a restore cuts them again. If LorEvolve cannot read a picture when you download, the download is refused and says
so - you never receive a file that quietly lacks one. A picture of an entry in the Trash only blocks the backup.

## Restoring a backup

1. Universes page > **Restore a backup** (or Settings > Data > Restore a backup), choose the `.zip`.
2. LorEvolve validates the whole file first and shows what it would create: counts per kind, the format version, and every
   problem it found (up to a limit). Nothing is written yet. The validated upload waits 30 minutes.
3. Name the new universe and confirm. The restore is **one transaction**: either the whole universe appears, or nothing
   does and the upload keeps waiting. Pictures stored before a failure are swept.
4. The result is a **new private universe owned by you**, with new ids everywhere, beside any existing one - never over it.
   Collaborators, comments and publication are not restored. Manuscript mentions point at the restored entries.

Any signed-in account may restore a backup file it holds; the restored universe is wholly that account's. Treat a backup
like the world itself: whoever has the file has its contents, including the private notes.

## Compatibility and limits

- Restores every format from version 1 to the current 35; a file from a newer LorEvolve is refused as unsupported rather than
  guessed at (`BackupVersionTests`, `BackupRoundTripTests`).
- Refused before anything is written: an upload over **512 MB**, more than **1 GB** uncompressed, a document over 128 MB,
  more than **5,000 pictures**, more than 1,000,000 records, unsafe paths (`..`, absolute, symlinks), duplicate ids,
  dangling references, unreadable or mislabelled pictures (`BackupArchiveSafetyTests`, `BackupValidationTests`).
- **A universe whose pictures approach the 1 GiB storage allowance can produce a backup larger than the 512 MB restore
  ceiling.** It downloads, and its originals are safe in the file, but LorEvolve will refuse to restore it. Not raised for
  alpha; recorded as a follow-up.
- The restorer needs storage allowance for the pictures; without room it is refused (409) and nothing is kept.
- A backup is built whole in memory before download, and a restore holds the one SQLite writer while it writes.
- No overwrite, merge, partial or account-wide restore (ADR 0032).

## What is tested

- `UniverseRecoveryTests.A_restore_drill_brings_back_every_kind_of_picture_byte_for_byte_and_the_same_world`: a rich world
  with an entry picture, an appearance picture, a map, artwork, a trashed entry's picture, a private note, a mention and a
  formatted article is exported, validated, restored and exported again; the two backups describe the same world fact by
  fact under disjoint ids, and every picture is read back through the restored universe's own routes byte for byte.
- The readable export's pages, links, pictures, escaping, and its refusal when a live picture is missing.
- `BackupRestoreTests`: late failure leaves no universe, row or picture; a picture that cannot be stored fails the restore
  and is swept; tokens are bound to the account that validated them.
- `export.spec.ts` and `restore.spec.ts`: the downloads and the restore in a browser.

## Not promised

- No guarantee beyond what is tested above. In particular nothing here defines what happens to a universe if a future paid
  plan lapses: billing does not exist, and #11 deliberately invents no policy.
- The per-universe files are not disaster recovery for the service; that is [database-backups.md](database-backups.md).
