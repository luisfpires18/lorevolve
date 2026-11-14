using LorEvolve.Api.Features.Lore;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Entity types scoped to a project rather than to a universe's lore (#143).
///
/// <para>These are written against the two things that would be silently wrong rather than loudly broken. **Isolation:**
/// a project's type must not appear in anything that reads the lore, and there are thirty such reads, so the guarantee
/// is a query filter and this asserts the filter is really there. **Uniqueness:** the obvious single index over
/// <c>(UniverseId, ProjectId, Name)</c> would have let two lore types share a name, because a nullable column makes
/// NULLs distinct, and default seeding depends on that uniqueness, so the symptom would have been duplicated starter
/// types rather than an error.</para>
///
/// <para>Project types have no endpoints yet; that is #144. So these write through the DbContext, which is also the
/// only way to prove the database itself holds the line rather than the API.</para>
/// </summary>
public sealed class ProjectScopedEntityTypeTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    /// <summary>A project's type is invisible to every read that does not ask to see past the filter.</summary>
    [Fact]
    public async Task A_project_s_type_is_not_in_the_universe_s_lore()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "scopedlore");
        var projectId = Guid.NewGuid();

        await WithDb(_factory, async db =>
        {
            db.EntityTypes.Add(Type(universe.Id, "Weapon", projectId));
            await db.SaveChangesAsync();
        });

        // The filter hides it from the ordinary read, which is what every lore screen, export and proposal uses.
        await WithDb(_factory, async db =>
        {
            Assert.Empty(await db.EntityTypes.Where(type => type.UniverseId == universe.Id && type.Name == "Weapon").ToListAsync());
            Assert.Equal(
                1,
                await db.EntityTypes.IgnoreQueryFilters()
                    .CountAsync(type => type.UniverseId == universe.Id && type.Name == "Weapon"));
        });

        // And from the universe's own types endpoint, which is the one an author sees.
        var listed = await client.GetStringAsync($"/api/universes/{universe.Id}/entity-types");
        Assert.DoesNotContain("Weapon", listed, StringComparison.Ordinal);
    }

    /// <summary>
    /// The trap. Two projects of one universe may each have a type of the same name; two lore types may not. A single
    /// unique index over the nullable column would have allowed the second as well.
    /// </summary>
    [Fact]
    public async Task Two_projects_may_share_a_type_name_and_two_lore_types_may_not()
    {
        var (_, universe) = await SignedInWithUniverse(_factory, "scopeduniq");
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();

        await WithDb(_factory, async db =>
        {
            db.EntityTypes.Add(Type(universe.Id, "Weapon", first));
            db.EntityTypes.Add(Type(universe.Id, "Weapon", second));
            await db.SaveChangesAsync();
        });

        await WithDb(_factory, async db =>
            Assert.Equal(2, await db.EntityTypes.IgnoreQueryFilters().CountAsync(type => type.Name == "Weapon" && type.ProjectId != null)));

        // One project cannot have the same name twice.
        await WithDb(_factory, async db =>
        {
            db.EntityTypes.Add(Type(universe.Id, "Weapon", first));
            await Assert.ThrowsAnyAsync<DbUpdateException>(() => db.SaveChangesAsync());
        });

        // And the lore's own uniqueness is exactly as strict as it was: the universe already has a Character type from
        // seeding, so a second one is refused.
        await WithDb(_factory, async db =>
        {
            var existing = await db.EntityTypes.AsNoTracking().FirstAsync(type => type.UniverseId == universe.Id);
            db.EntityTypes.Add(Type(universe.Id, existing.Name, null));
            await Assert.ThrowsAnyAsync<DbUpdateException>(() => db.SaveChangesAsync());
        });
    }

    /// <summary>
    /// The database refuses a parent from another scope, not only the API. A project's type cannot nest under a lore
    /// type, nor under a type of a different project, and the triggers say so.
    /// </summary>
    [Fact]
    public async Task A_type_s_parent_must_be_in_the_same_scope()
    {
        var (_, universe) = await SignedInWithUniverse(_factory, "scopedparent");
        var projectId = Guid.NewGuid();
        var other = Guid.NewGuid();
        Guid loreParent = default;
        Guid projectParent = default;

        await WithDb(_factory, async db =>
        {
            var lore = Type(universe.Id, "Lore root", null);
            var project = Type(universe.Id, "Project root", projectId);
            db.EntityTypes.AddRange(lore, project);
            await db.SaveChangesAsync();
            loreParent = lore.Id;
            projectParent = project.Id;
        });

        // A project's type under a lore type: refused by the trigger.
        await WithDb(_factory, async db =>
        {
            var child = Type(universe.Id, "Across scopes", projectId);
            child.ParentId = loreParent;
            db.EntityTypes.Add(child);
            var thrown = await Assert.ThrowsAnyAsync<DbUpdateException>(() => db.SaveChangesAsync());
            Assert.Contains("same universe and project", thrown.ToString(), StringComparison.Ordinal);
        });

        // A lore type under a project's type: refused the same way, in the other direction.
        await WithDb(_factory, async db =>
        {
            var child = Type(universe.Id, "Lore under a project", null);
            child.ParentId = projectParent;
            db.EntityTypes.Add(child);
            await Assert.ThrowsAnyAsync<DbUpdateException>(() => db.SaveChangesAsync());
        });

        // Another project's type under this project's type: also refused.
        await WithDb(_factory, async db =>
        {
            var child = Type(universe.Id, "Another project's", other);
            child.ParentId = projectParent;
            db.EntityTypes.Add(child);
            await Assert.ThrowsAnyAsync<DbUpdateException>(() => db.SaveChangesAsync());
        });

        // Within one project it is allowed, which is what makes nesting usable at all.
        await WithDb(_factory, async db =>
        {
            var child = Type(universe.Id, "Inside the project", projectId);
            child.ParentId = projectParent;
            db.EntityTypes.Add(child);
            await db.SaveChangesAsync();
        });

        await WithDb(_factory, async db =>
            Assert.Equal(
                projectParent,
                await db.EntityTypes.IgnoreQueryFilters()
                    .Where(type => type.Name == "Inside the project")
                    .Select(type => type.ParentId)
                    .SingleAsync()));
    }

    /// <summary>
    /// A field belongs to its type, and nothing about that changed: one field table, one definition, and a project's
    /// type inherits from its own parent exactly as a lore type does.
    /// </summary>
    [Fact]
    public async Task A_project_type_inherits_its_parent_s_fields_with_no_second_definition()
    {
        var (_, universe) = await SignedInWithUniverse(_factory, "scopedfields");
        var projectId = Guid.NewGuid();
        Guid parentId = default;
        Guid childId = default;

        await WithDb(_factory, async db =>
        {
            var parent = Type(universe.Id, "Weapon", projectId);
            db.EntityTypes.Add(parent);
            await db.SaveChangesAsync();
            parentId = parent.Id;

            db.EntityFieldDefinitions.Add(new EntityFieldDefinition
            {
                Id = Guid.NewGuid(),
                EntityTypeId = parentId,
                Name = "Damage",
                Kind = EntityFieldKind.Number,
                DisplayOrder = 0,
            });

            var child = Type(universe.Id, "Sword", projectId);
            child.ParentId = parentId;
            db.EntityTypes.Add(child);
            await db.SaveChangesAsync();
            childId = child.Id;
        });

        await WithDb(_factory, async db =>
        {
            // The field is defined once, on the parent, and the child has none of its own.
            Assert.Equal(1, await db.EntityFieldDefinitions.CountAsync(field => field.EntityTypeId == parentId));
            Assert.Equal(0, await db.EntityFieldDefinitions.CountAsync(field => field.EntityTypeId == childId));

            // Inheritance is resolved from the lineage, by the same helper the lore uses, over this scope's types.
            var parentOf = await db.EntityTypes.IgnoreQueryFilters()
                .Where(type => type.UniverseId == universe.Id && type.ProjectId == projectId)
                .ToDictionaryAsync(type => type.Id, type => type.ParentId);

            Assert.Contains(parentId, EntityTypeHierarchy.Lineage(parentOf, childId));
        });
    }

    /// <summary>
    /// A universe backup holds the lore's types and not a project's, and that is deliberate rather than incidental.
    ///
    /// <para>Carrying a project's types would need the projects themselves in the archive, and a universe backup does
    /// not hold projects: #138 left <c>CreativeProjects</c> out when a project was account-owned and outlived its
    /// universe. #171 ended that, so a universe now owns its projects and deletes them with it, which means a backup
    /// will have to learn about them. Until it does, a project's types are absent rather than restored into the wrong
    /// scope: the filter sees to that, and this test says so out loud so the absence is a decision and not a
    /// surprise.</para>
    ///
    /// <para><b>This must be settled before #144 can create project types</b>, or a backup silently drops an author's
    /// work. It is recorded on #143 and #144 rather than left here.</para>
    /// </summary>
    [Fact]
    public async Task A_universe_backup_holds_the_lore_s_types_and_not_a_project_s()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "scopedbackup");
        var projectId = Guid.NewGuid();

        await WithDb(_factory, async db =>
        {
            db.EntityTypes.Add(Type(universe.Id, "Vehicle", projectId));
            await db.SaveChangesAsync();
        });

        var types = (await Backup(client, universe.Id)).Payload.EntityTypes;

        Assert.DoesNotContain(types, type => type.Name == "Vehicle");
        Assert.NotEmpty(types);
    }

    private static EntityType Type(Guid universeId, string name, Guid? projectId) => new()
    {
        Id = Guid.NewGuid(),
        UniverseId = universeId,
        ProjectId = projectId,
        Name = name,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };
}
