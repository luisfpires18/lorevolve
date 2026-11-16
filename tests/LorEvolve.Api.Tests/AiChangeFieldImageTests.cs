using System.Net.Http.Json;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Lore;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// AI changes and image fields (Issue #238): a change can never set an image field's picture, nor create an image field,
/// and a refused submission stages nothing.
/// </summary>
public sealed class AiChangeFieldImageTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Staging_a_value_for_an_image_field_is_refused_and_nothing_else_changes()
    {
        var (owner, ownerId) = await Account(_factory, "aiimgfield");
        var u = (await CreateUniverse(owner, "AI pictures")).Id;
        var character = await TypeId(owner, u, "Character");
        var portrait = await Field(owner, u, character, new FieldDefinitionRequest("Portrait", EntityFieldKind.Image, false, null, null, null));
        var before = (await owner.GetFromJsonAsync<EntityPage>($"/api/universes/{u}/entities?page=1&pageSize=50"))!.TotalCount;

        var staged = await Stage(_factory, u, ownerId, NewLore("hero", character, "Alenna Vance", new AiFieldInput(portrait.Id, Text: "a portrait")));

        Assert.Null(staged.Proposal);
        var issue = Assert.Single(staged.Issues);
        Assert.Equal(AiChangeCodes.ImageField, issue.Code);
        Assert.Equal($"fields.{portrait.Id}", issue.Field);
        Assert.Equal(before, (await owner.GetFromJsonAsync<EntityPage>($"/api/universes/{u}/entities?page=1&pageSize=50"))!.TotalCount);
    }

    [Fact]
    public async Task An_entry_of_a_type_with_an_image_field_is_still_proposed_without_touching_it()
    {
        var (owner, ownerId) = await Account(_factory, "aiimgentry");
        var u = (await CreateUniverse(owner, "AI pictures two")).Id;
        var character = await TypeId(owner, u, "Character");
        await Field(owner, u, character, new FieldDefinitionRequest("Portrait", EntityFieldKind.Image, false, null, null, null));

        await Staged(_factory, u, ownerId, NewLore("hero", character, "Alenna Vance"));
    }

    [Fact]
    public async Task An_AI_cannot_create_an_image_field()
    {
        var (owner, ownerId) = await Account(_factory, "aiimgschema");
        var u = (await CreateUniverse(owner, "AI pictures three")).Id;
        var character = await TypeId(owner, u, "Character");

        var staged = await StageSchema(_factory, u, ownerId, NewField("art", new AiLoreFieldInput(Id(character), "Art", "image")));

        Assert.Null(staged.Proposal);
        Assert.Contains(staged.Issues, issue => issue.Code == AiChangeCodes.Invalid && issue.Field == "field.kind");
    }
}
