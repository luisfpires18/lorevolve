using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The desktop edition (ADR 0070): one local author signed in by the shell's launch token, loopback names only, none of
/// the web-only surfaces, pictures on disk.
/// </summary>
public sealed class DesktopEditionTests : IDisposable
{
    private const string Token = "a-launch-token-only-this-test-knows";

    private readonly LorEvolveApiFactory _factory = new()
    {
        EnvironmentName = "Desktop",
        Settings = new Dictionary<string, string?> { [DesktopLaunch.TokenKey] = Token },
    };

    public void Dispose() => _factory.Dispose();

    private HttpClient Client() => _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    [Fact]
    public async Task The_launch_token_signs_in_the_one_local_author_every_time()
    {
        using var client = Client();

        var launch = await client.GetAsync($"{DesktopLaunch.LaunchPath}?token={Token}");
        Assert.Equal(HttpStatusCode.Redirect, launch.StatusCode);
        Assert.Equal("/app", launch.Headers.Location?.OriginalString);

        var me = await client.GetFromJsonAsync<AuthUserResponse>("/api/auth/me");
        Assert.Equal(DesktopLaunch.LocalUserName, me!.Username);

        using var again = Client();
        (await again.GetAsync($"{DesktopLaunch.LaunchPath}?token={Token}")).EnsureRedirect();
        Assert.Equal(me.Id, (await again.GetFromJsonAsync<AuthUserResponse>("/api/auth/me"))!.Id);

        // The author can work: a universe is theirs to create.
        var created = await again.PostAsJsonAsync("/api/universes", new CreateUniverseRequest("Desk world", null, null));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("?token=")]
    [InlineData("?token=a-launch-token-only-this-test-know")]
    [InlineData("?token=a-launch-token-only-this-test-knows-and-more")]
    public async Task A_launch_without_the_token_signs_nothing_in(string query)
    {
        using var client = Client();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(DesktopLaunch.LaunchPath + query)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task A_host_started_without_a_token_signs_nobody_in()
    {
        using var factory = new LorEvolveApiFactory { EnvironmentName = "Desktop" };
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{DesktopLaunch.LaunchPath}?token=")).StatusCode);
    }

    [Fact]
    public async Task A_request_naming_another_host_is_refused()
    {
        using var client = Client();
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{DesktopLaunch.LaunchPath}?token={Token}");
        request.Headers.Host = "rebound.example";

        Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(request)).StatusCode);
    }

    [Theory]
    [InlineData("GET", "/api/public/universes")]
    [InlineData("GET", "/api/public/stats")]
    [InlineData("GET", "/api/public/authors/someone")]
    [InlineData("GET", "/robots.txt")]
    [InlineData("GET", "/sitemap.xml")]
    [InlineData("GET", "/api/auth/registration")]
    [InlineData("POST", "/api/auth/register")]
    [InlineData("POST", "/api/auth/login")]
    [InlineData("POST", "/api/auth/logout")]
    [InlineData("GET", "/api/admin/overview")]
    [InlineData("GET", "/api/profile/public-name")]
    public async Task Web_only_routes_are_not_there(string method, string path)
    {
        using var client = Client();
        (await client.GetAsync($"{DesktopLaunch.LaunchPath}?token={Token}")).EnsureRedirect();

        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method == "POST")
        {
            request.Content = JsonContent.Create(new { });
        }

        Assert.Equal(HttpStatusCode.NotFound, (await client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task Publishing_and_collaborators_are_not_there_for_a_real_universe()
    {
        using var client = Client();
        (await client.GetAsync($"{DesktopLaunch.LaunchPath}?token={Token}")).EnsureRedirect();
        var universe = (await (await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest("Kept home", null, null)))
            .Content.ReadFromJsonAsync<UniverseDetail>())!;

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/universes/{universe.Id}/publication")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/universes/{universe.Id}/collaborators")).StatusCode);
    }
}

/// <summary>The desktop edition's picture store: files on disk, written whole, typed by extension, kept inside its folder.</summary>
public sealed class FileSystemMediaObjectStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "lorevolve-media-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    [Fact]
    public async Task An_object_survives_a_new_store_on_the_same_folder_until_deleted()
    {
        const string key = "universes/u/entities/e/primary/a/thumbnail-t.webp";
        await new FileSystemMediaObjectStore(_root).PutAsync(key, new MemoryStream([1, 2, 3]), "image/webp", CancellationToken.None);

        var reopened = new FileSystemMediaObjectStore(_root);
        await using (var stored = await reopened.GetAsync(key, CancellationToken.None))
        {
            Assert.NotNull(stored);
            Assert.Equal("image/webp", stored.ContentType);
            Assert.Equal(3, stored.Length);
        }

        Assert.Empty(Directory.EnumerateFiles(_root, "*.partial", SearchOption.AllDirectories));

        await reopened.DeleteAsync(key, CancellationToken.None);
        await reopened.DeleteAsync(key, CancellationToken.None);
        Assert.Null(await reopened.GetAsync(key, CancellationToken.None));
    }

    [Fact]
    public async Task A_put_replaces_and_reads_its_type_from_the_extension()
    {
        var store = new FileSystemMediaObjectStore(_root);
        await store.PutAsync("a/original.png", new MemoryStream([1]), "image/png", CancellationToken.None);
        await store.PutAsync("a/original.png", new MemoryStream([1, 2]), "image/png", CancellationToken.None);

        await using var stored = await store.GetAsync("a/original.png", CancellationToken.None);
        Assert.Equal("image/png", stored!.ContentType);
        Assert.Equal(2, stored.Length);
    }

    [Theory]
    [InlineData("../outside.webp")]
    [InlineData("a/../../outside.webp")]
    public async Task A_key_that_leaves_the_folder_is_refused(string key)
    {
        var store = new FileSystemMediaObjectStore(_root);

        await Assert.ThrowsAsync<ArgumentException>(() =>
            store.PutAsync(key, new MemoryStream([1]), "image/webp", CancellationToken.None));
    }
}

internal static class RedirectAssertions
{
    public static void EnsureRedirect(this HttpResponseMessage response) =>
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
}
