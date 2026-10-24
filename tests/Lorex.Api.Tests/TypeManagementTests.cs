using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// Managing a universe's types (Product refinement 020): renaming and re-iconing one keeps its identity and everything
/// else it stores; deleting one is refused while any entry uses it, the Trash included, and says so in the author's
/// terms; and a type that is genuinely unused - its entries moved to another type - deletes and stays deleted.
///
/// The reported case: Location, an entry moved to a new Kingdom type, then Location deleted. The delete succeeded, and
/// the very next read of the list seeded a new, empty "Location" back in, because the starter types were filled in by
/// name on every read. Credentials are obviously synthetic.
/// </summary>
public sealed class TypeManagementTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Editing ----------

    [Fact]
    public async Task A_rename_and_a_new_icon_keep_the_type_its_entries_and_everything_else_it_stores()
    {
        var (client, universe) = await SignedInWithUniverse("type-rename");
        var character = await Type(client, universe.Id, "Character");
        var entry = await CreateEntity(client, universe.Id, character.Id, "Aragorn");
        Assert.True(character.FamilyTreeEligible);

        // What the Types screen's editor sends: the name and icon it edits, everything else as it stands.
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{character.Id}",
            new EntityTypeRequest(
                "Person",
                character.Description,
                "crown",
                character.AccentColor,
                character.DisplayOrder,
                character.FamilyTreeEligible));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var renamed = await Type(client, universe.Id, "Person");
        Assert.Equal(character.Id, renamed.Id);
        Assert.Equal("crown", renamed.Icon);
        Assert.Equal(character.Description, renamed.Description);
        Assert.Equal(character.AccentColor, renamed.AccentColor);
        Assert.Equal(character.DisplayOrder, renamed.DisplayOrder);
        Assert.True(renamed.FamilyTreeEligible);
        Assert.Equal(1, renamed.EntityCount);

        // The entry is attached by id, and reads the new name.
        var stored = (await client.GetFromJsonAsync<EntityDetail>(
            $"/api/universes/{universe.Id}/entities/{entry.Id}"))!;
        Assert.Equal(character.Id, stored.EntityTypeId);
        Assert.Equal("Person", stored.EntityTypeName);
        var filtered = await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universe.Id}/entities?entityTypeId={character.Id}");
        Assert.Equal(entry.Id, Assert.Single(filtered!.Items).Id);

        // And a starter type renamed is not seeded back in under its old name.
        var types = await Types(client, universe.Id);
        Assert.DoesNotContain(types, type => type.Name == "Character");
        Assert.Equal(EntityTypeDefaults.Defaults.Count, types.Count);
    }

    [Fact]
    public async Task A_name_another_type_already_has_is_refused_on_the_name()
    {
        var (client, universe) = await SignedInWithUniverse("type-duplicate");
        var location = await Type(client, universe.Id, "Location");

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{location.Id}",
            new EntityTypeRequest("Character", location.Description, location.Icon, location.AccentColor, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!;
        Assert.True(problem.Errors.ContainsKey("name"));
        Assert.Equal("Location", (await Type(client, universe.Id, "Location")).Name);
    }

    [Fact]
    public async Task Every_new_icon_is_accepted_and_an_unknown_one_still_refused()
    {
        var (client, universe) = await SignedInWithUniverse("type-icons");
        var concept = await Type(client, universe.Id, "Concept");

        foreach (var icon in new[] { "tree", "flame", "skull", "scroll", "star", "moon", "globe", "landmark", "house", "swords", "coins", "flask", "wand", "languages" })
        {
            var accepted = await client.PutAsJsonAsync(
                $"/api/universes/{universe.Id}/entity-types/{concept.Id}",
                new EntityTypeRequest("Concept", concept.Description, icon, concept.AccentColor, null));
            Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
            Assert.Equal(icon, (await Type(client, universe.Id, "Concept")).Icon);
        }

        var refused = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{concept.Id}",
            new EntityTypeRequest("Concept", concept.Description, "dragon", concept.AccentColor, null));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
    }

    // ---------- Deleting ----------

    [Fact]
    public async Task Location_emptied_by_moving_its_entry_to_Kingdom_deletes_and_stays_deleted()
    {
        var (client, universe) = await SignedInWithUniverse("type-reported");
        var location = await Type(client, universe.Id, "Location");
        var kingdom = await CreateType(client, universe.Id, "Kingdom");

        // Location has a field, so the move has field values to leave behind if anything did.
        var added = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{location.Id}/fields",
            new FieldDefinitionRequest("Climate", EntityFieldKind.ShortText, false, null, null, null));
        added.EnsureSuccessStatusCode();
        var climate = (await Type(client, universe.Id, "Location")).Fields.Single();

        var gondor = await CreateEntity(
            client, universe.Id, location.Id, "Gondor", [new FieldValueInput(climate.Id, "Temperate", null, null, null, null, null)]);

        // The move, as the entry form sends it: the new type and that type's (empty) field set.
        var moved = await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{gondor.Id}",
            new EntityRequest(kingdom.Id, "Gondor", null, CanonStatus.Idea, [], [], []));
        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);

        // Nothing of Location is left on the entry: its type, and no value for Location's field.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
            Assert.Equal(kingdom.Id, (await db.Entities.SingleAsync(entity => entity.Id == gondor.Id)).EntityTypeId);
            Assert.False(await db.EntityFieldValues.AnyAsync(value => value.FieldDefinitionId == climate.Id));
        }

        Assert.Equal(0, (await Type(client, universe.Id, "Location")).EntityCount);

        var deleted = await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{location.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        // The bug: the next read seeded a new "Location" by name. It must not come back.
        var types = await Types(client, universe.Id);
        Assert.DoesNotContain(types, type => type.Name == "Location");
        Assert.DoesNotContain(types, type => type.Id == location.Id);
        Assert.Equal(EntityTypeDefaults.Defaults.Count, types.Count); // six starters and Kingdom

        // The entry is intact on its new type, and its history still reads the type it was.
        var stored = (await client.GetFromJsonAsync<EntityDetail>(
            $"/api/universes/{universe.Id}/entities/{gondor.Id}"))!;
        Assert.Equal("Kingdom", stored.EntityTypeName);
        var history = await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/universes/{universe.Id}/entities/{gondor.Id}/revisions");
        Assert.Equal(2, history!.Count);
    }

    [Fact]
    public async Task A_type_used_by_a_live_entry_is_refused_with_its_count()
    {
        var (client, universe) = await SignedInWithUniverse("type-live");
        var location = await Type(client, universe.Id, "Location");
        await CreateEntity(client, universe.Id, location.Id, "Rivendell");

        var problem = await Conflict(await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{location.Id}"));

        Assert.Equal(
            "Location can't be deleted because 1 entry still uses it. Move it to another type first.",
            problem.Detail);
        Assert.Equal(EntityTypeEndpoints.TypeInUseCode, problem.Extensions["code"]?.ToString());
        Assert.Contains(await Types(client, universe.Id), type => type.Id == location.Id);
    }

    [Fact]
    public async Task A_type_used_only_by_an_entry_in_the_Trash_is_refused_and_says_the_Trash()
    {
        var (client, universe) = await SignedInWithUniverse("type-trashed");
        var location = await Type(client, universe.Id, "Location");
        var entry = await CreateEntity(client, universe.Id, location.Id, "Moria");
        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{entry.Id}")).EnsureSuccessStatusCode();

        // Out of Lore is not unused: the Trash keeps the entry, and the entry keeps its type.
        var listed = await Type(client, universe.Id, "Location");
        Assert.Equal(1, listed.EntityCount);
        Assert.Equal(1, listed.TrashedEntityCount);

        var problem = await Conflict(await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{location.Id}"));
        Assert.Equal(
            "Location can't be deleted because 1 entry still uses it, and it is in the Trash. "
                + "Restore it from the Trash, then move it to another type.",
            problem.Detail);

        await CreateEntity(client, universe.Id, location.Id, "Lothlorien");
        problem = await Conflict(await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{location.Id}"));
        Assert.Equal(
            "Location can't be deleted because 2 entries still use it, 1 of them in the Trash. "
                + "Move them to another type first; an entry in the Trash has to be restored before it can be moved.",
            problem.Detail);
        Assert.Equal("1", problem.Extensions["liveCount"]?.ToString());
        Assert.Equal("1", problem.Extensions["trashedCount"]?.ToString());
    }

    [Fact]
    public async Task Moving_every_entry_to_the_Trash_does_not_free_a_type_but_moving_them_to_another_type_does()
    {
        var (client, universe) = await SignedInWithUniverse("type-trash-vs-move");
        var location = await Type(client, universe.Id, "Location");
        var kingdom = await CreateType(client, universe.Id, "Kingdom");
        var first = await CreateEntity(client, universe.Id, location.Id, "Rohan");
        var second = await CreateEntity(client, universe.Id, location.Id, "Arnor");

        var trashed = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities/bulk-trash",
            new BulkTrashRequest([first.Id, second.Id]));
        trashed.EnsureSuccessStatusCode();
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{location.Id}")).StatusCode);

        foreach (var entry in new[] { first, second })
        {
            (await client.PostAsync($"/api/universes/{universe.Id}/trash/{entry.Id}/restore", null)).EnsureSuccessStatusCode();
            (await client.PutVersionedAsync(
                $"/api/universes/{universe.Id}/entities/{entry.Id}",
                new EntityRequest(kingdom.Id, entry.Name, null, CanonStatus.Idea, [], [], []))).EnsureSuccessStatusCode();
        }

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{location.Id}")).StatusCode);
    }

    [Fact]
    public async Task The_database_still_refuses_to_orphan_an_entry_from_its_type()
    {
        var (client, universe) = await SignedInWithUniverse("type-fk");
        var location = await Type(client, universe.Id, "Location");
        await CreateEntity(client, universe.Id, location.Id, "Isengard");

        // Past the endpoint's own check, straight at the table: the foreign key is still Restrict.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        db.EntityTypes.Remove(await db.EntityTypes.SingleAsync(type => type.Id == location.Id));
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    // ---------- The starter types: written once, at creation, and never by a read ----------

    [Fact]
    public async Task A_new_universe_is_given_the_starter_types_when_it_is_created()
    {
        var (client, universe) = await SignedInWithUniverse("type-starters");

        // Written by the create itself, before anything has read the list.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
            Assert.Equal(
                EntityTypeDefaults.Defaults.Select(each => each.Name).Order(),
                (await db.EntityTypes.Where(type => type.UniverseId == universe.Id).Select(type => type.Name).ToListAsync()).Order());
        }

        Assert.Equal(EntityTypeDefaults.Defaults.Count, (await Types(client, universe.Id)).Count);
    }

    [Fact]
    public async Task A_deleted_starter_type_is_not_put_back_by_reading_the_list()
    {
        var (client, universe) = await SignedInWithUniverse("type-delete-starter");
        var concept = await Type(client, universe.Id, "Concept");

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{concept.Id}")).EnsureSuccessStatusCode();

        for (var read = 0; read < 3; read++)
        {
            var types = await Types(client, universe.Id);
            Assert.DoesNotContain(types, type => type.Name == "Concept");
            Assert.Equal(EntityTypeDefaults.Defaults.Count - 1, types.Count);
        }
    }

    [Fact]
    public async Task A_universe_whose_author_deleted_every_type_stays_without_types()
    {
        var (client, universe) = await SignedInWithUniverse("type-delete-all");

        foreach (var type in await Types(client, universe.Id))
        {
            (await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{type.Id}")).EnsureSuccessStatusCode();
        }

        // Read, and read again: a list is only read, and nothing comes back.
        Assert.Empty(await Types(client, universe.Id));
        Assert.Empty(await Types(client, universe.Id));
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        Assert.False(await db.EntityTypes.AnyAsync(type => type.UniverseId == universe.Id));
    }

    [Theory]
    [InlineData("Character", true)]
    [InlineData("Location", false)]
    public async Task Editing_a_name_and_icon_keeps_the_stored_family_tree_choice(string starter, bool eligible)
    {
        var (client, universe) = await SignedInWithUniverse($"type-family-{eligible}");
        var type = await Type(client, universe.Id, starter);
        Assert.Equal(eligible, type.FamilyTreeEligible);

        // As the Types screen's editor sends it, which shows no Family Tree choice: the stored value, sent back.
        (await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}",
            new EntityTypeRequest($"{starter} renamed", type.Description, "star", type.AccentColor, type.DisplayOrder, type.FamilyTreeEligible)))
            .EnsureSuccessStatusCode();
        Assert.Equal(eligible, (await Type(client, universe.Id, $"{starter} renamed")).FamilyTreeEligible);

        // And left out altogether, as any other caller may: kept as stored, never reset.
        (await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}",
            new EntityTypeRequest($"{starter} again", type.Description, "moon", type.AccentColor, type.DisplayOrder)))
            .EnsureSuccessStatusCode();
        var stored = await Type(client, universe.Id, $"{starter} again");
        Assert.Equal(eligible, stored.FamilyTreeEligible);
        Assert.Equal("moon", stored.Icon);
    }

    [Fact]
    public async Task Another_owner_cannot_rename_or_delete_a_type()
    {
        var (owner, universe) = await SignedInWithUniverse("type-owner");
        var location = await Type(owner, universe.Id, "Location");
        var intruder = await SignedInClient("user-type-intruder");

        var renamed = await intruder.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{location.Id}",
            new EntityTypeRequest("Mine now", null, null, null, null));
        var deleted = await intruder.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{location.Id}");

        Assert.Equal(HttpStatusCode.NotFound, renamed.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, deleted.StatusCode);
        Assert.Equal("Location", (await Type(owner, universe.Id, "Location")).Name);
    }

    [Fact]
    public void The_backup_format_is_the_nested_types_version()
    {
        // A rename, an icon and the new icon keys are all values of columns a version 18 backup already carried; version 19
        // added only a type's parent (nested types, Product refinement 022). Later versions added a link field's target (20),
        // a moment's stories (21), a custom calendar (22) and type groups (23), which sit beside the types rather than in one.
        Assert.Equal(28, UniverseBackup.CurrentVersion);
    }

    // ---------- Helpers ----------

    private static async Task<ProblemDetails> Conflict(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ProblemDetails>())!;
    }

    private static async Task<List<EntityTypeResponse>> Types(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;

    private static async Task<EntityTypeResponse> Type(HttpClient client, Guid universeId, string name) =>
        (await Types(client, universeId)).Single(type => type.Name == name);

    private static async Task<EntityTypeResponse> CreateType(HttpClient client, Guid universeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types",
            new EntityTypeRequest(name, null, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
    }

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, CanonStatus.Idea, null, null, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest($"World {tag}", null, null));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<UniverseDetail>())!);
    }
}
