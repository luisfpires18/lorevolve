using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A nested type inherits the fields of every type above it (ADR 0007 amendment, 2026-11-12): an entry of it holds, is
/// required and filtered by them; a name or meaning is unique across the chain; and a move is refused while entries hold
/// values in fields it would lose, or when a field it would gain is already there.
/// </summary>
public sealed class InheritedFieldTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Weapons, Guid Chaos, Guid Blade, Guid Damage, Guid Rune);

    /// <summary>Weapons (Damage) &gt; Weapons of Chaos (Rune) &gt; Blades, with no field of its own.</summary>
    private async Task<World> NewWorld(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var u = universe.Id;
        var weapons = await NewType(client, u, "Weapons", null);
        var chaos = await NewType(client, u, "Weapons of Chaos", weapons);
        var blade = await NewType(client, u, "Blades", chaos);
        var damage = await AddField(client, u, weapons, "Damage");
        var rune = await AddField(client, u, chaos, "Rune");
        return new World(client, u, weapons, chaos, blade, damage, rune);
    }

    [Fact]
    public async Task An_entry_holds_and_is_filtered_by_every_field_its_type_inherits()
    {
        var w = await NewWorld("inh-hold");
        var sword = await Entry(w, w.Blade, "Sunder", (w.Damage, "Cleaves stone"), (w.Rune, "Ash"));

        var detail = (await w.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{w.U}/entities/{sword}"))!;
        Assert.Equal(
            new[] { ("Damage", "Cleaves stone"), ("Rune", "Ash") }.Order(),
            detail.Fields.Select(value => (value.Name, value.Text!)).Order());

        // A filter on a field Blades inherits, from Blades itself and from Weapons with its nested types.
        foreach (var query in new[] { $"entityTypeId={w.Blade}", $"entityTypeId={w.Weapons}&includeDescendants=true" })
        {
            var page = (await w.Client.GetFromJsonAsync<EntityPage>(
                $"/api/universes/{w.U}/entities?{query}&field={Uri.EscapeDataString($"{w.Damage}:contains:stone")}"))!;
            Assert.Equal(["Sunder"], page.Items.Select(item => item.Name));
        }

        // A field of a type nested beneath is not the parent's: an entry of Weapons ignores it, as it ignores any unknown field.
        var plain = await Entry(w, w.Weapons, "Club", (w.Damage, "Bruises"), (w.Rune, "Never kept"));
        var club = (await w.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{w.U}/entities/{plain}"))!;
        Assert.Equal(["Damage"], club.Fields.Select(value => value.Name));
    }

    [Fact]
    public async Task A_required_field_above_is_required_below_in_a_form_and_in_mass_create()
    {
        var w = await NewWorld("inh-required");
        await AddField(w.Client, w.U, w.Weapons, "Maker", required: true);

        var missing = await w.Client.PostAsJsonAsync(
            $"/api/universes/{w.U}/entities", new EntityRequest(w.Blade, "Sunder", null, CanonStatus.Canon, [], [], []));
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);

        var bulk = await w.Client.PostAsJsonAsync(
            $"/api/universes/{w.U}/entities/bulk", new BulkEntityRequest([new BulkEntityRow(w.Blade, "Sunder", CanonStatus.Canon)]));
        Assert.Equal(HttpStatusCode.BadRequest, bulk.StatusCode);
    }

    [Fact]
    public async Task A_field_name_is_unique_across_the_types_above_and_inside()
    {
        var w = await NewWorld("inh-names");
        Assert.Equal(HttpStatusCode.BadRequest, (await PostField(w.Client, w.U, w.Blade, "Damage")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PostField(w.Client, w.U, w.Weapons, "Rune")).StatusCode);
        Assert.True((await PostField(w.Client, w.U, w.Blade, "Edge")).IsSuccessStatusCode);
    }

    [Fact]
    public async Task A_move_that_would_lose_held_values_or_bring_a_field_twice_is_refused()
    {
        var w = await NewWorld("inh-move");
        var sword = await Entry(w, w.Blade, "Sunder", (w.Damage, "Cleaves stone"));

        // Out from under Weapons: Sunder would lose Damage.
        var refused = await Move(w, w.Chaos, null);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains(EntityTypeEndpoints.InheritedFieldsCode, await refused.Content.ReadAsStringAsync());
        Assert.Equal(w.Weapons, await ParentOf(w, w.Chaos));

        // Cleared, the move goes through.
        await Update(w, sword, w.Blade, "Sunder");
        Assert.True((await Move(w, w.Chaos, null)).IsSuccessStatusCode);

        // Back under Weapons while a type inside it has its own "Damage": refused, the name would be there twice.
        await AddField(w.Client, w.U, w.Blade, "Damage");
        var twin = await Move(w, w.Chaos, w.Weapons);
        Assert.Equal(HttpStatusCode.Conflict, twin.StatusCode);
        Assert.Contains("same name", await twin.Content.ReadAsStringAsync());
        Assert.Null(await ParentOf(w, w.Chaos));
    }

    [Fact]
    public async Task A_backup_with_inherited_values_restores_them()
    {
        var w = await NewWorld("inh-backup");
        await Entry(w, w.Blade, "Sunder", (w.Damage, "Cleaves stone"), (w.Rune, "Ash"));

        var restored = await RestoreArchive(w.Client, await RawArchive(w.Client, w.U), "inh-backup restored");
        var page = (await w.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{restored.Id}/entities"))!;
        var id = page.Items.Single(item => item.Name == "Sunder").Id;
        var detail = (await w.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{restored.Id}/entities/{id}"))!;
        Assert.Equal(["Cleaves stone", "Ash"], detail.Fields.Select(value => value.Text!).Order(StringComparer.Ordinal).Reverse());
    }

    private static async Task<Guid> NewType(HttpClient client, Guid u, string name, Guid? parent) =>
        (await PostJson<EntityTypeResponse>(
            client,
            $"/api/universes/{u}/entity-types",
            new EntityTypeRequest(name, null, null, null, null, Parent: parent is null ? null : new EntityTypeParentChoice(parent)))).Id;

    private static Task<HttpResponseMessage> PostField(HttpClient client, Guid u, Guid typeId, string name, bool required = false) =>
        client.PostAsJsonAsync(
            $"/api/universes/{u}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, EntityFieldKind.ShortText, required, null, null, null));

    private static async Task<Guid> AddField(HttpClient client, Guid u, Guid typeId, string name, bool required = false)
    {
        var response = await PostField(client, u, typeId, name, required);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.Single(field => field.Name == name).Id;
    }

    private static async Task<Guid> Entry(World w, Guid typeId, string name, params (Guid Field, string Text)[] values) =>
        (await PostJson<EntityDetail>(
            w.Client,
            $"/api/universes/{w.U}/entities",
            new EntityRequest(typeId, name, null, CanonStatus.Canon, [], [], [.. values.Select(value => Text(value.Field, value.Text))]))).Id;

    private static async Task Update(World w, Guid entityId, Guid typeId, string name)
    {
        var current = (await w.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{w.U}/entities/{entityId}"))!;
        var response = await w.Client.PutAsJsonAsync(
            $"/api/universes/{w.U}/entities/{entityId}",
            new EntityRequest(typeId, name, null, CanonStatus.Canon, [], [], [], ExpectedVersion: current.Version));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    private static FieldValueInput Text(Guid field, string text) => new(field, text, null, null, null, null, null);

    private static async Task<HttpResponseMessage> Move(World w, Guid typeId, Guid? parent)
    {
        var type = (await w.Client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{w.U}/entity-types"))!.Single(one => one.Id == typeId);
        return await w.Client.PutAsJsonAsync(
            $"/api/universes/{w.U}/entity-types/{typeId}",
            new EntityTypeRequest(type.Name, type.Description, type.Icon, type.AccentColor, null, Parent: new EntityTypeParentChoice(parent)));
    }

    private static async Task<Guid?> ParentOf(World w, Guid typeId) =>
        (await w.Client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{w.U}/entity-types"))!.Single(one => one.Id == typeId).ParentId;
}
