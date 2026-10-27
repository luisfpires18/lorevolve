using System.Net.Http.Json;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.WorldRules;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The HTTP steps the world rule check tests share (ADR 0034): event kinds and methods, rules with a check, moments with
/// details, and reading what Canon found. Every name here is invented for the tests and means nothing to LorEvolve. Not a test.
/// </summary>
internal static class RuleValidationTestClient
{
    public const string RuleCode = "CANON-WORLD-001";

    // ---------- Terms ----------

    public static string Terms(Guid universeId) => $"/api/universes/{universeId}/validation-terms";

    public static string Term(Guid universeId, Guid termId) => $"{Terms(universeId)}/{termId}";

    public static Task<ValidationTermResponse> CreateTerm(HttpClient client, Guid universeId, ValidationTermKind kind, string name) =>
        PostJson<ValidationTermResponse>(client, Terms(universeId), new ValidationTermRequest(kind, name));

    public static Task<ValidationTermResponse> EventKind(HttpClient client, Guid universeId, string name) =>
        CreateTerm(client, universeId, ValidationTermKind.EventKind, name);

    public static Task<ValidationTermResponse> Method(HttpClient client, Guid universeId, string name) =>
        CreateTerm(client, universeId, ValidationTermKind.Method, name);

    public static async Task<List<ValidationTermResponse>> ListTerms(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<ValidationTermResponse>>(Terms(universeId)))!;

    public static Task<HttpResponseMessage> RenameTerm(HttpClient client, Guid universeId, Guid termId, string name) =>
        client.PutAsJsonAsync(Term(universeId, termId), new ValidationTermRenameRequest(name));

    // ---------- Rules with a check ----------

    public static WorldRuleValidationRequest Limit(Guid eventKind, Guid method, int? max) =>
        new(WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod, eventKind, method, max);

    public static WorldRuleValidationRequest NoCheck => new(WorldRuleValidationKind.None, null, null, null);

    public static Task<HttpResponseMessage> TryCreateRule(HttpClient client, Guid universeId, string title, WorldRuleValidationRequest? check) =>
        client.PostAsJsonAsync(WorldRuleTestClient.Rules(universeId), new WorldRuleRequest(title, "", null, check));

    public static async Task<WorldRuleDetail> CreateCheckedRule(
        HttpClient client,
        Guid universeId,
        string title,
        WorldRuleValidationRequest? check,
        string description = "")
    {
        var response = await client.PostAsJsonAsync(WorldRuleTestClient.Rules(universeId), new WorldRuleRequest(title, description, null, check));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WorldRuleDetail>())!;
    }

    /// <summary>Saves over <paramref name="current"/> with <paramref name="check"/> - null leaves the check out of the save.</summary>
    public static Task<HttpResponseMessage> TrySaveCheck(
        HttpClient client,
        Guid universeId,
        WorldRuleDetail current,
        WorldRuleValidationRequest? check,
        string? title = null) =>
        client.PutAsJsonAsync(
            WorldRuleTestClient.Rule(universeId, current.Id),
            new WorldRuleRequest(title ?? current.Title, current.Description, current.UpdatedAt, check));

    public static async Task<WorldRuleDetail> SaveCheck(
        HttpClient client,
        Guid universeId,
        WorldRuleDetail current,
        WorldRuleValidationRequest? check,
        string? title = null)
    {
        var response = await TrySaveCheck(client, universeId, current, check, title);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WorldRuleDetail>())!;
    }

    // ---------- Moments ----------

    public static string Timeline(Guid universeId) => $"/api/universes/{universeId}/timeline";

    public static TimelineValidationRequest Details(Guid? eventKind, Guid? method, Guid? participant) => new(eventKind, method, participant);

    public static TimelineEntryRequest Moment(
        string title,
        TimelineValidationRequest? details,
        CanonStatus status = CanonStatus.Canon,
        IReadOnlyList<Guid>? linked = null,
        int year = 1,
        string? description = null) =>
        new(title, description, status, TimelineDateKind.Exact, year, null, null, null, null, null, null, linked ?? [], null, null, details);

    public static Task<HttpResponseMessage> TryCreateMoment(HttpClient client, Guid universeId, TimelineEntryRequest request) =>
        client.PostAsJsonAsync(Timeline(universeId), request);

    public static async Task<TimelineEntryResponse> CreateMoment(HttpClient client, Guid universeId, TimelineEntryRequest request)
    {
        var response = await TryCreateMoment(client, universeId, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;
    }

    public static Task<HttpResponseMessage> TryUpdateMoment(HttpClient client, Guid universeId, Guid entryId, TimelineEntryRequest request) =>
        client.PutAsJsonAsync($"{Timeline(universeId)}/{entryId}", request);

    public static async Task<TimelineEntryResponse> UpdateMoment(HttpClient client, Guid universeId, Guid entryId, TimelineEntryRequest request)
    {
        var response = await TryUpdateMoment(client, universeId, entryId, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;
    }

    public static async Task<TimelineEntryResponse> ReadMoment(HttpClient client, Guid universeId, Guid entryId) =>
        (await client.GetFromJsonAsync<TimelineEntryResponse>($"{Timeline(universeId)}/{entryId}"))!;

    public static async Task DeleteMoment(HttpClient client, Guid universeId, Guid entryId) =>
        (await client.DeleteAsync($"{Timeline(universeId)}/{entryId}")).EnsureSuccessStatusCode();

    // ---------- Entries ----------

    public static async Task TrashEntity(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.DeleteAsync($"/api/universes/{universeId}/entities/{entityId}")).EnsureSuccessStatusCode();

    public static async Task RestoreEntity(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.PostAsync($"/api/universes/{universeId}/trash/{entityId}/restore", null)).EnsureSuccessStatusCode();

    // ---------- Canon ----------

    /// <summary>This check's findings in one status - pending by default - or in any status when <paramref name="status"/> is null.</summary>
    public static async Task<List<CanonConflictResponse>> Findings(
        HttpClient client,
        Guid universeId,
        CanonConflictStatus? status = CanonConflictStatus.Pending)
    {
        var filter = status is { } wanted ? $"&status={(int)wanted}" : "";
        var page = (await client.GetFromJsonAsync<CanonConflictPage>($"/api/universes/{universeId}/canon-conflicts?pageSize=100{filter}"))!;
        return [.. page.Items.Where(conflict => conflict.RuleCode == RuleCode)];
    }

    public static async Task<CanonEvaluationResponse> Evaluate(HttpClient client, Guid universeId)
    {
        var response = await client.PostAsync($"/api/universes/{universeId}/canon-conflicts/evaluate", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CanonEvaluationResponse>())!;
    }

    // ---------- A universe with one checked rule ----------

    /// <summary>
    /// A signed-in account's universe holding an event kind, two methods, two Canon characters and a rule allowing each participant
    /// at most <c>max</c> Canon "Resurrection" moments by "Rite of Ash". The rule's words say something else entirely.
    /// </summary>
    public sealed record CheckedWorld(
        HttpClient Client,
        Guid Universe,
        Guid Resurrection,
        Guid RiteOfAsh,
        Guid SevenStones,
        WorldRuleDetail Rule,
        Guid Arlen,
        Guid Mira)
    {
        /// <summary>A Canon moment of the rule's event kind by the rule's method, or by <paramref name="method"/>, for a participant.</summary>
        public Task<TimelineEntryResponse> Occurrence(string title, Guid? participant, Guid? method = null, CanonStatus status = CanonStatus.Canon) =>
            CreateMoment(Client, Universe, Moment(title, Details(Resurrection, method ?? RiteOfAsh, participant), status));

        public Task<TimelineEntryResponse> Update(TimelineEntryResponse moment, TimelineValidationRequest? details, CanonStatus? status = null, string? title = null) =>
            UpdateMoment(Client, Universe, moment.Id, Moment(title ?? moment.Title, details, status ?? moment.CanonStatus, [.. moment.Entities.Select(link => link.EntityId)], moment.Date.StartYear ?? 1));

        public Task<List<CanonConflictResponse>> Findings(CanonConflictStatus? status = CanonConflictStatus.Pending) =>
            RuleValidationTestClient.Findings(Client, Universe, status);

        public async Task<WorldRuleDetail> ReadRule() => await WorldRuleTestClient.ReadRule(Client, Universe, Rule.Id);
    }

    public static async Task<CheckedWorld> NewCheckedWorld(LorEvolveApiFactory factory, string tag, int max = 1)
    {
        var (client, universe) = await SignedInWithUniverse(factory, tag);
        var u = universe.Id;

        var resurrection = await EventKind(client, u, "Resurrection");
        var ash = await Method(client, u, "Rite of Ash");
        var stones = await Method(client, u, "Seven Stones");
        var rule = await CreateCheckedRule(client, u, "One return by the Rite", Limit(resurrection.Id, ash.Id, max), "Words nothing reads.");
        var arlen = await CreateEntity(client, u, "Arlen");
        var mira = await CreateEntity(client, u, "Mira");

        return new CheckedWorld(client, u, resurrection.Id, ash.Id, stones.Id, rule, arlen, mira);
    }
}
