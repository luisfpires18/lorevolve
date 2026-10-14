using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Lore;

namespace Lorex.Api.Tests;

/// <summary>
/// The HTTP steps the article tests share: an entry's article address, reading and saving it the way the editor does -
/// naming the <c>version</c> it was written over - its history, and reading a stale save's refusal. Not a test.
/// </summary>
internal static class ArticleTestClient
{
    /// <summary>
    /// What an author might really write in the editor: a heading, a word half in bold (two text nodes), a list, a quote, a
    /// link, text that only looks like markup, and several scripts - a combining accent, a no-break space and an emoji
    /// joined by zero-width joiners.
    /// </summary>
    public const string RichDocument =
        """{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"The Drowned Coast"}]},"""
        + """{"type":"paragraph","content":[{"type":"text","text":"She kept the tide's ledger by hand, "},{"type":"text","marks":[{"type":"bold"}],"text":"al"},{"type":"text","text":"ways."}]},"""
        + """{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Ærendel · café · 北の門 · المدينة · 👩‍👩‍👧 · no break"}]}]}]},"""
        + """{"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"“You knew,” he said. <b>Not HTML</b> &amp; not an entity."}]}]},"""
        + """{"type":"paragraph","content":[{"type":"text","marks":[{"type":"link","attrs":{"href":"https://example.test/ledger"}}],"text":"the ledger"}]}]}""";

    /// <summary>A Tiptap document, one paragraph per argument.</summary>
    public static string Doc(params string[] paragraphs)
    {
        var blocks = paragraphs.Select(text =>
            $$"""{"type":"paragraph","content":[{"type":"text","text":{{JsonSerializer.Serialize(text)}}}]}""");

        return $$"""{"type":"doc","content":[{{string.Join(',', blocks)}}]}""";
    }

    public static string ArticlePath(Guid universeId, Guid entityId) =>
        $"/api/universes/{universeId}/entities/{entityId}/article";

    public static async Task<EntityArticleResponse> ReadArticle(HttpClient client, Guid universeId, Guid entityId)
    {
        var response = await client.GetAsync(ArticlePath(universeId, entityId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityArticleResponse>())!;
    }

    public static Task<HttpResponseMessage> PutArticle(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        string? content,
        int? expectedVersion) =>
        client.PutAsJsonAsync(ArticlePath(universeId, entityId), new EntityArticleRequest(content, expectedVersion));

    /// <summary>Saves over whatever is stored now, as an editor that has just opened the entry would.</summary>
    public static async Task<EntityArticleResponse> WriteArticle(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        string content)
    {
        var current = await ReadArticle(client, universeId, entityId);
        var response = await PutArticle(client, universeId, entityId, content, current.Version);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityArticleResponse>())!;
    }

    public static async Task<List<EntityArticleRevisionSummary>> ArticleRevisions(
        HttpClient client,
        Guid universeId,
        Guid entityId) =>
        (await client.GetFromJsonAsync<List<EntityArticleRevisionSummary>>(
            $"{ArticlePath(universeId, entityId)}/revisions"))!;

    public static async Task<EntityArticleRevisionDetail> ArticleRevision(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        Guid revisionId) =>
        (await client.GetFromJsonAsync<EntityArticleRevisionDetail>(
            $"{ArticlePath(universeId, entityId)}/revisions/{revisionId}"))!;

    public static Task<HttpResponseMessage> RestoreArticle(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        Guid revisionId,
        int? expectedVersion) =>
        client.PostAsJsonAsync(
            $"{ArticlePath(universeId, entityId)}/revisions/{revisionId}/restore",
            new EntityArticleRestoreRequest(expectedVersion));

    /// <summary>The 409 a stale save is given: its code, the <c>updatedAt</c> and the <c>currentVersion</c> it says are stored now.</summary>
    public static async Task<(string? Code, DateTime? UpdatedAt, int CurrentVersion)> ArticleRefusal(HttpResponseMessage response)
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
}
