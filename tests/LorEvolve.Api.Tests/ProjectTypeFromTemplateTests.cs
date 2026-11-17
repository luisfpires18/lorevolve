using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.TypeTemplates;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A game type made from a universe type template (#283): an independent copy of plain rows, with no link back, that
/// only ever inserts.
/// </summary>
public sealed class ProjectTypeFromTemplateTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_game_type_is_created_from_a_template_with_its_fields_and_options()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "tfcopy");
        var game = await NewGame(client, universe.Id, "Hollow Season");
        var other = await NewGame(client, universe.Id, "Other Season");
        var template = await FullTemplate(client, universe.Id, "Unit");

        var copy = await Copy(client, game, template.Id);

        Assert.Equal(Shape(template), Shape(copy));
        Assert.NotEqual(template.Fields[0].Id, copy.Fields[0].Id);
        Assert.Equal(8, copy.Fields.Count);

        // Belongs to the target game only, and a manual type still works beside it.
        Assert.Contains(await Types(client, game), type => type.Id == copy.Id);
        Assert.DoesNotContain(await Types(client, other), type => type.Name == "Unit");
        (await client.PostAsJsonAsync($"/api/projects/{game}/entity-types", new ProjectEntityTypeRequest("Manual", null, null, null))).EnsureSuccessStatusCode();

        // A name chosen by the author replaces the template name.
        var named = await Copy(client, game, template.Id, "Scout");
        Assert.Equal("Scout", named.Name);
    }

    [Fact]
    public async Task Copies_and_template_are_independent_of_each_other_and_of_other_games()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "tfindep");
        var gameA = await NewGame(client, universe.Id, "Game A");
        var gameB = await NewGame(client, universe.Id, "Game B");
        var template = await FullTemplate(client, universe.Id, "Unit");
        var a = await Copy(client, gameA, template.Id);
        var b = await Copy(client, gameB, template.Id);
        Assert.NotEqual(a.Fields[0].Id, b.Fields[0].Id);

        var templateBefore = Shape(await GetTemplate(client, universe.Id, template.Id));
        var bBefore = Shape(b);

        // Change copy A: rename, add a field, delete a field, change options.
        var typeUrl = $"/api/projects/{gameA}/entity-types/{a.Id}";
        (await client.PutAsJsonAsync(typeUrl, new ProjectEntityTypeRequest("Unit renamed", null, null, null))).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync($"{typeUrl}/fields", new ProjectEntityFieldRequest("Extra", EntityFieldKind.Number))).EnsureSuccessStatusCode();
        var rarity = a.Fields.Single(field => field.Name == "Rarity");
        (await client.PutAsJsonAsync($"{typeUrl}/fields/{rarity.Id}", new ProjectEntityFieldRequest("Rarity", EntityFieldKind.Select, Options: ["Only"]))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{typeUrl}/fields/{a.Fields.Single(field => field.Name == "Lore").Id}")).StatusCode);

        Assert.Equal(templateBefore, Shape(await GetTemplate(client, universe.Id, template.Id)));
        Assert.Equal(bBefore, Shape((await Types(client, gameB)).Single(type => type.Id == b.Id)));

        // Change the template: B and the already changed A keep what they have.
        var aAfter = Shape((await Types(client, gameA)).Single(type => type.Id == a.Id));
        var templateUrl = $"/api/universes/{universe.Id}/type-templates/{template.Id}";
        (await client.PutAsJsonAsync(templateUrl, new ProjectEntityTypeRequest("Template renamed", null, null, null))).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync($"{templateUrl}/fields", new ProjectEntityFieldRequest("Late", EntityFieldKind.Boolean))).EnsureSuccessStatusCode();
        var cost = template.Fields.Single(field => field.Name == "Cost");
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{templateUrl}/fields/{cost.Id}")).StatusCode);

        Assert.Equal(bBefore, Shape((await Types(client, gameB)).Single(type => type.Id == b.Id)));
        Assert.Equal(aAfter, Shape((await Types(client, gameA)).Single(type => type.Id == a.Id)));
    }

    [Fact]
    public async Task A_refused_copy_writes_nothing_and_existing_entries_keep_their_values()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "tfrefuse");
        var game = await NewGame(client, universe.Id, "Hollow Season");
        var elsewhere = await CreateUniverse(client, "Elsewhere tfrefuse");

        var existing = await Send<ProjectEntityTypeResponse>(client.PostAsJsonAsync(
            $"/api/projects/{game}/entity-types", new ProjectEntityTypeRequest("Unit", null, null, null)));
        await client.PostAsJsonAsync(
            $"/api/projects/{game}/entity-types/{existing.Id}/fields", new ProjectEntityFieldRequest("Speed", EntityFieldKind.Number));
        var speed = (await Types(client, game)).Single().Fields.Single(field => field.Name == "Speed");
        var entry = await Send<EntityDetail>(client.PostAsJsonAsync(
            $"/api/projects/{game}/entities",
            new ProjectEntityRequest(existing.Id, "Scout", null, Fields: [new FieldValueInput(speed.Id, null, 7, null, null, null, null)])));
        var entryUrl = $"/api/projects/{game}/entities/{entry.Id}";
        var entryBefore = await client.GetStringAsync(entryUrl);
        Assert.Contains("7", entryBefore);
        var before = await Snapshot(client, game);

        var template = await FullTemplate(client, universe.Id, "unit");

        // The name is taken (case-insensitive): the same field error as a manual type, nothing changes.
        var clash = await client.PostAsJsonAsync($"/api/projects/{game}/entity-types/from-template", new ProjectTypeFromTemplateRequest(template.Id, null));
        Assert.Equal(HttpStatusCode.BadRequest, clash.StatusCode);
        Assert.Contains("already has a type", await clash.Content.ReadAsStringAsync());
        Assert.Equal(before, await Snapshot(client, game));
        Assert.Equal(entryBefore, await client.GetStringAsync(entryUrl));

        // A copy under another name only adds; the entry and the older type are untouched.
        await Copy(client, game, template.Id, "Unit two");
        var after = await Types(client, game);
        Assert.Equal(2, after.Count);
        Assert.Equal(1, after.Single(type => type.Id == existing.Id).EntryCount);
        Assert.Equal(["Speed"], after.Single(type => type.Id == existing.Id).Fields.Select(field => field.Name));
        Assert.Equal(entryBefore, await client.GetStringAsync(entryUrl));

        // A template of another universe, or a missing one, is not found.
        var foreign = await Send<TypeTemplateResponse>(client.PostAsJsonAsync(
            $"/api/universes/{elsewhere.Id}/type-templates", new ProjectEntityTypeRequest("Foreign", null, null, null)));
        foreach (var id in new[] { foreign.Id, Guid.NewGuid() })
        {
            var response = await client.PostAsJsonAsync($"/api/projects/{game}/entity-types/from-template", new ProjectTypeFromTemplateRequest(id, "Whatever"));
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        Assert.Equal(2, (await Types(client, game)).Count);

        // A name that breaks the usual rules is a validation error, not a type.
        var tooLong = await client.PostAsJsonAsync($"/api/projects/{game}/entity-types/from-template", new ProjectTypeFromTemplateRequest(template.Id, new string('x', 500)));
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
    }

    [Fact]
    public async Task The_type_limit_and_access_rules_apply()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "tfaccess");
        var game = await NewGame(owner, universe.Id, "Hollow Season");
        var template = await FullTemplate(owner, universe.Id, "Unit");
        var url = $"/api/projects/{game}/entity-types/from-template";
        var request = new ProjectTypeFromTemplateRequest(template.Id, "Copy");

        var viewer = await SignedIn(_factory, "tfaccessviewer");
        await WithDb(_factory, async db =>
        {
            var userId = await db.Users.Where(user => user.UserName == "tfaccessviewer").Select(user => user.Id).SingleAsync();
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

        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PostAsJsonAsync(url, request)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await (await SignedIn(_factory, "tfaccessout")).PostAsJsonAsync(url, request)).StatusCode);
        Assert.Empty(await Types(owner, game));

        // At the limit the copy is refused with an error on the name, and nothing is written.
        await WithDb(_factory, async db =>
        {
            for (var i = 0; i < ProjectEntityTypeEndpoints.MaxTypesPerProject; i++)
            {
                db.EntityTypes.Add(new EntityType
                {
                    Id = Guid.NewGuid(),
                    UniverseId = universe.Id,
                    ProjectId = game,
                    Name = $"Filler {i}",
                    DisplayOrder = i,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }

            await db.SaveChangesAsync();
        });

        var full = await owner.PostAsJsonAsync(url, request);
        Assert.Equal(HttpStatusCode.BadRequest, full.StatusCode);
        Assert.Contains("name", await full.Content.ReadAsStringAsync());
        Assert.Equal(ProjectEntityTypeEndpoints.MaxTypesPerProject, (await Types(owner, game)).Count);
    }

    // ---------- helpers ----------

    private static async Task<T> Send<T>(Task<HttpResponseMessage> request)
    {
        var response = await request;
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<Guid> NewGame(HttpClient client, Guid universeId, string name) =>
        (await Send<ProjectDetail>(client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest(name, ProjectKind.Game, ProjectLifecycle.Active, null, null, universeId, null)))).Id;

    private static Task<ProjectEntityTypeResponse> Copy(HttpClient client, Guid projectId, Guid templateId, string? name = null) =>
        Send<ProjectEntityTypeResponse>(client.PostAsJsonAsync(
            $"/api/projects/{projectId}/entity-types/from-template",
            new ProjectTypeFromTemplateRequest(templateId, name)));

    private static async Task<List<ProjectEntityTypeResponse>> Types(HttpClient client, Guid projectId) =>
        (await client.GetFromJsonAsync<List<ProjectEntityTypeResponse>>($"/api/projects/{projectId}/entity-types"))!;

    private static async Task<TypeTemplateResponse> GetTemplate(HttpClient client, Guid universeId, Guid id) =>
        (await client.GetFromJsonAsync<TypeTemplateResponse>($"/api/universes/{universeId}/type-templates/{id}"))!;

    /// <summary>A template with one field of every kind it can hold, some with options.</summary>
    private static async Task<TypeTemplateResponse> FullTemplate(HttpClient client, Guid universeId, string name)
    {
        var url = $"/api/universes/{universeId}/type-templates";
        var template = await Send<TypeTemplateResponse>(client.PostAsJsonAsync(
            url, new ProjectEntityTypeRequest(name, "A playable piece.", null, "#3366aa")));
        ProjectEntityFieldRequest[] fields =
        [
            new("Title", EntityFieldKind.ShortText, true),
            new("Lore", EntityFieldKind.LongText),
            new("Cost", EntityFieldKind.Number),
            new("Flying", EntityFieldKind.Boolean),
            new("Released", EntityFieldKind.Date),
            new("Rarity", EntityFieldKind.Select, Options: ["Rare", "Common", "Epic"]),
            new("Modes", EntityFieldKind.MultiSelect, Options: ["Solo", "Duo"]),
            new("Art", EntityFieldKind.Image, ImageShape: FieldImageShape.FourByThree),
        ];

        foreach (var field in fields)
        {
            template = await Send<TypeTemplateResponse>(client.PostAsJsonAsync($"{url}/{template.Id}/fields", field));
        }

        return template;
    }

    /// <summary>The definition without ids, so a template and a copy of it compare equal.</summary>
    private static string Shape(TypeTemplateResponse template) =>
        Shape(template.Name, template.Description, template.Icon, template.AccentColor, template.Fields);

    private static string Shape(ProjectEntityTypeResponse type) =>
        Shape(type.Name, type.Description, type.Icon, type.AccentColor, type.Fields);

    private static string Shape(string name, string? description, string? icon, string? accent, IReadOnlyList<ProjectEntityFieldResponse> fields) =>
        string.Join(
            "|",
            [
                name,
                description,
                icon,
                accent,
                .. fields.OrderBy(field => field.DisplayOrder).Select(field =>
                    $"{field.Name}:{field.Kind}:{field.IsRequired}:{field.DisplayOrder}:{field.ImageShape}:" +
                    string.Join(",", field.Options.OrderBy(option => option.DisplayOrder).Select(option => option.Value))),
            ]);

    private static async Task<string> Snapshot(HttpClient client, Guid projectId) =>
        await client.GetStringAsync($"/api/projects/{projectId}/entity-types") +
        await client.GetStringAsync($"/api/projects/{projectId}/entities");
}
