using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Publishing;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Explore's discovery query (Public portal 009): category, genre, search and sort on the anonymous listing.
///
/// The claims this file carries. Every filter narrows the one public query, so a private universe is never
/// matched, counted or ordered - searching its name, its description or its public summary finds nothing, and
/// the total says nothing either. Search reads only the public fields: name, public summary, the author's public
/// name. "Recent" is first publication, which republishing does not move; "A-Z" ignores case; the address breaks
/// every tie, so pages never repeat or skip. Unknown keys and sorts and an overlong search are refused, not
/// reinterpreted. The response is still exactly the eight-member allow-list.
///
/// One database of its own, seeded once, so every count here is exact.
/// </summary>
public sealed class PublicExploreQueryTests(PublicExploreQueryTests.Worlds worlds) : IClassFixture<PublicExploreQueryTests.Worlds>
{
    private readonly HttpClient _anonymous = Anonymous(worlds.Factory);

    /// <summary>
    /// Five public worlds by two authors, published in this order, and one private world that would match
    /// almost every query below if the boundary ever slipped.
    /// </summary>
    public sealed class Worlds : IAsyncLifetime
    {
        public LorEvolveApiFactory Factory { get; } = new();

        public async Task InitializeAsync()
        {
            var (ines, _) = await Account(Factory, "explore-ines");
            var (oren, _) = await Account(Factory, "explore-oren");

            await Publish(ines, "Ines Harrow", "ashen crown", "Kings of cinder and a crown nobody wants.", UniverseCategory.Games, UniverseGenres.Fantasy, UniverseGenres.Horror);
            await Publish(ines, "Ines Harrow", "Brine Lanterns", "A drowned coast where the tide keeps count.", UniverseCategory.Books, UniverseGenres.Mystery);
            await Publish(oren, "Oren Vale", "Cobalt Reach", "Starships over glass seas.", UniverseCategory.Games, UniverseGenres.ScienceFiction, UniverseGenres.Adventure);
            await Publish(oren, "Oren Vale", "Ashen Crown", "The other crown, in orbit.", UniverseCategory.MoviesAndTv, UniverseGenres.ScienceFiction);
            await Publish(oren, "Oren Vale", "Zephyr 100% Wild", "Wind spirits and a tabletop campaign.", UniverseCategory.TabletopAndRpg, UniverseGenres.Fantasy, UniverseGenres.Supernatural, UniverseGenres.Other);

            // Ready in every way, never published. Its name, description and summary all carry words the
            // public ones use, plus one word only it has.
            var hidden = await Ready(oren, "Ashen Duskhollow", "Oren Vale");
            await SavedDetails(oren, hidden.Id, "Kings of cinder, secretly. Quillfeather.", UniverseCategory.Games, UniverseGenres.Fantasy);
        }

        public Task DisposeAsync()
        {
            Factory.Dispose();
            return Task.CompletedTask;
        }

        private static async Task Publish(HttpClient owner, string author, string name, string summary, UniverseCategory category, params UniverseGenres[] genres)
        {
            var universe = await Ready(owner, name, author);
            await SavedDetails(owner, universe.Id, summary, category, genres);
            await Published(owner, universe.Id);
        }
    }

    private async Task<PublicUniversePage> List(string query)
    {
        var response = await _anonymous.GetAsync($"{PublicRoute}?{query}");
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<PublicUniversePage>())!;
    }

    private async Task<List<string>> Names(string query) => [.. (await List(query)).Items.Select(world => world.Name)];

    // ---------- Filters ----------

    [Fact]
    public async Task A_category_narrows_to_the_worlds_in_it_and_counts_only_those()
    {
        var games = await List("category=games");
        Assert.Equal(["Cobalt Reach", "ashen crown"], games.Items.Select(world => world.Name));
        Assert.Equal((2, 1), (games.TotalCount, games.TotalPages));
        Assert.All(games.Items, world => Assert.Equal(UniverseCategory.Games, world.Category));

        Assert.Equal(["Ashen Crown"], await Names("category=movies-and-tv"));
        Assert.Equal(["Zephyr 100% Wild"], await Names("category=tabletop-and-rpg"));

        var none = await List("category=audio");
        Assert.Empty(none.Items);
        Assert.Equal((0, 0), (none.TotalCount, none.TotalPages));
    }

    [Fact]
    public async Task A_genre_matches_every_world_that_lists_it_among_its_genres()
    {
        Assert.Equal(["Zephyr 100% Wild", "ashen crown"], await Names("genre=fantasy"));
        Assert.Equal(["Ashen Crown", "Cobalt Reach"], await Names("genre=science-fiction"));
        Assert.Equal(["Zephyr 100% Wild"], await Names("genre=other"));
        Assert.Empty(await Names("genre=post-apocalyptic"));
    }

    [Fact]
    public async Task Filters_search_sort_and_paging_compose()
    {
        Assert.Equal(["Cobalt Reach"], await Names("category=games&genre=science-fiction"));
        Assert.Equal(["ashen crown"], await Names("category=games&genre=fantasy&q=crown"));
        Assert.Equal(["ashen crown", "Ashen Crown"], await Names("q=crown&sort=az"));

        var second = await List("genre=fantasy&sort=az&page=2&pageSize=1");
        Assert.Equal(["Zephyr 100% Wild"], second.Items.Select(world => world.Name));
        Assert.Equal((2, 2), (second.TotalCount, second.TotalPages));
    }

    // ---------- Search ----------

    [Fact]
    public async Task Search_reads_the_name_the_public_summary_and_the_public_author_name()
    {
        // Name, ASCII case aside.
        Assert.Equal(["ashen crown", "Ashen Crown"], await Names("q=ASHEN&sort=az"));

        // Public summary only.
        Assert.Equal(["Brine Lanterns"], await Names("q=tide%20keeps"));

        // The author's public name - every world published under it.
        Assert.Equal(["Brine Lanterns", "ashen crown"], await Names("q=harrow"));

        // Surrounding space is not part of the search; blank is no search at all.
        Assert.Equal(["Cobalt Reach"], await Names("q=%20%20glass%20"));
        Assert.Equal(5, (await List("q=%20%20")).TotalCount);
    }

    [Fact]
    public async Task Search_wildcards_are_literal()
    {
        Assert.Equal(["Zephyr 100% Wild"], await Names("q=100%25"));
        Assert.Equal(["Zephyr 100% Wild"], await Names("q=%25"));
        Assert.Empty(await Names("q=%25%25"));
        Assert.Empty(await Names("q=_"));
    }

    [Fact]
    public async Task Nothing_private_is_searchable_or_counted()
    {
        // Its own word, from its summary, and its description: nothing, and nothing counted.
        foreach (var query in new[] { "q=quillfeather", "q=duskhollow", "q=secretly", "q=heir%20dies" })
        {
            var page = await List(query);
            Assert.Empty(page.Items);
            Assert.Equal(0, page.TotalCount);
        }

        // Words it shares with public worlds find only them.
        Assert.Equal(["ashen crown"], await Names("q=cinder"));
        Assert.DoesNotContain("Ashen Duskhollow", await Names("q=ashen&pageSize=48"));
        Assert.Equal(5, (await List("pageSize=48")).TotalCount);
        Assert.Equal(1, (await List("category=games&genre=fantasy")).TotalCount);
    }

    [Fact]
    public async Task The_response_under_every_filter_is_exactly_the_allow_list()
    {
        string[] allowed = ["authorDisplayName", "authorSlug", "cardImageUrl", "category", "genres", "name", "originalCreator", "originalWork", "publicSummary", "publishedAt", "slug"];

        foreach (var query in new[] { "q=oren", "category=games&sort=az", "genre=fantasy" })
        {
            using var body = JsonDocument.Parse(await (await _anonymous.GetAsync($"{PublicRoute}?{query}")).Content.ReadAsStringAsync());
            Assert.Equal(["items", "page", "pageSize", "totalCount", "totalPages"], body.RootElement.EnumerateObject().Select(member => member.Name).Order());
            var items = body.RootElement.GetProperty("items").EnumerateArray().ToList();
            Assert.NotEmpty(items);
            Assert.All(items, item => Assert.Equal(allowed, item.EnumerateObject().Select(member => member.Name).Order()));
        }
    }

    // ---------- Sort and paging ----------

    [Fact]
    public async Task Recent_is_first_publication_and_republishing_does_not_move_a_world()
    {
        string[] recent = ["Zephyr 100% Wild", "Ashen Crown", "Cobalt Reach", "Brine Lanterns", "ashen crown"];
        Assert.Equal(recent, await Names(string.Empty));
        Assert.Equal(recent, await Names("sort=recent"));

        // Yarrow is published, then Quince; Yarrow goes private and is published again, after Quince.
        var (author, _) = await Account(worlds.Factory, "explore-republish");
        var yarrow = await Ready(author, "Republished Yarrow", "Ines Harrow");
        await Published(author, yarrow.Id);
        var quince = await Ready(author, "Later Quince", "Ines Harrow");
        await Published(author, quince.Id);
        (await Unpublish(author, yarrow.Id)).EnsureSuccessStatusCode();
        await Published(author, yarrow.Id);

        // It keeps the place its first publication gave it: behind Quince.
        Assert.Equal(["Later Quince", "Republished Yarrow", .. recent], await Names(string.Empty));

        (await Unpublish(author, yarrow.Id)).EnsureSuccessStatusCode();
        (await Unpublish(author, quince.Id)).EnsureSuccessStatusCode();
        Assert.Equal(recent, await Names(string.Empty));
    }

    [Fact]
    public async Task A_to_z_ignores_case_and_the_address_breaks_ties()
    {
        var page = await List("sort=az");
        Assert.Equal(["ashen crown", "Ashen Crown", "Brine Lanterns", "Cobalt Reach", "Zephyr 100% Wild"], page.Items.Select(world => world.Name));

        // The two crowns share a name but for case; their addresses - minted in publication order - decide.
        Assert.Equal(["ashen-crown", "ashen-crown-2"], page.Items.Take(2).Select(world => world.Slug));
    }

    [Fact]
    public async Task Pages_neither_repeat_nor_skip_in_either_order()
    {
        foreach (var sort in new[] { "recent", "az" })
        {
            var whole = (await List($"sort={sort}&pageSize=48")).Items.Select(world => world.Slug).ToList();
            var paged = new List<string>();
            for (var number = 1; number <= 3; number++)
            {
                var page = await List($"sort={sort}&page={number}&pageSize=2");
                Assert.Equal((5, 3), (page.TotalCount, page.TotalPages));
                paged.AddRange(page.Items.Select(world => world.Slug));
            }

            Assert.Equal(whole, paged);
            Assert.Empty(await Names($"sort={sort}&page=4&pageSize=2"));
        }
    }

    [Fact]
    public async Task Out_of_range_paging_is_clamped_under_filters_too()
    {
        var clamped = await List("category=games&page=0&pageSize=0");
        Assert.Equal((1, 1, 2), (clamped.Page, clamped.PageSize, clamped.TotalCount));

        var widest = await List("q=a&page=-3&pageSize=9999");
        Assert.Equal((1, 48), (widest.Page, widest.PageSize));
    }

    // ---------- Refusals ----------

    [Theory]
    [InlineData("category=fantasy", "category")]
    [InlineData("category=Games", "category")]
    [InlineData("category=3", "category")]
    [InlineData("category=movies-%26-tv", "category")]
    [InlineData("genre=games", "genre")]
    [InlineData("genre=Fantasy", "genre")]
    [InlineData("genre=1", "genre")]
    [InlineData("genre=none", "genre")]
    [InlineData("sort=popular", "sort")]
    [InlineData("sort=AZ", "sort")]
    [InlineData("sort=trending", "sort")]
    public async Task An_unknown_key_or_order_is_refused_and_named(string query, string key)
    {
        var response = await _anonymous.GetAsync($"{PublicRoute}?{query}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal([key], await ErrorKeys(response));
        Assert.DoesNotContain("   at ", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_search_is_at_most_a_hundred_characters_and_several_refusals_are_named_together()
    {
        Assert.Equal(HttpStatusCode.OK, (await _anonymous.GetAsync($"{PublicRoute}?q={new string('a', 100)}")).StatusCode);

        var tooLong = await _anonymous.GetAsync($"{PublicRoute}?q={new string('a', 101)}");
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(["q"], await ErrorKeys(tooLong));

        var several = await _anonymous.GetAsync($"{PublicRoute}?category=x&genre=y&sort=z");
        Assert.Equal(["category", "genre", "sort"], (await ErrorKeys(several)).Order());
    }

    [Fact]
    public async Task Every_category_and_genre_has_the_key_the_portal_addresses_it_by()
    {
        // The web client's `publishing/types.ts` lists the same keys; a shared Explore address depends on them.
        Assert.Equal(
            ["original", "movies-and-tv", "games", "books", "comics", "tabletop-and-rpg", "audio", "other"],
            PublicUniverseEndpoints.CategoryKeys.OrderBy(pair => pair.Value).Select(pair => pair.Key));
        Assert.Equal(
            ["fantasy", "science-fiction", "adventure", "horror", "mystery", "historical", "romance", "thriller", "supernatural", "post-apocalyptic", "contemporary", "other"],
            PublicUniverseEndpoints.GenreKeys.OrderBy(pair => pair.Value).Select(pair => pair.Key));

        foreach (var key in PublicUniverseEndpoints.CategoryKeys.Keys)
        {
            Assert.Equal(HttpStatusCode.OK, (await _anonymous.GetAsync($"{PublicRoute}?category={key}")).StatusCode);
        }

        foreach (var key in PublicUniverseEndpoints.GenreKeys.Keys)
        {
            Assert.Equal(HttpStatusCode.OK, (await _anonymous.GetAsync($"{PublicRoute}?genre={key}")).StatusCode);
        }
    }
}
