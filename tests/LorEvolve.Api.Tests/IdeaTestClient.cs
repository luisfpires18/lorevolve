using System.Net.Http.Json;
using LorEvolve.Api.Features.Ideas;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The HTTP steps the idea tests share. Accounts, universes, lore and stories come from <see cref="PlotTestClient"/>; every
/// write goes through the real host over HTTP. Not a test.
/// </summary>
internal static class IdeaTestClient
{
    public const string Ideas = "/api/ideas";

    public static string Idea(Guid id) => $"{Ideas}/{id}";

    public static IdeaReferenceInput Ref(IdeaReferenceKind kind, Guid id) => new(kind, id);

    public static async Task<IdeaDetail> CreateIdea(
        HttpClient client,
        string title,
        string? body = null,
        Guid? universeId = null,
        IReadOnlyList<IdeaReferenceInput>? references = null)
    {
        var response = await client.PostAsJsonAsync(Ideas, new IdeaRequest(title, body, universeId, references, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<IdeaDetail>())!;
    }

    /// <summary>Saves over <paramref name="current"/>, changing only what is named, and answers with the raw response.</summary>
    public static Task<HttpResponseMessage> TrySave(
        HttpClient client,
        IdeaDetail current,
        string? title = null,
        string? body = null,
        Optional<Guid?> universeId = default,
        IReadOnlyList<IdeaReferenceInput>? references = null,
        Optional<DateTime?> expectedUpdatedAt = default) =>
        client.PutAsJsonAsync(
            Idea(current.Id),
            new IdeaRequest(
                title ?? current.Title,
                body ?? current.Body,
                universeId.HasValue ? universeId.Value : current.Universe?.Id,
                references ?? [.. current.References.Select(reference => Ref(reference.Kind, reference.Id))],
                expectedUpdatedAt.HasValue ? expectedUpdatedAt.Value : current.UpdatedAt));

    public static async Task<IdeaDetail> Save(
        HttpClient client,
        IdeaDetail current,
        string? title = null,
        string? body = null,
        Optional<Guid?> universeId = default,
        IReadOnlyList<IdeaReferenceInput>? references = null)
    {
        var response = await TrySave(client, current, title, body, universeId, references);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<IdeaDetail>())!;
    }

    public static async Task<IdeaDetail> ReadIdea(HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<IdeaDetail>(Idea(id)))!;

    public static async Task<IdeaPage> ListIdeas(HttpClient client, string query = "") =>
        (await client.GetFromJsonAsync<IdeaPage>($"{Ideas}{query}"))!;

    public static async Task<List<string>> ListedTitles(HttpClient client, string query = "") =>
        [.. (await ListIdeas(client, query)).Items.Select(item => item.Title)];

    /// <summary>A universe is deleted only once it is archived.</summary>
    public static async Task DeleteUniverse(HttpClient client, Guid universeId)
    {
        (await client.PostAsync($"/api/universes/{universeId}/archive", content: null)).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"/api/universes/{universeId}")).EnsureSuccessStatusCode();
    }

    /// <summary>A value that may be deliberately given - including null - or left out.</summary>
    public readonly record struct Optional<T>(T Value)
    {
        public bool HasValue { get; } = true;

        public static implicit operator Optional<T>(T value) => new(value);
    }
}
