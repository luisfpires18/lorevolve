using System.Net;
using System.Text.Json;
using Lorex.Api.Features.FamilyTrees;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.FamilyTreeTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// The family tree read (ADR 0035): what it derives, what it refuses to claim, and what it never touches.
///
/// Everything here is derived from explicit parent links on every request. No sibling, grandparent or grandchild row is ever
/// stored, nothing is read from a name, an entry type, an alias or a date, and reading a tree writes nothing at all. The tree is
/// bounded at two generations each way, so a circle of links cannot make it run for ever - it is reported instead.
/// </summary>
public sealed class FamilyTreeEndpointTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    // ---------- Derivation ----------

    [Fact]
    public async Task Parents_grandparents_siblings_children_and_grandchildren_all_come_from_parent_links()
    {
        var household = await NewHousehold(_factory, "fttree");
        var tree = await Tree(household.Family, household.Lia);

        Assert.Equal(household.Lia, tree.FocalEntityId);
        Assert.Equal(2, tree.GenerationsEachWay);

        Assert.Equal(["Mara", "Oren"], Names(tree, tree.Parents));
        Assert.Equal(["Nana"], Names(tree, tree.Grandparents));
        Assert.Equal(["Tam"], Names(tree, tree.Siblings));
        Assert.Equal(["Cai"], Names(tree, tree.Children));
        Assert.Equal(["Pip"], Names(tree, tree.Grandchildren));
        Assert.Empty(tree.Loops);

        // Read as a sentence, with the meaning and status of every link on every path.
        Assert.Equal(
            [
                "focal Lia generations=2",
                "parent Mara paths=[Mara>Lia:BiologicalParent:Canon:bore]",
                "parent Oren paths=[Oren>Lia:AdoptiveParent:Canon:raised]",
                "grandparent Nana paths=[Mara>Lia:BiologicalParent:Canon:bore / Nana>Mara:BiologicalParent:Canon:bore]",
                "sibling Tam paths=[Mara>Lia:BiologicalParent:Canon:bore / Mara>Tam:BiologicalParent:Canon:bore | "
                    + "Oren>Lia:AdoptiveParent:Canon:raised / Oren>Tam:BiologicalParent:Canon:bore]",
                "child Cai paths=[Lia>Cai:BiologicalParent:Canon:bore]",
                "grandchild Pip paths=[Lia>Cai:BiologicalParent:Canon:bore / Cai>Pip:AdoptiveParent:Canon:raised]",
            ],
            Describe(tree));

        // Seven authored links and not one row more: no sibling, grandparent or grandchild was written.
        await WithDb(_factory, async db =>
            Assert.Equal(7, await db.Relationships.CountAsync(link => link.UniverseId == household.Universe)));
    }

    [Fact]
    public async Task A_family_may_have_any_number_of_parents_of_either_kind()
    {
        var family = await NewFamily(_factory, "ftmanyparents");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var raised = await Kind(family, "raised", RelationshipFamilySemantic.AdoptiveParent, "raised by");
        var child = await Person(family, "Child");

        foreach (var name in new[] { "First", "Second", "Third" })
        {
            await Link(family, bore, await Person(family, name), child);
        }

        foreach (var name in new[] { "Fourth", "Fifth" })
        {
            await Link(family, raised, await Person(family, name), child);
        }

        var tree = await Tree(family, child);

        Assert.Equal(["Fifth", "First", "Fourth", "Second", "Third"], Names(tree, tree.Parents));
        Assert.Equal(3, tree.Links.Count(link => link.Semantic == RelationshipFamilySemantic.BiologicalParent));
        Assert.Equal(2, tree.Links.Count(link => link.Semantic == RelationshipFamilySemantic.AdoptiveParent));
    }

    [Fact]
    public async Task A_link_is_read_on_its_stored_direction_whatever_the_entries_are_called()
    {
        var family = await NewFamily(_factory, "ftdirection");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        // Stored source to target: the entry called "Child" is the parent here, because that is where the link was written.
        var child = await Person(family, "Child");
        var parent = await Person(family, "Parent");
        await Link(family, bore, child, parent);

        var childs = await Tree(family, child);
        var parents = await Tree(family, parent);

        Assert.Equal(["Parent"], Names(childs, childs.Children));
        Assert.Equal(["Child"], Names(parents, parents.Parents));
        Assert.Empty(childs.Parents);
    }

    [Fact]
    public async Task An_entry_reached_through_two_branches_is_one_relative_with_two_paths()
    {
        var family = await NewFamily(_factory, "ftdedupe");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        var elder = await Person(family, "Elder");
        var mara = await Person(family, "Mara");
        var oren = await Person(family, "Oren");
        var lia = await Person(family, "Lia");

        await Link(family, bore, elder, mara);
        await Link(family, bore, elder, oren);
        await Link(family, bore, mara, lia);
        await Link(family, bore, oren, lia);

        var tree = await Tree(family, lia);

        var grandparent = Assert.Single(tree.Grandparents);
        Assert.Equal(elder, grandparent.EntityId);
        Assert.Equal(2, grandparent.Paths.Count);
        Assert.Equal(["Elder", "Lia", "Mara", "Oren"], tree.Nodes.Select(node => node.Name));
        Assert.Equal(4, tree.Links.Count);
    }

    [Fact]
    public async Task A_kind_with_no_family_meaning_is_never_walked_and_giving_one_changes_every_tree_at_once()
    {
        var family = await NewFamily(_factory, "ftsemantic");
        var named = await Kind(family, "parent of", inverseName: "child of");
        var rules = await Kind(family, "rules", inverseName: "ruled by");

        var elder = await Person(family, "Elder");
        var young = await Person(family, "Young");
        await Link(family, named, elder, young);
        await Link(family, rules, elder, young);

        // Two links an author reads as family and rule, and no family tree between them.
        var blank = await Tree(family, young);
        Assert.Empty(blank.Links);
        Assert.Empty(blank.Parents);
        Assert.Equal([young], blank.Nodes.Select(node => node.EntityId));

        // The meaning is what makes it a parent link, and the existing link is read the moment it is given one.
        var configured = await Configure(family, named, RelationshipFamilySemantic.BiologicalParent);
        var derived = await Tree(family, young);
        Assert.Equal(["Elder"], Names(derived, derived.Parents));
        Assert.Equal(RelationshipFamilySemantic.BiologicalParent, Assert.Single(derived.Links).Semantic);

        // The "rules" link is still never read, whatever the other kind now means.
        Assert.Single(derived.Links);

        await Configure(family, configured, RelationshipFamilySemantic.None);
        Assert.Empty((await Tree(family, young)).Parents);
    }

    [Fact]
    public async Task One_recorded_parent_says_nothing_about_a_parent_nobody_recorded()
    {
        var family = await NewFamily(_factory, "ftmissing");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        var mara = await Person(family, "Mara");
        var oren = await Person(family, "Oren");
        var lia = await Person(family, "Lia");
        var tam = await Person(family, "Tam");

        // Lia's other parent, if she has one, was never written down.
        await Link(family, bore, mara, lia);
        await Link(family, bore, mara, tam);
        await Link(family, bore, oren, tam);

        var lias = await Tree(family, lia);
        Assert.Equal(["Mara"], Names(lias, lias.Parents));
        Assert.Equal(["Tam"], Names(lias, lias.Siblings));
        Assert.Single(Assert.Single(lias.Siblings).Paths);

        var tams = await Tree(family, tam);
        Assert.Equal(["Mara", "Oren"], Names(tams, tams.Parents));
        Assert.Single(Assert.Single(tams.Siblings).Paths);

        // A sibling is a position, not a claim about how much of a family two entries share: the answer has no word for it.
        using var document = JsonDocument.Parse(await TreeText(family, lia));
        Assert.Equal(
            ["focalEntityId", "generationsEachWay", "nodes", "links", "parents", "grandparents", "siblings", "children", "grandchildren", "loops", "connections"],
            document.RootElement.EnumerateObject().Select(property => property.Name));
        Assert.Equal(
            ["entityId", "paths"],
            document.RootElement.GetProperty("siblings")[0].EnumerateObject().Select(property => property.Name));

        foreach (var word in new[] { "half", "full sibling", "biologicalSibling" })
        {
            Assert.DoesNotContain(word, await TreeText(family, lia), StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task The_tree_reaches_two_generations_each_way_and_no_further()
    {
        var family = await NewFamily(_factory, "ftbounded");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        var chain = new List<Guid>();
        foreach (var index in Enumerable.Range(1, 7))
        {
            chain.Add(await Person(family, $"Generation {index}"));
        }

        foreach (var index in Enumerable.Range(0, chain.Count - 1))
        {
            await Link(family, bore, chain[index], chain[index + 1]);
        }

        var tree = await Tree(family, chain[3]);

        Assert.Equal(["Generation 3"], Names(tree, tree.Parents));
        Assert.Equal(["Generation 2"], Names(tree, tree.Grandparents));
        Assert.Equal(["Generation 5"], Names(tree, tree.Children));
        Assert.Equal(["Generation 6"], Names(tree, tree.Grandchildren));
        Assert.Equal(
            ["Generation 2", "Generation 3", "Generation 4", "Generation 5", "Generation 6"],
            tree.Nodes.Select(node => node.Name));
    }

    // ---------- Circles ----------

    [Fact]
    public async Task A_circle_of_two_is_named_rather_than_walked_for_ever_and_nothing_is_rewritten()
    {
        var family = await NewFamily(_factory, "ftcircle2");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var arlen = await Person(family, "Arlen");
        var brin = await Person(family, "Brin");

        var first = await Link(family, bore, arlen, brin);
        var second = await Link(family, bore, brin, arlen);

        var tree = await Tree(family, arlen);

        Assert.Equal(["Brin"], Names(tree, tree.Parents));
        Assert.Equal(["Brin"], Names(tree, tree.Children));
        Assert.Empty(tree.Grandparents);
        Assert.Empty(tree.Siblings);

        var loop = Assert.Single(tree.Loops);
        Assert.Equal([arlen, brin], loop.EntityIds);
        Assert.Equal(new[] { first, second }.Order(), loop.RelationshipIds.Order());

        // Deterministic, and read-only: two reads say the same, and both links are exactly as they were written.
        Assert.Equal(await TreeText(family, arlen), await TreeText(family, arlen));
        await WithDb(_factory, async db =>
        {
            var links = await db.Relationships.Where(link => link.UniverseId == family.Universe).ToListAsync();
            Assert.Equal(2, links.Count);
            Assert.Equal(
                new[] { $"{arlen}>{brin}", $"{brin}>{arlen}" }.Order(),
                links.Select(link => $"{link.SourceEntityId}>{link.TargetEntityId}").Order());
        });
    }

    [Fact]
    public async Task A_longer_circle_is_named_and_one_that_reaches_past_the_tree_is_simply_not_claimed()
    {
        var family = await NewFamily(_factory, "ftcircle3");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        var three = new List<Guid>();
        foreach (var name in new[] { "A", "B", "C" })
        {
            three.Add(await Person(family, name));
        }

        await Link(family, bore, three[0], three[1]);
        await Link(family, bore, three[1], three[2]);
        await Link(family, bore, three[2], three[0]);

        var tree = await Tree(family, three[0]);
        var loop = Assert.Single(tree.Loops);
        Assert.Equal(["A", "B", "C"], loop.EntityIds.Select(id => tree.Nodes.Single(node => node.EntityId == id).Name));
        Assert.Equal(3, loop.RelationshipIds.Count);
        Assert.Equal(["C"], Names(tree, tree.Parents));
        Assert.Equal(["B"], Names(tree, tree.Grandparents));

        // A circle longer than the tree reaches is outside what this read saw, so it is not named here. The tree stays finite and
        // correct for what it shows, and Canon Integrity reads the whole universe.
        var longer = await NewFamily(_factory, "ftcircle5");
        var kind = await Kind(longer, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var five = new List<Guid>();
        foreach (var name in new[] { "A", "B", "C", "D", "E" })
        {
            five.Add(await Person(longer, name));
        }

        foreach (var index in Enumerable.Range(0, 5))
        {
            await Link(longer, kind, five[index], five[(index + 1) % 5]);
        }

        var far = await Tree(longer, five[0]);
        Assert.Empty(far.Loops);
        Assert.Equal(["E"], Names(far, far.Parents));
        Assert.Equal(["D"], Names(far, far.Grandparents));
        Assert.Equal(["B"], Names(far, far.Children));
        Assert.Equal(["C"], Names(far, far.Grandchildren));
    }

    // ---------- The Trash ----------

    [Fact]
    public async Task An_entry_in_the_Trash_leaves_the_tree_whole_and_comes_back_with_its_links()
    {
        var household = await NewHousehold(_factory, "fttrash");
        var family = household.Family;
        var before = Describe(await Tree(family, household.Lia));

        await Trash(family, household.Mara);

        var hidden = await Tree(family, household.Lia);
        Assert.Equal(["Oren"], Names(hidden, hidden.Parents));
        Assert.Empty(hidden.Grandparents);
        Assert.Single(Assert.Single(hidden.Siblings).Paths);
        Assert.DoesNotContain("Mara", await TreeText(family, household.Lia), StringComparison.Ordinal);
        Assert.DoesNotContain(household.Mara.ToString(), await TreeText(family, household.Lia), StringComparison.OrdinalIgnoreCase);

        // A trashed entry has no tree of its own either.
        Assert.Equal(HttpStatusCode.NotFound, (await TreeResponse(family.Client, family.Universe, household.Mara)).StatusCode);

        await Restore(family, household.Mara);
        Assert.Equal(before, Describe(await Tree(family, household.Lia)));

        // Deleting a link is the author's own decision, and the tree follows it.
        var raised = (await Tree(family, household.Lia)).Links
            .Single(link => link.ParentEntityId == household.Oren && link.ChildEntityId == household.Lia);
        await Unlink(family, raised.RelationshipId);

        var after = await Tree(family, household.Lia);
        Assert.Equal(["Mara"], Names(after, after.Parents));
        Assert.Equal(["Tam"], Names(after, after.Siblings));
    }

    // ---------- Ownership ----------

    [Fact]
    public async Task Another_account_another_universe_and_a_guessed_id_all_read_as_absent()
    {
        var household = await NewHousehold(_factory, "ftowner");
        var stranger = await NewFamily(_factory, "ftintruder");

        var elsewhere = await InUniverse(household.Client, (await CreateUniverse(household.Client, "Second world ftowner")).Id);
        var neighbour = await Person(elsewhere, "Neighbour");

        foreach (var (client, universeId, entityId) in new[]
        {
            (stranger.Client, household.Universe, household.Lia),
            (stranger.Client, stranger.Universe, household.Lia),
            (household.Client, household.Universe, Guid.NewGuid()),
            (household.Client, Guid.NewGuid(), household.Lia),

            // An entry of another universe of the same account, under this universe: still absent.
            (household.Client, household.Universe, neighbour),
            (household.Client, elsewhere.Universe, household.Lia),
        })
        {
            var response = await TreeResponse(client, universeId, entityId);

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.DoesNotContain("Lia", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Nothing_from_another_universe_can_be_linked_or_walked_into()
    {
        var household = await NewHousehold(_factory, "ftcross");
        var elsewhere = await InUniverse(household.Client, (await CreateUniverse(household.Client, "Second world ftcross")).Id);
        var theirKind = await Kind(elsewhere, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var theirPerson = await Person(elsewhere, "Stranger");

        // The API refuses both halves: a kind from elsewhere, and an entry from elsewhere.
        Assert.Equal(HttpStatusCode.BadRequest, (await PostLink(household.Family, theirKind.Id, household.Mara, household.Lia)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PostLink(household.Family, household.Bore.Id, theirPerson, household.Lia)).StatusCode);

        // And were a row ever written around the API, the read still holds every end to this universe.
        await WithDb(_factory, async db =>
        {
            db.Relationships.Add(new LoreRelationship
            {
                Id = Guid.NewGuid(),
                UniverseId = household.Universe,
                RelationshipTypeId = theirKind.Id,
                SourceEntityId = theirPerson,
                TargetEntityId = household.Lia,
                CanonStatus = CanonStatus.Canon,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        });

        var tree = await Tree(household.Family, household.Lia);
        Assert.Equal(["Mara", "Oren"], Names(tree, tree.Parents));
        Assert.DoesNotContain("Stranger", await TreeText(household.Family, household.Lia), StringComparison.Ordinal);
    }

    // ---------- What a read costs, and what it leaves behind ----------

    [Fact]
    public async Task Reading_a_tree_writes_nothing_at_all()
    {
        var household = await NewHousehold(_factory, "ftreadonly");
        var family = household.Family;

        // A circle written straight into the database, so no write path has reconciled Canon for it yet.
        var arlen = await Person(family, "Arlen");
        var brin = await Person(family, "Brin");
        await Link(family, household.Bore, arlen, brin);
        await WithDb(_factory, async db =>
        {
            db.Relationships.Add(new LoreRelationship
            {
                Id = Guid.NewGuid(),
                UniverseId = family.Universe,
                RelationshipTypeId = household.Bore.Id,
                SourceEntityId = brin,
                TargetEntityId = arlen,
                CanonStatus = CanonStatus.Canon,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        });

        var before = await Footprint(family.Universe);

        foreach (var entity in new[] { household.Lia, household.Mara, household.Nana, household.Pip, arlen, brin })
        {
            await Tree(family, entity);
            await Tree(family, entity);
        }

        Assert.Equal(before, await Footprint(family.Universe));

        // Not even the circle it named: a finding is a write, and only an evaluation makes one.
        Assert.Empty(await LoopFindings(family, status: null));
        Assert.Equal(1, (await Evaluate(family)).Detected);
    }

    [Fact]
    public async Task A_tree_is_read_in_a_fixed_number_of_queries_however_large_the_family_is()
    {
        var family = await NewFamily(_factory, "ftqueries");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var married = await Kind(family, "married to", RelationshipFamilySemantic.NonStructuralFamily, "married to, the other way");
        var focal = await Person(family, "Focal");

        foreach (var index in Enumerable.Range(1, 4))
        {
            var parent = await Person(family, $"Parent {index}");
            await Link(family, bore, parent, focal);

            // Authored family on members drawn far from the focal entry, each listed in that member's details.
            var spouses = new List<Guid>();
            foreach (var above in Enumerable.Range(1, 2))
            {
                var grandparent = await Person(family, $"Grandparent {index}.{above}");
                spouses.Add(grandparent);
                await Link(family, bore, grandparent, parent);
            }

            await Link(family, married, spouses[0], spouses[1]);

            foreach (var beside in Enumerable.Range(1, 3))
            {
                await Link(family, bore, parent, await Person(family, $"Sibling {index}.{beside}"));
            }
        }

        foreach (var index in Enumerable.Range(1, 5))
        {
            var child = await Person(family, $"Child {index}");
            await Link(family, bore, focal, child);

            foreach (var below in Enumerable.Range(1, 2))
            {
                await Link(family, bore, child, await Person(family, $"Grandchild {index}.{below}"));
            }
        }

        var (queries, tree) = await CommandCounter.CountAsync(
            [family.Universe],
            () => Tree(family, focal));

        Assert.Equal(4, tree.Parents.Count);
        Assert.Equal(8, tree.Grandparents.Count);
        Assert.Equal(12, tree.Siblings.Count);
        Assert.Equal(5, tree.Children.Count);
        Assert.Equal(10, tree.Grandchildren.Count);
        Assert.Equal(8, tree.Connections.Count);
        Assert.InRange(queries, 1, 6);

        // No more for an entry with nobody around it: the walk is bounded, not proportional.
        var alone = await Person(family, "Alone");
        var (quiet, _) = await CommandCounter.CountAsync([family.Universe], () => Tree(family, alone));

        Assert.InRange(quiet, 1, queries);
    }

    [Fact]
    public async Task A_node_carries_what_names_an_entry_and_nothing_else_it_holds()
    {
        var family = await NewFamily(_factory, "ftnodes");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        var parent = await Person(family, "Mara", CanonStatus.Canon, summary: "A summary nobody needs here.");
        var child = await Person(family, "Lia", CanonStatus.Draft, entityTypeId: family.Location);
        await ArticleTestClient.WriteArticle(family.Client, family.Universe, parent, ArticleTestClient.Doc("An article nobody needs here."));
        await Link(family, bore, parent, child, CanonStatus.Draft);

        var tree = await Tree(family, child);
        var node = tree.Nodes.Single(candidate => candidate.EntityId == child);

        Assert.Equal((CanonStatus.Draft, "Location"), (node.CanonStatus, node.EntityTypeName));
        Assert.Equal(CanonStatus.Canon, tree.Nodes.Single(candidate => candidate.EntityId == parent).CanonStatus);

        // A Draft link is shown as a Draft link: the tree never promotes what an author has not.
        Assert.Equal(CanonStatus.Draft, Assert.Single(tree.Links).CanonStatus);

        var text = await TreeText(family, child);
        foreach (var unwanted in new[] { "A summary nobody needs here.", "An article nobody needs here.", "summary", "article" })
        {
            Assert.DoesNotContain(unwanted, text, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task An_entry_with_a_picture_carries_its_thumbnail_and_no_original()
    {
        var family = await NewFamily(_factory, "ftimages");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var parent = await Person(family, "Mara");
        var child = await Person(family, "Lia");
        await Link(family, bore, parent, child);

        using (var form = new MultipartFormDataContent())
        {
            var file = new ByteArrayContent(RestoreTestClient.Png(64, 48, 3));
            file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
            form.Add(file, "file", "mara.png");
            (await family.Client.PutAsync($"/api/universes/{family.Universe}/entities/{parent}/image", form))
                .EnsureSuccessStatusCode();
        }

        var tree = await Tree(family, child);
        var image = tree.Nodes.Single(node => node.EntityId == parent).Image;

        Assert.NotNull(image);
        Assert.NotEqual(Guid.Empty, image.ThumbnailId);
        Assert.Null(tree.Nodes.Single(node => node.EntityId == child).Image);
        Assert.DoesNotContain("original", await TreeText(family, child), StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Everything a family tree read must leave exactly as it was.</summary>
    private async Task<string> Footprint(Guid universeId)
    {
        var footprint = "";

        await WithDb(_factory, async db =>
        {
            var rows = await db.Relationships.Where(link => link.UniverseId == universeId)
                .Select(link => new { link.Id, link.SourceEntityId, link.TargetEntityId, link.CanonStatus, link.UpdatedAt })
                .ToListAsync();

            var touched = await db.Entities.Where(entry => entry.UniverseId == universeId)
                .MaxAsync(entry => (DateTime?)entry.UpdatedAt);

            footprint = string.Join(
                "\n",
                [
                    .. rows
                        .Select(link => $"{link.Id}:{link.SourceEntityId}:{link.TargetEntityId}:{link.CanonStatus}:{link.UpdatedAt:O}")
                        .Order(StringComparer.Ordinal),
                    $"kinds {await db.RelationshipTypes.CountAsync(kind => kind.UniverseId == universeId)}",
                    $"entries {await db.Entities.CountAsync(entry => entry.UniverseId == universeId)}",
                    $"conflicts {await db.CanonConflicts.CountAsync(conflict => conflict.UniverseId == universeId)}",
                    $"moments {await db.TimelineEntries.CountAsync(moment => moment.UniverseId == universeId)}",
                    $"versions {await db.EntityRevisions.CountAsync(version => version.Entity!.UniverseId == universeId)}",
                    $"touched {touched:O}",
                ]);
        });

        return footprint;
    }
}
