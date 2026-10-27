using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Universes;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The HTTP steps the publishing tests share: accounts, a universe made ready to publish, the owner's
/// routes, the anonymous ones, and pictures to upload. Not a test.
///
/// Credentials are obviously synthetic.
/// </summary>
internal static class PublishingTestClient
{
    public const string Password = "Test-password-123!";

    public const string PublicRoute = "/api/public/universes";

    /// <summary>A signed-in client and its account id.</summary>
    public static async Task<(HttpClient Client, string UserId)> Account(LorEvolveApiFactory factory, string tag)
    {
        var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest($"user-{tag}", $"{tag}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    /// <summary>No session at all: what anyone on the internet is.</summary>
    public static HttpClient Anonymous(LorEvolveApiFactory factory) => factory.CreateClient();

    public static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name, string? description = null)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, description, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    public static Task<HttpResponseMessage> SaveDetails(
        HttpClient client,
        Guid universeId,
        string? summary,
        UniverseCategory? category,
        params UniverseGenres[] genres) =>
        client.PutAsJsonAsync(
            $"/api/universes/{universeId}/publication",
            new PublicationDetailsRequest(summary, category, genres));

    public static async Task<PublicationState> SavedDetails(
        HttpClient client,
        Guid universeId,
        string? summary,
        UniverseCategory? category,
        params UniverseGenres[] genres)
    {
        var response = await SaveDetails(client, universeId, summary, category, genres);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<PublicationState>())!;
    }

    public static async Task<PublicationState> State(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<PublicationState>($"/api/universes/{universeId}/publication"))!;

    public static Task<HttpResponseMessage> Publish(HttpClient client, Guid universeId) =>
        client.PostAsync($"/api/universes/{universeId}/publish", null);

    public static Task<HttpResponseMessage> Unpublish(HttpClient client, Guid universeId) =>
        client.PostAsync($"/api/universes/{universeId}/unpublish", null);

    public static async Task<PublicationState> Published(HttpClient client, Guid universeId)
    {
        var response = await Publish(client, universeId);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<PublicationState>())!;
    }

    public static Task<HttpResponseMessage> SetPublicName(HttpClient client, string? name) =>
        client.PutAsJsonAsync("/api/profile/public-name", new PublicNameRequest(name));

    public static async Task<HttpResponseMessage> UploadArtwork(
        HttpClient client,
        Guid universeId,
        byte[] bytes,
        string fileName = "art.png",
        ImageCrop? crop = null)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(fileName.EndsWith(".jpg", StringComparison.Ordinal) ? "image/jpeg" : "image/png");
        form.Add(file, "file", fileName);

        if (crop is not null)
        {
            form.Add(new StringContent(JsonSerializer.Serialize(crop, JsonSerializerOptions.Web)), "crop");
        }

        return await client.PutAsync($"/api/universes/{universeId}/artwork", form);
    }

    public static async Task<UniverseArtworkRef> UploadedArtwork(
        HttpClient client,
        Guid universeId,
        byte[] bytes,
        string fileName = "art.png",
        ImageCrop? crop = null)
    {
        var response = await UploadArtwork(client, universeId, bytes, fileName, crop);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<UniverseArtworkRef>())!;
    }

    /// <summary>
    /// A universe with everything publishing needs, not yet published: a summary, a category, two genres,
    /// artwork, and its owner's public name.
    /// </summary>
    public static async Task<UniverseDetail> Ready(HttpClient client, string name, string author = "Mara Vell")
    {
        var universe = await CreateUniverse(client, name, "Private notes: the heir dies in book three.");
        await SavedDetails(client, universe.Id, "A drowned coast where the tide keeps count.", UniverseCategory.Books, UniverseGenres.Fantasy, UniverseGenres.Adventure);
        await UploadedArtwork(client, universe.Id, Png(1600, 1000));
        (await SetPublicName(client, author)).EnsureSuccessStatusCode();
        return universe;
    }

    public static async Task<PublicUniverse?> PublicBySlug(HttpClient client, string slug)
    {
        var response = await client.GetAsync($"{PublicRoute}/{slug}");
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<PublicUniverse>();
    }

    /// <summary>Every public universe, across as many pages as there are.</summary>
    public static async Task<List<PublicUniverse>> PublicListing(HttpClient client)
    {
        var all = new List<PublicUniverse>();
        for (var page = 1; ; page++)
        {
            var result = (await client.GetFromJsonAsync<PublicUniversePage>($"{PublicRoute}?page={page}&pageSize=48"))!;
            all.AddRange(result.Items);
            if (page >= result.TotalPages)
            {
                return all;
            }
        }
    }

    public static async Task<string?> ProblemCode(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    public static async Task<HashSet<string>> ErrorKeys(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.TryGetProperty("errors", out var errors)
            ? [.. errors.EnumerateObject().Select(error => error.Name)]
            : [];
    }

    /// <summary>A picture with structure in it, so a re-encode cannot collapse to one flat colour.</summary>
    public static byte[] Png(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = new Rgba32((byte)(x % 251), (byte)(y % 241), (byte)((x + y) % 233));
                }
            }
        });

        return Encode(image);
    }

    /// <summary>Red on the left half, blue on the right, so which part a card shows can be read from its pixels.</summary>
    public static byte[] Halves(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = x < width / 2 ? new Rgba32(220, 30, 30) : new Rgba32(30, 30, 220);
                }
            }
        });

        return Encode(image);
    }

    private static byte[] Encode(Image<Rgba32> image)
    {
        using var buffer = new MemoryStream();
        image.SaveAsPng(buffer);
        return buffer.ToArray();
    }
}
