using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// Mass create: "I have 40 names. Put them in Lorex." Many entries' basic shells - type, name, Canon status - in one
/// write that is all or nothing, and whose entries are exactly what a single create would have made: owned, typed inside
/// the universe, searchable at once and each with its own Created version. Credentials are obviously synthetic.
/// </summary>
public sealed class MassCreateTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    // ---------- What it creates ----------

    [Fact]
    public async Task The_owner_creates_several_entries_each_with_its_own_type_and_status()
    {
        var (client, universe) = await SignedInWithUniverse("mass-basic");
        var character = await Type(client, universe.Id, "Character");
        var location = await Type(client, universe.Id, "Location");

        var response = await Bulk(
            client,
            universe.Id,
            Row(character.Id, "Frodo Baggins", CanonStatus.Canon),
            Row(character.Id, "Samwise Gamgee", CanonStatus.Idea),
            Row(location.Id, "Rivendell", CanonStatus.Draft));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<BulkEntityResponse>())!.Created;

        // In the order sent, as the author wrote each name.
        Assert.Equal(["Frodo Baggins", "Samwise Gamgee", "Rivendell"], created.Select(entry => entry.Name));

        var frodo = await Entity(client, universe.Id, created[0].Id);
        Assert.Equal(character.Id, frodo.EntityTypeId);
        Assert.Equal(CanonStatus.Canon, frodo.CanonStatus);

        var sam = await Entity(client, universe.Id, created[1].Id);
        Assert.Equal(CanonStatus.Idea, sam.CanonStatus);

        var rivendell = await Entity(client, universe.Id, created[2].Id);
        Assert.Equal(location.Id, rivendell.EntityTypeId);
        Assert.Equal("Location", rivendell.EntityTypeName);
        Assert.Equal(CanonStatus.Draft, rivendell.CanonStatus);
    }

    [Fact]
    public async Task A_row_that_names_no_status_is_an_idea_as_a_new_entry_is()
    {
        var (client, universe) = await SignedInWithUniverse("mass-idea");
        var character = await Type(client, universe.Id, "Character");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities/bulk",
            new { entries = new[] { new { entityTypeId = character.Id, name = "Boromir" } } });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = Assert.Single((await response.Content.ReadFromJsonAsync<BulkEntityResponse>())!.Created);
        Assert.Equal(CanonStatus.Idea, (await Entity(client, universe.Id, created.Id)).CanonStatus);
    }

    [Fact]
    public async Task Forty_names_become_forty_entries_in_one_request()
    {
        var (client, universe) = await SignedInWithUniverse("mass-forty");
        var character = await Type(client, universe.Id, "Character");

        var created = await Created(await Bulk(client, universe.Id, Names(character.Id, "Wayfarer", 40)));

        Assert.Equal(40, created.Count);
        Assert.Equal(40, created.Select(entry => entry.Id).Distinct().Count());

        var listed = await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universe.Id}/entities?pageSize=50");
        Assert.Equal(40, listed!.TotalCount);
    }

    [Fact]
    public async Task Every_entry_gets_its_own_created_version_and_no_batch_version_exists()
    {
        var (client, universe) = await SignedInWithUniverse("mass-history");
        var character = await Type(client, universe.Id, "Character");

        var created = await Created(await Bulk(client, universe.Id, Names(character.Id, "Chronicler", 40)));
        var ids = created.Select(entry => entry.Id).ToList();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
            var revisions = await db.EntityRevisions.AsNoTracking()
                .Where(revision => ids.Contains(revision.EntityId))
                .ToListAsync();

            // One each, the entry's first, and nothing else - the batch is not a record of its own.
            Assert.Equal(40, revisions.Count);
            Assert.Equal(ids.Order(), revisions.Select(revision => revision.EntityId).Order());
            Assert.All(revisions, revision =>
            {
                Assert.Equal(EntityRevisionKind.Created, revision.Kind);
                Assert.Equal(1, revision.Number);
            });
        }

        // And read the way the History view reads it.
        var history = await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/universes/{universe.Id}/entities/{ids[17]}/revisions");
        var only = Assert.Single(history!);
        Assert.Equal(EntityRevisionKind.Created, only.Kind);
        Assert.Equal("Chronicler 18", only.Name);
    }

    [Fact]
    public async Task Every_entry_is_searchable_as_soon_as_the_request_returns()
    {
        var (client, universe) = await SignedInWithUniverse("mass-search");
        var character = await Type(client, universe.Id, "Character");

        await Created(await Bulk(client, universe.Id, Names(character.Id, "Lanternbearer", 40)));

        // One word every name shares: each of the forty has its own index row, or it would not be counted.
        var all = await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universe.Id}/entities?search=Lanternbearer&pageSize=50");
        Assert.Equal(40, all!.TotalCount);

        // And the one called what was typed comes first.
        var one = await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universe.Id}/entities?search={Uri.EscapeDataString("Lanternbearer 23")}");
        Assert.Equal("Lanternbearer 23", one!.Items[0].Name);
    }

    [Fact]
    public async Task A_basic_entry_has_nothing_but_its_type_name_and_status()
    {
        var (client, universe) = await SignedInWithUniverse("mass-shell");
        var character = await Type(client, universe.Id, "Character");

        var created = await Created(await Bulk(client, universe.Id, Row(character.Id, "  Gimli  ", CanonStatus.Canon)));
        var entry = await Entity(client, universe.Id, created[0].Id);

        // Trimmed and nothing more: the spelling and the case are the author's.
        Assert.Equal("Gimli", entry.Name);
        Assert.Null(entry.Summary);
        Assert.Empty(entry.Aliases);
        Assert.Empty(entry.Tags);
        Assert.Empty(entry.Fields);
        Assert.Null(entry.Image);
        Assert.False(entry.IsArchived);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        var stored = await db.Entities.AsNoTracking().SingleAsync(candidate => candidate.Id == entry.Id);
        Assert.Equal(ContentVisibility.Private, stored.Visibility);
        Assert.Null(stored.PublicSlug);
        Assert.Null(stored.PublishedAt);
        Assert.Null(stored.DeletedAt);
        Assert.False(await db.EntityArticles.AnyAsync(article => article.EntityId == entry.Id));
        Assert.False(await db.EntityImages.AnyAsync(image => image.EntityId == entry.Id));
        Assert.False(await db.Relationships.AnyAsync(link =>
            link.SourceEntityId == entry.Id || link.TargetEntityId == entry.Id));
        Assert.False(await db.TimelineEntryLinks.AnyAsync(link => link.EntityId == entry.Id));
    }

    // ---------- Names are not unique, and a batch does not make them so ----------

    [Fact]
    public async Task A_name_already_in_the_universe_is_created_again()
    {
        var (client, universe) = await SignedInWithUniverse("mass-existing-name");
        var character = await Type(client, universe.Id, "Character");
        await Created(await Bulk(client, universe.Id, Row(character.Id, "Robin", CanonStatus.Idea)));

        var response = await Bulk(client, universe.Id, Row(character.Id, "Robin", CanonStatus.Idea));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var robins = await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universe.Id}/entities?search=Robin");
        Assert.Equal(2, robins!.TotalCount);
    }

    [Fact]
    public async Task The_same_row_twice_in_one_batch_is_two_entries_when_the_author_sends_it()
    {
        var (client, universe) = await SignedInWithUniverse("mass-repeat");
        var character = await Type(client, universe.Id, "Character");

        var created = await Created(await Bulk(
            client,
            universe.Id,
            Row(character.Id, "Robin", CanonStatus.Draft),
            Row(character.Id, "Robin", CanonStatus.Draft)));

        Assert.Equal(2, created.Count);
        Assert.NotEqual(created[0].Id, created[1].Id);
        Assert.All(created, entry => Assert.Equal("Robin", entry.Name));
    }

    // ---------- All or nothing ----------

    [Fact]
    public async Task A_blank_name_anywhere_creates_nothing_and_names_its_row()
    {
        var (client, universe) = await SignedInWithUniverse("mass-blank");
        var character = await Type(client, universe.Id, "Character");
        var rows = Names(character.Id, "Pilgrim", 40);
        rows[16] = Row(character.Id, "   ", CanonStatus.Idea);

        var problem = await Refused(await Bulk(client, universe.Id, rows));

        Assert.Equal(["entries[16].name"], problem.Errors.Keys);
        Assert.Equal("Give it a name.", problem.Errors["entries[16].name"][0]);
        Assert.Equal(0, await Count(client, universe.Id));
    }

    [Fact]
    public async Task Every_problem_is_reported_at_once_by_row()
    {
        var (client, universe) = await SignedInWithUniverse("mass-many-problems");
        var character = await Type(client, universe.Id, "Character");

        var problem = await Refused(await Bulk(
            client,
            universe.Id,
            Row(character.Id, "Aragorn", CanonStatus.Canon),
            Row(character.Id, new string('x', LoreLimits.NameMaxLength + 1), CanonStatus.Canon),
            Row(Guid.NewGuid(), "Legolas", CanonStatus.Canon),
            Row(character.Id, "Gimli", (CanonStatus)7)));

        Assert.Equal(
            ["entries[1].name", "entries[2].entityTypeId", "entries[3].canonStatus"],
            problem.Errors.Keys.Order(StringComparer.Ordinal));
        Assert.Equal(
            $"Keep the name under {LoreLimits.NameMaxLength} characters.",
            problem.Errors["entries[1].name"][0]);
        Assert.Equal(0, await Count(client, universe.Id));
    }

    [Fact]
    public async Task A_type_from_another_universe_creates_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("mass-foreign-type");
        var elsewhere = await CreateUniverse(client, "Another world");
        var character = await Type(client, universe.Id, "Character");
        var foreign = await Type(client, elsewhere.Id, "Character");

        var problem = await Refused(await Bulk(
            client,
            universe.Id,
            Row(character.Id, "Faramir", CanonStatus.Canon),
            Row(foreign.Id, "Denethor", CanonStatus.Canon)));

        // Refused in the same words as a type that does not exist at all, so it confirms nothing about the other world.
        Assert.Equal("Choose a type from this universe.", problem.Errors["entries[1].entityTypeId"][0]);
        Assert.Equal(0, await Count(client, universe.Id));
        Assert.Equal(0, await Count(client, elsewhere.Id));
    }

    [Fact]
    public async Task An_unknown_type_creates_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("mass-unknown-type");
        var character = await Type(client, universe.Id, "Character");

        var problem = await Refused(await Bulk(
            client,
            universe.Id,
            Row(character.Id, "Eowyn", CanonStatus.Draft),
            Row(Guid.Empty, "Eomer", CanonStatus.Draft)));

        Assert.Equal("Choose a type from this universe.", problem.Errors["entries[1].entityTypeId"][0]);
        Assert.Equal(0, await Count(client, universe.Id));
    }

    [Fact]
    public async Task A_type_with_required_fields_is_refused_because_a_name_cannot_fill_them()
    {
        var (client, universe) = await SignedInWithUniverse("mass-required");
        var character = await Type(client, universe.Id, "Character");
        var starship = await CreateType(client, universe.Id, "Starship");
        var added = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{starship.Id}/fields",
            new FieldDefinitionRequest("Registry", EntityFieldKind.ShortText, true, null, null, null));
        added.EnsureSuccessStatusCode();

        var problem = await Refused(await Bulk(
            client,
            universe.Id,
            Row(character.Id, "Han", CanonStatus.Idea),
            Row(starship.Id, "Millennium Falcon", CanonStatus.Idea)));

        Assert.Equal(
            "Starship has required fields, so its entries are created one at a time.",
            problem.Errors["entries[1].entityTypeId"][0]);
        Assert.Equal(0, await Count(client, universe.Id));

        // The single create refuses the same entry for the same reason: required stays required.
        var single = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new EntityRequest(starship.Id, "Millennium Falcon", null, CanonStatus.Idea, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, single.StatusCode);

        // A field that is not required is no obstacle.
        var optional = await CreateType(client, universe.Id, "Moon");
        (await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{optional.Id}/fields",
            new FieldDefinitionRequest("Orbit", EntityFieldKind.ShortText, false, null, null, null)))
            .EnsureSuccessStatusCode();
        Assert.Equal(
            HttpStatusCode.Created,
            (await Bulk(client, universe.Id, Row(optional.Id, "Endor", CanonStatus.Idea))).StatusCode);
    }

    [Fact]
    public async Task The_limit_is_accepted_and_one_over_it_is_refused_whole()
    {
        var (client, universe) = await SignedInWithUniverse("mass-limit");
        var character = await Type(client, universe.Id, "Character");

        var over = await Refused(await Bulk(
            client, universe.Id, Names(character.Id, "Surplus", EntityEndpoints.MassCreateMaxEntries + 1)));
        Assert.Equal(
            $"Create up to {EntityEndpoints.MassCreateMaxEntries} entries at a time. This has "
                + $"{EntityEndpoints.MassCreateMaxEntries + 1}.",
            over.Errors["entries"][0]);
        Assert.Equal(0, await Count(client, universe.Id));

        var atLimit = await Created(await Bulk(
            client, universe.Id, Names(character.Id, "Enough", EntityEndpoints.MassCreateMaxEntries)));
        Assert.Equal(EntityEndpoints.MassCreateMaxEntries, atLimit.Count);
    }

    [Fact]
    public async Task An_empty_batch_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("mass-empty");

        var none = await Refused(await Bulk(client, universe.Id));
        Assert.Equal("Add at least one entry.", none.Errors["entries"][0]);

        var missing = await Refused(await client.PostAsJsonAsync($"/api/universes/{universe.Id}/entities/bulk", new { }));
        Assert.Equal("Add at least one entry.", missing.Errors["entries"][0]);
    }

    /// <summary>
    /// The transaction itself, not the checks in front of it: every row is valid, the database refuses the thirtieth
    /// insert, and the twenty-nine already written - with their index rows and versions - are gone with it.
    /// </summary>
    [Fact]
    public async Task A_database_failure_late_in_the_batch_leaves_no_entry_behind()
    {
        var (client, universe) = await SignedInWithUniverse("mass-rollback");
        var character = await Type(client, universe.Id, "Character");
        var rows = Names(character.Id, "Doomed", 40);
        const string fails = "Doomed 30";

        _factory.Commands.FailWhen = command =>
            command.CommandText.Contains("INSERT INTO \"Entities\"", StringComparison.Ordinal)
            && command.Parameters.Cast<DbParameter>().Any(parameter => parameter.Value as string == fails);

        HttpResponseMessage failed;
        try
        {
            failed = await Bulk(client, universe.Id, rows);
        }
        finally
        {
            _factory.Commands.FailWhen = null;
        }

        // Answered as a deployment answers it: the exception handler's 500 (issue 55, W2).
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
        Assert.Equal(0, await Count(client, universe.Id));

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
            Assert.False(await db.Entities.AnyAsync(entity => entity.UniverseId == universe.Id));
            Assert.False(await db.EntityRevisions.AnyAsync(revision => revision.Name.StartsWith("Doomed")));
        }

        var search = await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universe.Id}/entities?search=Doomed");
        Assert.Equal(0, search!.TotalCount);

        // Nothing was lost but the attempt: the same forty go through, once each.
        Assert.Equal(40, (await Created(await Bulk(client, universe.Id, rows))).Count);
        Assert.Equal(40, await Count(client, universe.Id));
    }

    // ---------- Who may ----------

    [Fact]
    public async Task Another_owners_universe_is_not_found_and_nothing_is_created()
    {
        var (owner, universe) = await SignedInWithUniverse("mass-owner");
        var character = await Type(owner, universe.Id, "Character");
        var intruder = await SignedInClient("user-mass-intruder");

        var response = await Bulk(intruder, universe.Id, Row(character.Id, "Gollum", CanonStatus.Canon));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(0, await Count(owner, universe.Id));

        var anonymous = await _factory.CreateClient().PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities/bulk",
            new BulkEntityRequest([Row(character.Id, "Gollum", CanonStatus.Canon)]));
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }

    // ---------- What it leaves alone ----------

    [Fact]
    public async Task The_single_create_is_unchanged()
    {
        var (client, universe) = await SignedInWithUniverse("mass-single");
        var character = await Type(client, universe.Id, "Character");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new EntityRequest(character.Id, " Elrond ", " Lord of Rivendell. ", CanonStatus.Draft, ["Peredhel"], ["Elves"], []));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var entry = (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
        Assert.Equal($"/api/universes/{universe.Id}/entities/{entry.Id}", response.Headers.Location?.OriginalString);
        Assert.Equal("Elrond", entry.Name);
        Assert.Equal("Lord of Rivendell.", entry.Summary);
        Assert.Equal(["Peredhel"], entry.Aliases);
        Assert.Equal(["Elves"], entry.Tags);

        var history = await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/universes/{universe.Id}/entities/{entry.Id}/revisions");
        Assert.Equal(EntityRevisionKind.Created, Assert.Single(history!).Kind);

        var found = await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universe.Id}/entities?search=Peredhel");
        Assert.Equal(entry.Id, Assert.Single(found!.Items).Id);

        // And its own refusals read as they did, unkeyed by any row.
        var blank = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new EntityRequest(character.Id, " ", null, CanonStatus.Idea, null, null, null));
        var problem = await Refused(blank);
        Assert.Equal(["name"], problem.Errors.Keys);
    }

    [Fact]
    public void Mass_create_needs_no_schema_change()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        Assert.False(db.Database.HasPendingModelChanges());
    }

    // ---------- Helpers ----------

    private static BulkEntityRow Row(Guid typeId, string name, CanonStatus status) => new(typeId, name, status);

    /// <summary>"Wayfarer 01" to "Wayfarer 40": names that share one word and differ by a number.</summary>
    private static BulkEntityRow?[] Names(Guid typeId, string stem, int count) =>
        [.. Enumerable.Range(1, count).Select(index => Row(typeId, $"{stem} {index:00}", CanonStatus.Idea))];

    private static Task<HttpResponseMessage> Bulk(HttpClient client, Guid universeId, params BulkEntityRow?[] rows) =>
        client.PostAsJsonAsync($"/api/universes/{universeId}/entities/bulk", new BulkEntityRequest(rows));

    private static async Task<IReadOnlyList<BulkCreatedEntity>> Created(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Null(response.Headers.Location);
        return (await response.Content.ReadFromJsonAsync<BulkEntityResponse>())!.Created;
    }

    private static async Task<ValidationProblemDetails> Refused(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!;
    }

    private static async Task<int> Count(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universeId}/entities?pageSize=1"))!.TotalCount;

    private static async Task<EntityDetail> Entity(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{universeId}/entities/{entityId}"))!;

    private static async Task<EntityTypeResponse> Type(HttpClient client, Guid universeId, string name)
    {
        var types = await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types");
        return types!.First(type => type.Name == name);
    }

    private static async Task<EntityTypeResponse> CreateType(HttpClient client, Guid universeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types",
            new EntityTypeRequest(name, null, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
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

    private async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        return (client, await CreateUniverse(client, $"World {tag}"));
    }
}
