# ADR 0007 - One generic entity model, with relational custom fields

Status: accepted (2026-09-07)

## Context

A worldbuilding tool cannot know in advance what a world contains. Characters and
locations are obvious; languages, rituals, debts, tides and shipping lanes are not. A
table per kind of thing would mean shipping a schema change every time an author invents
a category we did not anticipate.

## Decision

One `LoreEntity` table. What a thing *is* comes from an `EntityType` row owned by the
universe, and what it *has* comes from `EntityFieldDefinition` rows on that type. Authors
create their own types and fields; the backend has no Character class and no Location
class, and no inheritance between types.

Custom values live in `EntityFieldValue`, which has a typed column per shape rather than
a JSON blob: text, number, boolean, date, an option id, or a reference to another entity
in the same universe. Multi-select stores one row per chosen option. Select options are
their own rows, not a JSON array.

The one place JSON is allowed is the lore article, because it is Tiptap's own document
format. It is validated structurally on the way in, and the author never sees it.

Every universe starts with a small default set of types. Seeding inserts only the names a
universe is missing, so it is safe on a new universe and on one created before the
feature existed.

## Consequences

- Adding a kind of thing is data, not a migration.
- Values stay queryable and typed, so a field whose type is changed cannot silently
  reinterpret what is already stored. The API refuses that change while values exist,
  and refuses to delete a field or an option that still holds any.
- Reading one entity costs a join per field kind rather than one column read. Fine at
  this scale; if a universe ever holds enough entities for that to hurt, the fix is an
  index or a projection, not a JSON column.
- An entity reference is deliberately just a field pointing at another entity. Semantic
  relationships, with their own kinds and direction, are a separate model in phase 005.

## Amendment - the starter types are seeded once (2026-09-30, Product refinement 020)

Seeding filled in any missing starter *name* on every read of the type list - added in Phase 004 so universes created in
Phase 003, before types existed, got them on first use. Once types could be renamed and deleted from the Types screen,
that read undid the author: deleting Location succeeded and the next read put a new, empty "Location" back, so the delete
looked like it had failed and said nothing, and a renamed starter came back beside its new name.

Now the starters are written once, when a universe is created, and a read never writes. A universe's types are its
author's from then on; one whose author deleted every type has none, and says so where an entry would need one. No
backfill is owed: every universe since Phase 004 was seeded at creation, a restored universe takes the types its backup
holds, and a Phase 003 universe that was ever opened was seeded then by the old read.

## Amendment - nested types, and Lore starts with a type (2026-10-01, Product refinement 022)

**A type may sit beneath another type.** `EntityTypes.ParentId`, null for a root; any number of children, any depth - no
product limit, no mandatory or privileged root, and a universe may have one root, many or none. Every item of the tree is
an ordinary type, and an entry still has exactly one concrete `EntityTypeId`. Names stay unique per universe, not per
sibling group.

**Organisation, not inheritance.** Nothing passes from a parent to a child or back: not fields, required fields, icon,
accent, description, Canon semantics or Family Tree eligibility. Making a type a child copies nothing; moving one moves no
entry and no field.

**Integrity.** A parent is a type of the same universe and never the type itself or one of its descendants, so the types are
always a forest. Same universe and no-self are enforced by the database as well as the API - by triggers rather than a
foreign key, because SQLite adds a key only by rebuilding `EntityTypes`, and a rebuilt table changes the order SQLite visits
tables in a universe's cascading delete: the types went before the entries using them and the entries' RESTRICT key refused
the whole delete (seen, then avoided - the migration is additive, like `AddContentPublication`). A third trigger refuses
deleting a type that still has children, except inside its universe's own delete. Cycles are the API's and the restore's to
refuse, by walking the graph with a visited set (`EntityTypeHierarchy` server-side, `lore/typeTree.ts` in the client); a
trigger cannot walk a graph. No depth cap is used for that: a malformed graph ends a walk instead of looping, and a node no
root reaches is still listed.

**Order is among siblings.** `DisplayOrder` is a type's place among its direct siblings, from 1. A list of types is in
preorder: a parent before its descendants, siblings by place, then name, then id. A new type goes last among its siblings;
reparenting puts the type, with its whole subtree, last among its new siblings and closes the gap it left; `POST
.../entity-types/{id}/move` (`{ "direction": "up" | "down" }`) moves it one place and renumbers that sibling group 1..n, each
in one transaction (SQLite's write lock serialises them). Up on the first and down on the last answer the list unchanged, on
purpose. `DisplayOrder` in a type request is now ignored - a stale or arbitrary number cannot reorder anything. A row whose
parent or place changed records it in `UpdatedAt`.

**Amendment (2026-10-01, Product refinement 027): an absolute reorder, for a drag.** `POST .../entity-types/{id}/reorder`
`{ "index": n, "parentId": "<the parent the client saw, or null>" }` puts the type at 0-based place `n` among its current
direct siblings in one request and one transaction, renumbers that group 1..n, and answers the whole list as `move` does. It
never reparents: the type's nested types hang from it and so move with it, and nothing else - parent, fields, Family Tree,
entries, counts - changes. Its own place is an unchanged 200; `n` missing, negative or past the group is a 400 on `index`; a
`parentId` other than the type's current parent is a 409 `entity_type_parent_changed`, so a stale screen reloads instead of
reordering a group it never showed. `move` and `reorder` share one helper (`PlaceAmongSiblingsAsync`), so the ordering
invariant lives in one place. The Types screen: from 641px a grip per row drags a type among its siblings only (mouse only,
via `@dnd-kit/core`; the drop is computed from sibling branches, so it can never land inside another branch or under another
parent) and a keyboard lifts, moves and drops it from the same grip; Move up / Move down sit in the row's menu. At 640px and
under there is no grip and no touch drag: Up and Down stay on the row. Reparenting stays Edit's Parent type.

**Amendment (2026-10-02, Product refinement 028): Lore browses categories, not a flat list.** 025's flat preorder row is
replaced by the hierarchy's own shape, from the same `ParentId` tree - no schema change. The top row lists root types only;
choosing one that holds others opens a quieter row beneath it, "All <parent>" (the parent itself, which already includes its
whole branch) and then its direct children; each deeper chosen level that holds types adds one more row. Nested types never
sit beside the top-level ones. The exact choice is `aria-current="page"`, a category it sits in `aria-current="true"`. A phone
gets one menu per level ("Category", then "In <parent>"). Bare Lore still reads nothing and still has no "All" at the top; it
now says "Choose a category to browse your lore." with New entry. An empty category says "No entries in this category
yet." with its own create. Scope drives the breadcrumb, title, search placeholder ("Search Runes") and New label, which uses
the type's name as written ("New Runes"). Addresses stay `?type=<id>`.

**Contracts.** `EntityTypeResponse.parentId`; the list stays a flat array, and clients build the tree from ids. The type
request's `parent` is a wrapper - absent keeps the stored parent, so an older client saving a name cannot detach a type;
`{ "id": null }` is a root, `{ "id": "…" }` beneath that type. A parent not of this universe is a 400 on `parent`; a cycle is
a 409 `entity_type_parent_cycle`. `entityCount` is still the type's own entries (the Trash included), never its branch.
Deleting a type with children is refused - never cascaded, promoted or moved - with the same 409 `entity_type_in_use`, a
`childCount`, and words: "Runes can't be deleted because it still contains 4 nested types. Move or delete those types first."

**Lore has no "All".** With no type chosen Lore lists and reads nothing - a search or status in the address waits for a type
- and offers the types as a tree to choose from. A chosen type shows its branch: the entity list's `entityTypeId` is still
exact for every caller, and Lore adds `includeDescendants=true`, resolved on the server from the universe's type graph. An
unknown or foreign type id is taken out of the address, which chooses nothing. Mass create returns to that no-type state with
its count. The chooser is a disclosure of nested lists (links to choose, buttons to open a branch); the chosen type's
ancestors are opened and named in the header's path. Every type picker - Lore, the Types screen, New entry, Mass create -
follows the tree order, and a `<select>` names a type by its path ("Runes › Material Runes").

**Amendment (2026-10-01, Product refinement 025): the type row is back, without All; a type grows from its own row.**
The chooser above is withdrawn. Lore's type navigation is again `TypeSwitcher` - wrapped links from 641px, one menu on a
phone - listing every type flat in the tree's preorder (names are unique per universe, so no indentation is needed) and no
"All". Bare `/lore` is a real state: no type current, the menu says "Choose type", nothing listed or read - no entry
request, no skeleton, no filters, no Select, no panel. The header path's "Lore" crumb returns there. Branch browsing
(`includeDescendants`), the unknown-id rule and Mass create's return are unchanged. On the Types screen each row has **Add
child**, opening the same type drawer with that row's type as the starting parent (still editable); the drawer says "New
child type" and "Inside …", and the focus comes back to that row's Add child after creating or cancelling. Frontend only:
the create request already took `parent`.

## Amendment - custom-field filters in Lore (2026-10-04, Product refinement 034)

**A chosen type's entries can be narrowed by that type's own fields.** `GET .../entities` takes repeated
`field=<fieldId>:<op>:<value>`, split at the first two colons only (a GUID and a fixed word hold none, so the value may hold
anything). The Lore address carries the same values under the same name, so a link, a refresh, Back and Forward all keep them.
No second endpoint; a listing without `field` is unchanged.

| Kind | Operators (wire / words) | Value |
| --- | --- | --- |
| Short and long text | `contains` contains, `eq` is | text, trimmed, not blank |
| Number | `gt` is more than, `lt` is less than, `eq` is | a finite number, decimals kept |
| Yes or no | `is` | `true` or `false` (Yes / No) |
| Choose one | `is`, `isNot` is not | an option id of that field |
| Choose several | `contains` includes, `notContains` does not include | one option id of that field |
| Link to an entity | `is`, `isNot` | an entry id of this universe |

- **The type's own fields only.** Fields are not inherited, so a filter needs `entityTypeId` and names a field defined on
  exactly that type. Branch browsing still lists nested types' entries; they carry none of the parent's fields, so any field
  filter leaves them out.
- **AND, everywhere.** Filters are ANDed with each other and with the type branch, search, status and tag. The same field may
  appear more than once (`Age > 20` and `Age < 40`; two `includes` is "both"). At most **10**; an eleventh is a 400.
- **A missing value never matches**, positive or negative: "is not Arkazia" needs a Kingdom; "does not include Fire" needs at
  least one option chosen.
- **Text** compares through SQLite's `lower()` on both sides (the parameter is lowered by the same A-Z rule in C#), so it is
  case-insensitive for ASCII and exact otherwise; `contains` is `instr()`, so `%` and `_` are plain characters.
- **In the database, before the count, order and page.** Each filter is one correlated `EXISTS` over `EntityFieldValues`
  (served by its `(EntityId, FieldDefinitionId)` index), composed into the listing's query; ordering is untouched (recency, or
  the full-text score when searching). One read resolves the fields and options, one more any linked entries; the number of
  queries does not grow with the filters or the entries. No migration; cards carry no field values.
- **Refused, never ignored.** A field that is not the type's (another type, another universe, deleted, unknown), a Date field,
  an operator the kind lacks, a bad value, an option of another field, or an entry outside the universe is a 400 - dropping a
  filter would widen the answer. Another universe's field, option or entry gets the same answer as a made-up id.
- **Client** (`lore/fieldFilters.ts`): the one parser and serializer, the operators per kind and their words. Filters the
  chosen type cannot answer are taken out of the address with replace before anything is read; adding or removing one is a
  history entry and returns to page 1; another type starts with none; Clear filters clears them with search and status.
- **Not here:** Date (it waits on each universe's own calendars), is empty / is not empty, OR, saved views, public Explore.

## Amendment - a link field may be limited to one type (2026-10-05, Product correction 036)

A Character's "Kingdom" field offered Runes, because a link field had no allowed type: the entry form listed the first page
of every entry and the Lore filter's picker searched the whole universe. A target is now part of the field, by id.

- **`EntityFieldDefinitions.TargetEntityTypeId`**, nullable, keyed to `EntityTypes` (no action on delete, so a universe still
  goes in one cascade; the type endpoint refuses first). Set only on a link-to-an-entity field: the exact type its entries
  must be of. Null means **any Lore type**, an explicit choice shown as such. Every other kind must send null, or the field
  is refused. The same universe is checked by the endpoints, since the key cannot say it; another universe's type and no type
  get the same answer.
- **Exact type only.** Types nested inside the target are not included, and moving or renaming types changes nothing about
  what a field accepts. Several allowed types or a whole branch would be a later, deliberate change.
- **Never from a name.** A field called "Kingdom" is not limited to a type called "Kingdoms" unless its author says so; the
  migration (`AddEntityReferenceTargetType`) leaves every existing link field open to any type and infers nothing.
- **Narrowing waits for the data.** Limiting a field, from any type or from another type, is refused (409
  `entity_field_target_conflict`) while any entry, one in the Trash included, links it to an entry of another type. Nothing
  is cleared or rewritten. Widening to any type is always allowed.
- **The API decides.** An entry's save resolves every link it carries in one read (id and type, this universe only) and
  refuses one of the wrong type, a missing one or another universe's with the same words. A kept link to an entry in the
  Trash still saves when it fits. A Lore filter on a limited field refuses an entry of another type (400) rather than
  answering with nothing; its one batched read now also returns each entry's type.
- **Deleting a type** a link field on another type is limited to is refused (409 `entity_type_targeted`), naming the first
  such field. A type's own field that links to its own type goes with it.
- **The picker** (`EntityPicker`) takes the allowed type and passes it to the ordinary Lore listing as `entityTypeId`, so the
  database narrows the search. The entry form's link control is now that picker - it searches instead of listing a page - and
  the 034 filter editor uses the same one. Types offers "Allowed type", "Any Lore type" first, then every type by its path.
- Backup format 20 carries the target (ADR 0014 amendment).

## Amendment - semantic groups of types (2026-10-19, Issue #36)

A creator can gather several concrete types under one reusable classification - Elemental, Original and Corrupted Runes
under **Runes** - and use it where one exact type is too narrow: a link field's allowed target and a Lore filter. A group is
classification metadata, not an entity model, a parent type or an ontology.

- **Schema.** `EntityTypeGroups` (id, universe, name unique per universe, timestamps) and `EntityTypeGroupMembers`
  (group id + type id, composite key, index on the type), both cascading from their universe, group and type. No table per
  group, no field on a group. A type is in zero, one or several groups; membership is explicit and never read from a type's
  name, icon, description or parent. Triggers hold what keys cannot: a membership joins a group and a type of the same
  universe, and a field's group target is a group of its own universe and never beside an exact type.
- **Identity is the id.** Renaming a group or a member type changes no membership and no field that targets the group.
- **Nothing is inherited.** A member type keeps its own fields, icon, accent, hierarchy and Family Tree eligibility. Joining a
  group never makes a type Family Tree eligible: that stays the per-type `FamilyTreeEligible` (ADR 0040). Group-based Family
  Tree configuration is deliberately not here; it is Issue #37.
- **Membership is saved with the type.** `EntityTypeRequest.Groups` is the type's whole set - existing groups by id, new
  ones by name, created in the same transaction - so creating a group and joining it is one action, and a cancelled or
  refused save leaves no group behind. Absent keeps the stored set. There is no group-creation route of its own and no
  separate management page: `GET`, `PUT` (rename) and `DELETE` on `/entity-type-groups` are all there is.
- **Link fields.** `EntityFieldDefinitions.TargetGroupId` (nullable, keyed to `EntityTypeGroups`, no action on delete): a
  link field allows any type, one exact type (036, unchanged) or one group - never two of these. A group target accepts an
  entry whose type is in the group *when the link is written*; the entry save, the Lore field filter, the backup and the
  picker all apply the same rule from one membership read. An old exact-type field keeps its meaning; nothing converts.
- **Narrowing waits for the data, as for a type.** Changing a field's target to a group is refused (409
  `entity_field_target_conflict`) while any link, Trash included, points at an entry whose type is not in it.
- **Leaving a group waits for the data.** Taking a type out of a group is refused (409 `entity_type_group_in_use`) while a
  link in a field limited to that group points at an entry of that type (Trash included). The refusal names the field, its
  type and the link count; nothing is cleared, widened or grandfathered. A change that strands no link goes through.
- **Deleting a group** a link field targets is refused (409 `entity_type_group_targeted`) with the list of fields; the
  author changes them first. A target is never quietly opened to any type. Otherwise the group and its memberships go and
  every type, field and entry stays.
- **Concurrency.** Every one of these writes, and every entry write, runs in a transaction Microsoft.Data.Sqlite begins
  IMMEDIATE, so a membership change, a group delete, a field's new target and an entry's new link are serialised and each
  checks the state the other left. Checks are bounded: they read only the fields targeting the groups concerned and count
  their values through the existing indexes.
- **Lore.** The listing takes `entityTypeGroupId`: entries of every type in the group now, combined with search, status,
  ordering and pages exactly as a type is. Lore offers groups as one more row ("Groups", a layers icon, an accessible name
  ending in "(group)") and on a phone one more menu; a type and a group are never chosen together, and field filters stay a
  type's. No group badge on cards or entries.
- **Starter groups.** The one starter template (`EntityTypeDefaults`) creates, with its types, Characters (Character),
  Places (Location), Factions (Organization) and Objects (Item) - data for that template, editable like any group. Only
  types created in the same call join one. Existing universes are not classified by the migration
  (`AddEntityTypeGroups`), by a restore or by anything else. There is no blank-universe template today; a universe whose
  author deletes the starters keeps whatever groups they leave.
- **An entry's own type is held by the links to it.** Changing an entry's type is refused (409
  `entity_type_change_linked`) while another entry - one in the Trash included - links to it through a field limited to an
  exact type or a group the new type does not satisfy. The refusal names the fields (`fields[]`); the entry, its type, its
  history and every link stay as they were. Checked inside the save's own promotion-gate transaction, through the reference
  index. This closes the same gap for 036's exact-type targets. Adding a field and deleting a type or group are also each one
  IMMEDIATE transaction now, so a field can never name a target deleted in between.
- Backup format 23 carries groups, memberships and group targets (ADR 0014 amendment).

## Amendment - editing, archiving and restoring fields (2026-10-20, Issue #39)

A type's Fields is now a list a creator manages: each field has Edit, and Archive and Delete in its menu; Add field opens
the editor on request. A field that holds data is put away by archiving it, which is reversible; deletion is only for a
field nothing uses.

- **Schema.** One nullable column, `EntityFieldDefinitions.ArchivedAt` (migration `AddEntityFieldArchive`, no backfill:
  every existing field is active). Archived is a state of the same row, never a second table: the field keeps its id,
  name, kind, options, meaning, target, `IsRequired` and every `EntityFieldValues` row, in Lore and in the Trash.
- **Reads.** `EntityTypeResponse.Fields` is active fields only, so every form, filter and picker that reads it meets no
  archived field by accident; `ArchivedFields` carries the rest. Each field reports `entryCount` and `trashedEntryCount`.
  An entry's own read (`LoadDetailAsync`, so the entry page, MCP, the assistant and a suggestion's "before") leaves archived
  values out; its history still shows them as recorded.
- **Writes never touch archived values.** `UpdateCoreAsync` is the one writer of an existing entry's values (an ordinary
  save, a restored version, an accepted suggestion) and replaces only the active fields' rows; `PrepareFieldValuesAsync`
  addresses active fields only, so a value sent for an archived one is ignored like any unknown field. Required checks
  (single and mass create) ignore archived fields. Backup restore writes them as the file holds them.
- **Stale forms.** Archiving and restoring move on the edit version (ADR 0043) of every entry holding a value for the
  field, Trash included. A form or suggestion opened before is refused as stale rather than saved over a field set it never
  showed; this is what stops a form opened while a field was archived from dropping the values a restore brought back.
- **Active consumers.** The Canon lifespan readers and `CANON-FIELD-001`, the timeline's birth and death years, the
  chronology's "unplaced years" count and Lore field filters read active fields only. Archiving is reconciled, not gated
  (it only removes facts); restoring is gated, so a restored death year that would open a High finding is refused.
- **Protections still count archived data.** Deleting a type or group a field is limited to, leaving a group a link relies
  on, retyping an entry an archived field links to, removing a date period a year is written in: all read every field and
  value, archived ones included, and name an archived field as "(archived)". An entry holding values in archived fields of
  its own type cannot change type (409 `entity_type_change_archived`): the move would discard values no form shows.
- **Editing.** `PUT .../fields/{id}` keeps its rules (kind frozen while values exist, narrowing refused while a link does
  not fit, an option in use kept, one meaning per type) and adds two: an archived field is refused (409
  `entity_field_archived`, restore first), and Optional to Required is refused while a live entry of the type has no value
  (409 `entity_field_required_missing`, with `missingCount`). An edit keeps the field's place. Name and meaning stay unique
  per type across archived fields, so a restore can never meet a twin; the clash says when the other field is archived.
- **Restoring** (`POST .../restore`, body `{ asOptional }`) checks the field's links still fit its target, then, for a
  required field, that no live entry is missing a value; otherwise 409 `entity_field_required_missing` with
  `canRestoreOptional`. Only an explicit `asOptional: true` brings it back optional. Nothing is widened or cleared to make
  a restore fit. Archive and restore are idempotent.
- **Deleting** (`DELETE .../fields/{id}`) is refused (409 `entity_field_in_use`, `entryCount`, `trashedCount`) while any
  entry, Trash included, holds a value, active or archived; one IMMEDIATE transaction. No force-delete and no cascade.
- **New link fields** start with no target in the editor until the author picks one, Any Lore type included. The API
  still reads a missing target as any type, so older clients and the starter template are unchanged.
- **Not done (V1).** Reordering fields, renaming an option in place (a rename is a remove and an add, refused while the old
  one is chosen), adding a required field to a type with entries (still allowed, as before), a stale-edit check on the
  field definition itself (last write wins, under the same validation), and a "has no value" Lore filter to list the
  entries a required restore is waiting on.
- Backup format 25 carries `archivedAt` (ADR 0014 amendment).
