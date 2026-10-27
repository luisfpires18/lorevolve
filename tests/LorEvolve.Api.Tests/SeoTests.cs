using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Seo;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Trash;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Search and social metadata (Task 012, ADR 0038).
///
/// The claims this file carries. LorEvolve's home (031) is a page with its own fixed head, not a redirect. The app shell's head
/// is written on the server from the public predicates alone: a public universe, entry, story or author page has its own title, a description from public text only (a story's public summary,
/// never its premise), a canonical address and Open Graph on the configured origin - never the request's Host - while
/// anything private, trashed, incomplete or missing is one 404 with a generic noindex head that names nothing. Workspace
/// and sign-in pages are noindex. The sitemap lists exactly the effective-public addresses and loses an item the moment it
/// is unpublished; robots.txt and the sitemap shut everything out on a deployment not configured for indexing. The Trash
/// says whether a restore would publish again.
/// </summary>
public sealed partial class SeoTests : IClassFixture<LorEvolveApiFactory>, IDisposable
{
    private const string Origin = "https://lorevolve.example";

    private static readonly string Shell = """
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <!-- lorevolve:head -->
            <title>LorEvolve</title>
            <meta name="robots" content="noindex,nofollow" />
            <!-- /lorevolve:head -->
          </head>
          <body><div id="root"></div></body>
        </html>
        """;

    private readonly string _shellPath = Path.Combine(Path.GetTempPath(), $"lorevolve-shell-{Guid.NewGuid():N}.html");
    private readonly WebApplicationFactory<Program> _site;

    public SeoTests(LorEvolveApiFactory factory)
    {
        File.WriteAllText(_shellPath, Shell);
        _site = factory.WithWebHostBuilder(builder => builder
            .UseSetting("Frontend:ShellPath", _shellPath)
            .UseSetting("PublicSite:Origin", Origin)
            .UseSetting("PublicSite:AllowIndexing", "true"));
    }

    public void Dispose()
    {
        _site.Dispose();
        File.Delete(_shellPath);
    }

    // ---------- Pages ----------

    [Fact]
    public async Task A_public_universe_page_has_its_own_head_on_the_configured_origin()
    {
        var owner = await Owner("seo-world");
        var universe = await Ready(owner, "Salt <Coast>");
        var world = await Published(owner, universe.Id);

        var anonymous = _site.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/worlds/{world.PublicSlug}");
        request.Headers.Host = "evil.example";
        var response = await anonymous.SendAsync(request);
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-cache", response.Headers.CacheControl?.ToString());
        Assert.Contains("<title>Salt &lt;Coast&gt; | LorEvolve</title>", html, StringComparison.Ordinal);
        Assert.DoesNotContain("<Coast>", html, StringComparison.Ordinal);
        Assert.Equal("A drowned coast where the tide keeps count.", Meta(html, "name", "description"));
        Assert.Equal("index,follow", Meta(html, "name", "robots"));
        Assert.Equal($"{Origin}/worlds/{world.PublicSlug}", Canonical(html));
        Assert.Equal($"{Origin}/worlds/{world.PublicSlug}", Meta(html, "property", "og:url"));
        Assert.Equal("website", Meta(html, "property", "og:type"));
        Assert.StartsWith($"{Origin}/api/public/universes/{world.PublicSlug}/artwork/card/", Meta(html, "property", "og:image"), StringComparison.Ordinal);
        Assert.Equal("summary_large_image", Meta(html, "name", "twitter:card"));

        // The Host header wrote nothing; the private description is nowhere.
        Assert.DoesNotContain("evil.example", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Private notes", html, StringComparison.Ordinal);
        Assert.DoesNotContain(universe.Id.ToString(), html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Private_missing_and_malformed_public_addresses_are_one_noindex_404_that_names_nothing()
    {
        var owner = await Owner("seo-private");
        var universe = await Ready(owner, "Hidden Reach");
        var world = await Published(owner, universe.Id);
        (await Unpublish(owner, universe.Id)).EnsureSuccessStatusCode();

        var anonymous = _site.CreateClient();
        foreach (var path in new[]
        {
            $"/worlds/{world.PublicSlug}",
            "/worlds/nobody-holds-this",
            "/worlds/Not_A_Slug",
            $"/worlds/{world.PublicSlug}/lore/anything",
            $"/worlds/{world.PublicSlug}/stories/anything",
            "/authors/nobody-holds-this",
            "/worlds/a/b/c/d/e",
        })
        {
            var response = await anonymous.GetAsync(path);
            var html = await response.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("noindex,nofollow", Meta(html, "name", "robots"));
            Assert.Contains("<title>Page not available | LorEvolve</title>", html, StringComparison.Ordinal);
            Assert.Null(Canonical(html));
            Assert.Null(Meta(html, "property", "og:title"));
            Assert.DoesNotContain("Hidden Reach", html, StringComparison.Ordinal);
            Assert.Equal("noindex,nofollow", response.Headers.GetValues("X-Robots-Tag").Single());
        }
    }

    [Fact]
    public async Task Entry_and_story_pages_use_public_text_only_and_follow_both_levels()
    {
        var owner = await Owner("seo-content");
        var universe = await Ready(owner, "Glass Ebb");
        var u = universe.Id;
        var entry = await Entry(owner, u, "Salt Warden", "Keeper of the count.");
        var secret = await Entry(owner, u, "Secret Heir", "Dies in book three.");
        (await owner.PostAsync($"/api/universes/{u}/entities/{entry}/publish", null)).EnsureSuccessStatusCode();

        var story = await PlotTestClient.PostJson<StoryDetail>(
            owner, PlotTestClient.Stories(u), new StoryRequest("The Tide Count", "Premise secret: the narrator drowns.", StoryStatus.Drafting));
        (await SaveSummary(owner, u, story.Id, "A tide that counts the drowned.")).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{PlotTestClient.Story(u, story.Id)}/publish", null)).EnsureSuccessStatusCode();
        var world = await Published(owner, u);
        var anonymous = _site.CreateClient();

        var lore = await anonymous.GetStringAsync($"/worlds/{world.PublicSlug}/lore/salt-warden");
        Assert.Contains("<title>Salt Warden | Glass Ebb | LorEvolve</title>", lore, StringComparison.Ordinal);
        Assert.Equal("Keeper of the count.", Meta(lore, "name", "description"));
        Assert.Equal("article", Meta(lore, "property", "og:type"));
        Assert.Equal($"{Origin}/worlds/{world.PublicSlug}/lore/salt-warden", Canonical(lore));

        var page = await anonymous.GetStringAsync($"/worlds/{world.PublicSlug}/stories/the-tide-count");
        Assert.Contains("<title>The Tide Count | Glass Ebb | LorEvolve</title>", page, StringComparison.Ordinal);
        Assert.Equal("A tide that counts the drowned.", Meta(page, "name", "description"));
        Assert.Equal("A tide that counts the drowned.", Meta(page, "property", "og:description"));
        Assert.DoesNotContain("Premise secret", page, StringComparison.Ordinal);

        // A private entry under a public universe is not a page.
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/worlds/{world.PublicSlug}/lore/secret-heir")).StatusCode);
        Assert.NotEqual(Guid.Empty, secret);

        // A public entry under a private universe is not either.
        (await Unpublish(owner, u)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/worlds/{world.PublicSlug}/lore/salt-warden")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/worlds/{world.PublicSlug}/stories/the-tide-count")).StatusCode);
    }

    [Fact]
    public async Task An_author_page_has_a_conservative_head_and_only_while_they_have_a_public_world()
    {
        var owner = await Owner("seo-author");
        var universe = await Ready(owner, "Unreally", author: "Ines Arbor");
        await Published(owner, universe.Id);
        var anonymous = _site.CreateClient();
        var slug = (await PublicBySlug(anonymous, "unreally"))!.AuthorSlug;

        var html = await anonymous.GetStringAsync($"/authors/{slug}");
        Assert.Contains("<title>Ines Arbor | LorEvolve</title>", html, StringComparison.Ordinal);
        Assert.Equal("Ines Arbor, creator on LorEvolve. Worlds: Unreally.", Meta(html, "name", "description"));
        Assert.Equal("profile", Meta(html, "property", "og:type"));
        // No photo was chosen for the author page, so the picture is the brand's, never the private photo.
        Assert.Equal($"{Origin}/icon-512.png", Meta(html, "property", "og:image"));
        Assert.DoesNotContain("@example.test", html, StringComparison.Ordinal);
        Assert.DoesNotContain("user-seo-author", html, StringComparison.Ordinal);

        (await Unpublish(owner, universe.Id)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/authors/{slug}")).StatusCode);
    }

    [Fact]
    public async Task Workspace_sign_in_and_unknown_pages_are_noindex_and_home_and_Explore_have_one_canonical()
    {
        var anonymous = _site.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        foreach (var path in new[] { "/app", "/app/profile", "/app/universes/x/lore", "/login", "/register", "/somewhere-else" })
        {
            var response = await anonymous.GetAsync(path);
            var html = await response.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("noindex,nofollow", Meta(html, "name", "robots"));
            Assert.Equal("noindex,nofollow", response.Headers.GetValues("X-Robots-Tag").Single());
            Assert.Null(Canonical(html));
            Assert.Null(Meta(html, "property", "og:title"));
        }

        var explore = await anonymous.GetStringAsync("/explore");
        Assert.Contains("<title>Explore Worlds | LorEvolve</title>", explore, StringComparison.Ordinal);
        Assert.Equal("index,follow", Meta(explore, "name", "robots"));
        Assert.Equal($"{Origin}/explore", Canonical(explore));

        var searched = await anonymous.GetStringAsync("/explore?q=salt&category=books");
        Assert.Equal("noindex,follow", Meta(searched, "name", "robots"));
        Assert.Equal($"{Origin}/explore", Canonical(searched));

        // LorEvolve's home (031) is a page of its own, not a redirect to Explore: its own head and one canonical address, which
        // a tracking query does not change.
        var root = await anonymous.GetAsync("/");
        var home = await root.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, root.StatusCode);
        Assert.Equal(PageMetadataResolver.HomeTitle, Meta(home, "property", "og:title"));
        Assert.Contains("<title>LorEvolve | Build connected fictional universes</title>", home, StringComparison.Ordinal);
        Assert.Equal(PageMetadataResolver.HomeDescription, Meta(home, "name", "description"));
        Assert.Equal("index,follow", Meta(home, "name", "robots"));
        Assert.Equal($"{Origin}/", Canonical(home));
        Assert.Equal($"{Origin}/icon-512.png", Meta(home, "property", "og:image"));

        var tagged = await anonymous.GetStringAsync("/?ref=elsewhere");
        Assert.Equal("noindex,follow", Meta(tagged, "name", "robots"));
        Assert.Equal($"{Origin}/", Canonical(tagged));

        // The API is not a page to index, and an unknown API path is still a 404, not the shell.
        var api = await anonymous.GetAsync("/api/public/universes");
        Assert.Equal("noindex", api.Headers.GetValues("X-Robots-Tag").Single());
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/no-such-route")).StatusCode);
    }

    // ---------- Sitemap and robots ----------

    [Fact]
    public async Task The_sitemap_lists_exactly_the_effective_public_addresses_and_forgets_an_unpublished_one()
    {
        var owner = await Owner("seo-map");
        var universe = await Ready(owner, "Mapped Coast", author: "Tomas Rill");
        var u = universe.Id;
        var shown = await Entry(owner, u, "Lighthouse", null);
        await Entry(owner, u, "Unselected Heir", null);
        (await owner.PostAsync($"/api/universes/{u}/entities/{shown}/publish", null)).EnsureSuccessStatusCode();

        // A story selected without a public summary stays hidden (Task 011), so it is not in the sitemap either.
        var summarised = await PlotTestClient.PostJson<StoryDetail>(owner, PlotTestClient.Stories(u), new StoryRequest("Told Story", "Premise one.", StoryStatus.Planning));
        (await SaveSummary(owner, u, summarised.Id, "For readers.")).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{PlotTestClient.Story(u, summarised.Id)}/publish", null)).EnsureSuccessStatusCode();

        var world = await Published(owner, u);

        // Another author, whose only world is private: absent, and so are its selected entries.
        var (other, _) = await Account(_site, "seo-map-other");
        var hidden = await Ready(other, "Private Shelf", author: "Nobody Public");
        var hiddenEntry = await Entry(other, hidden.Id, "Shelf Keeper", null);
        (await other.PostAsync($"/api/universes/{hidden.Id}/entities/{hiddenEntry}/publish", null)).EnsureSuccessStatusCode();

        var anonymous = _site.CreateClient();
        var author = (await PublicBySlug(anonymous, world.PublicSlug!))!.AuthorSlug;
        var map = await anonymous.GetAsync("/sitemap.xml");
        Assert.Equal("application/xml", map.Content.Headers.ContentType?.MediaType);
        var locations = Locations(await map.Content.ReadAsStringAsync());

        Assert.Contains($"{Origin}/", locations);
        Assert.Contains($"{Origin}/explore", locations);
        Assert.Contains($"{Origin}/worlds/{world.PublicSlug}", locations);
        Assert.Contains($"{Origin}/worlds/{world.PublicSlug}/lore/lighthouse", locations);
        Assert.Contains($"{Origin}/worlds/{world.PublicSlug}/stories/told-story", locations);
        Assert.Contains($"{Origin}/authors/{author}", locations);
        Assert.DoesNotContain(locations, location => location.Contains("unselected", StringComparison.Ordinal));
        Assert.DoesNotContain(locations, location => location.Contains("private-shelf", StringComparison.Ordinal));
        Assert.DoesNotContain(locations, location => location.Contains("shelf-keeper", StringComparison.Ordinal));
        Assert.DoesNotContain(locations, location => location.Contains("nobody-public", StringComparison.Ordinal));
        Assert.DoesNotContain(locations, location => location.Contains("/api/", StringComparison.Ordinal) || location.Contains("/app", StringComparison.Ordinal));
        Assert.DoesNotContain(locations, location => Guid.TryParse(location.Split('/')[^1], out _));

        // Unpublishing the entry drops it from the next read; making the universe private drops everything in it and its author.
        (await owner.PostAsync($"/api/universes/{u}/entities/{shown}/unpublish", null)).EnsureSuccessStatusCode();
        Assert.DoesNotContain($"{Origin}/worlds/{world.PublicSlug}/lore/lighthouse", Locations(await anonymous.GetStringAsync("/sitemap.xml")));

        (await Unpublish(owner, u)).EnsureSuccessStatusCode();
        var after = Locations(await anonymous.GetStringAsync("/sitemap.xml"));
        Assert.DoesNotContain(after, location => location.Contains(world.PublicSlug!, StringComparison.Ordinal));
        Assert.DoesNotContain($"{Origin}/authors/{author}", after);
    }

    [Fact]
    public async Task Robots_invites_the_portal_and_keeps_the_workspace_out()
    {
        var text = await _site.CreateClient().GetStringAsync("/robots.txt");

        Assert.Contains("Allow: /worlds/", text, StringComparison.Ordinal);
        Assert.Contains("Allow: /api/public/", text, StringComparison.Ordinal);
        Assert.Contains("Disallow: /app", text, StringComparison.Ordinal);
        Assert.Contains("Disallow: /api/", text, StringComparison.Ordinal);
        Assert.Contains("Disallow: /login", text, StringComparison.Ordinal);
        Assert.Contains($"Sitemap: {Origin}/sitemap.xml", text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_deployment_not_configured_for_indexing_shuts_crawlers_out_and_emits_no_absolute_urls()
    {
        using var unconfigured = _site.WithWebHostBuilder(builder => builder
            .UseSetting("PublicSite:Origin", string.Empty)
            .UseSetting("PublicSite:AllowIndexing", "false"));
        var anonymous = unconfigured.CreateClient();

        Assert.Equal("User-agent: *\nDisallow: /\n", await anonymous.GetStringAsync("/robots.txt"));
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/sitemap.xml")).StatusCode);

        var home = await anonymous.GetStringAsync("/");
        Assert.Equal("noindex,nofollow", Meta(home, "name", "robots"));
        Assert.Null(Canonical(home));

        var explore = await anonymous.GetStringAsync("/explore");
        Assert.Equal("noindex,nofollow", Meta(explore, "name", "robots"));
        Assert.Null(Canonical(explore));
        Assert.Null(Meta(explore, "property", "og:url"));
        Assert.Null(Meta(explore, "property", "og:image"));
        Assert.Equal("Explore Worlds | LorEvolve", Meta(explore, "property", "og:title"));
    }

    [Theory]
    [InlineData("lorevolve.example")]
    [InlineData("ftp://lorevolve.example")]
    [InlineData("https://lorevolve.example/portal")]
    [InlineData("https://lorevolve.example/?a=1")]
    public void A_malformed_origin_fails_loudly(string origin)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["PublicSite:Origin"] = origin })
            .Build();
        Assert.Throws<InvalidOperationException>(() => PublicSite.From(configuration));
    }

    // ---------- Trash restore and publication ----------

    [Fact]
    public async Task The_Trash_says_whether_a_restore_would_publish_again()
    {
        var owner = await Owner("seo-trash");
        var universe = await Ready(owner, "Trash Tide");
        var u = universe.Id;
        var selected = await Entry(owner, u, "Selected One", null);
        var plain = await Entry(owner, u, "Plain One", null);
        (await owner.PostAsync($"/api/universes/{u}/entities/{selected}/publish", null)).EnsureSuccessStatusCode();

        var told = await PlotTestClient.PostJson<StoryDetail>(owner, PlotTestClient.Stories(u), new StoryRequest("Told", "p", StoryStatus.Planning));
        (await SaveSummary(owner, u, told.Id, "For readers.")).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{PlotTestClient.Story(u, told.Id)}/publish", null)).EnsureSuccessStatusCode();

        foreach (var id in new[] { selected, plain })
        {
            (await owner.DeleteAsync($"/api/universes/{u}/entities/{id}")).EnsureSuccessStatusCode();
        }

        (await owner.DeleteAsync(PlotTestClient.Story(u, told.Id))).EnsureSuccessStatusCode();

        // Universe private: selected, but a restore shows nothing.
        var privateTrash = await Trash(owner, u);
        Assert.Equal(TrashRestorePublication.Hidden, privateTrash["Selected One"]);
        Assert.Equal(TrashRestorePublication.Hidden, privateTrash["Told"]);
        Assert.Equal(TrashRestorePublication.None, privateTrash["Plain One"]);

        // Universe public: restoring would make them readable at once.
        await Published(owner, u);
        var publicTrash = await Trash(owner, u);
        Assert.Equal(TrashRestorePublication.Visible, publicTrash["Selected One"]);
        Assert.Equal(TrashRestorePublication.Visible, publicTrash["Told"]);
        Assert.Equal(TrashRestorePublication.None, publicTrash["Plain One"]);

        // And it does: the selection survived the Trash, as ADR 0036 says.
        (await owner.PostAsync($"/api/universes/{u}/trash/{selected}/restore", null)).EnsureSuccessStatusCode();
        var anonymous = _site.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"{PublicRoute}/trash-tide/lore/selected-one")).StatusCode);
    }

    // ---------- Helpers ----------

    private async Task<HttpClient> Owner(string tag) => (await Account(_site, tag)).Client;

    private static async Task<(HttpClient Client, string UserId)> Account(WebApplicationFactory<Program> site, string tag)
    {
        var client = site.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest($"user-{tag}", $"{tag}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    private static async Task<Guid> Entry(HttpClient client, Guid universeId, string name, string? summary)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        return (await PlotTestClient.PostJson<EntityDetail>(
            client,
            $"/api/universes/{universeId}/entities",
            new EntityRequest(types[0].Id, name, summary, CanonStatus.Draft, null, null, null))).Id;
    }

    private static Task<HttpResponseMessage> SaveSummary(HttpClient client, Guid universeId, Guid storyId, string? summary) =>
        client.PutAsJsonAsync($"{PlotTestClient.Story(universeId, storyId)}/publication", new StoryPublicationRequest(summary));

    private static async Task<Dictionary<string, TrashRestorePublication>> Trash(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<TrashPage>($"/api/universes/{universeId}/trash"))!.Items.ToDictionary(item => item.Name, item => item.Publication);

    private static string? Meta(string html, string attribute, string key)
    {
        var match = Regex.Match(html, $"<meta {attribute}=\"{Regex.Escape(key)}\" content=\"([^\"]*)\"");
        return match.Success ? WebUtility.HtmlDecode(match.Groups[1].Value) : null;
    }

    private static string? Canonical(string html)
    {
        var match = CanonicalLink().Match(html);
        return match.Success ? WebUtility.HtmlDecode(match.Groups[1].Value) : null;
    }

    private static List<string> Locations(string xml) => [.. LocElement().Matches(xml).Select(match => match.Groups[1].Value)];

    [GeneratedRegex("<link rel=\"canonical\" href=\"([^\"]*)\"")]
    private static partial Regex CanonicalLink();

    [GeneratedRegex("<loc>([^<]*)</loc>")]
    private static partial Regex LocElement();
}
