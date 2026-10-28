using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Search;
using LorEvolve.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.IdeaTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.WorldRuleTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// World rules in the universe search (ADR 0031, ADR 0033): found by title and by description alone as World rule results
/// that open the rule itself, merged by where the words were found, never from the Trash, another universe or another
/// account, in step with every edit, and indexed as derived text that goes with its universe.
/// </summary>
public sealed class WorldRuleSearchTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_rule_is_found_by_its_title_and_by_its_description_alone_as_a_world_rule()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrsfind");
        var u = universe.Id;
        var rule = await CreateRule(client, u, "Teleportation cannot cross the Veil", "Not even the Quorrel wardens may step through it.");

        var byTitle = Assert.Single((await Search(client, u, "teleport")).Results);
        Assert.Equal(
            (UniverseSearchKind.WorldRule, rule.Id, "Teleportation cannot cross the Veil", UniverseSearchField.Title),
            (byTitle.Kind, byTitle.Id, byTitle.Title, byTitle.MatchedIn));
        Assert.Null(byTitle.Excerpt);
        Assert.Null(byTitle.StoryId);
        Assert.Null(byTitle.EntityTypeName);

        var byDescription = Assert.Single((await Search(client, u, "Quorrel wardens")).Results);
        Assert.Equal((UniverseSearchKind.WorldRule, rule.Id, UniverseSearchField.Description), (byDescription.Kind, byDescription.Id, byDescription.MatchedIn));
        Assert.Contains(byDescription.Excerpt!, part => part.IsMatch && part.Text.Contains("Quorrel", StringComparison.Ordinal));

        // Words across the title and the description are found together, where the last of them was.
        Assert.Equal(UniverseSearchField.Description, Assert.Single((await Search(client, u, "Veil Quorrel")).Results).MatchedIn);

        // No description text travels on a title match, and no rule body ever does.
        Assert.DoesNotContain("step through", await client.GetStringAsync($"/api/universes/{u}/search?q=teleport"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_rule_in_the_Trash_is_never_found_a_restored_one_is_and_an_edit_is_found_at_once()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrstrash");
        var u = universe.Id;
        var rule = await CreateRule(client, u, "Dragons bond once", "A Tharnwick bond is for life.");

        await DeleteRule(client, u, rule.Id);
        Assert.Empty((await Search(client, u, "Tharnwick")).Results);
        Assert.Empty((await Search(client, u, "Dragons")).Results);

        rule = await RestoreRule(client, u, rule.Id);
        Assert.Equal([rule.Id], (await Search(client, u, "Tharnwick")).Results.Select(result => result.Id));

        var saved = await SaveRule(client, u, rule, title: "Wyverns bond once", description: "A Morrowgate bond is for life.");
        Assert.Empty((await Search(client, u, "Tharnwick")).Results);
        Assert.Empty((await Search(client, u, "Dragons")).Results);
        Assert.Equal([saved.Id], (await Search(client, u, "Wyverns")).Results.Select(result => result.Id));
        Assert.Equal([saved.Id], (await Search(client, u, "Morrowgate")).Results.Select(result => result.Id));
    }

    [Fact]
    public async Task A_rule_is_never_found_from_another_universe_or_by_another_account()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "wrsown");
        var other = await CreateUniverse(owner, "World wrsown other");
        await CreateRule(owner, universe.Id, "Zyqvarn law", "Zyqvarn words.");

        Assert.Single((await Search(owner, universe.Id, "Zyqvarn")).Results);
        Assert.Empty((await Search(owner, other.Id, "Zyqvarn")).Results);

        var stranger = await SignedIn(_factory, "user-wrsstranger");
        var strangersOwn = await CreateUniverse(stranger, "World wrsstranger");
        await CreateRule(stranger, strangersOwn.Id, "Unrelated law", "Nothing alike.");

        var guessed = await stranger.GetAsync(SearchPath(universe.Id, "Zyqvarn"));
        var missing = await stranger.GetAsync(SearchPath(Guid.NewGuid(), "Zyqvarn"));
        Assert.Equal((HttpStatusCode.NotFound, HttpStatusCode.NotFound), (guessed.StatusCode, missing.StatusCode));
        Assert.Equal(await missing.Content.ReadAsStringAsync(), await guessed.Content.ReadAsStringAsync());
        Assert.Empty((await Search(stranger, strangersOwn.Id, "Zyqvarn")).Results);
    }

    [Fact]
    public async Task A_rule_merges_with_titles_when_its_title_matches_and_with_planning_text_when_its_description_does()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrstier");
        var u = universe.Id;
        var story = (await PostJson<StoryDetail>(client, Stories(u), new StoryRequest("A siege", "Brindlemoor burns.", StoryStatus.Planning))).Id;
        var titled = await CreateRule(client, u, "Brindlemoor never falls");
        var described = await CreateRule(client, u, "Sieges end in spring", "Even at Brindlemoor.");
        var idea = await CreateIdea(client, "Brindlemoor floats", null, u);

        // Titles first, in the fixed order of kinds - an idea, then a rule - then planning text: a premise, then a description.
        Assert.Equal(
            [(UniverseSearchKind.Idea, idea.Id), (UniverseSearchKind.WorldRule, titled.Id), (UniverseSearchKind.Story, story), (UniverseSearchKind.WorldRule, described.Id)],
            (await Search(client, u, "Brindlemoor")).Results.Select(result => (result.Kind, result.Id)));
    }

    [Fact]
    public async Task The_rule_index_is_derived_text_cleaned_of_excerpt_markers_and_gone_with_its_universe()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrsindex");
        var u = universe.Id;
        const string marked = "Glasswater marked words.";
        var rule = await CreateRule(client, u, "Glasswater rule", marked);

        // The rule keeps what was written; the index's copy holds the two marker characters as spaces.
        Assert.Equal(marked, (await ReadRule(client, u, rule.Id)).Description);
        Assert.Equal(1, await Count(
            $"SELECT COUNT(*) AS Value FROM WorldRuleSearchIndex WHERE WorldRuleId = '{Key(rule.Id)}' AND instr(Description, char(57344)) = 0 AND instr(Description, char(57345)) = 0"));
        var found = Assert.Single((await Search(client, u, "marked")).Results);
        Assert.DoesNotContain(found.Excerpt!, part => part.Text.Contains('') || part.Text.Contains(''));

        // Text and the key, nothing else: no universe, owner, marker or moment is copied.
        Assert.Equal(["WorldRuleId", "Title", "Description"], await Columns("WorldRuleSearchIndex"));

        // Rebuilt from the authored row, the answers are the same.
        var before = (await Search(client, u, "Glasswater")).Results.Select(result => (result.Kind, result.Id, result.MatchedIn)).ToList();
        var key = Key(rule.Id);
        await WithDb(_factory, async db =>
        {
            await db.Database.ExecuteSqlAsync($"DELETE FROM WorldRuleSearchIndex WHERE WorldRuleId = {key}");
            await db.Database.ExecuteSqlAsync(
                $"INSERT INTO WorldRuleSearchIndex (WorldRuleId, Title, Description) SELECT Id, Title, replace(replace(Description, char(57344), ' '), char(57345), ' ') FROM WorldRules WHERE Id = {key}");
        });
        Assert.Equal(before, (await Search(client, u, "Glasswater")).Results.Select(result => (result.Kind, result.Id, result.MatchedIn)));

        await DeleteUniverse(client, u);
        Assert.Equal(0, await Count($"SELECT COUNT(*) AS Value FROM WorldRuleSearchIndex WHERE WorldRuleId = '{Key(rule.Id)}'"));
    }

    // ---------- Helpers ----------

    private static string SearchPath(Guid universeId, string query) =>
        $"/api/universes/{universeId}/search?q={Uri.EscapeDataString(query)}";

    private static async Task<UniverseSearchResponse> Search(HttpClient client, Guid universeId, string query)
    {
        var response = await client.GetAsync(SearchPath(universeId, query));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<UniverseSearchResponse>())!;
    }

    /// <summary>A Guid as the schema stores it.</summary>
    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

    private async Task<int> Count(string sql)
    {
        var value = 0;
        await WithDb(_factory, async db => value = await db.Database.SqlQueryRaw<int>(sql).SingleAsync());
        return value;
    }

    private async Task<List<string>> Columns(string table)
    {
        var names = new List<string>();
        await WithDb(_factory, async db => names = await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table}) ORDER BY cid")
            .ToListAsync());
        return names;
    }
}
