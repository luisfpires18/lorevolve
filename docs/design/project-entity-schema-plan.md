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

---

# Verification of the chosen approach (2026-11-14, after #171)

The owner chose the shared-table approach, conditional on five things being verified rather than assumed: query
isolation, unique constraints, permissions, inherited fields and the SQLite migration. This section is that
verification.

**Approval evidence:** the decision and its condition are recorded on Issue #143,
<https://github.com/luisfpires18/lorevolve/issues/143#issuecomment-6881091626>, which also supersedes the earlier
comment there asking the owner to pick Option A or Option B. The answer was neither: it is what this document first
called **Option C and rejected**, and the rejection no longer holds, because its only objection was that a standalone
project would have to borrow a universe, and after #171 there is no standalone project. The earlier options are kept
above as the record of how the decision was reached, not as live alternatives.

**What remains the owner's** is one narrower question, in point 3 below: whether a project's type may nest under a
universe-level lore type. It does not block the implementation.

## The shape

`EntityTypes.UniverseId` stays required. `EntityTypes.ProjectId` is added, nullable. `ProjectId IS NULL` is a
universe-level lore type; `ProjectId IS NOT NULL` is a type scoped to one project inside that same universe.

## 1. The migration: measured, and it needs no table rebuild

Probed by making the change in the model, generating the migration, reading the SQL, then removing the probe. The
whole schema change is:

```sql
ALTER TABLE "EntityTypes" ADD "ProjectId" TEXT NULL;
DROP INDEX "IX_EntityTypes_UniverseId_Name";
CREATE UNIQUE INDEX "IX_EntityTypes_UniverseId_Name" ON "EntityTypes" ("UniverseId", "Name") WHERE "ProjectId" IS NULL;
CREATE UNIQUE INDEX "IX_EntityTypes_ProjectId_Name" ON "EntityTypes" ("ProjectId", "Name") WHERE "ProjectId" IS NOT NULL;
```

`ef_temp` appears **zero** times and there is no `DROP TABLE`. That matters more than convenience: a rebuild would
drop the three hierarchy triggers silently, which is what the measurement earlier in this document found. Adding a
column and swapping indexes keeps them.

Precedent in the codebase for the same reasoning: `ParentId` is deliberately not a foreign key, and
`LoreConfiguration` says why in a comment, that SQLite would add one only by rebuilding the table.

## 2. Unique constraints: the trap that would have broken lore silently

Today: `HasIndex(type => new { type.UniverseId, type.Name }).IsUnique()`. The obvious move is to extend it to
`(UniverseId, ProjectId, Name)`. **That silently stops enforcing uniqueness for lore types**, because SQL treats NULLs
as distinct in a unique index: two universe-level types both named "Weapon" would each have `ProjectId` NULL, the rows
would differ as far as the index is concerned, and both would be accepted. Default type seeding relies on this
uniqueness for idempotence, so the failure would surface as duplicated starter types rather than as an error.

The fix is two partial unique indexes, as generated above: one on `(UniverseId, Name)` filtered to
`ProjectId IS NULL`, one on `(ProjectId, Name)` filtered to `ProjectId IS NOT NULL`. Lore keeps exactly the guarantee
it has, and two projects in one universe may each have a type of the same name.

The other two indexes need the same treatment for the same reason: `(UniverseId, DisplayOrder)` and
`(UniverseId, ParentId)` both scope ordering and hierarchy by universe, so project types would interleave with lore
types in display order unless the scope includes the project.

## 3. The triggers: they enforce the universe and must learn the project

`EntityTypes_ParentInUniverse_Insert` and `_Update` abort unless the parent type is in the same universe:

```sql
WHEN NEW.ParentId IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM EntityTypes AS parent
    WHERE parent.Id = NEW.ParentId AND parent.UniverseId = NEW.UniverseId AND parent.Id <> NEW.Id)
```

As written, a project type could be given a parent that is a lore type of the same universe, or a type in a different
project of it, and the database would allow both. The condition needs the project to match as well. That is
`DROP TRIGGER` plus `CREATE TRIGGER`, which is not a rebuild. `EntityTypes_KeepsChildren_Delete` needs the same.

**One product question falls out of this and is not mine to answer:** should a project's type be allowed to nest under
a universe-level lore type? Allowing it is how a project would reuse the world's taxonomy and inherit its fields;
forbidding it keeps the two scopes cleanly apart. The plan assumes **forbidden** for now, because it is the stricter
option and the one that can be relaxed later without rewriting rows, but it is a decision worth making deliberately.

## 4. Query isolation: seven sites, and the inheritance map

Seven query sites scope entity types by `UniverseId`. Each needs `ProjectId == null` added, or every lore list, picker
and export starts showing a project's types. This is the part most likely to be got wrong by omission, so it wants a
test that asserts a project type never appears in a universe-level listing, rather than only tests that project types
appear where they should.

The inheritance helper is where it matters most. `EntityTypeHierarchy` works on a parent map built by
`ParentsAsync(db, universeId, ...)`; if that map is built per universe rather than per scope, a project's type becomes
a candidate parent for a lore type and vice versa. The map must be built for one scope at a time.

## 5. Permissions and inherited fields

**Permissions need nothing new, and that is worth stating rather than assuming.** A project type lives in the same
universe row as the lore types, and after #171 every project is inside exactly one universe, so the existing
`UniverseAccess` matrix already decides who may read and edit it: reading needs `Read`, which every role has, and
changing needs `EditContent`, which is Owner and Editor. There is no project-level permission concept to add, because
all of a universe's projects share its access.

**Inherited fields need no new mechanism either**, provided point 4 holds. Fields belong to a type through
`EntityFieldDefinition.EntityTypeId`, which is unchanged, and inheritance is resolved from the lineage in the parent
map. So "no duplicated field definitions" is satisfied literally: one field table, one resolution path, one engine.
What it needs is the scope discipline of point 4 and the decision in point 3.

## What #143 is, concretely

1. The column, the two partial unique indexes, and the scope added to the ordering and hierarchy indexes.
2. The three triggers recreated with the project in their condition.
3. `ProjectId == null` on the seven universe-scoped query sites, and the parent map built per scope.
4. Project type endpoints reached through `ProjectAccess`, which already resolves to the universe's matrix.
5. Tests: a project type is invisible to every universe-level listing; two projects in one universe may each have a
   type of the same name; two lore types in one universe still may not; inheritance resolves within a scope and not
   across one; and the migration's rollback restores the single unique index.
6. The `LaterSchema` entries the new indexes need, since a rollback past this migration will drop them.

Nothing here is implemented yet. The architecture is settled and recorded on the issue; the one open question is the
nesting policy in point 3, and the rest of the unknowns above are to be settled while implementing rather than before.
