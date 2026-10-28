using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Lore's custom-field filters (refinement 034): each kind's comparisons, the rule that a missing value never matches,
/// AND across filters and with the listing's other conditions, the count and pages they leave, and every way a filter
/// is refused. Each test builds its own small world, so nothing depends on another's data. Credentials are synthetic.
/// </summary>
public sealed class EntityFieldFilterTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Text_equals_compares_the_whole_value_without_regard_to_case()
    {
        var w = await Seed("texteq");

        Assert.Equal(["Aria"], await Names(w, Filter(w.Title, "eq", "queen of %ash_")));
        Assert.Equal(["Cato"], await Names(w, Filter(w.Title, "eq", "QUEEN OF ASH")));
        Assert.Empty(await Names(w, Filter(w.Title, "eq", "queen")));

        // Letters outside A-Z are compared as written, and written exactly they always match.
        Assert.Equal(["Dax"], await Names(w, Filter(w.Title, "eq", "Ærendel of Öst")));
        Assert.Equal(["Dax"], await Names(w, Filter(w.Title, "contains", "Ærendel OF Ö")));
    }

    [Fact]
    public async Task Text_contains_is_case_insensitive_and_reads_percent_and_underscore_as_letters()
    {
        var w = await Seed("textcontains");

        Assert.Equal(["Aria", "Cato"], await Names(w, Filter(w.Title, "contains", "QUEEN")));

        // As LIKE wildcards these would match both queens; as text, only the title that holds them.
        Assert.Equal(["Aria"], await Names(w, Filter(w.Title, "contains", "_")));
        Assert.Equal(["Aria"], await Names(w, Filter(w.Title, "contains", "%ash")));
        Assert.Empty(await Names(w, Filter(w.Title, "contains", "f%a")));

        Assert.Equal(["Aria"], await Names(w, Filter(w.Notes, "contains", "NORTH")));
    }

    [Fact]
    public async Task Number_filters_compare_numbers_and_keep_their_decimals()
    {
        var w = await Seed("number");

        Assert.Equal(["Bran"], await Names(w, Filter(w.Age, "eq", "20")));
        Assert.Equal(["Aria"], await Names(w, Filter(w.Age, "eq", "34.5")));
        Assert.Equal(["Aria", "Cato"], await Names(w, Filter(w.Age, "gt", "30")));
        Assert.Equal(["Aria", "Cato"], await Names(w, Filter(w.Age, "gt", "34.4")));
        Assert.Equal(["Aria", "Bran"], await Names(w, Filter(w.Age, "lt", "34.6")));

        // Not compared as text, where "100" would sort before "20".
        Assert.Empty(await Names(w, Filter(w.Age, "gt", "100")));
        Assert.Equal(["Aria", "Bran", "Cato"], await Names(w, Filter(w.Age, "lt", "100")));
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("NaN")]
    [InlineData("Infinity")]
    [InlineData("")]
    public async Task A_number_filter_that_is_not_a_finite_number_is_refused(string value)
    {
        var w = await Seed($"badnum{value.Length}{value}");

        await AssertRefused(w, Filter(w.Age, "gt", value));
    }

    [Fact]
    public async Task Boolean_filters_read_yes_and_no_and_leave_out_entries_with_neither()
    {
        var w = await Seed("bool");

        Assert.Equal(["Aria", "Cato"], await Names(w, Filter(w.Alive, "is", "true")));
        Assert.Equal(["Bran"], await Names(w, Filter(w.Alive, "is", "false")));
        await AssertRefused(w, Filter(w.Alive, "is", "yes"));
        await AssertRefused(w, Filter(w.Alive, "gt", "true"));
    }

    [Fact]
    public async Task Select_is_and_is_not_match_by_option_and_need_a_value()
    {
        var w = await Seed("select");

        Assert.Equal(["Aria"], await Names(w, Filter(w.House, "is", w.HouseA)));

        // Cato and Dax have no House: neither is "not A".
        Assert.Equal(["Bran"], await Names(w, Filter(w.House, "isNot", w.HouseA)));
    }

    [Fact]
    public async Task A_select_filter_with_an_option_that_is_not_the_fields_own_is_refused()
    {
        var w = await Seed("selectbad");

        await AssertRefused(w, Filter(w.House, "is", w.Fire));
        await AssertRefused(w, Filter(w.House, "is", Guid.NewGuid()));
        await AssertRefused(w, Filter(w.House, "contains", w.HouseA));
    }

    [Fact]
    public async Task Multi_select_contains_and_does_not_contain_and_two_contains_mean_both()
    {
        var w = await Seed("multi");

        Assert.Equal(["Aria", "Bran"], await Names(w, Filter(w.Element, "contains", w.Water)));
        Assert.Equal(["Aria"], await Names(w, Filter(w.Element, "contains", w.Water), Filter(w.Element, "contains", w.Fire)));

        // Dax chose no element at all, so he does not count as lacking Water.
        Assert.Equal(["Cato"], await Names(w, Filter(w.Element, "notContains", w.Water)));
        await AssertRefused(w, Filter(w.Element, "is", w.Water));
    }

    [Fact]
    public async Task Entity_reference_filters_match_the_exact_entry_never_its_name()
    {
        var w = await Seed("reference");

        // Two locations called Arkazia: each id finds only the hero who points at that one.
        Assert.Equal(["Aria"], await Names(w, Filter(w.Kingdom, "is", w.Arkazia)));
        Assert.Equal(["Cato"], await Names(w, Filter(w.Kingdom, "is", w.OtherArkazia)));
        Assert.Equal(["Bran", "Cato"], await Names(w, Filter(w.Kingdom, "isNot", w.Arkazia)));
        await AssertRefused(w, Filter(w.Kingdom, "contains", w.Arkazia));
    }

    [Fact]
    public async Task An_entity_reference_filter_naming_another_universes_entry_is_refused()
    {
        var w = await Seed("refcross");
        var other = await Seed("refcrossother");

        await AssertRefused(w, Filter(w.Kingdom, "is", other.Arkazia));
        await AssertRefused(w, Filter(w.Kingdom, "is", Guid.NewGuid()));
    }

    [Fact]
    public async Task Filters_combine_with_and_with_each_other_and_with_status_and_search()
    {
        var w = await Seed("combine");

        Assert.Equal(["Aria"], await Names(w, Filter(w.Alive, "is", "true"), Filter(w.Element, "contains", w.Fire)));
        Assert.Equal(["Aria"], await Names(w, Filter(w.Age, "gt", "20"), Filter(w.Age, "lt", "40")));

        // Aria is a Draft, Cato an Idea.
        Assert.Equal(["Cato"], await Names(w, $"canonStatus=0&{Filter(w.Alive, "is", "true")}"));
        Assert.Equal(["Cato"], await Names(w, $"search=Cato&{Filter(w.Alive, "is", "true")}"));
        Assert.Empty(await Names(w, $"search=Bran&{Filter(w.Alive, "is", "true")}"));
    }

    [Fact]
    public async Task A_nested_types_entries_are_browsed_with_its_parent_but_never_match_a_field_they_do_not_have()
    {
        var w = await Seed("branch");

        Assert.Equal(["Aria", "Bran", "Cato", "Dax", "Eli"], await Names(w, ""));
        Assert.Equal(["Aria", "Cato"], await Names(w, Filter(w.Alive, "is", "true")));
    }

    [Fact]
    public async Task The_count_and_pages_are_those_of_the_filtered_list()
    {
        var w = await Seed("pages");

        var first = await Page(w, $"pageSize=1&page=1&{Filter(w.Age, "gt", "30")}");
        var second = await Page(w, $"pageSize=1&page=2&{Filter(w.Age, "gt", "30")}");

        Assert.Equal(2, first.TotalCount);
        Assert.Equal(2, first.TotalPages);
        Assert.Equal(
            ["Aria", "Cato"],
            first.Items.Concat(second.Items).Select(item => item.Name).Order().ToList());
    }

    [Fact]
    public async Task A_field_of_another_type_another_universe_or_a_date_is_refused()
    {
        var w = await Seed("ownership");
        var other = await Seed("ownershipother");

        await AssertRefused(w, Filter(w.Climate, "eq", "cold"));
        await AssertRefused(w, Filter(other.Title, "eq", "Smith"));
        await AssertRefused(w, Filter(w.Born, "eq", "2020-01-01"));
        await AssertRefused(w, Filter(Guid.NewGuid(), "eq", "x"));
    }

    [Fact]
    public async Task A_malformed_or_unknown_operator_is_refused()
    {
        var w = await Seed("operators");

        await AssertRefused(w, Filter(w.Title, "like", "Smith"));
        await AssertRefused(w, Filter(w.Age, "contains", "2"));
        await AssertRefused(w, $"field={Uri.EscapeDataString($"{w.Title}:eq")}");
        await AssertRefused(w, "field=not-a-filter");
        await AssertRefused(w, Filter(w.Title, "eq", "   "));
    }

    [Fact]
    public async Task More_than_ten_filters_are_refused_and_ten_are_not()
    {
        var w = await Seed("limit");
        var ten = string.Join('&', Enumerable.Repeat(Filter(w.Age, "gt", "1"), 10));

        Assert.Equal(["Aria", "Bran", "Cato"], await Names(w, ten));
        await AssertRefused(w, $"{ten}&{Filter(w.Age, "gt", "1")}");
    }

    [Fact]
    public async Task Field_filters_without_a_type_are_refused()
    {
        var w = await Seed("notype");

        var response = await w.Client.GetAsync(
            $"/api/universes/{w.UniverseId}/entities?{Filter(w.Alive, "is", "true")}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Another_users_universe_is_still_not_found_whatever_the_filters()
    {
        var w = await Seed("stranger");
        var stranger = await SignedInClient("user-filter-outsider");

        var response = await stranger.GetAsync(
            $"/api/universes/{w.UniverseId}/entities?entityTypeId={w.HeroId}&{Filter(w.Alive, "is", "true")}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Filters_are_conditions_on_one_query_not_reads_per_filter_or_per_entry()
    {
        var w = await Seed("querycount");
        var ids = new[] { w.UniverseId, w.HeroId };

        var (one, _) = await CommandCounter.CountAsync(ids, () => Names(w, Filter(w.Age, "gt", "1")));
        var (five, _) = await CommandCounter.CountAsync(ids, () => Names(
            w,
            Filter(w.Age, "gt", "1"),
            Filter(w.Alive, "is", "true"),
            Filter(w.Title, "contains", "queen"),
            Filter(w.Element, "notContains", w.Water),
            Filter(w.House, "isNot", w.HouseA)));

        Assert.Equal(one, five);
    }

    // ---------- The world ----------

    private sealed record World(
        HttpClient Client,
        Guid UniverseId,
        Guid HeroId,
        Guid Title,
        Guid Notes,
        Guid Age,
        Guid Alive,
        Guid House,
        Guid HouseA,
        Guid Element,
        Guid Fire,
        Guid Water,
        Guid Kingdom,
        Guid Born,
        Guid Climate,
        Guid Arkazia,
        Guid OtherArkazia);

    /// <summary>
    /// Hero, with one field of every kind, and Squire filed beneath it with none of them. Aria, Bran and Cato carry
    /// values; Dax carries only a title; Eli is a Squire. Two Locations share the name Arkazia.
    /// </summary>
    private async Task<World> Seed(string tag)
    {
        var client = await SignedInClient($"user-filter-{tag}");
        var created = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest($"Filters {tag}", null, null));
        created.EnsureSuccessStatusCode();
        var universeId = (await created.Content.ReadFromJsonAsync<UniverseDetail>())!.Id;

        var hero = await CreateType(client, universeId, "Hero");
        var squire = await CreateType(client, universeId, "Squire", hero.Id);
        var location = await CreateType(client, universeId, "Realm");

        var title = await AddField(client, universeId, hero.Id, "Title", EntityFieldKind.ShortText);
        var notes = await AddField(client, universeId, hero.Id, "Notes", EntityFieldKind.LongText);
        var age = await AddField(client, universeId, hero.Id, "Age", EntityFieldKind.Number);
        var alive = await AddField(client, universeId, hero.Id, "Alive", EntityFieldKind.Boolean);
        var house = await AddField(client, universeId, hero.Id, "House", EntityFieldKind.Select, ["Amber", "Basalt"]);
        var element = await AddField(client, universeId, hero.Id, "Element", EntityFieldKind.MultiSelect, ["Fire", "Water", "Earth"]);
        var kingdom = await AddField(client, universeId, hero.Id, "Kingdom", EntityFieldKind.EntityReference);
        var born = await AddField(client, universeId, hero.Id, "Born", EntityFieldKind.Date);
        var climate = await AddField(client, universeId, location.Id, "Climate", EntityFieldKind.ShortText);

        Guid Option(FieldDefinitionResponse field, string value) => field.Options.Single(option => option.Value == value).Id;

        var arkazia = await CreateEntity(client, universeId, location.Id, "Arkazia", CanonStatus.Idea, []);
        var otherArkazia = await CreateEntity(client, universeId, location.Id, "Arkazia", CanonStatus.Idea, []);
        var brennor = await CreateEntity(client, universeId, location.Id, "Brennor", CanonStatus.Idea, []);

        await CreateEntity(client, universeId, hero.Id, "Aria", CanonStatus.Draft,
        [
            Text(title.Id, "Queen of %Ash_"),
            Text(notes.Id, "Born in the north, raised by wolves."),
            Number(age.Id, 34.5),
            Flag(alive.Id, true),
            Options(house.Id, Option(house, "Amber")),
            Options(element.Id, Option(element, "Fire"), Option(element, "Water")),
            Reference(kingdom.Id, arkazia),
        ]);
        await CreateEntity(client, universeId, hero.Id, "Bran", CanonStatus.Idea,
        [
            Text(title.Id, "Smith"),
            Number(age.Id, 20),
            Flag(alive.Id, false),
            Options(house.Id, Option(house, "Basalt")),
            Options(element.Id, Option(element, "Water")),
            Reference(kingdom.Id, brennor),
        ]);
        await CreateEntity(client, universeId, hero.Id, "Cato", CanonStatus.Idea,
        [
            Text(title.Id, "queen of ash"),
            Number(age.Id, 41),
            Flag(alive.Id, true),
            Options(element.Id, Option(element, "Earth")),
            Reference(kingdom.Id, otherArkazia),
        ]);
        await CreateEntity(client, universeId, hero.Id, "Dax", CanonStatus.Idea, [Text(title.Id, "Ærendel of Öst")]);
        await CreateEntity(client, universeId, squire.Id, "Eli", CanonStatus.Idea, []);

        return new World(
            client, universeId, hero.Id, title.Id, notes.Id, age.Id, alive.Id,
            house.Id, Option(house, "Amber"), element.Id, Option(element, "Fire"), Option(element, "Water"),
            kingdom.Id, born.Id, climate.Id, arkazia, otherArkazia);
    }

    private static FieldValueInput Text(Guid field, string text) => new(field, text, null, null, null, null, null);

    private static FieldValueInput Number(Guid field, double number) => new(field, null, number, null, null, null, null);

    private static FieldValueInput Flag(Guid field, bool flag) => new(field, null, null, flag, null, null, null);

    private static FieldValueInput Options(Guid field, params Guid[] ids) => new(field, null, null, null, null, ids, null);

    private static FieldValueInput Reference(Guid field, Guid entity) => new(field, null, null, null, null, null, entity);

    // ---------- Asking ----------

    private static string Filter(Guid field, string op, object value) =>
        $"field={Uri.EscapeDataString($"{field}:{op}:{value}")}";

    private static async Task<EntityPage> Page(World w, string query)
    {
        var response = await w.Client.GetAsync(
            $"/api/universes/{w.UniverseId}/entities?entityTypeId={w.HeroId}&includeDescendants=true&{query}");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityPage>())!;
    }

    private static async Task<List<string>> Names(World w, params string[] filters) =>
        (await Page(w, string.Join('&', ["pageSize=50", .. filters]))).Items.Select(item => item.Name).Order().ToList();

    private static async Task AssertRefused(World w, string query)
    {
        var response = await w.Client.GetAsync(
            $"/api/universes/{w.UniverseId}/entities?entityTypeId={w.HeroId}&includeDescendants=true&{query}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(problem.RootElement.TryGetProperty("errors", out _));
    }

    // ---------- Setup ----------

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", $"e2e-{Guid.NewGuid()}"));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<EntityTypeResponse> CreateType(HttpClient client, Guid universeId, string name, Guid? parentId = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types",
            new EntityTypeRequest(name, null, null, null, null, Parent: parentId is null ? null : new EntityTypeParentChoice(parentId)));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
    }

    private static async Task<FieldDefinitionResponse> AddField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        EntityFieldKind kind,
        IReadOnlyList<string>? options = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, kind, false, null, null, options));
        response.EnsureSuccessStatusCode();
        var type = (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
        return type.Fields.First(field => field.Name == name);
    }

    private static async Task<Guid> CreateEntity(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        CanonStatus status,
        IReadOnlyList<FieldValueInput> fields)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, status, null, null, fields));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!.Id;
    }
}
