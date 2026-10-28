using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// What a write says when the database refuses it. A unique index losing a race is a refusal the author
/// can act on - the name is taken. Anything else the database says, a locked file most of all, is not,
/// and must not be dressed up as one.
/// </summary>
public sealed class DatabaseFailureTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    /// <summary>SQLite's own codes, as <c>Microsoft.Data.Sqlite</c> reports them.</summary>
    private static DbUpdateException Sqlite(int errorCode, int extendedErrorCode) =>
        new("An error occurred while saving.", new SqliteException("SQLite Error.", errorCode, extendedErrorCode));

    [Fact]
    public void A_unique_index_is_the_only_thing_a_name_refusal_may_be_read_from()
    {
        // SQLITE_CONSTRAINT_UNIQUE and SQLITE_CONSTRAINT_PRIMARYKEY: the race a friendly refusal was written for.
        Assert.True(DatabaseFailures.IsUniqueViolation(Sqlite(19, 2067)));
        Assert.True(DatabaseFailures.IsUniqueViolation(Sqlite(19, 1555)));

        // SQLITE_BUSY and SQLITE_LOCKED say nothing about the name. Neither does a foreign key or a check.
        Assert.False(DatabaseFailures.IsUniqueViolation(Sqlite(5, 5)));
        Assert.False(DatabaseFailures.IsUniqueViolation(Sqlite(6, 6)));
        Assert.False(DatabaseFailures.IsUniqueViolation(Sqlite(19, 787)));
        Assert.False(DatabaseFailures.IsUniqueViolation(Sqlite(19, 275)));

        // Nor does a failure that never reached SQLite at all.
        Assert.False(DatabaseFailures.IsUniqueViolation(new DbUpdateException("gone", new TimeoutException())));
        Assert.False(DatabaseFailures.IsUniqueViolation(new DbUpdateException("gone")));
    }

    [Fact]
    public void Any_constraint_covers_an_order_that_moved_but_still_not_a_locked_database()
    {
        // A row appended twice or a parent deleted underneath: the races this predicate is for.
        Assert.True(DatabaseFailures.IsConstraintViolation(Sqlite(19, 2067)));
        Assert.True(DatabaseFailures.IsConstraintViolation(Sqlite(19, 787)));

        // A column left null or a check refusing is a bug in the write, not a race.
        Assert.False(DatabaseFailures.IsConstraintViolation(Sqlite(19, 1299)));
        Assert.False(DatabaseFailures.IsConstraintViolation(Sqlite(19, 275)));

        Assert.False(DatabaseFailures.IsConstraintViolation(Sqlite(5, 5)));
        Assert.False(DatabaseFailures.IsConstraintViolation(Sqlite(6, 6)));
        Assert.False(DatabaseFailures.IsConstraintViolation(Sqlite(11, 11)));
        Assert.False(DatabaseFailures.IsConstraintViolation(new DbUpdateException("gone", new TimeoutException())));
    }

    [Fact]
    public async Task A_real_unique_index_violation_is_recognised_as_one()
    {
        // The predicates above are written against SQLite's codes. This is the only test that proves
        // EF Core actually hands them over in that shape: a genuine duplicate, written past the check
        // an endpoint does first, wrapped by a real SaveChanges.
        var (client, universe) = await SignedInWithUniverse(_factory, "dbfail-real");
        await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Artefact", null, null, null, null));

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        db.EntityTypes.Add(new EntityType
        {
            Id = Guid.NewGuid(),
            UniverseId = universe.Id,
            Name = "Artefact",
            DisplayOrder = 99,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });

        var failure = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.True(DatabaseFailures.IsUniqueViolation(failure));
        Assert.True(DatabaseFailures.IsConstraintViolation(failure));
    }

    [Fact]
    public async Task A_unique_index_losing_the_race_still_says_the_type_name_is_taken()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "dbfail-unique");

        // The check before the write cannot see a name inserted a microsecond ago; the index can, and this
        // is what it raises. The name is genuinely taken, so the friendly refusal is the truth.
        var response = await WithFailedInsert(
            "EntityTypes",
            () => new SqliteException("SQLite Error 19: 'UNIQUE constraint failed'.", 19, 2067),
            () => client.PostAsJsonAsync(
                $"/api/universes/{universe.Id}/entity-types",
                new EntityTypeRequest("Artefact", null, null, null, null)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("already has a type with that name", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_locked_database_does_not_claim_the_type_name_is_taken()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "dbfail-locked");

        var failed = await WithFailedInsert(
            "EntityTypes",
            () => new SqliteException("SQLite Error 5: 'database is locked'.", 5, 5),
            () => client.PostAsJsonAsync(
                $"/api/universes/{universe.Id}/entity-types",
                new EntityTypeRequest("Artefact", null, null, null, null)));

        // The write failed, so it must read as a failure - not as a name that was never taken.
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);

        // And the name really is free: the very next attempt takes it.
        var created = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Artefact", null, null, null, null));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
    }

    [Fact]
    public async Task A_locked_database_does_not_claim_the_universe_name_is_taken()
    {
        var client = await SignedIn(_factory, "dbfail-universe");

        var failed = await WithFailedInsert(
            "Universes",
            () => new SqliteException("SQLite Error 5: 'database is locked'.", 5, 5),
            () => client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest("Saltmarch", null, null)));

        // A failure, answered as one: not a refusal saying the name was taken or the order moved.
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);

        var created = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest("Saltmarch", null, null));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
    }

    [Fact]
    public async Task A_locked_database_does_not_claim_the_chapter_order_moved()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "dbfail-order");
        var story = await CreateStory(client, universe.Id, "Saltmarch");

        var failed = await WithFailedInsert(
            "Chapters",
            () => new SqliteException("SQLite Error 5: 'database is locked'.", 5, 5),
            () => client.PostAsJsonAsync(
                $"{Story(universe.Id, story)}/chapters",
                new ChapterRequest("First light", null, null)));

        // A failure, answered as one: not a refusal saying the name was taken or the order moved.
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);

        var created = await client.PostAsJsonAsync(
            $"{Story(universe.Id, story)}/chapters",
            new ChapterRequest("First light", null, null));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
    }

    /// <summary>Runs <paramref name="request"/> with the next insert into <paramref name="table"/> failing as SQLite would.</summary>
    private async Task<HttpResponseMessage> WithFailedInsert(
        string table,
        Func<Exception> failure,
        Func<Task<HttpResponseMessage>> request)
    {
        _factory.Commands.FailWith = failure;
        _factory.Commands.FailWhen = command =>
            command.CommandText.Contains($"INSERT INTO \"{table}\"", StringComparison.Ordinal);

        try
        {
            return await request();
        }
        finally
        {
            _factory.Commands.FailWhen = null;
            _factory.Commands.FailWith = static () => new InvalidOperationException("A test failed this command on purpose.");
        }
    }
}
