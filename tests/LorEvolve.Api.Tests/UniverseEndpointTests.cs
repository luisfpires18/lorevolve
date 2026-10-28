using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Universe CRUD plus the ownership invariant: a user must never reach another user's
/// universe through any verb, and a cross-owner attempt must be indistinguishable from
/// a universe that does not exist.
/// </summary>
public sealed class UniverseEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Anonymous access ----------

    [Theory]
    [InlineData("GET", "/api/universes")]
    [InlineData("POST", "/api/universes")]
    [InlineData("GET", "/api/universes/11111111-1111-1111-1111-111111111111")]
    [InlineData("PUT", "/api/universes/11111111-1111-1111-1111-111111111111")]
    [InlineData("POST", "/api/universes/11111111-1111-1111-1111-111111111111/archive")]
    [InlineData("POST", "/api/universes/11111111-1111-1111-1111-111111111111/unarchive")]
    [InlineData("DELETE", "/api/universes/11111111-1111-1111-1111-111111111111")]
    public async Task Universe_endpoints_reject_anonymous_callers(string method, string path)
    {
        using var client = _factory.CreateClient();

        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method is "POST" or "PUT")
        {
            request.Content = JsonContent.Create(new CreateUniverseRequest("Anything", null, null));
        }

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ---------- Owner happy path ----------

    [Fact]
    public async Task Owner_can_create_and_read_a_universe()
    {
        using var client = await SignedInClient("creator");

        var created = await CreateUniverse(client, "The Ashen Reach", "A drowned continent.", "#4F6BD6");

        Assert.Equal("The Ashen Reach", created.Name);
        Assert.Equal("A drowned continent.", created.Description);
        Assert.Equal("#4f6bd6", created.AccentColor);
        Assert.False(created.IsArchived);

        var fetched = await client.GetFromJsonAsync<UniverseDetail>($"/api/universes/{created.Id}");

        Assert.Equal(created.Id, fetched?.Id);
    }

    [Fact]
    public async Task Owner_can_update_their_universe()
    {
        using var client = await SignedInClient("editor");
        var created = await CreateUniverse(client, "Draft World");

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{created.Id}",
            new UpdateUniverseRequest("Renamed World", "Now with a description.", "#1a9c7b"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.Content.ReadFromJsonAsync<UniverseDetail>();
        Assert.Equal("Renamed World", updated?.Name);
        Assert.Equal("Now with a description.", updated?.Description);
    }

    [Fact]
    public async Task Owner_can_archive_and_unarchive()
    {
        using var client = await SignedInClient("archivist");
        var created = await CreateUniverse(client, "Shelved World");

        var archived = await client.PostAsync($"/api/universes/{created.Id}/archive", content: null);
        Assert.Equal(HttpStatusCode.OK, archived.StatusCode);
        Assert.True((await archived.Content.ReadFromJsonAsync<UniverseDetail>())?.IsArchived);

        // Archived universes drop out of the default list and come back when asked for.
        Assert.DoesNotContain(await ListNames(client), name => name == "Shelved World");
        Assert.Contains(await ListNames(client, includeArchived: true), name => name == "Shelved World");

        var unarchived = await client.PostAsync($"/api/universes/{created.Id}/unarchive", content: null);
        Assert.Equal(HttpStatusCode.OK, unarchived.StatusCode);
        Assert.False((await unarchived.Content.ReadFromJsonAsync<UniverseDetail>())?.IsArchived);
        Assert.Contains(await ListNames(client), name => name == "Shelved World");
    }

    [Fact]
    public async Task Delete_requires_the_universe_to_be_archived_first()
    {
        using var client = await SignedInClient("deleter");
        var created = await CreateUniverse(client, "Doomed World");

        var tooSoon = await client.DeleteAsync($"/api/universes/{created.Id}");
        Assert.Equal(HttpStatusCode.Conflict, tooSoon.StatusCode);

        await client.PostAsync($"/api/universes/{created.Id}/archive", content: null);

        var deleted = await client.DeleteAsync($"/api/universes/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var gone = await client.GetAsync($"/api/universes/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
    }

    [Fact]
    public async Task Duplicate_names_are_rejected_for_the_same_owner()
    {
        using var client = await SignedInClient("namer");
        await CreateUniverse(client, "Only One");

        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest("Only One", null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Two_owners_may_use_the_same_universe_name()
    {
        using var first = await SignedInClient("twinowner-a");
        using var second = await SignedInClient("twinowner-b");

        await CreateUniverse(first, "Parallel World");
        var created = await CreateUniverse(second, "Parallel World");

        Assert.Equal("Parallel World", created.Name);
    }

    [Fact]
    public async Task Creation_rejects_a_missing_name()
    {
        using var client = await SignedInClient("nameless");

        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest("   ", null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Creation_rejects_a_malformed_accent_colour()
    {
        using var client = await SignedInClient("painter");

        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest("Coloured World", null, "not-a-colour"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---------- Ownership invariant ----------

    [Fact]
    public async Task List_returns_only_the_callers_own_universes()
    {
        using var alice = await SignedInClient("owner-list-a");
        using var bob = await SignedInClient("owner-list-b");

        await CreateUniverse(alice, "Alice Only");
        await CreateUniverse(bob, "Bob Only");

        var aliceNames = await ListNames(alice, includeArchived: true);
        var bobNames = await ListNames(bob, includeArchived: true);

        Assert.Equal(["Alice Only"], aliceNames);
        Assert.Equal(["Bob Only"], bobNames);
    }

    [Fact]
    public async Task Search_never_reaches_another_owners_universe()
    {
        using var alice = await SignedInClient("owner-search-a");
        using var bob = await SignedInClient("owner-search-b");

        await CreateUniverse(alice, "Secret Cartography");
        await CreateUniverse(bob, "Secret Bakery");

        var bobResults = await ListNames(bob, search: "Secret", includeArchived: true);

        Assert.Equal(["Secret Bakery"], bobResults);
    }

    [Fact]
    public async Task Search_treats_wildcards_as_literal_characters()
    {
        using var client = await SignedInClient("wildcard");
        await CreateUniverse(client, "Plain World");

        var results = await ListNames(client, search: "%");

        Assert.Empty(results);
    }

    [Fact]
    public async Task Pagination_stays_owner_scoped()
    {
        using var alice = await SignedInClient("owner-page-a");
        using var bob = await SignedInClient("owner-page-b");

        for (var index = 0; index < 3; index++)
        {
            await CreateUniverse(alice, $"Alice World {index}");
            await CreateUniverse(bob, $"Bob World {index}");
        }

        var page = await bob.GetFromJsonAsync<UniversePage>("/api/universes?page=1&pageSize=50");

        Assert.NotNull(page);
        Assert.Equal(3, page.TotalCount);
        Assert.All(page.Items, item => Assert.StartsWith("Bob World", item.Name, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Pagination_splits_a_single_owners_universes_deterministically()
    {
        using var client = await SignedInClient("pager");

        for (var index = 0; index < 5; index++)
        {
            await CreateUniverse(client, $"Paged World {index}");
        }

        var first = await client.GetFromJsonAsync<UniversePage>("/api/universes?page=1&pageSize=2");
        var second = await client.GetFromJsonAsync<UniversePage>("/api/universes?page=2&pageSize=2");

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(5, first.TotalCount);
        Assert.Equal(3, first.TotalPages);
        Assert.Equal(2, first.Items.Count);
        Assert.Empty(first.Items.Select(item => item.Id).Intersect(second.Items.Select(item => item.Id)));
    }

    [Fact]
    public async Task A_user_cannot_read_another_users_universe()
    {
        var (_, victimUniverse) = await VictimUniverse("read");
        using var attacker = await SignedInClient("attacker-read");

        var response = await attacker.GetAsync($"/api/universes/{victimUniverse.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_cross_owner_read_is_indistinguishable_from_a_missing_universe()
    {
        var (_, victimUniverse) = await VictimUniverse("indistinguishable");
        using var attacker = await SignedInClient("attacker-probe");

        var someoneElses = await attacker.GetAsync($"/api/universes/{victimUniverse.Id}");
        var nonExistent = await attacker.GetAsync($"/api/universes/{Guid.NewGuid()}");

        Assert.Equal(nonExistent.StatusCode, someoneElses.StatusCode);
        Assert.Equal(
            await nonExistent.Content.ReadAsStringAsync(),
            await someoneElses.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_user_cannot_update_another_users_universe()
    {
        var (victim, victimUniverse) = await VictimUniverse("update");
        using var attacker = await SignedInClient("attacker-update");

        var response = await attacker.PutAsJsonAsync(
            $"/api/universes/{victimUniverse.Id}",
            new UpdateUniverseRequest("Hijacked", "Taken over.", "#000000"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var untouched = await victim.GetFromJsonAsync<UniverseDetail>($"/api/universes/{victimUniverse.Id}");
        Assert.Equal(victimUniverse.Name, untouched?.Name);
    }

    [Fact]
    public async Task A_user_cannot_archive_or_unarchive_another_users_universe()
    {
        var (victim, victimUniverse) = await VictimUniverse("archive");
        using var attacker = await SignedInClient("attacker-archive");

        var archive = await attacker.PostAsync($"/api/universes/{victimUniverse.Id}/archive", content: null);
        var unarchive = await attacker.PostAsync($"/api/universes/{victimUniverse.Id}/unarchive", content: null);

        Assert.Equal(HttpStatusCode.NotFound, archive.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unarchive.StatusCode);

        var untouched = await victim.GetFromJsonAsync<UniverseDetail>($"/api/universes/{victimUniverse.Id}");
        Assert.False(untouched?.IsArchived);
    }

    [Fact]
    public async Task A_user_cannot_delete_another_users_universe()
    {
        var (victim, victimUniverse) = await VictimUniverse("delete");
        await victim.PostAsync($"/api/universes/{victimUniverse.Id}/archive", content: null);

        using var attacker = await SignedInClient("attacker-delete");
        var response = await attacker.DeleteAsync($"/api/universes/{victimUniverse.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var stillThere = await victim.GetAsync($"/api/universes/{victimUniverse.Id}");
        Assert.Equal(HttpStatusCode.OK, stillThere.StatusCode);
    }

    [Fact]
    public async Task Ownership_cannot_be_set_by_the_client()
    {
        using var alice = await SignedInClient("overpost-a");
        using var bob = await SignedInClient("overpost-b");

        var bobId = (await bob.GetFromJsonAsync<AuthUserResponse>("/api/auth/me"))!.Id;

        // Extra properties are ignored: the request record has no ownership surface.
        var response = await alice.PostAsJsonAsync(
            "/api/universes",
            new { name = "Overposted", ownerId = bobId, isArchived = true, id = Guid.NewGuid() });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<UniverseDetail>();
        Assert.False(created?.IsArchived);

        Assert.Contains(await ListNames(alice), name => name == "Overposted");
        Assert.DoesNotContain(await ListNames(bob, includeArchived: true), name => name == "Overposted");
    }

    // ---------- Helpers ----------

    private async Task<(HttpClient Client, UniverseDetail Universe)> VictimUniverse(string tag)
    {
        var victim = await SignedInClient($"victim-{tag}");
        var universe = await CreateUniverse(victim, $"Victim World {tag}", "Private notes.");
        return (victim, universe);
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

    private static async Task<UniverseDetail> CreateUniverse(
        HttpClient client,
        string name,
        string? description = null,
        string? accentColor = null)
    {
        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest(name, description, accentColor));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<List<string>> ListNames(
        HttpClient client,
        string? search = null,
        bool includeArchived = false)
    {
        var query = $"/api/universes?includeArchived={includeArchived}&pageSize=50";
        if (search is not null)
        {
            query += $"&search={Uri.EscapeDataString(search)}";
        }

        var page = await client.GetFromJsonAsync<UniversePage>(query);
        return page!.Items.Select(item => item.Name).ToList();
    }
}
