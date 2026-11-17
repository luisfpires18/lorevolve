# Types architecture: Lore types and Game entity types

Audit for #279 (tracker #300, M3 Types & Reusable Templates). Investigation only: nothing here changes runtime,
schema or data. Paths are relative to the repository root; line numbers are from `origin/dev` at `1f32dd72`.

## 1. Summary

- There is **one schema engine**. Lore types and project (Game, Series, Film, Comic) types are rows of the same
  tables (`EntityTypes`, `EntityFieldDefinitions`, `EntityFieldOptions`, `EntityFieldSections`). Lore entries and
  project entries ("GameEntity") are rows of the same `Entities` and `EntityFieldValues` tables.
- Scope is a nullable `ProjectId` column on both `EntityType` and `LoreEntity`. Null means lore. A value means the
  row belongs to that project and is hidden from lore by a global EF query filter.
- The API and the UI are split by scope: lore types are reached through the universe, project types through the
  project. The backend reuses lore helpers; the frontend has a separate, smaller project editor.
- No universe-owned reusable template store exists today. Starter templates are hard-coded in
  `ProjectTemplates.cs` and copied once on request.

## 2. Type ownership and field storage

Model: `src/LorEvolve.Api/Features/Lore/LoreModel.cs`.

| Entity (table) | Key ownership columns | Line |
| --- | --- | --- |
| `EntityType` (`EntityTypes`) | `UniverseId` (required), `ProjectId` (null = lore), `ParentId` (nesting, not an FK), `FieldLayoutVersion` | 77, 97, 128 |
| `EntityFieldSection` | `EntityTypeId`, `Name`, `DisplayOrder`, `StartsCollapsed` | 155 |
| `EntityTypeGroup` / `EntityTypeGroupMember` | `UniverseId`; groups types for lists and family trees | 178, 210 |
| `EntityFieldDefinition` | `EntityTypeId`, `Kind`, `Semantic`, `IsRequired`, `DefaultValue`, `TargetEntityTypeId`, `TargetGroupId`, `ImageShape`, `ArchivedAt`, `SectionId`, `Version` | 222 |
| `EntityFieldOption` | `FieldDefinitionId`, `Value`, `DisplayOrder` | 305 |
| `LoreEntity` (`Entities`) | `UniverseId`, `ProjectId` (null = lore), `CanonEntityId` (optional link from a project entry to a lore entry, not an FK), `EntityTypeId` | 322, 342, 356 |
| `EntityFieldValue` | typed columns: `TextValue`, `NumberValue` (+ `EraId`), `BooleanValue`, `DateValue`, `OptionId`, `ReferencedEntityId` | 445 |
| `EntityImage` | one portrait per entry | `Features/Lore/EntityImageModel.cs` |
| `EntityFieldImage` | pictures held in Image fields (#238) | `Features/Lore/EntityFieldImageModel.cs` |

Isolation: `src/LorEvolve.Api/Features/Lore/LoreConfiguration.cs:44` (`type.ProjectId == null`) and `:236`
(`entity.ProjectId == null`). Any read that needs project rows says `IgnoreQueryFilters()` with the project named
(for example `ProjectEntityEndpoints.cs` list query, `EntityFieldImageEndpoints.cs:154`).

Lore types support nesting (`ParentId`, `EntityTypeHierarchy.cs`), type groups (`EntityTypeGroupEndpoints.cs`),
field sections and field archive. Project types support nesting (`ProjectEntityTypeEndpoints.cs` codes
`project_entity_type_has_children`, `project_entity_type_inherited_pictures`); type groups are universe-level and
apply to lore only.

Limits for project schemas: `ProjectEntityTypeEndpoints.cs:40-45` (200 types per project, 60 fields per type, 60
options per field).

### Migration history (type-related, `src/LorEvolve.Api/Data/Migrations/`)

`AddEntityFieldSemantics` (20260908), `AddEntityImages` (20260910) and framing follow-ups, `RestrictEntityTypeIconKeys`,
`AddEntityTypeFamilyTreeEligibility` (20260929), `AddEntityTypeHierarchy` (20261001), `AddEntityReferenceTargetType`
(20261005), `AddEntityTypeGroups` (20261019), `AddEntityTypeGroupFamilyTree`, `AddEntityFieldArchive`,
`AddEntityFieldVersion` (20261020), `AddEntityFieldSections` (20261024), `AddImageDisplayCopies` (20261107),
`OrderTypeGroups` (20261112), `AddCreativeProjects`, `RequireProjectUniverse`, `AddProjectScopedEntityTypes`,
`AddProjectEntities` (20261114), `AllowProjectEntryProposals`, `AllowProjectSchemaProposals` (20261115),
`AddEntityFieldImages` (20261116, #238).

## 3. Field kinds, validation and rendering

Kinds (`LoreModel.cs:15`): `ShortText`, `LongText`, `Number`, `Boolean`, `Date`, `Select`, `MultiSelect`,
`EntityReference`, `Image`. Image shapes (`:31`): `Free`, `Square`, `FourByThree`, `SixteenByNine`. Semantics
(`:56`): `BirthYear`, `DeathYear`, `Age` (lore chronology).

Backend validation is shared:

- Field definition rules: `LoreValidation.cs` (`ValidateImageField` at `:118`, `Normalize` at `:208`,
  `NormalizeAccent`). The project field path calls them (`ProjectEntityTypeEndpoints.cs:256-258, 883, 928`).
- Field value preparation and entry creation: `EntityEndpoints.CreateEntryAsync` (`EntityEndpoints.cs:526`),
  `CheckEntryAsync` (`:632`), `PrepareFieldValuesAsync` (`:1251`, `:1277`), `FieldLineageAsync` (`:1267`, inherited
  fields through the type tree, takes a `projectId`), `LoadDetailAsync` (`:1637`). `ProjectEntityEndpoints.cs`
  calls all of these (lines 130, 157, 225, 249, 384, 439).
- Image field uploads: `EntityFieldImageEndpoints.cs` under
  `/api/universes/{universeId}/entities/{entityId}/field-images/{fieldId}`; it resolves project entries too
  (`:153-172`).

Frontend (`src/LorEvolve.Web/src`):

| Concern | Lore | Project |
| --- | --- | --- |
| Type list and editor | `pages/UniverseTypes.tsx` (912 lines), `components/TypeDialog.tsx`, `components/TypeFields.tsx` (1142 lines), `components/TypeGroupsPanel.tsx`, `components/FieldSectionsDialog.tsx` | `components/ProjectSchema.tsx` (576 lines), reuses `TypeDialog`, `TypeIcon`, `Field`, `lore/typeTree.ts`; own field editor (does not use `TypeFields`) |
| Value inputs | `components/FieldInputs.tsx`, `components/FieldImageInput.tsx`, `components/EntityImageField.tsx` (portrait) | `components/ProjectEntries.tsx` (712 lines): own inline form, reuses `FieldImageInput`, `lore/images.ts` `setFieldImage`, `EntityCardBody` |
| Value display | `pages/EntityPage.tsx` | `components/ProjectEntries.tsx` cards |
| Host | route `types` in `App.tsx:433` | `components/ProjectEntitiesView.tsx`, mounted in `pages/ProjectPage.tsx:379` |
| API client | `lore/api.ts`, `lore/types.ts` | `projectEntities/api.ts`, `projectEntities/types.ts` |

Shared frontend helpers: `lore/typeTree.ts` (`buildTypeTree`, `typePathLabel`), `lore/fieldInheritance.ts`,
`lore/fieldSections.ts`, `lore/typeIcons.ts`, `components/TypeIcon.tsx`, `components/Field.tsx`,
`components/ActionMenu.tsx`, `components/EmptyState.tsx`, `components/LoreCatalog.tsx`.

## 4. Routes and tools

API, lore (`/api/universes/{universeId}`):

- `entity-types`: list, create, update, delete, `move`, `reorder`, `fields` CRUD, `fields/{id}/archive|restore`,
  `field-layout` (`EntityTypeEndpoints.cs:107-123`).
- `entity-type-groups`: list, create, `order`, rename, delete, `family-tree` (`EntityTypeGroupEndpoints.cs:33-42`).
- `entities`: list, create, `bulk`, `bulk-trash`, get, update, delete (`EntityEndpoints.cs:99-109`).
- `entities/{id}/image`: portrait upload, `thumbnail`, remove, reads (`EntityImageEndpoints.cs:68-98`).

API, project (`/api/projects/{projectId}`):

- `entity-types`: list, create, update, delete, `fields` CRUD (`ProjectEntityTypeEndpoints.cs:47-58`). No move,
  reorder, archive, sections or layout routes.
- `template`: GET the kind's starter, POST to apply it (`:60-68`, handlers `:722`, `:750`).
- `entities`: list (`typeId`, `skip`, `take`, `recent`), create, get, update, delete, `revisions`
  (`ProjectEntityEndpoints.cs:40-49`).

Web routes (`App.tsx`): universe `types` (`:433`, `UniverseTypes`), universe `game-entities` (`:334`, a
`ProjectsPage` filtered to `ProjectKind.Game`, a list of games, not of entities), `projects/:projectId/*` (`:341`,
`ProjectPage` with the entities view).

MCP (read-only, `src/LorEvolve.Api/Features/Mcp/LorEvolveMcpProjectEntityTools.cs`): project types (`:56`,
`get_project_schema`), list entries (`:127`), get entry (`:205`), structure (`:278`), script (`:358`). Lore types
reach MCP through the lore entry and overview tools. AI proposals can stage project entries and schema changes
(`Features/AiChanges/AiChangeCatalog.cs`, migrations `AllowProjectEntryProposals`, `AllowProjectSchemaProposals`).

## 5. Shared vs specialized, and domain boundaries

Shared: tables, field kinds, validation, value preparation, field image storage, revisions, the type tree helper,
type dialog and icons.

Lore only: type groups, family-tree eligibility, semantics (birth/death/age), field archive and sections, layout
versioning, portrait image (`EntityImageEndpoints.cs:148` reads `db.Entities` without `IgnoreQueryFilters`, so a
project entry has no portrait route), canon status, publishing (`Visibility`, `PublicSlug`), tags, aliases.

Project only: `CanonEntityId` link to a lore entry, starter templates, project access via `ProjectAccess`.

Boundary rule: a project entry is never part of lore. Its `CanonStatus` is always written as `Draft` and never read
back (`ProjectEntityEndpoints.cs:529-536`). Lore and Game stay separate models over shared storage; the issue
decision "LoreEntity and GameEntity models remain distinct" holds at the scope level, not at the table level.

Lore Systems vs Game Systems: `src/LorEvolve.Api/Features/Systems/` holds world-logic systems, rules and findings
for a universe (ADR 0072). It has no project scope. There is no Game Systems feature in the code today.

## 6. Data migration and compatibility risks

- **Query filter is the only lore/project wall.** Any new row in `EntityTypes` with `ProjectId == null` is lore and
  shows up in about thirty reads across twelve features (comment at `LoreModel.cs:84-97`), backups, AI proposals and
  MCP. Storing templates there would leak them unless every filter and read changed.
- **SQLite rebuilds drop triggers.** `EntityTypes`, `EntityFieldDefinitions`, `EntityFieldSections`, `Entities` and
  group members carry triggers (`EntityTypes_KeepsChildren_Delete`, `EntityTypes_ParentInUniverse_*`,
  `EntityFieldDefinitions_SectionOfType_*`, `EntityFieldDefinitions_TargetGroup_*`, `Entities_CanonLinkKeepsEntry_Delete`,
  `EntitySearchIndex_EntityDeleted`). Any migration that rebuilds these tables (new FK, changed column) must recreate
  them. This is why `ParentId` and `CanonEntityId` are not FKs. Prefer new tables over altered ones.
- **Backup format.** `UniverseBackup.CurrentVersion = 48` (`Features/Export/UniverseBackup.cs:348`).
  `BackupEntityType` carries `ProjectId` (`:598-611`), `BackupProjectEntity` (`:993`) carries field images since
  v48. New persisted data needs a version bump, builder (`UniverseBackupBuilder.cs`), validation
  (`Features/Restore/BackupValidation.cs`) and normalization (`Features/Restore/BackupNormalization.cs`).
- **Existing data.** Project types written from `ProjectTemplates.cs` carry no record of their origin (by design,
  `ProjectTemplates.cs:9-12`). A future `SourceTemplateId` would be null for all existing rows.
- `EntityReference` fields on a project type target types of the same project; a template outside any project
  cannot hold such a target, so references need a rule when copying (see #283 below).

## 7. Recommendations for #280 to #287

**#280 one Types destination.** Keep `pages/UniverseTypes.tsx` as the destination and add a context switch: Lore,
or Gaming with a game selector (games from the existing projects list filtered to `ProjectKind.Game`). The Gaming
context mounts the existing `ProjectSchema.tsx` for the chosen project. No API change. Leave the project page entry
point working.

**#281 template persistence: new table pair, not `EntityTypes`.** Add `TypeTemplates` (`Id`, `UniverseId`, `Name`,
`Description`, `Icon`, `AccentColor`, `CreatedAt`, `UpdatedAt`) and `TypeTemplateFields` (`Id`, `TemplateId`,
`Name`, `Kind`, `IsRequired`, `DisplayOrder`, `ImageShape`, `Options` as an ordered child table
`TypeTemplateFieldOptions` or a JSON list). Reasons from the code:
- reusing `EntityTypes` with a discriminator touches the query filter at `LoreConfiguration.cs:44` and every lore
  read, backup and AI proposal path; a new table touches none of them;
- no FK from project types to templates, so deleting or editing a template cannot cascade into game types;
- new tables need no rebuild of triggered tables;
- the shape mirrors `ProjectTemplates.StarterType` / `StarterField`, which the apply path already consumes.
Supported kinds: all except `EntityReference` (no target outside a project) and no `Semantic`. Validate with the
existing `LoreValidation` helpers and the project limits (`MaxFieldsPerType`, `MaxOptionsPerField`). Routes under
`/api/universes/{universeId}/type-templates`, editor-only access through the universe access check. Include the
tables in the backup (bump to 49). Single-level templates (no nesting) for now.

**#282 template management UI.** A third context in the Types destination, "Templates", reusing `TypeDialog` and
the project field editor pattern in `ProjectSchema.tsx`. Follow `docs/design/ui-components.md`.

**#283 create a game type from a template.** One POST on the project types route (for example
`POST /api/projects/{projectId}/entity-types/from-template/{templateId}`) that copies the template into ordinary
`EntityTypes` / `EntityFieldDefinitions` / `EntityFieldOptions` rows in one transaction, the way `ApplyTemplateAsync`
(`ProjectEntityTypeEndpoints.cs:750`) does for starters. Optional `SourceTemplateId` on `EntityTypes` is a nullable
column add (no rebuild, no FK, informational only); it may be skipped entirely since no acceptance criterion reads
it. Check the same-universe rule and the 200-type limit.

**#284 game-scoped GameEntity directory.** The current `game-entities` route lists games, not entities. Build the
directory on `GET /api/projects/{projectId}/entities?typeId=` and `ProjectEntitiesView` / `LoreCatalog`, with the
type tree from `lore/typeTree.ts`.

**#285 list search, sort, pagination.** Today: `skip` / `take` paging and two sorts (name, or `recent` =
`UpdatedAt` desc), ids as tie-break (`ProjectEntityEndpoints.cs:55-93`). There is no search parameter. Add a `q`
name filter server-side. Available sort columns: `Name`, `UpdatedAt`, `CreatedAt`. Status fields: `CanonStatus`
exists but is always `Draft` for project entries, `IsArchived` and `DeletedAt` exist; there is no meaningful
GameEntity status to sort by.

**#286 details page with description and image.** Description maps to `LoreEntity.Summary` (already saved by
project update). There is no portrait for project entries: either open `EntityImageEndpoints.cs` to project entries
(it reads `db.Entities` at `:148` without `IgnoreQueryFilters`) or add a project route that reuses its storage.
Opening the existing route with the project check is the smaller change. Read the entry with
`GET /api/projects/{projectId}/entities/{entityId}` (`LoadDetailAsync`).

**#287 dynamic fields on details.** Reuse the rendering and the editor already in `ProjectEntries.tsx`, and
`FieldImageInput` for image fields. #222 ("An entry's fields are readable on a screen of its own") is open and
lore-side; whatever field-reading view it ships should be shared so #287 does not fork a second one.

## 8. Unresolved

- Whether `EntityImageEndpoints` refuses project entries by intent or by omission is not stated in the code.
- How lore types reach MCP in detail was not traced tool by tool.
- #222 scope was read by title only.
