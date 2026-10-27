using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Relationships, and the two invariants that matter most: one stored row is read
/// correctly from both ends, and nothing resolves outside the caller's own universe.
/// Credentials here are obviously synthetic.
/// </summary>
public sealed class RelationshipEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Relationship types ----------

    [Fact]
    public async Task Owner_can_create_a_custom_relationship_type()
    {
        var (client, universe) = await SignedInWithUniverse("reltype");

        var created = await CreateType(client, universe.Id, "rules", "ruled by");

        Assert.Equal("rules", created.Name);
        Assert.Equal("ruled by", created.InverseName);
        Assert.False(created.IsSymmetric);
        Assert.Equal(0, created.RelationshipCount);
    }

    [Fact]
    public async Task A_symmetric_type_needs_no_inverse_name()
    {
        var (client, universe) = await SignedInWithUniverse("relsym");

        var created = await CreateType(client, universe.Id, "married to", inverseName: null, isSymmetric: true);

        Assert.True(created.IsSymmetric);
        Assert.Null(created.InverseName);
    }

    [Fact]
    public async Task A_directional_type_without_an_inverse_name_is_rejected()
    {
        var (client, universe) = await SignedInWithUniverse("relnoinverse");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types",
            new RelationshipTypeRequest("rules", null, false, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Owner_can_update_a_relationship_type()
    {
        var (client, universe) = await SignedInWithUniverse("reltypeedit");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}",
            new RelationshipTypeRequest("reigns over", "reigned over by", false, "Sovereignty.", 3));
        response.EnsureSuccessStatusCode();

        var updated = (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;

        Assert.Equal("reigns over", updated.Name);
        Assert.Equal("reigned over by", updated.InverseName);
        Assert.Equal("Sovereignty.", updated.Description);
        Assert.Equal(3, updated.DisplayOrder);
    }

    [Fact]
    public async Task Turning_a_type_symmetric_clears_its_inverse_name()
    {
        var (client, universe) = await SignedInWithUniverse("relsymswitch");
        var type = await CreateType(client, universe.Id, "allied with", "allied with");

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}",
            new RelationshipTypeRequest("allied with", "ignored", true, null, null));
        response.EnsureSuccessStatusCode();

        var updated = (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;

        Assert.True(updated.IsSymmetric);
        Assert.Null(updated.InverseName);
    }

    [Fact]
    public async Task A_relationship_type_still_in_use_cannot_be_deleted()
    {
        var (client, universe) = await SignedInWithUniverse("reltypeinuse");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        var response = await client.DeleteAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        // The refusal names how many links stand in the way, so it has to count in
        // English rather than in row counts.
        Assert.Contains(
            "1 relationship still uses this type. Delete it first.",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_refusal_to_delete_a_used_type_counts_more_than_one_in_the_plural()
    {
        var (client, universe) = await SignedInWithUniverse("reltypeplural");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var third = await CreateEntity(
            client, universe.Id, (await FirstDefaultType(client, universe.Id)).Id, "Arnor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);
        await CreateRelationship(client, universe.Id, type.Id, world.First.Id, third.Id);

        var response = await client.DeleteAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains(
            "2 relationships still use this type. Delete them first.",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_unused_relationship_type_can_be_deleted()
    {
        var (client, universe) = await SignedInWithUniverse("reltypefree");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var response = await client.DeleteAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await ListTypes(client, universe.Id));
    }

    // ---------- Directional and symmetric perspective ----------

    [Fact]
    public async Task A_directional_relationship_reads_forward_from_its_source()
    {
        var (client, universe) = await SignedInWithUniverse("reldirection");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var created = await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        Assert.Equal(world.First.Id, created.SourceEntityId);
        Assert.Equal(world.Second.Id, created.TargetEntityId);

        var fromAragorn = Assert.Single(await ListFor(client, universe.Id, world.First.Id));

        Assert.Equal(RelationshipPerspective.Forward, fromAragorn.Perspective);
        Assert.Equal("rules", fromAragorn.Label);
        Assert.Equal(world.Second.Id, fromAragorn.RelatedEntityId);
        Assert.Equal("Gondor", fromAragorn.RelatedEntityName);
    }

    [Fact]
    public async Task The_same_row_reads_inverted_from_its_target()
    {
        var (client, universe) = await SignedInWithUniverse("relinverse");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        var created = await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        var fromGondor = Assert.Single(await ListFor(client, universe.Id, world.Second.Id));

        // One stored row, read from the other end: same id, inverted wording.
        Assert.Equal(created.Id, fromGondor.Id);
        Assert.Equal(RelationshipPerspective.Inverse, fromGondor.Perspective);
        Assert.Equal("ruled by", fromGondor.Label);
        Assert.Equal(world.First.Id, fromGondor.RelatedEntityId);
        Assert.Equal("Aragorn", fromGondor.RelatedEntityName);

        // The stored direction still travels with the row so it stays editable in place.
        Assert.Equal(world.First.Id, fromGondor.SourceEntityId);
        Assert.Equal(world.Second.Id, fromGondor.TargetEntityId);
    }

    [Fact]
    public async Task A_symmetric_relationship_reads_the_same_from_both_ends()
    {
        var (client, universe) = await SignedInWithUniverse("relsymread");
        var world = await Cast(client, universe.Id, "Aragorn", "Arwen");
        var type = await CreateType(client, universe.Id, "married to", inverseName: null, isSymmetric: true);
        await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        var fromAragorn = Assert.Single(await ListFor(client, universe.Id, world.First.Id));
        var fromArwen = Assert.Single(await ListFor(client, universe.Id, world.Second.Id));

        Assert.Equal("married to", fromAragorn.Label);
        Assert.Equal("married to", fromArwen.Label);
        Assert.Equal(world.Second.Id, fromAragorn.RelatedEntityId);
        Assert.Equal(world.First.Id, fromArwen.RelatedEntityId);
    }

    // ---------- Stored detail ----------

    [Fact]
    public async Task Notes_canon_status_and_optional_dates_persist()
    {
        var (client, universe) = await SignedInWithUniverse("relfields");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var start = new DateTime(3019, 5, 1, 0, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(3120, 3, 1, 0, 0, 0, DateTimeKind.Utc);

        var created = await CreateRelationship(
            client, universe.Id, type.Id, world.First.Id, world.Second.Id,
            canonStatus: CanonStatus.Canon,
            startDate: start,
            endDate: end,
            notes: "Crowned after the War of the Ring.");

        var fetched = (await client.GetFromJsonAsync<RelationshipDetail>(
            $"/api/universes/{universe.Id}/relationships/{created.Id}"))!;

        Assert.Equal(CanonStatus.Canon, fetched.CanonStatus);
        Assert.Equal(start, fetched.StartDate);
        Assert.Equal(end, fetched.EndDate);
        Assert.Equal("Crowned after the War of the Ring.", fetched.Notes);

        var view = Assert.Single(await ListFor(client, universe.Id, world.First.Id));
        Assert.Equal(CanonStatus.Canon, view.CanonStatus);
        Assert.Equal(start, view.StartDate);
        Assert.Equal(end, view.EndDate);
        Assert.Equal("Crowned after the War of the Ring.", view.Notes);
    }

    [Fact]
    public async Task Dates_are_optional()
    {
        var (client, universe) = await SignedInWithUniverse("reldateless");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var created = await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        Assert.Null(created.StartDate);
        Assert.Null(created.EndDate);
        Assert.Null(created.Notes);
    }

    [Fact]
    public async Task An_end_date_before_the_start_date_is_rejected()
    {
        var (client, universe) = await SignedInWithUniverse("reldateorder");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships",
            new RelationshipRequest(
                type.Id,
                world.First.Id,
                world.Second.Id,
                CanonStatus.Idea,
                new DateTime(3120, 3, 1, 0, 0, 0, DateTimeKind.Utc),
                new DateTime(3019, 5, 1, 0, 0, 0, DateTimeKind.Utc),
                null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_entity_cannot_be_related_to_itself()
    {
        var (client, universe) = await SignedInWithUniverse("relself");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships",
            new RelationshipRequest(
                type.Id, world.First.Id, world.First.Id, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Updating_a_relationship_rewrites_the_single_stored_row()
    {
        var (client, universe) = await SignedInWithUniverse("reledit");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        var created = await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships/{created.Id}",
            new RelationshipRequest(
                type.Id,
                world.First.Id,
                world.Second.Id,
                CanonStatus.Draft,
                null,
                null,
                "Still being decided."));
        response.EnsureSuccessStatusCode();

        var updated = (await response.Content.ReadFromJsonAsync<RelationshipDetail>())!;

        Assert.Equal(created.Id, updated.Id);
        Assert.Equal(CanonStatus.Draft, updated.CanonStatus);
        Assert.Equal("Still being decided.", updated.Notes);
        Assert.Single(await ListFor(client, universe.Id, world.First.Id));
    }

    [Fact]
    public async Task Deleting_a_relationship_removes_it_from_both_entities()
    {
        var (client, universe) = await SignedInWithUniverse("reldelete");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        var created = await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        var response = await client.DeleteAsync($"/api/universes/{universe.Id}/relationships/{created.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await ListFor(client, universe.Id, world.First.Id));
        Assert.Empty(await ListFor(client, universe.Id, world.Second.Id));
    }

    // ---------- Universe ownership ----------

    [Fact]
    public async Task Both_ends_must_live_in_the_same_universe()
    {
        var (client, home) = await SignedInWithUniverse("relsameuniverse");
        var world = await Cast(client, home.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, home.Id, "rules", "ruled by");

        // A second universe owned by the same author: ownership passes, the entity still
        // does not belong here.
        var away = await CreateUniverse(client, "Elsewhere");
        var awayType = await FirstDefaultType(client, away.Id);
        var outsider = await CreateEntity(client, away.Id, awayType.Id, "Someone Else");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{home.Id}/relationships",
            new RelationshipRequest(
                type.Id, world.First.Id, outsider.Id, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_relationship_type_from_another_universe_is_rejected()
    {
        var (client, home) = await SignedInWithUniverse("relforeigntype");
        var world = await Cast(client, home.Id, "Aragorn", "Gondor");

        var away = await CreateUniverse(client, "Elsewhere");
        var awayType = await CreateType(client, away.Id, "rules", "ruled by");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{home.Id}/relationships",
            new RelationshipRequest(
                awayType.Id, world.First.Id, world.Second.Id, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_entity_from_another_universe_has_no_relationships_here()
    {
        var (client, universe, world, type) = await Populated("rellistcross");
        await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        // Same owner, different universe: the entity is real, but not real *here*.
        var other = await CreateUniverse(client, "World rellistcross-other");

        var response = await client.GetAsync(
            $"/api/universes/{other.Id}/entities/{world.First.Id}/relationships");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Another_owner_cannot_read_a_relationship()
    {
        var (alice, aliceUniverse, aliceWorld, aliceType) = await Populated("relread-a");
        var link = await CreateRelationship(
            alice, aliceUniverse.Id, aliceType.Id, aliceWorld.First.Id, aliceWorld.Second.Id);

        var bob = await SignedInClient("user-relread-b");

        var get = await bob.GetAsync($"/api/universes/{aliceUniverse.Id}/relationships/{link.Id}");
        var list = await bob.GetAsync(
            $"/api/universes/{aliceUniverse.Id}/entities/{aliceWorld.First.Id}/relationships");
        var types = await bob.GetAsync($"/api/universes/{aliceUniverse.Id}/relationship-types");

        // 404 everywhere: someone else's universe is indistinguishable from one that does
        // not exist.
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, list.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, types.StatusCode);
    }

    [Fact]
    public async Task Another_owner_cannot_mutate_or_delete_a_relationship()
    {
        var (alice, aliceUniverse, aliceWorld, aliceType) = await Populated("relmutate-a");
        var link = await CreateRelationship(
            alice, aliceUniverse.Id, aliceType.Id, aliceWorld.First.Id, aliceWorld.Second.Id);

        var bob = await SignedInClient("user-relmutate-b");

        var update = await bob.PutAsJsonAsync(
            $"/api/universes/{aliceUniverse.Id}/relationships/{link.Id}",
            new RelationshipRequest(
                aliceType.Id,
                aliceWorld.First.Id,
                aliceWorld.Second.Id,
                CanonStatus.Canon,
                null,
                null,
                "Tampered."));

        var delete = await bob.DeleteAsync($"/api/universes/{aliceUniverse.Id}/relationships/{link.Id}");

        Assert.Equal(HttpStatusCode.NotFound, update.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);

        var untouched = (await alice.GetFromJsonAsync<RelationshipDetail>(
            $"/api/universes/{aliceUniverse.Id}/relationships/{link.Id}"))!;
        Assert.Equal(CanonStatus.Idea, untouched.CanonStatus);
        Assert.Null(untouched.Notes);
    }

    [Fact]
    public async Task Another_owner_cannot_delete_a_relationship_type()
    {
        var (alice, aliceUniverse) = await SignedInWithUniverse("reltypeown-a");
        var aliceType = await CreateType(alice, aliceUniverse.Id, "rules", "ruled by");

        var bob = await SignedInClient("user-reltypeown-b");

        var update = await bob.PutAsJsonAsync(
            $"/api/universes/{aliceUniverse.Id}/relationship-types/{aliceType.Id}",
            new RelationshipTypeRequest("hijacked", "hijacked by", false, null, null));
        var delete = await bob.DeleteAsync(
            $"/api/universes/{aliceUniverse.Id}/relationship-types/{aliceType.Id}");

        Assert.Equal(HttpStatusCode.NotFound, update.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);
    }

    [Fact]
    public async Task An_entity_owned_by_someone_else_cannot_be_targeted()
    {
        var (alice, aliceUniverse, aliceWorld, _) = await Populated("reltarget-a");
        var (bob, bobUniverse, bobWorld, bobType) = await Populated("reltarget-b");

        var response = await bob.PostAsJsonAsync(
            $"/api/universes/{bobUniverse.Id}/relationships",
            new RelationshipRequest(
                bobType.Id, bobWorld.First.Id, aliceWorld.First.Id, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        // Nothing was written into either universe.
        Assert.Empty(await ListFor(bob, bobUniverse.Id, bobWorld.First.Id));
        Assert.Empty(await ListFor(alice, aliceUniverse.Id, aliceWorld.First.Id));
    }

    [Fact]
    public async Task A_relationship_type_owned_by_someone_else_cannot_be_used()
    {
        var (alice, aliceUniverse) = await SignedInWithUniverse("reltypeuse-a");
        var aliceType = await CreateType(alice, aliceUniverse.Id, "rules", "ruled by");

        var (bob, bobUniverse, bobWorld, _) = await Populated("reltypeuse-b");

        var response = await bob.PostAsJsonAsync(
            $"/api/universes/{bobUniverse.Id}/relationships",
            new RelationshipRequest(
                aliceType.Id, bobWorld.First.Id, bobWorld.Second.Id, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await ListFor(bob, bobUniverse.Id, bobWorld.First.Id));
    }

    [Fact]
    public async Task Identity_and_timestamps_cannot_be_overposted()
    {
        var (client, universe) = await SignedInWithUniverse("reloverpost");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var planted = Guid.NewGuid();
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships",
            new
            {
                id = planted,
                universeId = Guid.NewGuid(),
                relationshipTypeId = type.Id,
                sourceEntityId = world.First.Id,
                targetEntityId = world.Second.Id,
                canonStatus = CanonStatus.Idea,
                createdAt = new DateTime(1999, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                updatedAt = new DateTime(1999, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<RelationshipDetail>())!;

        Assert.NotEqual(planted, created.Id);
        Assert.True(created.CreatedAt > new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        // The row landed in the caller's universe, not the one they tried to name.
        Assert.Single(await ListFor(client, universe.Id, world.First.Id));
    }

    // ---------- Canon constraints ----------

    [Fact]
    public async Task A_type_has_no_canon_constraints_until_its_author_configures_some()
    {
        var (client, universe) = await SignedInWithUniverse("relcons-default");

        var created = await CreateType(client, universe.Id, "parent of", "child of");

        Assert.Equal(RelationshipTypeCanonConstraints.None, created.CanonConstraints);
        Assert.Equal(
            RelationshipTypeCanonConstraints.None,
            Assert.Single(await ListTypes(client, universe.Id)).CanonConstraints);
    }

    [Theory]
    [InlineData("older", RelationshipAgeOrder.SourceOlder, null, null)]
    [InlineData("younger", RelationshipAgeOrder.SourceYounger, null, null)]
    [InlineData("min", RelationshipAgeOrder.None, 12, null)]
    [InlineData("max", RelationshipAgeOrder.None, null, 40)]
    [InlineData("both", RelationshipAgeOrder.SourceOlder, 12, 60)]
    [InlineData("zero", RelationshipAgeOrder.None, 0, 0)]
    public async Task Each_constraint_is_stored_exactly_as_configured(
        string tag,
        RelationshipAgeOrder order,
        int? min,
        int? max)
    {
        var (client, universe) = await SignedInWithUniverse($"relcons-{tag}");
        var constraints = new RelationshipTypeCanonConstraints(order, min, max);

        var created = await CreateType(client, universe.Id, "parent of", "child of", constraints: constraints);

        Assert.Equal(constraints, created.CanonConstraints);
        Assert.Equal(constraints, Assert.Single(await ListTypes(client, universe.Id)).CanonConstraints);
    }

    [Fact]
    public async Task Constraints_can_be_changed_and_cleared()
    {
        var (client, universe) = await SignedInWithUniverse("relcons-edit");
        var type = await CreateType(
            client, universe.Id, "parent of", "child of",
            constraints: new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, 12, null));

        var changed = await UpdateType(
            client, universe.Id, type.Id,
            new RelationshipTypeRequest(
                "parent of", "child of", false, null, null,
                new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceYounger, null, 30)));

        Assert.Equal(
            new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceYounger, null, 30),
            changed.CanonConstraints);

        var cleared = await UpdateType(
            client, universe.Id, type.Id,
            new RelationshipTypeRequest(
                "parent of", "child of", false, null, null, RelationshipTypeCanonConstraints.None));

        Assert.Equal(RelationshipTypeCanonConstraints.None, cleared.CanonConstraints);
    }

    [Fact]
    public async Task Saving_a_type_without_sending_constraints_keeps_the_ones_it_has()
    {
        var (client, universe) = await SignedInWithUniverse("relcons-keep");
        var configured = new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, 12, 60);
        var type = await CreateType(client, universe.Id, "parent of", "child of", constraints: configured);

        // A client that predates constraints renames the type and knows nothing else about it.
        var renamed = await UpdateType(
            client, universe.Id, type.Id,
            new RelationshipTypeRequest("begat", "begotten by", false, null, null));

        Assert.Equal("begat", renamed.Name);
        Assert.Equal(configured, renamed.CanonConstraints);
    }

    [Theory]
    [InlineData("min", -1, null, "canonConstraints.minAgeDifferenceYears")]
    [InlineData("max", null, -1, "canonConstraints.maxAgeDifferenceYears")]
    public async Task A_negative_age_gap_is_refused(string tag, int? min, int? max, string field)
    {
        var (client, universe) = await SignedInWithUniverse($"relcons-neg{tag}");

        var response = await PostType(
            client, universe.Id,
            new RelationshipTypeRequest(
                "parent of", "child of", false, null, null,
                new RelationshipTypeCanonConstraints(RelationshipAgeOrder.None, min, max)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(field, await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Empty(await ListTypes(client, universe.Id));
    }

    [Fact]
    public async Task A_minimum_above_the_maximum_is_refused_rather_than_swapped()
    {
        var (client, universe) = await SignedInWithUniverse("relcons-minmax");
        var configured = new RelationshipTypeCanonConstraints(RelationshipAgeOrder.None, 5, 10);
        var type = await CreateType(client, universe.Id, "parent of", "child of", constraints: configured);

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}",
            new RelationshipTypeRequest(
                "parent of", "child of", false, null, null,
                new RelationshipTypeCanonConstraints(RelationshipAgeOrder.None, 20, 10)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("canonConstraints.maxAgeDifferenceYears", body, StringComparison.Ordinal);
        Assert.Contains("20 years", body, StringComparison.Ordinal);

        // Neither the two numbers nor anything else about the type moved.
        Assert.Equal(configured, Assert.Single(await ListTypes(client, universe.Id)).CanonConstraints);
    }

    [Fact]
    public async Task An_age_order_lorevolve_does_not_know_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("relcons-enum");

        var byNumber = await PostType(
            client, universe.Id,
            new RelationshipTypeRequest(
                "parent of", "child of", false, null, null,
                new RelationshipTypeCanonConstraints((RelationshipAgeOrder)99, null, null)));

        Assert.Equal(HttpStatusCode.BadRequest, byNumber.StatusCode);
        Assert.Contains("canonConstraints.ageOrder", await byNumber.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var byName = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types",
            new
            {
                name = "parent of",
                inverseName = "child of",
                isSymmetric = false,
                canonConstraints = new { ageOrder = "Banana" },
            });

        Assert.Equal(HttpStatusCode.BadRequest, byName.StatusCode);
        Assert.Empty(await ListTypes(client, universe.Id));
    }

    [Fact]
    public async Task A_symmetric_type_may_bound_an_age_gap_but_cannot_name_an_older_end()
    {
        var (client, universe) = await SignedInWithUniverse("relcons-sym");

        var ordered = await PostType(
            client, universe.Id,
            new RelationshipTypeRequest(
                "sibling of", null, true, null, null,
                new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, null, null)));

        Assert.Equal(HttpStatusCode.BadRequest, ordered.StatusCode);
        Assert.Contains("canonConstraints.ageOrder", await ordered.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var gap = new RelationshipTypeCanonConstraints(RelationshipAgeOrder.None, null, 20);
        var created = await CreateType(client, universe.Id, "sibling of", isSymmetric: true, constraints: gap);

        Assert.Equal(gap, created.CanonConstraints);
    }

    [Fact]
    public async Task A_type_cannot_be_turned_symmetric_beneath_an_age_order_it_already_has()
    {
        var (client, universe) = await SignedInWithUniverse("relcons-symswitch");
        var configured = new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, null, null);
        var type = await CreateType(client, universe.Id, "parent of", "child of", constraints: configured);

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}",
            new RelationshipTypeRequest("parent of", null, true, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var stored = Assert.Single(await ListTypes(client, universe.Id));
        Assert.False(stored.IsSymmetric);
        Assert.Equal(configured, stored.CanonConstraints);
    }

    [Fact]
    public async Task Another_owner_cannot_change_a_types_constraints()
    {
        var (alice, aliceUniverse) = await SignedInWithUniverse("relcons-own-a");
        var aliceType = await CreateType(alice, aliceUniverse.Id, "parent of", "child of");

        var bob = await SignedInClient("user-relcons-own-b");

        var response = await bob.PutAsJsonAsync(
            $"/api/universes/{aliceUniverse.Id}/relationship-types/{aliceType.Id}",
            new RelationshipTypeRequest(
                "parent of", "child of", false, null, null,
                new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, 12, null)));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(
            RelationshipTypeCanonConstraints.None,
            Assert.Single(await ListTypes(alice, aliceUniverse.Id)).CanonConstraints);
    }

    [Fact]
    public async Task A_type_cannot_be_configured_through_a_universe_it_does_not_belong_to()
    {
        var (client, first) = await SignedInWithUniverse("relcons-scope");
        var second = await CreateUniverse(client, "World relcons-scope two");
        var type = await CreateType(client, first.Id, "parent of", "child of");

        // The same owner, so this is not about the account: the type is simply not in that universe.
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{second.Id}/relationship-types/{type.Id}",
            new RelationshipTypeRequest(
                "parent of", "child of", false, null, null,
                new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, null, null)));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Empty(await ListTypes(client, second.Id));
        Assert.Equal(
            RelationshipTypeCanonConstraints.None,
            Assert.Single(await ListTypes(client, first.Id)).CanonConstraints);
    }

    // ---------- Helpers ----------

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

    /// <summary>A signed-in owner with a universe, two entities and a directional type.</summary>
    private async Task<(HttpClient Client, UniverseDetail Universe, (EntityDetail First, EntityDetail Second) World,
        RelationshipTypeResponse Type)> Populated(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(tag);
        var world = await Cast(client, universe.Id, $"First {tag}", $"Second {tag}");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        return (client, universe, world, type);
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<EntityTypeResponse> FirstDefaultType(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        return types.First(type => type.Name == "Character");
    }

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, CanonStatus.Idea, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<(EntityDetail First, EntityDetail Second)> Cast(
        HttpClient client,
        Guid universeId,
        string first,
        string second)
    {
        var type = await FirstDefaultType(client, universeId);
        return (
            await CreateEntity(client, universeId, type.Id, first),
            await CreateEntity(client, universeId, type.Id, second));
    }

    private static async Task<List<RelationshipTypeResponse>> ListTypes(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<RelationshipTypeResponse>>(
            $"/api/universes/{universeId}/relationship-types"))!;

    private static async Task<RelationshipTypeResponse> CreateType(
        HttpClient client,
        Guid universeId,
        string name,
        string? inverseName = null,
        bool isSymmetric = false,
        string? description = null,
        RelationshipTypeCanonConstraints? constraints = null)
    {
        var response = await PostType(
            client,
            universeId,
            new RelationshipTypeRequest(name, inverseName, isSymmetric, description, null, constraints));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;
    }

    private static Task<HttpResponseMessage> PostType(
        HttpClient client,
        Guid universeId,
        RelationshipTypeRequest request) =>
        client.PostAsJsonAsync($"/api/universes/{universeId}/relationship-types", request);

    private static async Task<RelationshipTypeResponse> UpdateType(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        RelationshipTypeRequest request)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/relationship-types/{typeId}",
            request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;
    }

    private static async Task<RelationshipDetail> CreateRelationship(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        Guid sourceId,
        Guid targetId,
        CanonStatus canonStatus = CanonStatus.Idea,
        DateTime? startDate = null,
        DateTime? endDate = null,
        string? notes = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationships",
            new RelationshipRequest(typeId, sourceId, targetId, canonStatus, startDate, endDate, notes));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipDetail>())!;
    }

    private static async Task<List<RelationshipView>> ListFor(
        HttpClient client,
        Guid universeId,
        Guid entityId) =>
        (await client.GetFromJsonAsync<List<RelationshipView>>(
            $"/api/universes/{universeId}/entities/{entityId}/relationships"))!;
}
