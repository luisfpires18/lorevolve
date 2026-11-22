using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// "Import lore entry" on a project entry: the values arrive as the project's own, and nothing the project does to them
/// can reach the lore. Written against the leak the feature exists to prevent, so the lore is read back after the
/// project's copy is edited.
/// </summary>
public sealed class ProjectEntityImportTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Importing_a_lore_entry_copies_its_values_and_links_and_editing_them_leaves_the_lore_alone()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "importlore");
        var u = universe.Id;

        // The lore: a Rune type with a Power, and a Hero type with a title, a rank and a base rune.
        var loreRune = await LoreType(client, u, "Rune");
        var power = await LoreField(client, u, loreRune.Id, new("Power", EntityFieldKind.Number, false, null, null, null));
        var loreHero = await LoreType(client, u, "Hero");
        var title = await LoreField(client, u, loreHero.Id, new("Title", EntityFieldKind.ShortText, false, null, null, null));
        var rank = await LoreField(client, u, loreHero.Id, new("Rank", EntityFieldKind.Select, false, null, null, ["Novice", "Master"]));
        var baseRune = await LoreField(
            client, u, loreHero.Id, new("Base rune", EntityFieldKind.EntityReference, false, null, null, null, TargetEntityTypeId: loreRune.Id));
        var secret = await LoreField(client, u, loreHero.Id, new("Only in lore", EntityFieldKind.ShortText, false, null, null, null));

        var ember = await LoreEntry(client, u, loreRune.Id, "Ember", [Number(power.Id, 3)]);
        var aria = await LoreEntry(
            client,
            u,
            loreHero.Id,
            "Aria",
            [
                Text(title.Id, "Wanderer"),
                new(rank.Id, null, null, null, null, [rank.Options.First(option => option.Value == "Master").Id], null),
                new(baseRune.Id, null, null, null, null, null, ember.Id),
                Text(secret.Id, "kept in the lore"),
            ]);

        // The game: its own types, with the same field names.
        var project = await ProjectEntityTests.NewProject(client, u, "Hollow Season");
        var gameRune = await ProjectEntityTests.NewType(client, project.Id, "Rune");
        var gamePower = await GameField(client, project.Id, gameRune.Id, new("Power", EntityFieldKind.Number));
        var gameHero = await ProjectEntityTests.NewType(client, project.Id, "Hero");
        var gameTitle = await GameField(client, project.Id, gameHero.Id, new("title", EntityFieldKind.ShortText));
        var gameRank = await GameField(client, project.Id, gameHero.Id, new("Rank", EntityFieldKind.Select, null, ["Novice", "Master"]));
        var gameBaseRune = await GameField(client, project.Id, gameHero.Id, new("Base rune", EntityFieldKind.EntityReference));
        var entry = await ProjectEntityTests.NewEntry(client, project.Id, gameHero.Id, "Aria in the game");

        var response = await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entities/{entry.Id}/import-lore", new ImportLoreRequest(aria.Id, entry.Version));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = (await response.Content.ReadFromJsonAsync<ImportLoreResult>())!;

        Assert.Equal(["Base rune", "Rank", "title"], result.Imported.Order());
        Assert.Equal(["Ember"], result.Copied);
        Assert.Equal(["Only in lore"], result.Skipped);
        Assert.Equal(aria.Id, result.Entity!.CanonEntityId);
        Assert.Equal(entry.Version + 1, result.Entity.Version);

        Assert.Equal("Wanderer", Value(result.Entity, gameTitle).Text);
        Assert.Equal(["Master"], Value(result.Entity, gameRank).OptionValues);

        // The rune is the project's own entry, made as a copy that points back at Ember, with its power.
        var copyId = Value(result.Entity, gameBaseRune).ReferencedEntityId!.Value;
        Assert.NotEqual(ember.Id, copyId);
        var copy = (await client.GetFromJsonAsync<EntityDetail>($"/api/projects/{project.Id}/entities/{copyId}"))!;
        Assert.Equal("Ember", copy.Name);
        Assert.Equal(ember.Id, copy.CanonEntityId);
        Assert.Equal(3, Value(copy, gamePower).Number);

        // Editing the game's rune does not reach the lore's.
        var edit = await client.PutAsJsonAsync(
            $"/api/projects/{project.Id}/entities/{copyId}",
            new ProjectEntityRequest(
                gameRune.Id, "Ember (game)", null, ember.Id, [new(gamePower.Id, null, 9, null, null, null, null)], copy.Version));
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);

        var loreAfter = (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{ember.Id}"))!;
        Assert.Equal("Ember", loreAfter.Name);
        Assert.Equal(3, loreAfter.Fields.Single(field => field.FieldDefinitionId == power.Id).Number);

        // A second import reuses the copy rather than making another.
        var again = await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entities/{entry.Id}/import-lore", new ImportLoreRequest(aria.Id, result.Entity.Version));
        var second = (await again.Content.ReadFromJsonAsync<ImportLoreResult>())!;
        Assert.Empty(second.Copied);
        Assert.Equal(copyId, Value(second.Entity!, gameBaseRune).ReferencedEntityId);
    }

    [Fact]
    public async Task A_stale_version_and_a_lore_entry_from_elsewhere_are_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "importrefuse");
        var project = await ProjectEntityTests.NewProject(client, universe.Id, "Hollow Season");
        var type = await ProjectEntityTests.NewType(client, project.Id, "Hero");
        var entry = await ProjectEntityTests.NewEntry(client, project.Id, type.Id, "Aria in the game");
        var lore = await CreateEntity(client, universe.Id, "Aria");

        var stale = await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entities/{entry.Id}/import-lore", new ImportLoreRequest(lore, entry.Version + 5));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        // Another project entry is not a lore entry, so it cannot be a source.
        var sibling = await ProjectEntityTests.NewEntry(client, project.Id, type.Id, "Another");
        var notLore = await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entities/{entry.Id}/import-lore", new ImportLoreRequest(sibling.Id, entry.Version));
        Assert.Equal(HttpStatusCode.NotFound, notLore.StatusCode);
    }

    private static FieldValueResponse Value(EntityDetail entry, FieldValueRef field) =>
        entry.Fields.Single(each => each.FieldDefinitionId == field.Id);

    private static FieldValueInput Text(Guid fieldId, string text) => new(fieldId, text, null, null, null, null, null);

    private static FieldValueInput Number(Guid fieldId, double number) => new(fieldId, null, number, null, null, null, null);

    private static async Task<EntityTypeResponse> LoreType(HttpClient client, Guid universeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types", new EntityTypeRequest(name, null, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
    }

    private static async Task<FieldValueRef> LoreField(
        HttpClient client, Guid universeId, Guid typeId, FieldDefinitionRequest request)
    {
        var response = await client.PostAsJsonAsync($"/api/universes/{universeId}/entity-types/{typeId}/fields", request);
        response.EnsureSuccessStatusCode();
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        var field = types.Single(type => type.Id == typeId).Fields.Single(each => each.Name == request.Name);
        return new FieldValueRef(field.Id, field.Options);
    }

    private static async Task<FieldValueRef> GameField(
        HttpClient client, Guid projectId, Guid typeId, ProjectEntityFieldRequest request)
    {
        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/entity-types/{typeId}/fields", request);
        response.EnsureSuccessStatusCode();
        var type = (await response.Content.ReadFromJsonAsync<ProjectEntityTypeResponse>())!;
        var field = type.Fields.Single(each => string.Equals(each.Name, request.Name, StringComparison.OrdinalIgnoreCase));
        return new FieldValueRef(field.Id, field.Options.Select(option => new FieldOptionResponse(option.Id, option.Value, option.DisplayOrder)).ToList());
    }

    private static async Task<EntityDetail> LoreEntry(
        HttpClient client, Guid universeId, Guid typeId, string name, IReadOnlyList<FieldValueInput> fields)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities", new EntityRequest(typeId, name, null, CanonStatus.Canon, null, null, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    /// <summary>A field's id and options, whichever side of the API made it.</summary>
    private sealed record FieldValueRef(Guid Id, IReadOnlyList<FieldOptionResponse> Options);
}
