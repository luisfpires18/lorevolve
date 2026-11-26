using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using static LorEvolve.Api.Tests.McpTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>What the review says about an edit of a project's entry: only what changes, under names that still read.</summary>
public sealed partial class McpProjectSchemaProposalTests
{
    [Fact]
    public async Task An_edit_leaves_out_what_it_keeps_even_when_empty()
    {
        var (type, health, motto) = await NewReviewTypeAsync("Barge");
        var entry = await NewReviewEntryAsync(type, "Low barge", new FieldValueInput(health, null, 5, null, null, null, null));
        await using var client = await SdkClient(Api, W.U, fixture.Proposer.AccessToken);

        var staged = await Call(client, Proposal(
            "Rename the barge, with an empty motto",
            new
            {
                id = "u",
                action = "update",
                resource = "project_entry",
                targetId = entry,
                projectEntry = new { name = "High barge", fields = new object[] { new { fieldId = motto, text = "" } } },
            }));

        var change = (await AiChangeTestClient.Read(W.Owner, W.U, staged.GetProperty("proposalId").GetGuid())).Operations.Single();
        Assert.Equal(["Name"], change.Lines.Select(line => line.Label));
    }

    [Fact]
    public async Task A_field_deleted_after_staging_is_called_a_deleted_field()
    {
        var (type, _, motto) = await NewReviewTypeAsync("Skiff");
        var entry = await NewReviewEntryAsync(type, "Reed skiff");
        await using var client = await SdkClient(Api, W.U, fixture.Proposer.AccessToken);

        var staged = await Call(client, Proposal(
            "Give the skiff a motto",
            new
            {
                id = "u",
                action = "update",
                resource = "project_entry",
                targetId = entry,
                projectEntry = new { fields = new object[] { new { fieldId = motto, text = "Low and quiet" } } },
            }));

        (await W.Owner.DeleteAsync($"/api/projects/{fixture.Game}/entity-types/{type}/fields/{motto}")).EnsureSuccessStatusCode();

        var change = (await AiChangeTestClient.Read(W.Owner, W.U, staged.GetProperty("proposalId").GetGuid())).Operations.Single();
        var line = Assert.Single(change.Lines);
        Assert.Equal(("A deleted field", (string?)null, "Low and quiet"), (line.Label, line.Before, line.After));
        Assert.NotEmpty(change.Issues);
    }

    /// <summary>A type of the test's own, so no other test sees its fields: a Health number and a Motto text.</summary>
    private async Task<(Guid Type, Guid Health, Guid Motto)> NewReviewTypeAsync(string name)
    {
        var types = $"/api/projects/{fixture.Game}/entity-types";
        var type = (await Posted<ProjectEntityTypeResponse>(types, new ProjectEntityTypeRequest(name, null, null, null))).Id;
        await Posted<ProjectEntityTypeResponse>($"{types}/{type}/fields", new ProjectEntityFieldRequest("Health", EntityFieldKind.Number));
        var fields = (await Posted<ProjectEntityTypeResponse>($"{types}/{type}/fields", new ProjectEntityFieldRequest("Motto", EntityFieldKind.ShortText))).Fields;
        return (type, fields.Single(field => field.Name == "Health").Id, fields.Single(field => field.Name == "Motto").Id);
    }

    private async Task<Guid> NewReviewEntryAsync(Guid type, string name, params FieldValueInput[] fields) =>
        (await Posted<EntityDetail>($"/api/projects/{fixture.Game}/entities", new ProjectEntityRequest(type, name, null, null, fields))).Id;

    private async Task<T> Posted<T>(string path, object body)
    {
        var response = await W.Owner.PostAsJsonAsync(path, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }
}
