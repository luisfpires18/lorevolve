using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Lore;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Quick Create (Issue #25) has no route of its own: the small form posts exactly what the full entry form posts, to the
/// same create. These pin what it relies on, from the payload it sends - an Idea, no summary, no aliases or tags, every
/// active field with only the required ones filled. The entry is ordinary from the moment it exists; the type, the
/// required fields, the links, the universe and the caller's role are all still the server's to check; and the parent
/// entry it is chosen for is saved, or not, on its own later, under its own link field's limit.
/// </summary>
public sealed class QuickCreateTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Character, Guid Kingdoms, Guid Runes);

    [Fact]
    public async Task A_quick_create_is_an_ordinary_Idea_with_one_version_and_is_found_by_search()
    {
        var w = await NewWorld("qc-ordinary");

        var created = await Create(w, w.Kingdoms, "Erandor");

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var entry = (await created.Content.ReadFromJsonAsync<EntityDetail>())!;
        // Never promoted for being made from a picker: the Idea it was sent as.
        Assert.Equal(CanonStatus.Idea, entry.CanonStatus);
        Assert.Equal(w.Kingdoms, entry.EntityTypeId);
        Assert.Single((await w.Client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/universes/{w.U}/entities/{entry.Id}/revisions"))!);
        var found = (await w.Client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{w.U}/entities?search=Erandor&entityTypeId={w.Kingdoms}"))!;
        Assert.Contains(found.Items, item => item.Id == entry.Id);
    }

    [Fact]
    public async Task A_name_alone_cannot_skip_a_required_field_but_an_archived_one_asks_nothing()
    {
        var w = await NewWorld("qc-required");
        var motto = await AddField(w, w.Kingdoms, new FieldDefinitionRequest("Motto", EntityFieldKind.ShortText, true, null, null, null));
        var seal = await AddField(w, w.Kingdoms, new FieldDefinitionRequest("Old seal", EntityFieldKind.ShortText, true, null, null, null));
        (await w.Client.PostAsync($"/api/universes/{w.U}/entity-types/{w.Kingdoms}/fields/{seal}/archive", null))
            .EnsureSuccessStatusCode();

        var nameOnly = await Create(w, w.Kingdoms, "Erandor", Text(motto, null));
        Assert.Equal(HttpStatusCode.BadRequest, nameOnly.StatusCode);
        Assert.Contains(motto.ToString(), await nameOnly.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
        Assert.Empty(await Named(w, "Erandor"));

        // The active required field filled; the archived one, which the form never shows, is not asked for.
        var filled = await Create(w, w.Kingdoms, "Erandor", Text(motto, "By the river"));
        Assert.Equal(HttpStatusCode.Created, filled.StatusCode);
    }

    [Fact]
    public async Task The_parent_s_link_field_keeps_its_limit_when_the_parent_is_saved()
    {
        var w = await NewWorld("qc-limit");
        var kingdom = await AddField(w, w.Character, new FieldDefinitionRequest(
            "Kingdom", EntityFieldKind.EntityReference, false, null, null, null, TargetEntityTypeId: w.Kingdoms));
        var erandor = await Id(await Create(w, w.Kingdoms, "Erandor"));
        var rune = await Id(await Create(w, w.Runes, "Erandor"));

        // Two entries can share a name; the field takes only the one of its type.
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(w, w.Character, "Akron", Link(kingdom, rune))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Create(w, w.Character, "Akron", Link(kingdom, erandor))).StatusCode);

        // A group limit too: only its member types' entries.
        var group = (await PostJson<EntityTypeResponse>(
            w.Client,
            $"/api/universes/{w.U}/entity-types",
            new EntityTypeRequest("Elemental Runes", null, null, null, null, Groups: [new EntityTypeGroupChoice(null, "Runes group")]))).Id;
        var groupId = (await w.Client.GetFromJsonAsync<List<EntityTypeGroupResponse>>($"/api/universes/{w.U}/entity-type-groups"))!
            .Single(each => each.Name == "Runes group").Id;
        var runeField = await AddField(w, w.Character, new FieldDefinitionRequest(
            "Rune", EntityFieldKind.EntityReference, false, null, null, null, TargetGroupId: groupId));
        var lava = await Id(await Create(w, group, "Lava"));
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(w, w.Character, "Mara", Link(runeField, rune))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Create(w, w.Character, "Mara", Link(runeField, lava))).StatusCode);
    }

    [Fact]
    public async Task Another_universe_s_type_or_entry_is_refused()
    {
        var w = await NewWorld("qc-universe");
        var other = await NewWorld("qc-universe-other");
        var kingdom = await AddField(w, w.Character, new FieldDefinitionRequest(
            "Kingdom", EntityFieldKind.EntityReference, false, null, null, null));
        var foreignEntry = await Id(await Create(other, other.Kingdoms, "Elsewhere"));

        Assert.False((await Create(w, other.Kingdoms, "Erandor")).IsSuccessStatusCode);
        Assert.False((await Create(w, w.Character, "Akron", Link(kingdom, foreignEntry))).IsSuccessStatusCode);
        Assert.Empty(await Named(w, "Erandor"));
        Assert.Empty(await Named(w, "Akron"));
    }

    [Fact]
    public async Task Only_a_member_who_may_edit_content_creates()
    {
        var w = await CollaborationTestClient.NewSharedWorld(_factory, "qc-roles");

        foreach (var (who, allowed) in new[] { (Who.Owner, true), (Who.Editor, true), (Who.Reviewer, false), (Who.Viewer, false), (Who.Outsider, false) })
        {
            var response = await w.Client(who).PostAsJsonAsync(
                $"/api/universes/{w.U}/entities",
                new EntityRequest(w.CharacterType, $"Made by {who}", null, CanonStatus.Idea, [], [], []));
            Assert.True(allowed == response.IsSuccessStatusCode, $"{who}: {response.StatusCode}");
        }

        var names = (await w.Owner.GetFromJsonAsync<EntityPage>($"/api/universes/{w.U}/entities?search=Made%20by&pageSize=50"))!
            .Items.Select(item => item.Name).Order(StringComparer.Ordinal);
        Assert.Equal(["Made by Editor", "Made by Owner"], names);
    }

    // ---------- Steps ----------

    private async Task<World> NewWorld(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universe.Id}/entity-types"))!;
        async Task<Guid> Type(string name) =>
            (await PostJson<EntityTypeResponse>(
                client, $"/api/universes/{universe.Id}/entity-types", new EntityTypeRequest(name, null, null, null, null))).Id;
        return new World(client, universe.Id, types.Single(type => type.Name == "Character").Id, await Type("Kingdoms"), await Type("Runes"));
    }

    private static async Task<Guid> AddField(World w, Guid typeId, FieldDefinitionRequest request)
    {
        var response = await w.Client.PostAsJsonAsync($"/api/universes/{w.U}/entity-types/{typeId}/fields", request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.Single(field => field.Name == request.Name).Id;
    }

    /// <summary>The payload Quick Create sends: an Idea, no summary, no aliases or tags, the given field values.</summary>
    private static Task<HttpResponseMessage> Create(World w, Guid typeId, string name, params FieldValueInput[] fields) =>
        w.Client.PostAsJsonAsync(
            $"/api/universes/{w.U}/entities",
            new EntityRequest(typeId, name, null, CanonStatus.Idea, [], [], fields));

    private static FieldValueInput Text(Guid fieldId, string? text) => new(fieldId, text, null, null, null, null, null);

    private static FieldValueInput Link(Guid fieldId, Guid entityId) => new(fieldId, null, null, null, null, null, entityId);

    private static async Task<Guid> Id(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!.Id;
    }

    private static async Task<List<EntitySummary>> Named(World w, string name) =>
        [.. (await w.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{w.U}/entities?search={Uri.EscapeDataString(name)}"))!
            .Items.Where(item => item.Name == name)];
}
