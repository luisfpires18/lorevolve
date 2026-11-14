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

## The conflict, measured rather than assumed

The clean domain model is one type table whose scope is either a universe or a project: make `UniverseId` nullable,
add a nullable `ProjectId`, and require exactly one of them. What that costs in SQLite was measured rather than
guessed, by making the column nullable, generating the migration, and reading the SQL it produces. The probe was then
removed and the model restored; nothing of it is in this PR.

**Verified, by generating and reading the migration SQL:**

1. **The C# cost is almost nothing.** Making `EntityType.UniverseId` nullable breaks exactly **one** call site in the
   whole API, `Features/Lore/EntityTypeEndpoints.cs:2006`, where a type's universe is read to find its parents.
2. **The migration is a full table rebuild.** `dotnet ef migrations add` emits two `AlterColumn` operations, which the
   SQLite provider turns into this when applied:

   ```sql
   CREATE TABLE "ef_temp_EntityTypes" ( ... );
   INSERT INTO "ef_temp_EntityTypes" ("Id", "AccentColor", ... "UniverseId", "UpdatedAt") SELECT ... FROM "EntityTypes";
   DROP TABLE "EntityTypes";
   ALTER TABLE "ef_temp_EntityTypes" RENAME TO "EntityTypes";
   ```

3. **The rebuild silently loses the three hierarchy triggers.** The word "trigger" does not appear anywhere in the
   generated SQL. SQLite drops a table's triggers with the table, so `EntityTypes_ParentInUniverse_Insert`,
   `EntityTypes_ParentInUniverse_Update` and `EntityTypes_KeepsChildren_Delete` are dropped by `DROP TABLE` and never
   recreated. The database-level guarantee that a parent type is in the same universe as its child, which
   `AddEntityTypeHierarchy` put in the database deliberately rather than only in C#, would be gone with no error and
   no failing request to say so.

**Anticipated, not verified:** that this repository's migration tests would fail on it. They compare the whole
schema, every index and trigger, and every table's row counts across a rollback and a roll-forward, so a rebuild that
drops three triggers is the kind of thing they are built to notice, and `LaterSchema` exists precisely because such
comparisons are sensitive to schema changes. But I did not run them against the probe, so this is a reasonable
expectation rather than a measurement, and the plan does not rest on it.

**What actually makes this the owner's decision** is point 3, not the test suite. The rebuild is survivable: the
migration can recreate the triggers by hand, and a test can be written to prove they came back. But that turns a
schema change into a careful, hand-written migration over the lore schema's central table, with five foreign keys
pointing at it, in service of a feature that adds nothing to lore. Whether that is worth doing is a judgement about
risk appetite on an alpha product with real author data, which is the owner's and not an implementer's.

## Option A: one table, scope made optional

Make `EntityTypes.UniverseId` nullable, add `ProjectId`, add a check that exactly one is set, and teach the three
triggers both scopes.

- **For:** one type table, one field table, one inheritance implementation, literally no duplication. Every later M2
  child inherits the engine for free. `TargetEntityTypeId`, groups and sections keep working unchanged.
- **Against:** the rebuild above, over the lore schema's central table with five foreign keys pointing at it, and the
  three hierarchy triggers must be recreated by hand in the migration or they are lost silently. The migration
  touches every author's existing lore schema to deliver a feature that changes nothing about lore, and a rollback
  after release cannot be trusted, which is the risk ADR 0018 already flags for SQLite.
- **Cost:** the hand-written migration, its trigger restoration, a test proving the triggers came back, and whatever
  the existing migration tests need, all before a single project entity exists. The C# change itself is one line.

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
children are built on the other shape. It should then be its own issue with its own migration plan, whose first
requirement is recreating the three triggers and a test that fails when they are missing, because the measurement
above shows that losing them is the default behaviour rather than an unlikely accident.

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
