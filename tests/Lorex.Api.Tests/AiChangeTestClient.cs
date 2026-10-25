using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.AiChanges;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// Stages proposals the way both AI entry points do - through <see cref="AiChangeStaging"/>, as a member of the universe -
/// and reviews them over the browser routes (ADR 0047). The entry points themselves are exercised in their own tests.
/// </summary>
internal static class AiChangeTestClient
{
    public static AiRefInput Ref(string key) => new(null, key);

    public static AiRefInput Id(Guid id) => new(id, null);

    public static AiChangeOperationInput NewLore(string key, Guid typeId, string name, params AiFieldInput[] fields) =>
        new(key, "create", "lore_entry", Lore: new AiLoreInput(typeId, name, Fields: fields));

    public static AiChangeOperationInput EditLore(string key, Guid entityId, AiLoreInput lore) =>
        new(key, "update", "lore_entry", entityId, Lore: lore);

    public static AiChangeOperationInput Remove(string key, string resource, Guid targetId) => new(key, "remove", resource, targetId);

    public static AiChangeOperationInput NewLink(string key, Guid typeId, AiRefInput source, AiRefInput target) =>
        new(key, "create", "relationship", Relationship: new AiRelationshipInput(typeId, source, target));

    /// <summary>Stages a proposal as <paramref name="userId"/>, from the assistant unless an origin is given.</summary>
    public static async Task<AiChangeStaged> Stage(LorexApiFactory factory, Guid universeId, string userId, params AiChangeOperationInput[] operations)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        return await AiChangeStaging.StageAsync(
            db, factory.Clock, universeId, userId, new AiChangeOrigin(AiChangeSource.Assistant), new AiChangeSubmission("Test changes", operations), default);
    }

    /// <summary>Stages a schema proposal (ADR 0062) as <paramref name="userId"/>, from an entry point allowed to propose schema.</summary>
    public static async Task<AiChangeStaged> StageSchema(LorexApiFactory factory, Guid universeId, string userId, params AiChangeOperationInput[] operations)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        return await AiChangeStaging.StageAsync(
            db, factory.Clock, universeId, userId, new AiChangeOrigin(AiChangeSource.Assistant, SchemaAllowed: true), new AiChangeSubmission("Schema", operations), default);
    }

    public static async Task<Guid> StagedSchema(LorexApiFactory factory, Guid universeId, string userId, params AiChangeOperationInput[] operations)
    {
        var staged = await StageSchema(factory, universeId, userId, operations);
        Assert.True(staged.Proposal is not null, string.Join("; ", staged.Issues.Select(issue => $"{issue.Id}: {issue.Code} {issue.Message} ({issue.Field})")));
        return staged.Proposal!.Id;
    }

    public static AiChangeOperationInput NewType(string key, AiLoreTypeInput type) => new(key, "create", "lore_type", LoreType: type);

    public static AiChangeOperationInput NewField(string key, AiLoreFieldInput field) => new(key, "create", "lore_field", Field: field);

    public static AiChangeOperationInput NewGroup(string key, string name) => new(key, "create", "lore_group", Group: new AiLoreGroupInput(name));

    /// <summary>Stages a proposal that must be accepted, and answers its id.</summary>
    public static async Task<Guid> Staged(LorexApiFactory factory, Guid universeId, string userId, params AiChangeOperationInput[] operations)
    {
        var staged = await Stage(factory, universeId, userId, operations);
        Assert.True(staged.Proposal is not null, string.Join("; ", staged.Issues.Select(issue => $"{issue.Id}: {issue.Code} {issue.Message} ({issue.Field})")));
        return staged.Proposal!.Id;
    }

    public static string Path(Guid universeId, Guid proposalId) => $"/api/universes/{universeId}/ai-changes/{proposalId}";

    public static async Task<AiChangeProposalResponse> Read(HttpClient client, Guid universeId, Guid proposalId)
    {
        var response = await client.GetAsync(Path(universeId, proposalId));
        Assert.True(response.IsSuccessStatusCode, $"Reading the proposal answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<AiChangeProposalResponse>())!;
    }

    public static Guid Op(AiChangeProposalResponse proposal, string key) => proposal.Operations.Single(operation => operation.Key == key).Id;

    public static Task<HttpResponseMessage> Approve(HttpClient client, Guid universeId, AiChangeProposalResponse proposal, IEnumerable<string> keys, Guid? approvalId = null) =>
        client.PostAsJsonAsync(
            $"{Path(universeId, proposal.Proposal.Id)}/approve",
            new AiChangeApproveRequest(proposal.Revision, [.. keys.Select(key => Op(proposal, key))], approvalId ?? Guid.NewGuid()));

    /// <summary>Approves every pending change of a proposal, which must succeed.</summary>
    public static async Task<AiChangeReceipt> ApproveAll(HttpClient client, Guid universeId, Guid proposalId)
    {
        var proposal = await Read(client, universeId, proposalId);
        var response = await Approve(client, universeId, proposal, proposal.Operations.Where(operation => operation.Status == AiChangeOperationStatus.Pending).Select(operation => operation.Key));
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Approving answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<AiChangeReceipt>())!;
    }

    public static Task<HttpResponseMessage> Reject(HttpClient client, Guid universeId, Guid proposalId, IReadOnlyList<Guid>? operationIds, bool all = false) =>
        client.PostAsJsonAsync($"{Path(universeId, proposalId)}/reject", new AiChangeRejectRequest(operationIds, all));

    public static async Task<Guid> TypeId(HttpClient client, Guid universeId, string name) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!.First(type => type.Name == name).Id;

    public static async Task<RelationshipTypeResponse> Kind(HttpClient client, Guid universeId, string name, bool symmetric = false) =>
        await PlotTestClient.PostJson<RelationshipTypeResponse>(
            client, $"/api/universes/{universeId}/relationship-types", new RelationshipTypeRequest(name, symmetric ? null : $"{name} of", symmetric, null, null));

    public static async Task<FieldDefinitionResponse> Field(HttpClient client, Guid universeId, Guid typeId, FieldDefinitionRequest request) =>
        (await PlotTestClient.PostJson<EntityTypeResponse>(client, $"/api/universes/{universeId}/entity-types/{typeId}/fields", request))
            .Fields.Single(field => field.Name == request.Name);

    public static async Task<string> Code(HttpResponseMessage response) => await PublishingTestClient.ProblemCode(response) ?? $"(none: {(int)response.StatusCode})";
}
