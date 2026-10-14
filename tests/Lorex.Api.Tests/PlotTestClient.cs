using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// The steps the plot tests share: an account with a universe, lore, a story with chapters and scenes, arcs and
/// beats, and reading a backup back. Every write goes through the real host over HTTP.
///
/// Credentials are obviously synthetic.
/// </summary>
internal static class PlotTestClient
{
    private const string Password = "Test-password-123!";

    // ---------- Addresses ----------

    public static string Stories(Guid universeId) => $"/api/universes/{universeId}/stories";

    public static string Story(Guid universeId, Guid storyId) => $"{Stories(universeId)}/{storyId}";

    public static string Arcs(Guid universeId, Guid storyId) => $"{Story(universeId, storyId)}/plot-arcs";

    public static string Arc(Guid universeId, Guid storyId, Guid arcId) => $"{Arcs(universeId, storyId)}/{arcId}";

    public static string ArcBeats(Guid universeId, Guid storyId, Guid arcId) => $"{Arc(universeId, storyId, arcId)}/beats";

    public static string Beat(Guid universeId, Guid storyId, Guid beatId) => $"{Story(universeId, storyId)}/plot-beats/{beatId}";

    // ---------- Accounts, lore and stories ----------

    public static async Task<HttpClient> SignedIn(LorexApiFactory factory, string username)
    {
        var client = factory.CreateClient();
        (await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password))).EnsureSuccessStatusCode();
        return client;
    }

    public static async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(LorexApiFactory factory, string tag)
    {
        var client = await SignedIn(factory, $"user-{tag}");
        return (client, await CreateUniverse(client, $"World {tag}"));
    }

    public static Task<UniverseDetail> CreateUniverse(HttpClient client, string name) =>
        PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest(name, null, null));

    public static async Task<Guid> CreateEntity(HttpClient client, Guid universeId, string name)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        var entity = await PostJson<EntityDetail>(
            client,
            $"/api/universes/{universeId}/entities",
            new EntityRequest(types.First(type => type.Name == "Character").Id, name, null, CanonStatus.Canon, null, null, null));
        return entity.Id;
    }

    public static async Task<Guid> CreateStory(HttpClient client, Guid universeId, string title) =>
        (await PostJson<StoryDetail>(client, Stories(universeId), new StoryRequest(title, null, StoryStatus.Planning))).Id;

    public static async Task<Guid> CreateChapter(HttpClient client, Guid universeId, Guid storyId, string title) =>
        (await PostJson<ChapterResponse>(client, $"{Story(universeId, storyId)}/chapters", new ChapterRequest(title, null, null))).Id;

    public static async Task<Guid> CreateScene(HttpClient client, Guid universeId, Guid storyId, string title, Guid? chapterId = null) =>
        (await PostJson<SceneResponse>(
            client,
            $"{Story(universeId, storyId)}/scenes",
            new SceneRequest(title, null, null, null, null, null, chapterId))).Id;

    public static async Task<StoryDetail> ReadStory(HttpClient client, Guid universeId, Guid storyId) =>
        (await client.GetFromJsonAsync<StoryDetail>(Story(universeId, storyId)))!;

    // ---------- Plot ----------

    public static Task<PlotArcResponse> CreateArc(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        string title,
        string? description = null,
        string? notes = null) =>
        PostJson<PlotArcResponse>(client, Arcs(universeId, storyId), new PlotArcRequest(title, description, notes));

    public static Task<PlotBeatResponse> CreateBeat(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        Guid arcId,
        string title,
        IReadOnlyList<Guid>? scenes = null,
        IReadOnlyList<Guid>? entities = null,
        string? description = null,
        string? notes = null) =>
        PostJson<PlotBeatResponse>(
            client,
            ArcBeats(universeId, storyId, arcId),
            new PlotBeatRequest(title, description, notes, scenes, entities));

    public static async Task<List<PlotArcResponse>> Plot(HttpClient client, Guid universeId, Guid storyId) =>
        (await client.GetFromJsonAsync<List<PlotArcResponse>>(Arcs(universeId, storyId)))!;

    public static async Task<PlotBeatResponse> ReadBeat(HttpClient client, Guid universeId, Guid storyId, Guid beatId) =>
        (await client.GetFromJsonAsync<PlotBeatResponse>(Beat(universeId, storyId, beatId)))!;

    // ---------- HTTP ----------

    public static async Task<T> PostJson<T>(HttpClient client, string path, object body)
    {
        var response = await client.PostAsJsonAsync(path, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    public static async Task<T> PutJson<T>(HttpClient client, string path, object body)
    {
        // An entry, story or scene save names the version it was written over (ADR 0043), as its editor would.
        var response = body is Lorex.Api.Features.Lore.EntityRequest or StoryRequest or SceneRequest
            ? await client.PutVersionedAsync(path, body)
            : await client.PutAsJsonAsync(path, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    /// <summary>The validation errors a refusal carries, as raw JSON, so two refusals can be compared word for word.</summary>
    public static async Task<string> Errors(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("errors").GetRawText();
    }

    public static async Task WithDb(LorexApiFactory factory, Func<LorexDbContext, Task> read)
    {
        using var scope = factory.Services.CreateScope();
        await read(scope.ServiceProvider.GetRequiredService<LorexDbContext>());
    }

    // ---------- Backups ----------

    public static async Task<UniverseBackup> Backup(HttpClient client, Guid universeId) =>
        JsonSerializer.Deserialize<UniverseBackup>(
            DocumentText(await RawArchive(client, universeId)),
            UniverseBackupJson.Options)!;

    public static async Task<byte[]> RawArchive(HttpClient client, Guid universeId)
    {
        var response = await client.GetAsync($"/api/universes/{universeId}/export");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync();
    }

    public static string DocumentText(byte[] archive)
    {
        using var zip = new ZipArchive(new MemoryStream(archive, writable: false), ZipArchiveMode.Read);
        var entry = zip.GetEntry(BackupArchive.DocumentPath)
            ?? throw new InvalidOperationException("No document in the archive.");

        using var reading = entry.Open();
        using var buffer = new MemoryStream();
        reading.CopyTo(buffer);
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    public static string PayloadText(string raw)
    {
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.GetProperty("payload").GetRawText();
    }
}
