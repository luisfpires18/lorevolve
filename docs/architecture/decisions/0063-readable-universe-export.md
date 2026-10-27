# ADR 0063 - A readable export is Markdown pages rendered from the backup snapshot, for reading, never read back

Status: accepted (2026-10-26). GitHub issue #11 (Data Portability and Trust, pre-alpha 053).

## Context

Issue #11's promise is "you can always retrieve your world". LorEvolve already had the native backup (ADR 0014): one versioned
ZIP per universe, `backup.json` plus every picture's original, restored as a new universe (ADR 0032). It is complete -
`BackupInventoryTests` classifies every table as carried, derived or left out - but it is JSON with ids, written for a
parser. A creator who wants to read their world outside LorEvolve, or keep it somewhere LorEvolve cannot reach, had nothing.

The issue asks for at least one human-readable whole-universe export, kept separate from the native backup and from
third-party import (#17), with predictable media paths, the same permission boundaries, and no promise that is not tested.

## Decision

**Markdown in a ZIP.** `GET /api/universes/{id}/export/readable` answers `lorevolve-{slug}-{yyyyMMdd}-readable.zip`. Markdown
because it is plain text any editor opens, renders on every code host and note tool, diffs, and survives LorEvolve; HTML was the
other candidate and would have needed a stylesheet and a sanitiser for the same content. A ZIP because the pictures travel
with the pages.

**Rendered from the backup's snapshot, not from the database.** `ReadableExport` takes the `UniverseBackupSnapshot` that
`UniverseBackupBuilder` already reads in one transaction and renders its payload. It can therefore never show something a
backup of the same moment does not hold, it reuses the backup's completeness tests, and it adds no second reading of the
schema to keep in step. It shares `UniverseBackupArchiveWriter.WriteMediaAsync`, so a picture sits at the same path and a
picture the store cannot produce refuses the export (500 `backup_media_missing`, nothing downloaded) exactly as a backup is
refused.

**Layout, version 1.**

| Path | Holds |
| --- | --- |
| `README.md` | The universe: description, artwork, public details, attribution; contents with counts; what is not included |
| `lore/README.md` | Every type as the tree it is, each live entry listed and linked; semantic groups |
| `lore/{type}/{entry}.md` | One live entry: type, status, aliases, tags, picture, summary, field values by section, article, relationships, timeline moments, scenes, eras, forms, abilities, appearances with pictures, knowledge, map pins, the owner's private note |
| `relationships.md` | Every live relationship as a table, and the relationship kinds |
| `timeline.md` | Date periods, the calendar, every live moment in order with who, stories and details |
| `stories/{story}/README.md` | A live story: status, premise, chapters with their scenes, plot arcs and beats |
| `stories/{story}/{NNN}-{scene}.md` | A live scene, numbered in reading order: point of view, when, lore, summary, notes, manuscript |
| `maps/{map}.md` | A map: its picture, scale and every pin |
| `world-rules.md`, `ideas.md` | Live world rules with their checks; the universe's live ideas with what they are about |
| `media/...` | Originals, byte for byte, at the backup's own paths (`BackupArchive`) - only pictures a page shows |

File names are names reduced to lowercase letters, digits and single hyphens (at most 60 characters, never a name Windows
reserves); when two in one folder would match, every one of them takes its id's first eight hex digits, so the result does
not depend on order. Pages link one another by relative path, so the folder works offline.

**Faithful, not a second editor.** An article's Tiptap document becomes Markdown (paragraphs, headings two levels below the
page's, lists, quotes, code, rules, breaks, bold, italic, strike, code, links). A manuscript is written as stored, with each
mention a link to its entry. Field values read as the app shows them (a year with its era label, a choice by its name, a link
to the entry).

**Safe to open.** Every piece of an author's text is escaped (`\`, `` ` ``, `*`, `_`, `[`, `]`, `<`, `>`, `#`, `|` in
headings, lists, tables and links, date-period and month labels included; `\`, `[`, `]`, `<` and `>` in manuscript prose),
so a collaborator's text cannot become a link, an image, a table or HTML in a viewer that renders it. An article link survives only for `http`, `https` and `mailto` - the editor's own rule (`LoreContent`),
applied again because a row may predate it.

**The same gate as a backup.** `UniverseCapability.Backup`: the owner alone, 404 to anyone without access. It holds the
owner's private notes (ADR 0056) for the same reason the backup does - it is the owner's copy of their own world.

## What it is not

- **Not restorable.** Nothing reads it back; the README says so and points at the backup. Keeping it one-way is what lets
  the format change for readers without a compatibility promise.
- **Not the whole backup.** Live content only: the Trash, saved versions (entries, articles, manuscripts, progressions),
  dismissed Canon findings and the backup's ids stay in the backup. The README counts what was left in the Trash.
- **Not an account export.** Like a backup, one universe; ideas with no universe, accounts, collaborators, comments,
  suggestions, AI proposals and publication state are absent.
- **Not an import format** (#17 stays separate and post-alpha).

## Consequences

- Two downloads in Settings > Data: Download backup (restorable) and Download readable export (for reading).
- A layout change is a new `ReadableExport.LayoutVersion`; the README states the one it was written with.
- Built whole in memory, like a backup; bounded by the same upload limits.
- File names lose characters outside letters and digits; a world named only in symbols gets `entry`, `story`, `map`.
- Markdown viewers join lines not separated by a blank line and may read indentation as code; the raw text keeps the
  author's line breaks.

Tests: `UniverseRecoveryTests` (a full restore drill with every kind of picture; the readable book's pages, links and
pictures; unsafe links and markup neutralised; a missing live picture refuses it, a missing trashed one does not),
`UniverseAccessMatrixTests` (owner only), `export.spec.ts` (the download in a browser).
