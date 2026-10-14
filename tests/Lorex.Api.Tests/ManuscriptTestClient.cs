using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Stories;

namespace Lorex.Api.Tests;

/// <summary>
/// The HTTP steps the manuscript tests share: a scene's manuscript address, reading it, saving it the way the editor does
/// - naming the <c>version</c> it was written over - and reading a stale save's refusal. Not a test.
/// </summary>
internal static class ManuscriptTestClient
{
    /// <summary>
    /// What an author might really type: paragraphs and deliberate blank lines, dialogue in curly quotes, indentation and
    /// trailing spaces, a Windows line ending, text that only looks like Markdown or HTML, and more than one script -
    /// including a combining accent, a no-break space and an emoji joined by zero-width joiners.
    /// </summary>
    public const string Prose =
        "The hall had emptied long before Arlen understood\nwhy Mira would not meet his eyes…\n\n\n"
        + "“You knew,” he said. ‘Say it.’ — nothing.\n"
        + "\tIndented, with trailing spaces   \n"
        + "   and leading ones.\r\n"
        + "# Not a heading. *Not emphasis.* <b>Not HTML</b> &amp; not an entity.\n"
        + "Ærendel · café · 北の門 · المدينة · "
        + "עיר · \U0001F469‍\U0001F469‍\U0001F467 · no break\n\n";

    public static string Manuscript(Guid universeId, Guid storyId, Guid sceneId) =>
        $"{PlotTestClient.Story(universeId, storyId)}/scenes/{sceneId}/manuscript";

    public static async Task<SceneManuscriptResponse> ReadManuscript(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        Guid sceneId)
    {
        var response = await client.GetAsync(Manuscript(universeId, storyId, sceneId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SceneManuscriptResponse>())!;
    }

    public static Task<HttpResponseMessage> PutManuscript(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        string? content,
        int? expectedVersion) =>
        client.PutAsJsonAsync(
            Manuscript(universeId, storyId, sceneId),
            new SceneManuscriptRequest(content, expectedVersion));

    /// <summary>Saves over whatever is stored now, as an editor that has just opened the scene would.</summary>
    public static async Task<SceneManuscriptResponse> WriteManuscript(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        string content)
    {
        var current = await ReadManuscript(client, universeId, storyId, sceneId);
        var response = await PutManuscript(client, universeId, storyId, sceneId, content, current.Version);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SceneManuscriptResponse>())!;
    }

    /// <summary>The 409 a stale save is given: its code, the <c>updatedAt</c> and the <c>currentVersion</c> it says are stored now.</summary>
    public static async Task<(string? Code, DateTime? UpdatedAt, int CurrentVersion)> Refusal(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        var updatedAt = root.GetProperty("updatedAt");
        return (
            root.GetProperty("code").GetString(),
            updatedAt.ValueKind == JsonValueKind.Null ? null : updatedAt.GetDateTime(),
            root.GetProperty("currentVersion").GetInt32());
    }

    /// <summary>The same instant, whatever kind each side came back with.</summary>
    public static void SameMoment(DateTime? expected, DateTime? actual)
    {
        Assert.Equal(expected is null, actual is null);
        if (expected is { } a && actual is { } b)
        {
            Assert.Equal(a.ToUniversalTime().Ticks, b.ToUniversalTime().Ticks);
        }
    }
}
