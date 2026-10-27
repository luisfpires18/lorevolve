# Architecture decisions

One ADR per durable decision. Rationale lives in the ADR, never here.

| # | Decision | File |
| --- | --- | --- |
| 0001 | Modular monolith, feature-oriented backend | [0001-modular-monolith.md](0001-modular-monolith.md) |
| 0002 | SQLite with EF Core migrations | [0002-sqlite-ef-core.md](0002-sqlite-ef-core.md) |
| 0003 | Identity foundation deferred to the auth phase | [0003-identity-foundation.md](0003-identity-foundation.md) |
| 0004 | PowerShell launcher instead of a custom executable | [0004-local-launcher.md](0004-local-launcher.md) |
| 0005 | Cookie sessions over token auth | [0005-cookie-authentication.md](0005-cookie-authentication.md) |
| 0006 | Universe ownership is enforced in every query (access rule superseded by 0041) | [0006-universe-ownership.md](0006-universe-ownership.md) |
| 0007 | One generic entity model, with relational custom fields (amended 020: starter types seeded once; #36: semantic type groups; #39: fields edited, archived and restored; #25: Quick Create from a link field or a relation; #61: a type target takes its nested types) | [0007-generic-entity-model.md](0007-generic-entity-model.md) |
| 0008 | A relationship is one row, read from either end | [0008-relationship-direction.md](0008-relationship-direction.md) |
| 0009 | Fictional chronology is stored as signed integer components | [0009-fictional-chronology.md](0009-fictional-chronology.md) |
| 0010 | Canon conflicts are derived findings keyed by a fingerprint | [0010-canon-conflict-lifecycle.md](0010-canon-conflict-lifecycle.md) |
| 0011 | A field declares what it means, in a closed enum, on Number only | [0011-semantic-field-codes.md](0011-semantic-field-codes.md) |
| 0012 | High conflicts block only the write that introduces them (amended for mass create: a batch is one all-or-nothing candidate) | [0012-canon-promotion-gate.md](0012-canon-promotion-gate.md) |
| 0013 | An entry's history is a full snapshot per accepted write (amended #39: a field or choice a version records is kept) | [0013-entity-revision-snapshots.md](0013-entity-revision-snapshots.md) |
| 0014 | A backup is one versioned archive holding a universe's authored data (amended #23: version 32, the owner's private notes; #15: version 33, knowledge records) | [0014-universe-backup-format.md](0014-universe-backup-format.md) |
| 0015 | An entry is trashed by a marker, and nothing that points at it is destroyed (amended 020: bulk move, all or nothing) | [0015-entity-trash-and-restore.md](0015-entity-trash-and-restore.md) |
| 0016 | Lore is searched by a SQLite FTS5 index the write path keeps in step | [0016-sqlite-full-text-search.md](0016-sqlite-full-text-search.md) |
| 0017 | Lorex installs as an app shell and caches build output only | [0017-pwa-shell-and-caching.md](0017-pwa-shell-and-caching.md) |
| 0018 | DEV is one App Service serving both halves, with state on the site's own share | [0018-azure-dev-single-app-service.md](0018-azure-dev-single-app-service.md) |
| 0019 | An entry has one image, held in a private bucket and served by Lorex | [0019-entity-primary-image.md](0019-entity-primary-image.md) |
| 0020 | An entity type's icon is a key from a closed, built-in set | [0020-entity-type-icon-keys.md](0020-entity-type-icon-keys.md) |
| 0021 | An account's photo is its own user-level media, on the entry image's proven path | [0021-profile-photo.md](0021-profile-photo.md) |
| 0022 | A universe keeps its own chronology: ordered eras, compared as structured points (amended 018: authors see "date periods", unbounded; 039: an optional custom calendar of months by id) | [0022-universe-chronology.md](0022-universe-chronology.md) |
| 0023 | A relationship type may carry explicit Canon constraints, checked on the stored direction | [0023-relationship-canon-constraints.md](0023-relationship-canon-constraints.md) |
| 0024 | A story is authored narrative that references lore, told in its own order | [0024-story-scene-foundation.md](0024-story-scene-foundation.md) |
| 0025 | A chapter is optional structure; a scene's order is its place inside its chapter | [0025-story-chapters.md](0025-story-chapters.md) |
| 0026 | Plot is planning: arcs of beats that point at scenes and lore and own neither (amended #48: plan, writing and timeline cross-links) | [0026-story-plot-arcs-beats.md](0026-story-plot-arcs-beats.md) |
| 0027 | A scene's manuscript is plain prose in a row of its own, read and written on its own route | [0027-scene-manuscript.md](0027-scene-manuscript.md) |
| 0028 | An entry's article lives in a row of its own, with its own history, saved on its own route | [0028-entity-article.md](0028-entity-article.md) |
| 0029 | Content recovery: saved versions, a Trash for story content, and recovery copies of unsaved writing | [0029-content-recovery.md](0029-content-recovery.md) |
| 0030 | Ideas are account-owned possibilities, optionally about one universe, and never lore | [0030-ideas.md](0030-ideas.md) |
| 0031 | A universe is searched across its recorded content from one persistent bar, over derived FTS5 indexes | [0031-universe-search.md](0031-universe-search.md) |
| 0032 | A backup is restored as a new universe: validated first, every id new, the account's own | [0032-backup-restore.md](0032-backup-restore.md) |
| 0033 | A world rule is a universe's own statement of how its world works, and means nothing to Lorex by itself | [0033-world-rules.md](0033-world-rules.md) |
| 0034 | A world rule may carry one explicit check, counted against the explicit details of Canon moments | [0034-timeline-rule-validation.md](0034-timeline-rule-validation.md) |
| 0035 | A relation kind may carry an explicit family meaning, and a family tree derives the rest (amended by 0040: type eligibility, family without ancestry) | [0035-family-trees.md](0035-family-trees.md) |
| 0036 | A universe is private until its owner publishes its shell, and the portal reads only an allow-list (amended for 010: entries and stories are published one by one, and a private universe overrides them; for 011: an entry's page carries its article, and a story needs a public summary) | [0036-universe-publication.md](0036-universe-publication.md) |
| 0037 | An author is public only through a chosen name, a minted address and a photo they chose to show | [0037-public-author-identity.md](0037-public-author-identity.md) |
| 0038 | Public pages carry server-rendered metadata from the public predicates, on a configured origin | [0038-public-page-metadata.md](0038-public-page-metadata.md) |
| 0039 | A story's parts are published one by one on its own page; a world may credit the work it is based on | [0039-story-content-publication-and-attribution.md](0039-story-content-publication-and-attribution.md) |
| 0040 | A type may be enabled for the Family Tree, and a relation kind may mean family without ancestry (supersedes two statements of 0035; amended #37: portrait nodes with details, groups enabled for the tree) | [0040-family-tree-type-semantics.md](0040-family-tree-type-semantics.md) |

| 0041 | A universe has one owner and may have collaborators, and one gate decides what each may do (supersedes 0006's access rule; amended 030: invitations by email and collaborator management; 042: history names who made each version; 043: review comments; 045: suggested changes; #23: private notes, the owner's alone) | [0041-universe-collaboration-access.md](0041-universe-collaboration-access.md) |
| 0042 | An account has a storage allowance (1 GiB), counted from the originals of the Lore pictures in the universes it owns and held during uploads | [0042-account-storage-quota.md](0042-account-storage-quota.md) |
| 0043 | A protected save names the version it was written over, and a save over a newer one is refused (entries, articles, stories, scenes, manuscripts; #39: field definitions; #23: private notes) | [0043-concurrent-edit-protection.md](0043-concurrent-edit-protection.md) |
| 0044 | A suggestion is bound to the version it was made over, and is accepted only through the target's own save | [0044-suggested-changes.md](0044-suggested-changes.md) |
| 0045 | The universe assistant reads through permission-safe tools over a shared read layer, behind a narrow provider boundary | [0045-universe-assistant.md](0045-universe-assistant.md) |
| 0046 | An outside AI app reads one universe over MCP, as one member, through OAuth 2.1 issued by LoreX itself (amended 052: a separate, opt-in proposal scope) | [0046-mcp-read-only-connection.md](0046-mcp-read-only-connection.md) |
| 0047 | An AI proposes changes; a person approves them in LoreX; only approved changes are applied, together, through each resource's own write path | [0047-staged-ai-changes.md](0047-staged-ai-changes.md) |
| 0048 | Relationships and timeline moments get a Trash; AI proposals reach every creator-authored resource | [0048-ai-changes-content-coverage.md](0048-ai-changes-content-coverage.md) |
| 0049 | One LoreX confirmation replaces the browser's confirm(); only beforeunload stays the browser's | [0049-shared-confirmation-dialog.md](0049-shared-confirmation-dialog.md) |
| 0050 | An entry's progression is its own aggregate, and an era holds only what differs then (#41) | [0050-entry-progression-eras.md](0050-entry-progression-eras.md) |
| 0051 | A relationship holds during periods of its own, on the universe's time or an entry's era (#18) | [0051-temporal-relationships.md](0051-temporal-relationships.md) |
| 0052 | An entry's forms and abilities are available exactly in the eras the author ticks (#42) | [0052-entry-forms-and-abilities.md](0052-entry-forms-and-abilities.md) |
| 0053 | An entry's appearances are one record each, with a gallery stored like the entry's own picture (#43) | [0053-entry-appearances.md](0053-entry-appearances.md) |
| 0054 | Duplicate is a new entry's form filled from another, and copies only what it says (#27) | [0054-duplicate-entry.md](0054-duplicate-entry.md) |
| 0055 | A type's fields may be arranged in optional sections, and a section is presentation only (#26) | [0055-field-sections.md](0055-field-sections.md) |
| 0056 | An entry may carry one private author note, and the owner alone may read it (#23) | [0056-private-author-notes.md](0056-private-author-notes.md) |
| 0057 | A knowledge record is an author's statement that one actor knows one thing from one scene, and nothing is inferred (#15) | [0057-knowledge-records.md](0057-knowledge-records.md) |
| 0058 | A manuscript mention is one plain-text token, resolved by id, shown as stored while writing and as a name everywhere else (#31) | [0058-manuscript-mentions.md](0058-manuscript-mentions.md) |
| 0059 | An account has a platform role; an Admin may block a Member, and reads only what LoreX records (#40) | [0059-platform-admin-workspace.md](0059-platform-admin-workspace.md) |
| 0060 | A universe's maps are uploaded pictures kept whole, with pins at fractions of them linked to Lore by id (#52) | [0060-lore-linked-maps.md](0060-lore-linked-maps.md) |
| 0061 | Geography is read from the maps' pins through one shared reader, and a distance exists only on a calibrated map (#53) | [0061-map-geography-and-calibration.md](0061-map-geography-and-calibration.md) |
| 0062 | An AI proposes schema - lore types, fields, groups - as its own reviewed proposal, through the Types screen's own write paths | [0062-ai-schema-proposals.md](0062-ai-schema-proposals.md) |
| 0063 | A readable export is Markdown pages rendered from the backup snapshot, for reading, never read back (#11) | [0063-readable-universe-export.md](0063-readable-universe-export.md) |
| 0064 | The web process takes a daily online SQLite snapshot and keeps it, verified, in a private R2 bucket (#54) | [0064-sqlite-backups-to-r2.md](0064-sqlite-backups-to-r2.md) |
| 0065 | Lore's front page is a catalog of the universe's types, with a Browse by group choice above the cards (#60) | [0065-lore-front-page-catalog.md](0065-lore-front-page-catalog.md) |
| 0066 | An idea board is an account-owned canvas of notes, ideas and entries, and never lore (amends 0030) | [0066-idea-boards.md](0066-idea-boards.md) |

All accepted. Next number: `0067`.

Known limitations are recorded in the ADR that owns them - cross-era ordering on the plain
reckoning in 0009 and 0011, and years written before a universe named its eras, the listing's
join and the missing era reassignment in 0022, the `Age` reference year and exclusive-relationship overlap in 0011, what the
promotion gate does not claim about stored High conflicts in 0012, unbounded history
growth in 0013, what a backup is not in 0014, the type that cannot be freed while a
trashed entry still uses it in 0015, the loss of substring matching in 0016, what an
installed Lorex does not do offline in 0017, and what the DEV topology costs - one
writer, an outage on deploy, keys unencrypted at rest and no rollback for the schema -
in 0018, and what an entry's image costs a backup and a revision restore in 0019, and what a
profile photo is deliberately left out of - a backup, a history and anyone else's view - in
0021, and the deferred life-state constraints and the gap across eras of unrecorded length in 0023, and
what stories deliberately do not have yet - prose, history, search, a Trash, Canon checks - in
0024, and what chapters leave for later - acts and volumes, drag-and-drop, collapsing - in 0025, and what plot
leaves for later - a status, beat chronology, visual planning, editing beats from a scene - in 0026, and what a manuscript
leaves for later - formatting, revisions, autosave, search - and what a whole-text save costs, in
0027, and what an entry article's history costs and leaves for later - plain text, diffs, pruning, restoring article text
from entry versions recorded before it - and the excerpt's marker characters, in 0028, and what content recovery deliberately
does not do - permanent deletion, versions of short text and structure, drafts for forms, syncing drafts between devices, and
restoring a chapter with the scenes it once held - in 0029, and what ideas deliberately do not have - promotion into lore, statuses,
versions, cross-universe references - and the unassigned ideas no universe backup can hold, in 0030, and what the universe
search leaves out - account-wide search, unassigned ideas, substrings, a pinned bar, the triggers the model cannot see - in 0031, and
what a restore does not do - overwrite, merge, account-wide or partial restores, background jobs - and the writer lock a very large
one holds, in 0032, and what a world rule deliberately is not - ordered, prioritised, versioned or read for meaning - in 0033, and
what a rule's check deliberately is not - a second pattern, a builder, a condition tree, a diagnostic finding, a stale-save token for
moments - and that it is only as complete as the details authors record, in 0034, and the duplicate relationships an older
database may already hold, which nothing deletes and no unique index refuses, in 0008, and what unpublishing cannot
recall - a copy a visitor already has - and the slug a deleted world frees, and the stem an entry or story address
reveals was once taken, in 0036, and the author address a second author of one name gets, in 0037, and the body a non-rendering crawler cannot see and
the copies search engines keep after an unpublish, in 0038, and the unpublished chapter headings, the one-page story reader and
the Trash restore that asks nothing for a story part, in 0039, and the Family Tree's own kind dialog that leaves Canon constraints to
the Relation Kinds tab, and the relation editor that still links an entry of any type, in 0040, and the bucket objects no storage total counts and nothing reconciles, in 0042, and the whole-form save that keeping one's changes still is, and the editors that keep their own stale-save check or have none, in 0043, and the suggestion an intervening save to any field makes unacceptable, and the prose that cannot be suggested yet, in 0044, and what the universe assistant deliberately is not - a writer, a memory, a web search or a second search - and the universe content it sends to its provider, in 0045, and the clients MCP V1 cannot serve - custom-scheme redirects, signed client assertions, pre-registration, legacy SSE, server-to-client requests - and the plain error answer OpenIddict gives a request it refuses before its redirect is trusted, in 0046, and the edit that an intervening save makes unapplicable, the creates that cannot link to each other in one proposal, and the proposals no backup carries, in 0047, and the stored-form binding of arcs, beats, rules and ideas, the constraint rollback that waits for open proposals, and the trashed links and moments a rollback brings back live, in 0048.
