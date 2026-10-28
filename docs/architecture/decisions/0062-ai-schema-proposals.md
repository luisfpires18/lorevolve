# ADR 0062 - An AI proposes schema as its own reviewed proposal, through the Types screen's own write paths

Status: accepted (2026-10-25). GitHub issue 59 (P0, pre-alpha): phase 1 - lore types, field definitions, semantic groups;
phase 2 - relationship kinds, the reckoning (date periods and calendar), event kinds and methods; phase 3 - one entry's
progression (eras, forms, abilities, appearances), as content; phase 4 - pictures handed over by a person and quarantined until
approved; and a friendly, stable MCP address per universe.

## Context

ADR 0047 and 0048 let an AI stage changes to a universe's content and kept its schema out by decision: an AI asked to
populate a Lord of the Rings universe could only squeeze kingdoms, races and weapons into the starter types. Issue 59 asks
for the schema itself - types, fields with their choices and link targets, semantic groups (#36) - through the same staged,
human-reviewed proposals, without a second schema engine, invented field kinds or hidden ontology, and without giving any
existing grant the power to change a universe's shape.

Three things already exist and decide the shape. Every schema write has one path - the Types screen's routes, which check
names, kinds, targets, groups and the field lifecycle (#39) inside their transaction. Field meaning (ADR 0011) is declared by
the author, never inferred and never by AI. And a proposal's content checks (`AiChangeChecker`) read the universe's types and
fields as they are stored: an entry can only use a field id that exists.

## Decision

**Three schema resources.** `AiChangeResource.LoreType` (12), `LoreField` (13), `LoreGroup` (14); `lore_type`,
`lore_field`, `lore_group` on the wire. Create and update for all three; `remove` only on a field, and it **archives** it
(Issue #39: it leaves forms, filters and rules, keeps every value, and is restored in Types). Types and groups are never
removed by an AI - neither has a Trash, and the app deletes them only by hand once nothing uses them; the refusal says so.
Inputs: `AiLoreTypeInput` (name, description, icon key, accent, parent or root, the whole set of groups, Family Tree),
`AiLoreFieldInput` (type, name, kind from the eight LorEvolve has, required, default, the whole list of choices, a link limited
to one type, one group or any entry), `AiLoreGroupInput` (name, Family Tree). Stored as `TypeValues`, `FieldValues`,
`GroupValues`. **No member sets a field's meaning**: an update carries the stored one through unchanged (ADR 0011).

**Definitions and content never share a proposal.** A submission holding both is refused whole. Inside a schema proposal,
references go Group -> Type -> Field with `{ref}` (a type's parent and groups, a field's type and link target), and approval
applies them in that order. Entries that use the new types and fields come in a second proposal, after approval, with the
ids `get_change_options` then lists. This is the issue's "explicit dependent stages": a content check never has to trust an
id that does not exist yet, and a reviewer approves the shape before anything is poured into it.

**The Types screen's own write paths, extracted, as the approver.** `EntityTypeEndpoints.CreateCoreAsync`, `UpdateCoreAsync`,
`AddFieldCoreAsync`, `UpdateFieldCoreAsync`, `ArchiveFieldCoreAsync`; `EntityTypeGroupEndpoints.CreateCoreAsync` (a group
with no types yet - the state deleting a group's last type leaves too) and `UpdateCoreAsync` (rename and Family Tree). Each
route calls its core after its access check; each core joins the approval's transaction (`JoinedTransaction`) under the
Canon gate (ADR 0047). The read-only refusals of a field write were split out - `FieldAddRefusalAsync`,
`FieldEditRefusalAsync` (shape, kind locked by values now or in history, name and meaning clashes archived ones included,
targets of this universe and not narrower than existing links, required while entries or eras leave it empty, a choice still
used now or in history) - so a proposal's check asks exactly what the write will, and the write asks again.

**Checks, at staging, on every read, inside every approval.** The type's `ValidateEntityType`, the field's `ValidateField`
and the refusals above; names unique in the universe (ordinal, as the unique indexes are) and across the batch; a parent of
this universe or of the proposal that never puts a type inside itself, through stored and proposed parents alike; groups of
this universe or the proposal; leaving a group that existing links rely on (`LeavingRefusalAsync`); a field limited to a type
or group the proposal creates refused when it already holds links; types and groups bound to their stored form, fields to
their version (ADR 0043) - a stale change can only be rejected. Selective approval and rejection work as for content: a field
cannot be approved without its new type, rejecting a type rejects its fields (`needs_rejected`), and any refusal at approval
applies nothing of the batch.

**Who.** Staging and approving schema needs `EditContent` - an owner or Editor, as by hand. A Reviewer's suggestions never
reach schema; a Viewer stages nothing.

**A separate, explicit permission for apps.** `McpConnection.CanProposeSchema`, default false: a second unticked choice on
the consent screen (`lorevolve_schema`), offered only beside proposals and only to a role that edits types; it is granted only
with `CanPropose` and only by that tick. It is not an OAuth scope - the token is the same, so no client registration and no
existing grant changes; a connection approved before it has none, and refreshing never adds it. Connected Apps shows it and
takes it back on its own (`DELETE .../connected-apps/{id}/schema`, proposals and reading kept); stopping proposals stops it
too. Staging refuses schema without it, the catalog says why, and a staged schema proposal from an app that lost it can only
be rejected (`BlockedAsync`). The assistant's propose mode is a signed-in person asking in LorEvolve, so its role decides.

**The catalog is the real schema.** `get_change_options` lists every type with description, icon, parent, groups, live
entry count, active fields (with version, default, choices, limit by id) and archived fields apart; every group with its
types; the field kinds and icon keys LorEvolve has; and `schema` - whether this person through this entry point may propose
schema now, why not, and notes: reuse what exists, a group is not a type or a choice, ask the person when two models fit
(Orc as a type or as a Race choice), meaning stays the author's.

**Review.** Schema changes are described by LorEvolve like content ("New lore type", "New field on WEAPON OF ORDER (new):
WIELDER", kind, required, choices, what a link accepts, parent, groups); an archive says what it keeps. "Open it" goes to
Types.

## Phase 2: relationship kinds, the reckoning, event kinds and methods

Three more schema resources, under every rule above: `RelationshipType` (15, `relationship_kind`), `Chronology` (16,
`chronology`) and `ValidationTerm` (17, `event_kind` or `method` - the word is the kind, and a term never changes kind).
Written through their own screens' cores: `RelationshipTypeEndpoints.CreateCoreAsync`/`UpdateCoreAsync`,
`ChronologyEndpoints.UpdateCoreAsync` (under the gate it always runs under), `ChronologyCalendarEndpoints.SaveCoreAsync`,
`ValidationTermEndpoints.CreateCoreAsync`/`RenameCoreAsync`. None is ever removed by an AI.

**Nothing already linked or dated is reinterpreted.** A person may do each of these by hand, where the screen shows what
moves; an AI change may not, and is refused with the reason, nothing written:

- A relationship kind relationships already use keeps its direction (symmetric or not). Renaming it or its inverse is a
  plain before/after line in the review. Its Canon age rules (ADR 0035) are carried through unchanged: what a kind means to
  the rules is the author's, like a field's meaning. Its family meaning may be proposed (amendment, 2026-10-28, below).
- The reckoning is one change, written whole. Every existing date period and month is listed by id, **in its stored order**;
  new ones go anywhere among periods and after the months. Leaving one out, reordering, an id that is not this universe's, a
  period that dates anything turning its count around, a month shortened below a day in use, and starting a custom calendar
  while simple dates use month numbers (which turning one on rewrites) are all refused. Bound to the whole stored reckoning:
  any hand edit since makes it a conflict.

The catalog lists kinds with descriptions and how many links use them, and `schema.chronology`: each period with its
direction, label and whether it dates anything, the calendar's months with their days and use, and whether simple dates use
months. Migration `AddDefinitionProposals` widens the constraint to 17; its rollback drops only proposals holding these.

## Phase 3: one entry's progression, as content

`AiChangeResource.Progression` (18, `progression`, update only, `targetId` the entry) is **content**, not schema: it shares a
proposal with the entry's other changes, never with schema, and is staged by those who edit content (owner, Editor - a
Reviewer's suggestions stay entries, stories and scenes). One change per entry per proposal holds its eras, forms, abilities
and appearances as a patch over the stored snapshot (`ProgressionSnapshot`, the history's own record): an item with an id
changes, one without is added, one left out stays exactly as stored, and **nothing is removed** - taking an era, a form or a
look away is the author's, on the Progression page.

New items get their ids from LorEvolve at staging, and an AI names them by keys (`{"key": "young"}`), so a new form can be
available in a new era and a new outfit worn in a new form in one save, on the same entry - never a new entry per era. The
check is the save's own normalisation (`ProgressionState.NormalizeAsync`, as a restore runs it so the given ids are taken,
never one another entry's item holds); the change is bound to the progression's version; approval is
`ProgressionEndpoints.WriteAsync` as the approver (`givenIds`), one version of the history. An appearance's pictures are not
part of a save, so every existing picture link stays. `get_change_options` with `loreId` adds that entry's progression - ids,
links, picture counts and version - so an AI can change existing items by id.

## Phase 4: pictures, handed over by a person, quarantined until approved

`AiChangeResource.Media` (19, `image`, create only) is content: a picture for an entry's profile - only when it has none, since
an AI change never replaces one (the replaced picture's objects are deleted for good) - or one more picture in one of its
appearances. **The AI sends no file.** AI clients cannot reliably hand over a person's local file, and a proposal never
carries base64, a URL to fetch (no SSRF surface), or storage credentials. The change says where the picture goes and what it
should be; the person uploads it on the proposal's review page, signed in (`PUT .../ai-changes/{p}/operations/{o}/media`,
the person it was staged for or someone who may approve it, while the change waits). Until then the change has
`awaiting_upload` and cannot be approved; staging itself does not count that as a problem.

**Quarantine.** The upload passes `ImagePreparation.PrepareAsync` - the upload gate's three decoders, one frame, its byte and
pixel bounds - and its original and thumbnail are written, with no transaction open, under the keys the picture will have
(the entry's or appearance's prefix, a fresh asset id). `AiChangeMedia` records them, with no foreign key so no cascade can
forget a key. Nothing serves them but the review's preview (`.../media/thumbnail|original`, behind the proposal's own access,
`private, no-store`); nothing counts them against storage; at most 64 MB waits per account. Uploading again replaces the
file and sweeps the old objects.

**Approval attaches through the upload's own commit.** Room is held before the approval's transaction
(`AccountStorage.ReserveAsync`, as every upload holds it before its commit, ADR 0042) and consumed inside it by
`AppearanceImageEndpoints.AttachAsync` or `EntityImageEndpoints.AttachFirstAsync` - the routes' own in-transaction steps,
extracted: the target still live, the gallery not full, the entry still without a picture, the history recorded - and the
quarantine row goes in the same commit, so the picture's row owns the objects from then on. Out of room, or the target gone,
refuses the approval whole and the picture stays in quarantine. Every hold is given back afterwards.

**Nothing is left behind.** `AiChangeMediaSweep` (hourly, after start-up) deletes the objects, then the row, of every
quarantined picture whose change is no longer waiting - rejected, expired, its proposal or universe gone. Backups carry none
of it (ADR 0047). A migration rollback drops the table and leaves its objects in the bucket - a migration has no store.

## Amendment, 2026-10-28: a relationship kind's family meaning can be proposed

Seeding a universe over MCP showed the gap: an AI could make "parent of" and every parent link, but not say that "parent of"
is a parent, so the Family Tree (ADR 0040) drew nobody until a person found the setting by hand. `AiRelationshipKindInput`
now takes an optional `familyMeaning` - `biological_parent`, `adoptive_parent`, `other_family` or `none` - on create and
update; left out, a new kind is `none` and an existing one keeps what is stored. It goes through the Types screen's own
validation (no parent meaning on a symmetric kind), the review page shows it as a before/after "Family meaning" line in the
Types screen's own words, and the catalog lists each kind's current `familyMeaning`. Nothing is written until the person
approves, as for every change, so the meaning is still the author's decision; only the typing moves. Canon age rules stay
hand-only. No migration: the meaning rides in the stored kind values, which already carried it.

## A friendly MCP address per universe

Each universe gets `{origin}/mcp/u/{alias}`, such as `/mcp/u/the-lord-of-the-rings-7k2f`, beside the canonical
`/mcp/universes/{id}`, which keeps working - every connection made with it is untouched. The alias is the universe's name in
lowercase ASCII words (common accented Latin letters folded, since the host runs with invariant globalization), cut at 24
characters, and four random characters, so nobody guesses one from a name and two universes never share one. It lives in
`McpUniverseAliases` - MCP's own table, cascading with the universe, never a column on `Universes` (SQLite would rebuild that
table on a rollback, under triggers that name it) - is made the first time Connect to AI is opened, and is kept through a
rename.

An address, never a credential: the gate resolves it server-side to one universe and then asks exactly what it asks of the
address by id - the token, the connection, the role. A token's audience is the resource the app asked for, in the spelling
it used, and either spelling of the same universe passes the gate; another universe's never does, and a refresh cannot move
a grant to another universe by naming its alias. An alias that names nothing is answered like any address - the same 401
with its own metadata address, the same metadata document - and a connection asked for with it is refused at the redirect
(`invalid_target`); someone who cannot read the universe is refused as before. Connect to AI shows the friendly URL to copy,
suggests a connection name ("LorEvolve - LOTR"), and says it survives a rename. The Azure App Service is not renamed.

## Consequences

- Migration `AddSchemaProposals`: the resource check constraint widened to 14 and `McpConnections.CanProposeSchema` (false
  for every existing row). Its rollback first deletes proposals holding a schema change - review state, never content - so
  the narrower constraint can be rebuilt; what was approved stays in the schema.
- Migrations `AddDefinitionProposals`, `AddProgressionProposals` and `AddAiChangeMedia` widen the constraint to 17, 18 and
  19 (the last adds the quarantine table); each rollback drops only proposals holding what it added. `AddMcpUniverseAliases`
  adds the alias table; its rollback drops it, and the canonical addresses go on working.
- An alias cannot be chosen or changed by the owner yet; a universe keeps the one it was given.
- Real AI clients: an MCP client is told in the tool result to send the person to the review page for each picture, and not
  to say a picture was added. Whether a given client relays that honestly is the client's; nothing a client says changes
  what is attached.
- Backups carry no proposals (ADR 0047). Approved types, fields and groups are ordinary schema and travel as they always did.
- A type's sections, field order and field layout (#26), type reordering and reparenting beyond `parent`, field restore and
  every delete stay hand-only. Field meaning stays hand-only by ADR 0011.
- A schema proposal and the entries that use it are two approvals by design; an AI is told so in the catalog and the tool
  descriptions.
- The assistant's tool results are cut at 10,000 characters (ADR 0045): a universe with very many types and fields gives it a
  cut catalog. MCP clients get it whole.
