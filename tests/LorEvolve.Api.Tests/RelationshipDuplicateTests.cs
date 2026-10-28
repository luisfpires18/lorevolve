using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.FamilyTrees;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.FamilyTreeTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// One link, stored once.
///
/// What makes two links the same link is the kind between the same two ends the same way round, and
/// nothing else: not the words a kind is called, not what it means to a family tree, and not the notes,
/// dates or Canon status that describe the one link rather than telling it from another. Everything a
/// kind's identity does not cover stays legal - a second kind between the same pair, the other direction
/// where direction means something, the same three ids in another universe or another account's.
///
/// The rule is on the relationship routes, which is every way a relationship is ever created: the entry's
/// Relations view, the family tree's Add connection, and a request written by hand. Credentials are
/// obviously synthetic.
/// </summary>
public sealed class RelationshipDuplicateTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Refused ----------

    [Fact]
    public async Task The_same_kind_between_the_same_two_ends_is_refused_and_only_one_is_stored()
    {
        var family = await NewFamily(_factory, "dup-same");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var akron = await Person(family, "Akron Wright");
        var aaron = await Person(family, "Aaron Wright");

        var first = await Link(family, bore, akron, aaron);

        var again = await PostLink(family, bore.Id, akron, aaron);

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        var problem = await Problem(again);
        Assert.Equal(RelationshipEndpoints.DuplicateCode, problem.Code);
        Assert.Contains("already exists", problem.Detail, StringComparison.OrdinalIgnoreCase);

        // It names the link that is there, so a client can offer to open the one the author meant.
        Assert.Equal(first, problem.RelationshipId);

        Assert.Single(await ListFor(family, akron));
        Assert.Single(await ListFor(family, aaron));
    }

    [Fact]
    public async Task Notes_dates_and_a_Canon_status_do_not_make_a_second_copy_a_different_link()
    {
        var family = await NewFamily(_factory, "dup-fields");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var akron = await Person(family, "Akron");
        var aaron = await Person(family, "Aaron");

        await Link(family, bore, akron, aaron, CanonStatus.Canon);

        // Everything a link carries besides its kind and its two ends describes that one link. Leaving any
        // of it in the key would let the very duplicate this refuses through, by typing a date into one.
        var again = await family.Client.PostAsJsonAsync(
            $"/api/universes/{family.Universe}/relationships",
            new RelationshipRequest(
                bore.Id,
                akron,
                aaron,
                CanonStatus.Idea,
                new DateTime(1200, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                new DateTime(1240, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                "Recorded a second time by mistake."));

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Single(await ListFor(family, akron));
    }

    [Fact]
    public async Task A_kind_that_reads_the_same_from_both_ends_is_the_same_link_either_way_round()
    {
        var family = await NewFamily(_factory, "dup-symmetric");
        var married = await PostJson<RelationshipTypeResponse>(
            family.Client,
            Kinds(family.Universe),
            new RelationshipTypeRequest("married to", null, true, null, null));

        var rohan = await Person(family, "Rohan");
        var gondor = await Person(family, "Gondor");

        await PostJson<RelationshipDetail>(
            family.Client,
            $"/api/universes/{family.Universe}/relationships",
            new RelationshipRequest(married.Id, rohan, gondor, CanonStatus.Canon, null, null, null));

        // A symmetric kind is stored once precisely because both readings are one sentence (ADR 0008),
        // so the reversed pair is not a second link - it is the one that is already there.
        var reversed = await PostLink(family, married.Id, gondor, rohan);

        Assert.Equal(HttpStatusCode.Conflict, reversed.StatusCode);
        Assert.Equal(RelationshipEndpoints.DuplicateCode, (await Problem(reversed)).Code);
        Assert.Single(await ListFor(family, rohan));
        Assert.Single(await ListFor(family, gondor));
    }

    [Fact]
    public async Task An_edit_that_would_turn_one_link_into_a_copy_of_another_is_refused()
    {
        var family = await NewFamily(_factory, "dup-edit");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var akron = await Person(family, "Akron");
        var aaron = await Person(family, "Aaron");
        var alia = await Person(family, "Alia");

        await Link(family, bore, akron, aaron);
        var second = await Link(family, bore, akron, alia);

        // Re-pointing the second link's child at the first link's child would leave two rows saying
        // the same thing, which is the same fault arriving by a different route.
        var response = await family.Client.PutAsJsonAsync(
            $"/api/universes/{family.Universe}/relationships/{second}",
            new RelationshipRequest(bore.Id, akron, aaron, CanonStatus.Canon, null, null, null));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(RelationshipEndpoints.DuplicateCode, (await Problem(response)).Code);

        // And nothing was written: the link still points where it did.
        var stored = await family.Client.GetFromJsonAsync<RelationshipDetail>(
            $"/api/universes/{family.Universe}/relationships/{second}");
        Assert.Equal(alia, stored!.TargetEntityId);
    }

    [Fact]
    public async Task A_link_is_never_its_own_duplicate()
    {
        var family = await NewFamily(_factory, "dup-self");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var akron = await Person(family, "Akron");
        var aaron = await Person(family, "Aaron");
        var link = await Link(family, bore, akron, aaron);

        // The ordinary edit - same kind, same ends, a note added - must still go through.
        var response = await family.Client.PutAsJsonAsync(
            $"/api/universes/{family.Universe}/relationships/{link}",
            new RelationshipRequest(bore.Id, akron, aaron, CanonStatus.Canon, null, null, "Recorded at the census."));

        response.EnsureSuccessStatusCode();
        Assert.Equal("Recorded at the census.", (await response.Content.ReadFromJsonAsync<RelationshipDetail>())!.Notes);
    }

    // ---------- Still allowed ----------

    [Fact]
    public async Task A_second_kind_between_the_same_pair_is_a_second_relationship()
    {
        var family = await NewFamily(_factory, "dup-kinds");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var raised = await Kind(family, "raised", RelationshipFamilySemantic.AdoptiveParent);
        var akron = await Person(family, "Akron");
        var aaron = await Person(family, "Aaron");

        await Link(family, bore, akron, aaron);
        await Link(family, raised, akron, aaron);

        Assert.Equal(2, (await ListFor(family, aaron)).Count);
    }

    [Fact]
    public async Task Two_kinds_that_mean_the_same_thing_to_a_family_tree_are_still_two_kinds()
    {
        var family = await NewFamily(_factory, "dup-semantic");
        var mother = await Kind(family, "mother of", RelationshipFamilySemantic.BiologicalParent);
        var father = await Kind(family, "father of", RelationshipFamilySemantic.BiologicalParent);
        var mara = await Person(family, "Mara");
        var oren = await Person(family, "Oren");

        // Identity is the kind's id. Two kinds carrying the same family meaning are two kinds, and a
        // child having both a mother and a father recorded is not a duplicate of anything.
        await Link(family, mother, mara, oren);
        var second = await PostLink(family, father.Id, mara, oren);

        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        Assert.Equal(2, (await ListFor(family, oren)).Count);
    }

    [Fact]
    public async Task Names_play_no_part_in_whether_two_links_are_the_same()
    {
        var family = await NewFamily(_factory, "dup-names");
        var first = await Kind(family, "parent of", RelationshipFamilySemantic.BiologicalParent);
        var second = await Kind(family, "parent of (as recorded)", RelationshipFamilySemantic.BiologicalParent);
        var akron = await Person(family, "Akron");
        var aaron = await Person(family, "Aaron");

        await Link(family, first, akron, aaron);

        // Two kinds whose wording all but matches are still two kinds. Nothing here reads a word.
        Assert.Equal(HttpStatusCode.Created, (await PostLink(family, second.Id, akron, aaron)).StatusCode);
    }

    [Fact]
    public async Task The_other_direction_is_a_different_link_where_direction_means_something()
    {
        var family = await NewFamily(_factory, "dup-reverse");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var akron = await Person(family, "Akron");
        var aaron = await Person(family, "Aaron");

        await Link(family, bore, akron, aaron);

        // Nonsense as lore, and Canon Integrity has a rule that says so - but it is a different row,
        // and refusing it here would be refusing it for the wrong reason.
        Assert.Equal(HttpStatusCode.Created, (await PostLink(family, bore.Id, aaron, akron)).StatusCode);
        Assert.Equal(2, (await ListFor(family, akron)).Count);
    }

    [Fact]
    public async Task The_same_three_ids_in_another_universe_are_not_a_duplicate()
    {
        var (client, first) = await SignedInWithUniverse(_factory, "dup-universe");
        var firstFamily = await InUniverse(client, first.Id);
        var firstKind = await Kind(firstFamily, "bore", RelationshipFamilySemantic.BiologicalParent);
        var akron = await Person(firstFamily, "Akron");
        var aaron = await Person(firstFamily, "Aaron");
        await Link(firstFamily, firstKind, akron, aaron);

        // The same author, the same two names, a second world. Ids differ, and so would the check even
        // if they did not: it never looks outside the universe the caller was proved to own.
        var second = await CreateUniverse(client, "A second world");
        var secondFamily = await InUniverse(client, second.Id);
        var secondKind = await Kind(secondFamily, "bore", RelationshipFamilySemantic.BiologicalParent);
        var otherAkron = await Person(secondFamily, "Akron");
        var otherAaron = await Person(secondFamily, "Aaron");

        Assert.Equal(
            HttpStatusCode.Created,
            (await PostLink(secondFamily, secondKind.Id, otherAkron, otherAaron)).StatusCode);
    }

    [Fact]
    public async Task Another_account_writing_the_same_shape_is_neither_refused_nor_told_about()
    {
        var mine = await NewFamily(_factory, "dup-mine");
        var myKind = await Kind(mine, "bore", RelationshipFamilySemantic.BiologicalParent);
        var myParent = await Person(mine, "Akron");
        var myChild = await Person(mine, "Aaron");
        await Link(mine, myKind, myParent, myChild);

        var theirs = await NewFamily(_factory, "dup-theirs");
        var theirKind = await Kind(theirs, "bore", RelationshipFamilySemantic.BiologicalParent);
        var theirParent = await Person(theirs, "Akron");
        var theirChild = await Person(theirs, "Aaron");

        Assert.Equal(
            HttpStatusCode.Created,
            (await PostLink(theirs, theirKind.Id, theirParent, theirChild)).StatusCode);

        // And the refusal one account does get never mentions another's ids - it can only name a link
        // inside the universe the caller owns.
        var again = await PostLink(theirs, theirKind.Id, theirParent, theirChild);
        var problem = await Problem(again);
        Assert.NotEqual(myParent, problem.RelationshipId);
        Assert.DoesNotContain(myParent.ToString(), await again.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }

    // ---------- Not a duplicate: a database that simply failed ----------

    [Fact]
    public async Task A_locked_database_is_not_reported_as_a_link_that_already_exists()
    {
        var family = await NewFamily(_factory, "dup-locked");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var akron = await Person(family, "Akron");
        var aaron = await Person(family, "Aaron");

        _factory.Commands.FailWith = static () => new SqliteException("SQLite Error 5: 'database is locked'.", 5, 5);
        _factory.Commands.FailWhen = static command =>
            command.CommandText.Contains("INSERT INTO \"Relationships\"", StringComparison.Ordinal);

        HttpResponseMessage failed;
        try
        {
            failed = await PostLink(family, bore.Id, akron, aaron);
        }
        finally
        {
            _factory.Commands.FailWhen = null;
            _factory.Commands.FailWith = static () => new InvalidOperationException("A test failed this command on purpose.");
        }

        // The write failed, so it has to read as a failure. Telling the author their link already exists
        // when it does not is a lie they would act on by going to look for it.
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);

        // And nothing was stored, so the very next attempt writes it.
        Assert.Equal(HttpStatusCode.Created, (await PostLink(family, bore.Id, akron, aaron)).StatusCode);
    }

    // ---------- What is already stored ----------

    [Fact]
    public async Task Duplicates_written_before_the_rule_are_kept_and_drawn_once()
    {
        var family = await NewFamily(_factory, "dup-existing");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var akron = await Person(family, "Akron Wright");
        var aaron = await Person(family, "Aaron Wright");

        var first = await Link(family, bore, akron, aaron);
        var copy = await WriteDuplicateBehindTheApi(family.Universe, bore.Id, akron, aaron);

        // Nothing of the author's is deleted, and both rows still answer from Relations: a stored row is
        // a stored row, and it is theirs to remove.
        var relations = await ListFor(family, aaron);
        Assert.Equal(2, relations.Count);
        Assert.Contains(relations, view => view.Id == first);
        Assert.Contains(relations, view => view.Id == copy);

        // The tree draws the connection once, and Aaron is one child rather than two. Which of the two
        // rows it draws is not the point and is not promised beyond being the same one every read - they
        // say the same thing, which is the whole complaint.
        var tree = await Tree(family, akron);
        Assert.Single(tree.Links);
        Assert.Contains(tree.Links[0].RelationshipId, new[] { first, copy });
        var child = Assert.Single(tree.Children);
        Assert.Equal(aaron, child.EntityId);
        Assert.Single(child.Paths);

        Assert.Equal(tree.Links[0].RelationshipId, (await Tree(family, akron)).Links[0].RelationshipId);
    }

    // ---------- Helpers ----------

    /// <summary>
    /// A duplicate as an older database holds one, put there behind the routes that now refuse it. This is
    /// the only way to get one: nothing an author can press writes it any more.
    /// </summary>
    private async Task<Guid> WriteDuplicateBehindTheApi(Guid universeId, Guid kindId, Guid parent, Guid child)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        var now = DateTime.UtcNow;
        var copy = new LoreRelationship
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            RelationshipTypeId = kindId,
            SourceEntityId = parent,
            TargetEntityId = child,
            CanonStatus = CanonStatus.Canon,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Relationships.Add(copy);
        await db.SaveChangesAsync();
        return copy.Id;
    }

    private static async Task<List<RelationshipView>> ListFor(Family family, Guid entityId) =>
        (await family.Client.GetFromJsonAsync<List<RelationshipView>>(
            $"/api/universes/{family.Universe}/entities/{entityId}/relationships"))!;

    private static async Task<(string? Code, string Detail, Guid? RelationshipId)> Problem(HttpResponseMessage response)
    {
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        return (
            body!.TryGetValue("code", out var code) ? code.ToString() : null,
            body.TryGetValue("detail", out var detail) ? detail.ToString() ?? string.Empty : string.Empty,
            body.TryGetValue("relationshipId", out var id) && Guid.TryParse(id.ToString(), out var parsed)
                ? parsed
                : null);
    }
}
