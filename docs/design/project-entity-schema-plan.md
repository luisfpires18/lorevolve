# Project-scoped entity schema: the plan, and the one decision that is the owner's

Written for Issue #143 (LOREX-009), the foundation of milestone M2 (#134). Its own "Open questions" say to stop for
an explicit decision if common persistence conflicts with a current architecture decision. It does, so this is the
investigation and a recommendation rather than a guess.

## What #143 asks for

Entity type definitions, custom fields, relationships and content scoped to a **project**, reusing the LoreEntity
infrastructure rather than duplicating it, with nested types and inherited fields working for project entities and no
duplicated field definitions. M2's four later children (#144 Game, #145 Series, #146 Film, #147 Comic) are meant to
be four vocabularies on top of one engine, not five implementations.

## What exists today

`EntityType` (`src/LorEvolve.Api/Features/Lore/LoreModel.cs`) is universe-scoped, and the scope is **required**:

```csharp
public Guid UniverseId { get; set; }          // not nullable
public Guid? ParentId { get; set; }           // nested types, ADR 0007 amendment
```

Around it:

- `EntityFieldDefinition.EntityTypeId` is required, so a field belongs to exactly one type.
- Five tables carry a foreign key to `EntityTypes`: `Entities`, `EntityFieldDefinitions` (twice, including
  `TargetEntityTypeId` from ADR 036), `EntityTypeGroupMembers`, `EntityFieldSections`.
- `EntityTypes` carries **three triggers** from `AddEntityTypeHierarchy` (2026-10-01):
  `EntityTypes_ParentInUniverse_Insert`, `EntityTypes_ParentInUniverse_Update`, `EntityTypes_KeepsChildren_Delete`.
  The first two enforce that a parent type is in the same universe, in the database rather than only in C#.

A project, from #138, is account-owned with an **optional** universe, and a standalone project is the ordinary case.

## The conflict

The clean domain model is one type table whose scope is either a universe or a project: make `UniverseId` nullable,
add a nullable `ProjectId`, and require exactly one of them. In SQLite, making an existing column nullable is not an
`ALTER`: EF Core rebuilds the table, which here means dropping and recreating `EntityTypes` with its indexes and its
three triggers while five foreign keys point at it.

That is the operation this repository's migration tests exist to refuse. They compare the whole schema and every
table's row counts across a rollback and a roll-forward, and the rule learned from a smaller version of this change
is recorded in the project's own notes: no column migrations on a table like this, because the rebuild breaks the
rollback tests. #143's constraints also say to keep schema inheritance, backup and MCP boundaries intact, and a
rebuild of the lore schema's central table puts all three at risk for a feature that adds nothing to lore.

So the decision is not "which is tidier" but **which cost the owner prefers**, and it is theirs because it changes a
load-bearing architecture decision either way.

## Option A: one table, scope made optional

Make `EntityTypes.UniverseId` nullable, add `ProjectId`, add a check that exactly one is set, and teach the three
triggers both scopes.

- **For:** one type table, one field table, one inheritance implementation, literally no duplication. Every later M2
  child inherits the engine for free. `TargetEntityTypeId`, groups and sections keep working unchanged.
- **Against:** a rebuild of `EntityTypes` with five dependent foreign keys and three triggers; the rollback tests
  have to be rewritten rather than extended; the migration touches every author's existing lore schema to deliver a
  feature that changes nothing about lore; and a rollback after release cannot be trusted, which is the exact risk
  ADR 0018 already flags for SQLite.
- **Cost:** the migration and its tests are most of the work of #143, before any project entity exists.

## Option B: project types in their own tables, one shared engine (recommended)

Add `ProjectEntityType` and `ProjectEntityFieldDefinition` tables, pure `CREATE TABLE`, and extract the inheritance
and field-resolution logic out of `Features/Lore` into a scope-agnostic engine both sides call.

- **For:** no existing table is touched, so lore, revisions, backups, publication and MCP are untouched by
  construction and the rollback tests extend the way they did for `CreativeProjects` in #138. Project entities can
  belong to a standalone project with no universe, which Option A only reaches by making the universe optional
  anyway. Each later M2 child adds a vocabulary, not an implementation.
- **Against:** two type tables exist, so "no duplicated field definitions" is satisfied at the level that matters
  (one resolution engine, one set of rules) rather than literally (one table). Anything that wants to treat a lore
  type and a project type interchangeably needs the shared abstraction rather than a single foreign key, and
  `TargetEntityTypeId` cannot point across the two without a second nullable column.
- **Cost:** the extraction is real work, but it is work M2 needs regardless, and it carries no migration risk.

## Option C: project types are universe types with a project column

Add a nullable `ProjectId` to `EntityTypes` and leave `UniverseId` required.

- **Rejected.** A standalone project has no universe, so its types would have to borrow one, and a type that belongs
  to a project while claiming a universe will leak into every universe-scoped query that does not know to exclude it.
  That is a correctness problem spread across the whole lore feature, traded for a smaller migration. The cheapest
  schema here buys the most expensive bugs.

## Recommendation

**Option B.** It keeps the lore schema untouched, works for standalone projects, and matches how #138 and #140
already landed: new tables rather than altered ones, and derivation rather than duplication where that was possible.
The literal reading of "no duplicated field definitions" is the one thing it gives up, and one engine with two
backing tables honours the intent, which is that M2 must not become five implementations.

If the owner prefers Option A, it is a coherent choice and the right time for it is **now**, before four more M2
children are built on the other shape. It should then be its own issue with its own migration plan, because
rebuilding `EntityTypes` deserves more than a line in a feature issue.

## What #143 becomes under Option B

1. Extract the field and inheritance resolution in `Features/Lore` into a scope-agnostic engine, with the existing
   lore tests as the proof that lore behaviour did not change.
2. Add `ProjectEntityType` and `ProjectEntityFieldDefinition`, nested types and inherited fields included, plus the
   `LaterSchema` and `BackupInventoryTests` entries every new table needs here.
3. Access: a project's types are reached exactly as the project is (`ProjectAccess`), so a collaborator who may edit
   the linked universe's content may edit its projects' types, and nobody else sees them.
4. Versioned field kinds: store the kind as an int with a version column beside it, so a future kind is additive and
   no stored definition ever carries executable code.
5. Focused tests: inheritance for project types, cross-project and cross-universe isolation, and the existing lore
   suites green unchanged.

Nothing of #143 is implemented in this PR. It is the decision and the plan.
