using System.Net.Http.Json;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using static LorEvolve.Api.Tests.FamilyTreeTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// <c>CANON-FAMILY-001</c> (ADR 0035): Canon parent links that go round in a circle, so entries are recorded as their own
/// ancestors.
///
/// Two things run through all of it. Only a kind an author gave a family meaning is read - a kind called "parent of" with none is
/// invisible - and the finding is reported, never refused: it is Medium, so every link is written exactly as the author wrote it
/// and nothing is rewritten. The conflict table follows each write without an evaluation being asked for.
/// </summary>
public sealed class CanonFamilyLoopRuleTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    /// <summary>The only two parts anything can play in this finding: an entry on the circle, or a link that closes it.</summary>
    private static readonly string[] Roles = ["in the circle", "family link"];

    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_circle_of_two_is_one_medium_finding_naming_both_entries_and_both_links()
    {
        var family = await NewFamily(_factory, "loop-two");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var arlen = await Person(family, "Arlen");
        var brin = await Person(family, "Brin");

        var first = await Link(family, bore, arlen, brin);
        Assert.Empty(await LoopFindings(family));

        // The second link closes the circle, and the write itself reports it.
        var second = await Link(family, bore, brin, arlen);
        var finding = Assert.Single(await LoopFindings(family));

        Assert.Equal(CanonConflictSeverity.Medium, finding.Severity);
        Assert.Equal("Family links go round in a circle through “Arlen” and “Brin”", finding.Title);
        Assert.Contains("“Arlen” bore “Brin”", finding.Explanation, StringComparison.Ordinal);
        Assert.Contains("“Brin” bore “Arlen”", finding.Explanation, StringComparison.Ordinal);
        Assert.Contains("each other's ancestors", finding.Explanation, StringComparison.Ordinal);

        // The author reads names, never an enum name or an id.
        Assert.DoesNotContain("BiologicalParent", finding.Explanation, StringComparison.Ordinal);
        Assert.DoesNotContain(first.ToString(), finding.Explanation, StringComparison.OrdinalIgnoreCase);

        Assert.Equal(
            new[] { arlen, brin }.Order(),
            finding.Subjects.Where(subject => subject.Kind == CanonSubjectKind.Entity).Select(subject => subject.SubjectId).Order());
        Assert.Equal(
            new[] { first, second }.Order(),
            finding.Subjects.Where(subject => subject.Kind == CanonSubjectKind.Relationship).Select(subject => subject.SubjectId).Order());
        Assert.All(finding.Subjects, subject => Assert.Contains(subject.Role, Roles, StringComparer.Ordinal));
    }

    [Fact]
    public async Task A_longer_circle_is_one_finding_over_its_own_links_and_nothing_hanging_off_it()
    {
        var family = await NewFamily(_factory, "loop-three");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var raised = await Kind(family, "raised", RelationshipFamilySemantic.AdoptiveParent, "raised by");

        var a = await Person(family, "Ada");
        var b = await Person(family, "Bel");
        var c = await Person(family, "Cor");
        var above = await Person(family, "Dane");
        var below = await Person(family, "Eve");

        var circle = new[]
        {
            await Link(family, bore, a, b),

            // Adoptive links close a circle exactly as biological ones do: either way the entry above is a parent.
            await Link(family, raised, b, c),
            await Link(family, bore, c, a),
        };

        // One link into the circle and one out of it. Neither closes a circle of its own, so neither belongs to this finding.
        await Link(family, bore, above, a);
        await Link(family, bore, a, below);

        var finding = Assert.Single(await LoopFindings(family));

        Assert.Equal("Family links go round in a circle through “Ada”, “Bel” and “Cor”", finding.Title);
        Assert.Contains("their own ancestors", finding.Explanation, StringComparison.Ordinal);
        Assert.Equal(
            circle.Order(),
            finding.Subjects.Where(subject => subject.Kind == CanonSubjectKind.Relationship).Select(subject => subject.SubjectId).Order());
        Assert.Equal(
            new[] { a, b, c }.Order(),
            finding.Subjects.Where(subject => subject.Kind == CanonSubjectKind.Entity).Select(subject => subject.SubjectId).Order());
    }

    [Fact]
    public async Task A_family_that_only_looks_tangled_is_no_circle()
    {
        var household = await NewHousehold(_factory, "loop-none");
        var family = household.Family;

        // A parent of a parent's child, and a shared grandparent: unusual, and not a circle.
        await Link(family, household.Bore, household.Nana, household.Oren);
        await Link(family, household.Raised, household.Mara, household.Cai);

        Assert.Equal(0, (await Evaluate(family)).Detected);
        Assert.Empty(await LoopFindings(family, status: null));
    }

    [Fact]
    public async Task Only_canon_links_between_canon_entries_close_a_circle()
    {
        var family = await NewFamily(_factory, "loop-canon");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var arlen = await Person(family, "Arlen");
        var brin = await Person(family, "Brin");

        await Link(family, bore, arlen, brin);
        var draft = await Link(family, bore, brin, arlen, CanonStatus.Draft);

        Assert.Empty(await LoopFindings(family));

        // Promoting the link closes it.
        (await family.Client.PutAsJsonAsync(
            $"/api/universes/{family.Universe}/relationships/{draft}",
            new RelationshipRequest(bore.Id, brin, arlen, CanonStatus.Canon, null, null, null)))
            .EnsureSuccessStatusCode();
        Assert.Single(await LoopFindings(family));

        // An end that is not Canon opens it again: an entry that is still a Draft is not yet a claim about the world.
        await SetCanonStatus(family, brin, "Brin", CanonStatus.Draft);
        Assert.Empty(await LoopFindings(family));
        Assert.Single(await LoopFindings(family, CanonConflictStatus.Resolved));

        await SetCanonStatus(family, brin, "Brin", CanonStatus.Canon);
        Assert.Single(await LoopFindings(family));
    }

    [Fact]
    public async Task A_kind_with_no_family_meaning_closes_nothing_and_giving_it_one_reports_at_once()
    {
        var family = await NewFamily(_factory, "loop-semantic");
        var kind = await Kind(family, "parent of", inverseName: "child of");
        var arlen = await Person(family, "Arlen");
        var brin = await Person(family, "Brin");

        await Link(family, kind, arlen, brin);
        await Link(family, kind, brin, arlen);

        await Evaluate(family);
        Assert.Empty(await LoopFindings(family, status: null));

        // The name never said anything; the meaning does, and the configuration write reports it.
        var configured = await Configure(family, kind, RelationshipFamilySemantic.BiologicalParent);
        Assert.Single(await LoopFindings(family));

        await Configure(family, configured, RelationshipFamilySemantic.None);
        Assert.Empty(await LoopFindings(family));
        Assert.Single(await LoopFindings(family, CanonConflictStatus.Resolved));
    }

    [Fact]
    public async Task The_Trash_and_a_deleted_link_close_the_circle_and_a_restore_opens_it_again()
    {
        var family = await NewFamily(_factory, "loop-trash");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var arlen = await Person(family, "Arlen");
        var brin = await Person(family, "Brin");

        await Link(family, bore, arlen, brin);
        var closing = await Link(family, bore, brin, arlen);
        Assert.Single(await LoopFindings(family));

        await Trash(family, brin);
        Assert.Empty(await LoopFindings(family));

        await Restore(family, brin);
        Assert.Single(await LoopFindings(family));

        await Unlink(family, closing);
        Assert.Empty(await LoopFindings(family));
        Assert.Single(await LoopFindings(family, CanonConflictStatus.Resolved));
    }

    [Fact]
    public async Task A_dismissed_circle_stays_dismissed_while_it_stands_and_a_new_link_in_it_is_a_new_finding()
    {
        var family = await NewFamily(_factory, "loop-dismiss");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var raised = await Kind(family, "raised", RelationshipFamilySemantic.AdoptiveParent, "raised by");
        var arlen = await Person(family, "Arlen");
        var brin = await Person(family, "Brin");

        await Link(family, bore, arlen, brin);
        await Link(family, bore, brin, arlen);

        var finding = Assert.Single(await LoopFindings(family));
        (await family.Client.PostAsync($"/api/universes/{family.Universe}/canon-conflicts/{finding.Id}/dismiss", null))
            .EnsureSuccessStatusCode();

        await Evaluate(family);
        Assert.Empty(await LoopFindings(family));
        Assert.Equal(finding.Id, Assert.Single(await LoopFindings(family, CanonConflictStatus.Dismissed)).Id);

        // A second link inside the circle is a different set of links, so it is a different circle and a different finding. The
        // dismissed one closes rather than swallowing it: a dismissal suppresses the circle that was dismissed, not the
        // fingerprint for ever (ADR 0010).
        await Link(family, raised, arlen, brin);
        Assert.NotEqual(finding.Id, Assert.Single(await LoopFindings(family)).Id);
        Assert.Empty(await LoopFindings(family, CanonConflictStatus.Dismissed));
        Assert.Equal(finding.Id, Assert.Single(await LoopFindings(family, CanonConflictStatus.Resolved)).Id);
    }

    [Fact]
    public async Task A_circle_belongs_to_its_own_universe()
    {
        var family = await NewFamily(_factory, "loop-universe");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var arlen = await Person(family, "Arlen");
        var brin = await Person(family, "Brin");
        await Link(family, bore, arlen, brin);
        await Link(family, bore, brin, arlen);

        var elsewhere = await InUniverse(family.Client, (await CreateUniverse(family.Client, "Quiet world loop")).Id);
        await Kind(elsewhere, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        Assert.Single(await LoopFindings(family));
        Assert.Equal(0, (await Evaluate(elsewhere)).Detected);
        Assert.Empty(await LoopFindings(elsewhere, status: null));
    }
}
