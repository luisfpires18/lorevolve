using System.Net.Http.Json;
using LorEvolve.Api.Features.WorldRules;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The HTTP steps the world rule tests share. Accounts and universes come from <see cref="PlotTestClient"/>; every write goes
/// through the real host over HTTP. Not a test.
/// </summary>
internal static class WorldRuleTestClient
{
    public static string Rules(Guid universeId) => $"/api/universes/{universeId}/world-rules";

    public static string Rule(Guid universeId, Guid ruleId) => $"{Rules(universeId)}/{ruleId}";

    public static string RestorePath(Guid universeId, Guid ruleId) => $"/api/universes/{universeId}/trash/world-rules/{ruleId}/restore";

    public static async Task<WorldRuleDetail> CreateRule(HttpClient client, Guid universeId, string title, string? description = null)
    {
        var response = await client.PostAsJsonAsync(Rules(universeId), new WorldRuleRequest(title, description, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WorldRuleDetail>())!;
    }

    /// <summary>Saves over <paramref name="current"/>, changing only what is named, and answers with the raw response.</summary>
    public static Task<HttpResponseMessage> TrySaveRule(
        HttpClient client,
        Guid universeId,
        WorldRuleDetail current,
        string? title = null,
        string? description = null,
        IdeaTestClient.Optional<DateTime?> expectedUpdatedAt = default) =>
        client.PutAsJsonAsync(
            Rule(universeId, current.Id),
            new WorldRuleRequest(
                title ?? current.Title,
                description ?? current.Description,
                expectedUpdatedAt.HasValue ? expectedUpdatedAt.Value : current.UpdatedAt));

    public static async Task<WorldRuleDetail> SaveRule(
        HttpClient client,
        Guid universeId,
        WorldRuleDetail current,
        string? title = null,
        string? description = null)
    {
        var response = await TrySaveRule(client, universeId, current, title, description);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WorldRuleDetail>())!;
    }

    public static async Task<WorldRuleDetail> ReadRule(HttpClient client, Guid universeId, Guid ruleId) =>
        (await client.GetFromJsonAsync<WorldRuleDetail>(Rule(universeId, ruleId)))!;

    public static async Task<WorldRulePage> ListRules(HttpClient client, Guid universeId, string query = "") =>
        (await client.GetFromJsonAsync<WorldRulePage>($"{Rules(universeId)}{query}"))!;

    public static async Task<List<string>> ListedTitles(HttpClient client, Guid universeId) =>
        [.. (await ListRules(client, universeId)).Items.Select(item => item.Title)];

    public static async Task DeleteRule(HttpClient client, Guid universeId, Guid ruleId) =>
        (await client.DeleteAsync(Rule(universeId, ruleId))).EnsureSuccessStatusCode();

    public static async Task<WorldRuleDetail> RestoreRule(HttpClient client, Guid universeId, Guid ruleId)
    {
        var response = await client.PostAsync(RestorePath(universeId, ruleId), content: null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WorldRuleDetail>())!;
    }
}
