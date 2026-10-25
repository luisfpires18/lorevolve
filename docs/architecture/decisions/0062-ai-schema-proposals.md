# ADR 0062 - An AI proposes schema as its own reviewed proposal, through the Types screen's own write paths

Status: accepted (2026-10-25). GitHub issue 59 (P0, pre-alpha), phase 1 - lore types, field definitions, semantic groups.

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
`AiLoreFieldInput` (type, name, kind from the eight Lorex has, required, default, the whole list of choices, a link limited
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
the consent screen (`lorex_schema`), offered only beside proposals and only to a role that edits types; it is granted only
with `CanPropose` and only by that tick. It is not an OAuth scope - the token is the same, so no client registration and no
existing grant changes; a connection approved before it has none, and refreshing never adds it. Connected Apps shows it and
takes it back on its own (`DELETE .../connected-apps/{id}/schema`, proposals and reading kept); stopping proposals stops it
too. Staging refuses schema without it, the catalog says why, and a staged schema proposal from an app that lost it can only
be rejected (`BlockedAsync`). The assistant's propose mode is a signed-in person asking in LoreX, so its role decides.

**The catalog is the real schema.** `get_change_options` lists every type with description, icon, parent, groups, live
entry count, active fields (with version, default, choices, limit by id) and archived fields apart; every group with its
types; the field kinds and icon keys Lorex has; and `schema` - whether this person through this entry point may propose
schema now, why not, and notes: reuse what exists, a group is not a type or a choice, ask the person when two models fit
(Orc as a type or as a Race choice), meaning stays the author's.

**Review.** Schema changes are described by LoreX like content ("New lore type", "New field on WEAPON OF ORDER (new):
WIELDER", kind, required, choices, what a link accepts, parent, groups); an archive says what it keeps. "Open it" goes to
Types.

## Consequences

- Migration `AddSchemaProposals`: the resource check constraint widened to 14 and `McpConnections.CanProposeSchema` (false
  for every existing row). Its rollback first deletes proposals holding a schema change - review state, never content - so
  the narrower constraint can be rebuilt; what was approved stays in the schema.
- Backups carry no proposals (ADR 0047). Approved types, fields and groups are ordinary schema and travel as they always did.
- A type's sections, field order and field layout (#26), type reordering and reparenting beyond `parent`, field restore and
  every delete stay hand-only. Field meaning stays hand-only by ADR 0011.
- A schema proposal and the entries that use it are two approvals by design; an AI is told so in the catalog and the tool
  descriptions.
- The assistant's tool results are cut at 10,000 characters (ADR 0045): a universe with very many types and fields gives it a
  cut catalog. MCP clients get it whole.
