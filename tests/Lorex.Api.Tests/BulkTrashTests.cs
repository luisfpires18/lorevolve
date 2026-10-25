using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Trash;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Lorex.Api.Tests.ArticleTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Moving many entries to the Trash at once (Product refinement 020): what one move does, for each entry, in one write
/// that is all or nothing. Nothing is erased - the Trash keeps every entry whole and restores each one as ever.
/// Credentials are obviously synthetic.
/// </summary>
public sealed class BulkTrashTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task Forty_entries_leave_Lore_together_and_all_wait_in_the_Trash()
    {
        var (client, universe, type) = await World("bulktrash-forty");
        var entries = await Many(client, universe.Id, type, "Wayfarer", 40);
        var keep = await Create(client, universe.Id, type, "Kept");

        var response = await BulkTrash(client, universe.Id, [.. entries.Select(entry => entry.Id)]);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(40, (await response.Content.ReadFromJsonAsync<BulkTrashResponse>())!.Trashed);

        // Out of the listing, the search and a type's filter; the one not chosen stays.
        var listed = await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universe.Id}/entities?pageSize=50");
        Assert.Equal(keep.Id, Assert.Single(listed!.Items).Id);
        var searched = await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universe.Id}/entities?search=Wayfarer");
        Assert.Equal(0, searched!.TotalCount);

        var trash = await Trash(client, universe.Id);
        Assert.Equal(
            entries.Select(entry => entry.Id).Order(),
            trash.Items.Where(item => item.Kind == TrashItemKind.Entry).Select(item => item.Id).Order());
    }

    [Fact]
    public async Task A_trashed_entry_keeps_its_article_fields_relationships_history_and_type_and_restores_whole()
    {
        var (client, universe, type) = await World("bulktrash-whole");
        var field = await AddField(client, universe.Id, type, "Title");
        var frodo = await Create(client, universe.Id, type, "Frodo", [new FieldValueInput(field, "Ring-bearer", null, null, null, null, null)]);
        var sam = await Create(client, universe.Id, type, "Sam");
        await WriteArticle(client, universe.Id, frodo.Id, Doc("He went there and back again."));
        var kind = await RelationshipKind(client, universe.Id);
        var link = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships",
            new RelationshipRequest(kind, frodo.Id, sam.Id, CanonStatus.Idea, null, null, null));
        link.EnsureSuccessStatusCode();

        (await BulkTrash(client, universe.Id, [frodo.Id, sam.Id])).EnsureSuccessStatusCode();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
            var stored = await db.Entities.AsNoTracking().SingleAsync(entity => entity.Id == frodo.Id);
            Assert.NotNull(stored.DeletedAt);
            Assert.Equal(type, stored.EntityTypeId);
            Assert.True(await db.EntityArticles.AnyAsync(article => article.EntityId == frodo.Id));
            Assert.True(await db.EntityFieldValues.AnyAsync(value => value.EntityId == frodo.Id));
            Assert.True(await db.Relationships.AnyAsync(relationship => relationship.SourceEntityId == frodo.Id));
            Assert.True(await db.EntityRevisions.AnyAsync(revision => revision.EntityId == frodo.Id));
        }

        var restored = await client.PostAsync($"/api/universes/{universe.Id}/trash/{frodo.Id}/restore", null);
        restored.EnsureSuccessStatusCode();
        var detail = (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{universe.Id}/entities/{frodo.Id}"))!;
        Assert.Equal("Ring-bearer", Assert.Single(detail.Fields).Text);
        Assert.Contains("there and back again", (await ReadArticle(client, universe.Id, frodo.Id)).Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_id_from_another_universe_refuses_the_whole_request_in_the_same_words_as_an_unknown_one()
    {
        var (client, universe, type) = await World("bulktrash-foreign");
        var elsewhere = await CreateUniverse(client, "Another world");
        var foreignType = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{elsewhere.Id}/entity-types"))![0].Id;
        var mine = await Create(client, universe.Id, type, "Mine");
        var theirs = await Create(client, elsewhere.Id, foreignType, "Theirs");

        var foreign = await Refused(await BulkTrash(client, universe.Id, [mine.Id, theirs.Id]));
        var unknown = await Refused(await BulkTrash(client, universe.Id, [mine.Id, Guid.NewGuid()]));

        Assert.Equal(["entityIds[1]"], foreign.Errors.Keys);
        Assert.Equal(foreign.Errors["entityIds[1]"], unknown.Errors["entityIds[1]"]);
        Assert.Equal(1, await LiveCount(client, universe.Id));
        Assert.Equal(1, await LiveCount(client, elsewhere.Id));
    }

    [Fact]
    public async Task An_entry_already_in_the_Trash_refuses_the_whole_request()
    {
        var (client, universe, type) = await World("bulktrash-already");
        var first = await Create(client, universe.Id, type, "First");
        var second = await Create(client, universe.Id, type, "Second");
        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{second.Id}")).EnsureSuccessStatusCode();
        var trashedAt = (await Trash(client, universe.Id)).Items.Single().TrashedAt;

        var problem = await Refused(await BulkTrash(client, universe.Id, [first.Id, second.Id]));

        Assert.Equal("This entry is not in Lore any more. It may already be in the Trash.", problem.Errors["entityIds[1]"][0]);
        Assert.Equal(1, await LiveCount(client, universe.Id));
        // Its moment in the Trash is not rewritten.
        Assert.Equal(trashedAt, (await Trash(client, universe.Id)).Items.Single().TrashedAt);
    }

    [Fact]
    public async Task An_empty_a_repeated_or_an_oversized_request_is_refused_whole()
    {
        var (client, universe, type) = await World("bulktrash-shape");
        var entries = await Many(client, universe.Id, type, "Extra", 3);

        Assert.Equal("Choose at least one entry.", (await Refused(await BulkTrash(client, universe.Id, []))).Errors["entityIds"][0]);
        Assert.Equal(
            "The same entry is listed more than once.",
            (await Refused(await BulkTrash(client, universe.Id, [entries[0].Id, entries[0].Id]))).Errors["entityIds"][0]);

        var over = Enumerable.Range(0, EntityEndpoints.BulkTrashMaxEntries + 1).Select(_ => Guid.NewGuid()).ToList();
        over[0] = entries[1].Id;
        Assert.Equal(
            $"Move up to {EntityEndpoints.BulkTrashMaxEntries} entries at a time. This has {EntityEndpoints.BulkTrashMaxEntries + 1}.",
            (await Refused(await BulkTrash(client, universe.Id, over))).Errors["entityIds"][0]);

        Assert.Equal(3, await LiveCount(client, universe.Id));
    }

    [Fact]
    public async Task A_database_failure_late_in_the_batch_leaves_every_entry_in_Lore()
    {
        var (client, universe, type) = await World("bulktrash-rollback");
        var entries = await Many(client, universe.Id, type, "Steadfast", 20);
        var fails = entries[14].Id.ToString();

        _factory.Commands.FailWhen = command =>
            command.CommandText.Contains("UPDATE \"Entities\"", StringComparison.Ordinal)
            && command.Parameters.Cast<DbParameter>().Any(parameter =>
                string.Equals(parameter.Value?.ToString(), fails, StringComparison.OrdinalIgnoreCase));

        HttpResponseMessage failed;
        try
        {
            failed = await BulkTrash(client, universe.Id, [.. entries.Select(entry => entry.Id)]);
        }
        finally
        {
            _factory.Commands.FailWhen = null;
        }

        // Answered as a deployment answers it: the exception handler's 500 (issue 55, W2).
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
        Assert.Equal(20, await LiveCount(client, universe.Id));
        Assert.Empty((await Trash(client, universe.Id)).Items);
    }

    [Fact]
    public async Task Another_owner_is_not_found_and_moves_nothing()
    {
        var (owner, universe, type) = await World("bulktrash-owner");
        var entry = await Create(owner, universe.Id, type, "Precious");
        var intruder = await SignedInClient("user-bulktrash-intruder");

        Assert.Equal(HttpStatusCode.NotFound, (await BulkTrash(intruder, universe.Id, [entry.Id])).StatusCode);
        Assert.Equal(1, await LiveCount(owner, universe.Id));
    }

    [Fact]
    public async Task The_single_move_to_the_Trash_is_unchanged()
    {
        var (client, universe, type) = await World("bulktrash-single");
        var entry = await Create(client, universe.Id, type, "Alone");

        var response = await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{entry.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{entry.Id}")).StatusCode);
        Assert.Equal(entry.Id, Assert.Single((await Trash(client, universe.Id)).Items).Id);
    }

    // ---------- Helpers ----------

    private static Task<HttpResponseMessage> BulkTrash(HttpClient client, Guid universeId, List<Guid> ids) =>
        client.PostAsJsonAsync($"/api/universes/{universeId}/entities/bulk-trash", new BulkTrashRequest(ids));

    private static async Task<ValidationProblemDetails> Refused(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!;
    }

    private static async Task<TrashPage> Trash(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<TrashPage>($"/api/universes/{universeId}/trash?pageSize=100"))!;

    private static async Task<int> LiveCount(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universeId}/entities?pageSize=1"))!.TotalCount;

    private static async Task<List<EntityDetail>> Many(HttpClient client, Guid universeId, Guid type, string stem, int count)
    {
        var entries = new List<EntityDetail>();
        for (var index = 1; index <= count; index++)
        {
            entries.Add(await Create(client, universeId, type, $"{stem} {index:00}"));
        }

        return entries;
    }

    private static async Task<EntityDetail> Create(
        HttpClient client,
        Guid universeId,
        Guid type,
        string name,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(type, name, null, CanonStatus.Idea, null, null, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<Guid> AddField(HttpClient client, Guid universeId, Guid type, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{type}/fields",
            new FieldDefinitionRequest(name, EntityFieldKind.ShortText, false, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.Single(field => field.Name == name).Id;
    }

    private static async Task<Guid> RelationshipKind(HttpClient client, Guid universeId)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest("Travels with", "Travels with", true, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!.Id;
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<(HttpClient Client, UniverseDetail Universe, Guid Type)> World(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        var universe = await CreateUniverse(client, $"World {tag}");
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universe.Id}/entity-types"))!;
        return (client, universe, types.Single(type => type.Name == "Character").Id);
    }
}
