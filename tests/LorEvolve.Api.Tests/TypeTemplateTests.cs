using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.TypeTemplates;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A universe's reusable type templates (#281): stored beside the universe, reached only through it, and never touching
/// a project's own types or entries.
/// </summary>
public sealed class TypeTemplateTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_template_is_created_changed_and_deleted_and_every_kind_of_field_is_kept_in_order()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ttcrud");
        var template = await NewTemplate(client, universe.Id, "Unit", "A playable piece.", "#3366aa");

        Assert.Equal("Unit", template.Name);
        Assert.Equal("A playable piece.", template.Description);
        Assert.Empty(template.Fields);

        // One field of every kind a template can hold.
        await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Title", EntityFieldKind.ShortText, IsRequired: true));
        await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Lore", EntityFieldKind.LongText));
        await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Cost", EntityFieldKind.Number));
        await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Flying", EntityFieldKind.Boolean));
        await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Released", EntityFieldKind.Date));
        await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Rarity", EntityFieldKind.Select, Options: ["Rare", "Common", "Epic"]));
        await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Modes", EntityFieldKind.MultiSelect, Options: ["Solo", "Duo"]));
        var withArt = await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Art", EntityFieldKind.Image, ImageShape: FieldImageShape.FourByThree));

        Assert.Equal(
            ["Title", "Lore", "Cost", "Flying", "Released", "Rarity", "Modes", "Art"],
            withArt.Fields.Select(field => field.Name));

        // Read back from a fresh context, not from the response that wrote it.
        await WithDb(async db =>
        {
            var stored = await db.TypeTemplates.AsNoTracking()
                .Include(each => each.Fields).ThenInclude(field => field.Options)
                .SingleAsync(each => each.Id == template.Id);

            Assert.Equal(universe.Id, stored.UniverseId);
            Assert.Equal("#3366aa", stored.AccentColor);
            var fields = stored.Fields.OrderBy(field => field.DisplayOrder).ToList();
            Assert.Equal([0, 1, 2, 3, 4, 5, 6, 7], fields.Select(field => field.DisplayOrder));
            Assert.True(fields[0].IsRequired);
            Assert.Equal(["Rare", "Common", "Epic"], fields[5].Options.OrderBy(option => option.DisplayOrder).Select(option => option.Value));
            Assert.Equal(FieldImageShape.FourByThree, fields[7].ImageShape);
            Assert.Null(fields[0].ImageShape);
        });

        // Changed: the template renamed, a field turned from a list of choices into text, one field removed.
        var renamed = await Send<TypeTemplateResponse>(
            client.PutAsJsonAsync(Path(universe.Id, template.Id), new ProjectEntityTypeRequest("Hero", null, null, null)));
        Assert.Equal("Hero", renamed.Name);

        var rarity = withArt.Fields.Single(field => field.Name == "Rarity");
        var changed = await Send<TypeTemplateResponse>(client.PutAsJsonAsync(
            $"{Path(universe.Id, template.Id)}/fields/{rarity.Id}",
            new ProjectEntityFieldRequest("Tier", EntityFieldKind.ShortText)));
        var tier = changed.Fields.Single(field => field.Id == rarity.Id);
        Assert.Equal(EntityFieldKind.ShortText, tier.Kind);
        Assert.Empty(tier.Options);

        var modes = withArt.Fields.Single(field => field.Name == "Modes");
        var reordered = await Send<TypeTemplateResponse>(client.PutAsJsonAsync(
            $"{Path(universe.Id, template.Id)}/fields/{modes.Id}",
            new ProjectEntityFieldRequest("Modes", EntityFieldKind.MultiSelect, Options: ["Trio", "Solo"])));
        Assert.Equal(["Trio", "Solo"], reordered.Fields.Single(field => field.Id == modes.Id).Options.Select(option => option.Value));

        var lore = withArt.Fields.Single(field => field.Name == "Lore");
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{Path(universe.Id, template.Id)}/fields/{lore.Id}")).StatusCode);

        var read = (await client.GetFromJsonAsync<TypeTemplateResponse>(Path(universe.Id, template.Id)))!;
        Assert.Equal(7, read.Fields.Count);
        Assert.DoesNotContain(read.Fields, field => field.Id == lore.Id);
        Assert.Single((await client.GetFromJsonAsync<List<TypeTemplateResponse>>(Path(universe.Id)))!);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Path(universe.Id, template.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Path(universe.Id, template.Id))).StatusCode);

        await WithDb(async db =>
        {
            Assert.False(await db.TypeTemplates.AnyAsync(each => each.Id == template.Id));
            Assert.False(await db.TypeTemplateFields.AnyAsync(each => each.TemplateId == template.Id));
            Assert.False(await db.TypeTemplateFieldOptions.AnyAsync(each => each.FieldId == modes.Id));
        });
    }

    [Fact]
    public async Task What_a_template_cannot_hold_is_refused_and_names_are_unique_only_within_a_universe()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ttrefuse");
        var (_, other) = await SignedInWithUniverse(_factory, "ttrefuse2");
        var template = await NewTemplate(client, universe.Id, "Item");

        var link = await client.PostAsJsonAsync(
            $"{Path(universe.Id, template.Id)}/fields",
            new ProjectEntityFieldRequest("Owner", EntityFieldKind.EntityReference));
        Assert.Equal(HttpStatusCode.BadRequest, link.StatusCode);
        Assert.Contains("cannot hold a field that links to an entry", await link.Content.ReadAsStringAsync());

        var nested = await client.PostAsJsonAsync(Path(universe.Id), new ProjectEntityTypeRequest("Sword", null, null, null, template.Id));
        Assert.Equal(HttpStatusCode.BadRequest, nested.StatusCode);

        var empty = await client.PostAsJsonAsync(
            $"{Path(universe.Id, template.Id)}/fields",
            new ProjectEntityFieldRequest("Rarity", EntityFieldKind.Select));
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);

        var twice = await client.PostAsJsonAsync(Path(universe.Id), new ProjectEntityTypeRequest("item", null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, twice.StatusCode);

        // Another universe may use the same name. Its owner is a different account, so this goes through the DB.
        await WithDb(async db =>
        {
            db.TypeTemplates.Add(new TypeTemplate { Id = Guid.NewGuid(), UniverseId = other.Id, Name = "Item" });
            await db.SaveChangesAsync();
        });

        var second = await NewTemplate(client, (await CreateUniverse(client, "Second ttrefuse")).Id, "Item");
        Assert.Equal("Item", second.Name);
    }

    [Fact]
    public async Task An_id_from_another_universe_is_not_found_and_only_editors_may_write()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "ttaccess");
        var elsewhere = await CreateUniverse(owner, "Elsewhere ttaccess");
        var template = await NewTemplate(owner, universe.Id, "Map");
        var withField = await AddField(owner, universe.Id, template.Id, new ProjectEntityFieldRequest("Size", EntityFieldKind.Number));
        var field = withField.Fields.Single().Id;

        // The same template id under a universe it does not belong to.
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(Path(elsewhere.Id, template.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await owner.PutAsJsonAsync(Path(elsewhere.Id, template.Id), new ProjectEntityTypeRequest("Stolen", null, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.DeleteAsync(Path(elsewhere.Id, template.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await owner.PostAsJsonAsync($"{Path(elsewhere.Id, template.Id)}/fields", new ProjectEntityFieldRequest("X", EntityFieldKind.Number))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await owner.DeleteAsync($"{Path(elsewhere.Id, template.Id)}/fields/{field}")).StatusCode);
        Assert.Equal("Map", (await owner.GetFromJsonAsync<TypeTemplateResponse>(Path(universe.Id, template.Id)))!.Name);

        // A viewer reads but cannot write; an account with no membership is told nothing exists.
        var viewer = await SignedIn(_factory, "ttaccessviewer");
        await WithDb(async db =>
        {
            var userId = await db.Users.Where(user => user.UserName == "ttaccessviewer").Select(user => user.Id).SingleAsync();
            db.UniverseMemberships.Add(new UniverseMembership
            {
                UniverseId = universe.Id,
                UserId = userId,
                Role = UniverseRole.Viewer,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        });

        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync(Path(universe.Id, template.Id))).StatusCode);
        Assert.Single((await viewer.GetFromJsonAsync<List<TypeTemplateResponse>>(Path(universe.Id)))!);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await viewer.PostAsJsonAsync(Path(universe.Id), new ProjectEntityTypeRequest("Mine", null, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.DeleteAsync(Path(universe.Id, template.Id))).StatusCode);

        var outsider = await SignedIn(_factory, "ttaccessout");
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(Path(universe.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(Path(universe.Id, template.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await outsider.PostAsJsonAsync(Path(universe.Id), new ProjectEntityTypeRequest("Mine", null, null, null))).StatusCode);
    }

    [Fact]
    public async Task A_games_types_and_entries_are_unchanged_by_templates_and_the_universe_takes_them_when_deleted()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ttisolate");
        var project = await Send<ProjectDetail>(client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest("Hollow Season", ProjectKind.Game, ProjectLifecycle.Active, null, null, universe.Id, null)));
        var types = await Send<List<ProjectEntityTypeResponse>>(client.PostAsync($"/api/projects/{project.Id}/template", null));
        var unit = types.First(type => type.Name == "Unit");
        await Send<EntityDetail>(client.PostAsJsonAsync($"/api/projects/{project.Id}/entities", new ProjectEntityRequest(unit.Id, "Scout", null)));

        var before = await Snapshot(client, project.Id);

        var template = await NewTemplate(client, universe.Id, "Unit");
        var field = (await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Speed", EntityFieldKind.Number))).Fields.Single();
        await Send<TypeTemplateResponse>(client.PutAsJsonAsync(Path(universe.Id, template.Id), new ProjectEntityTypeRequest("Unit two", null, null, null)));
        await Send<TypeTemplateResponse>(client.PutAsJsonAsync(
            $"{Path(universe.Id, template.Id)}/fields/{field.Id}",
            new ProjectEntityFieldRequest("Pace", EntityFieldKind.ShortText)));
        Assert.Equal(before, await Snapshot(client, project.Id));

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Path(universe.Id, template.Id))).StatusCode);
        Assert.Equal(before, await Snapshot(client, project.Id));

        // The universe goes, and its templates with it.
        var kept = await NewTemplate(client, universe.Id, "Map");
        await AddField(client, universe.Id, kept.Id, new ProjectEntityFieldRequest("Terrain", EntityFieldKind.Select, Options: ["Sand"]));
        (await client.PostAsync($"/api/universes/{universe.Id}/archive", content: null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{universe.Id}")).StatusCode);

        await WithDb(async db =>
        {
            Assert.False(await db.TypeTemplates.AnyAsync(each => each.UniverseId == universe.Id));
            Assert.False(await db.TypeTemplateFields.AnyAsync(each => each.TemplateId == kept.Id));
        });
    }

    [Fact]
    public async Task A_backup_carries_the_templates_and_a_restore_brings_them_back_with_new_ids()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ttbackup");
        var template = await NewTemplate(client, universe.Id, "Unit", "A piece.", null);
        await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Rarity", EntityFieldKind.Select, true, ["Rare", "Common"]));
        await AddField(client, universe.Id, template.Id, new ProjectEntityFieldRequest("Art", EntityFieldKind.Image, ImageShape: FieldImageShape.Square));

        var archive = await RawArchive(client, universe.Id);
        var carried = Assert.Single(BackupOf(archive).Payload.TypeTemplates!);
        Assert.Equal("Unit", carried.Name);
        Assert.Equal(["Rarity", "Art"], carried.Fields.Select(field => field.Name));

        var restored = await RestoreArchive(client, archive, "Restored ttbackup");
        var back = Assert.Single((await client.GetFromJsonAsync<List<TypeTemplateResponse>>(Path(restored.Id)))!);

        Assert.NotEqual(template.Id, back.Id);
        Assert.Equal("A piece.", back.Description);
        Assert.Equal(["Rarity", "Art"], back.Fields.Select(field => field.Name));
        Assert.True(back.Fields[0].IsRequired);
        Assert.Equal(["Rare", "Common"], back.Fields[0].Options.Select(option => option.Value));
        Assert.Equal(FieldImageShape.Square, back.Fields[1].ImageShape);
    }

    // ---------- helpers ----------

    private static string Path(Guid universeId, Guid? templateId = null) =>
        templateId is { } id ? $"/api/universes/{universeId}/type-templates/{id}" : $"/api/universes/{universeId}/type-templates";

    private static async Task<T> Send<T>(Task<HttpResponseMessage> request)
    {
        var response = await request;
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static Task<TypeTemplateResponse> NewTemplate(
        HttpClient client,
        Guid universeId,
        string name,
        string? description = null,
        string? accent = null) =>
        Send<TypeTemplateResponse>(client.PostAsJsonAsync(Path(universeId), new ProjectEntityTypeRequest(name, description, null, accent)));

    private static Task<TypeTemplateResponse> AddField(HttpClient client, Guid universeId, Guid templateId, ProjectEntityFieldRequest request) =>
        Send<TypeTemplateResponse>(client.PostAsJsonAsync($"{Path(universeId, templateId)}/fields", request));

    /// <summary>A project's types, fields and entries as one comparable string.</summary>
    private static async Task<string> Snapshot(HttpClient client, Guid projectId)
    {
        var types = await client.GetStringAsync($"/api/projects/{projectId}/entity-types");
        var entries = await client.GetStringAsync($"/api/projects/{projectId}/entities");
        return types + entries;
    }

    private async Task WithDb(Func<LorEvolveDbContext, Task> work)
    {
        using var scope = _factory.Services.CreateScope();
        await work(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>());
    }
}
