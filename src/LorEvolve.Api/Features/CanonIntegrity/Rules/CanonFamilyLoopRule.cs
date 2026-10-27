using LorEvolve.Api.Features.FamilyTrees;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// <c>CANON-FAMILY-001</c>: Canon parent links that go round in a circle, so that entries are recorded as their own ancestors
/// (ADR 0035).
///
/// Reads only what an author configured: relationships whose type carries a family meaning, on the stored direction - source
/// parent, target child. A type's name is never read, so "father of" with no family meaning is invisible here, and a type called
/// anything at all with one is read as a parent link. Biological and adoptive links count alike: either way the entry above is a
/// parent.
///
/// Canon only, as the other relationship rules are: a link that is not Canon, or an end that is not Canon or is in the Trash, is
/// not yet a claim about the world, and leaves the circle open. One finding per circle - a strongly connected group, with every
/// link between its members - rather than one per elementary cycle, whose number can grow exponentially; fingerprinted over
/// those links as a set, so the same circle is the same finding after a restore's new ids, and a link added to it is a new one.
///
/// Medium, not High. A circle is impossible for ordinary ancestry, but a world with time travel or rebirth may mean exactly that,
/// and LorEvolve cannot tell which without reading words - so it is reported, never refused, and nothing is rewritten. The family
/// tree names the circles it can see itself, whatever the links' status.
/// </summary>
public sealed class CanonFamilyLoopRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-FAMILY-001";

    public CanonConflictSeverity Severity => CanonConflictSeverity.Medium;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var rows = await context.Db.Relationships.AsNoTracking()
            .Where(relationship => relationship.UniverseId == context.UniverseId
                && relationship.DeletedAt == null
                && relationship.RelationshipType!.UniverseId == context.UniverseId
                // Ancestry only: a non-structural family link places nobody above anybody, so it closes no circle (ADR 0040).
                && RelationshipFamilySemantics.Parent.Contains(relationship.RelationshipType.FamilySemantic)
                && relationship.CanonStatus == CanonStatus.Canon
                && relationship.SourceEntity!.DeletedAt == null
                && relationship.SourceEntity.CanonStatus == CanonStatus.Canon
                && relationship.TargetEntity!.DeletedAt == null
                && relationship.TargetEntity.CanonStatus == CanonStatus.Canon)
            .Select(relationship => new Row(
                relationship.Id,
                relationship.RelationshipTypeId,
                relationship.SourceEntityId,
                relationship.SourceEntity!.Name,
                relationship.TargetEntityId,
                relationship.TargetEntity!.Name,
                relationship.RelationshipType!.FamilySemantic,
                relationship.RelationshipType.Name))
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
        {
            return [];
        }

        var links = rows.ToDictionary(row => row.RelationshipId);
        var names = rows
            .SelectMany(row => new[] { (Id: row.ParentId, Name: row.ParentName), (Id: row.ChildId, Name: row.ChildName) })
            .DistinctBy(entry => entry.Id)
            .ToDictionary(entry => entry.Id, entry => entry.Name);

        var loops = FamilyTreeDerivation.Loops(
            rows.Select(row => new FamilyLink(
                row.RelationshipId, row.RelationshipTypeId, row.ParentId, row.ChildId, row.Semantic)));

        return [.. loops.Select(loop => Finding(loop, links, names))];
    }

    private CanonFinding Finding(DerivedLoop loop, Dictionary<Guid, Row> links, Dictionary<Guid, string> names)
    {
        var entries = loop.EntityIds
            .OrderBy(id => names[id], StringComparer.Ordinal)
            .ThenBy(id => id)
            .ToList();
        var steps = loop.RelationshipIds
            .Select(id => links[id])
            .OrderBy(row => row.ParentName, StringComparer.Ordinal)
            .ThenBy(row => row.ChildName, StringComparer.Ordinal)
            .ThenBy(row => row.RelationshipId)
            .ToList();

        var who = Joined(entries.Select(id => CanonRuleText.Quoted(names[id])));
        var ancestors = entries.Count == 2 ? "each other's ancestors" : "their own ancestors";

        var title = $"Family links go round in a circle through {who}";

        var explanation =
            $"Each of these Canon links names a parent, so together they make {who} {ancestors}: " +
            string.Join("; ", steps.Select(row =>
                $"{CanonRuleText.Quoted(row.ParentName)} {row.TypeName} {CanonRuleText.Quoted(row.ChildName)}")) +
            ". A family tree cannot place anyone above themselves. If the world does not mean this, correct or remove one of " +
            "the links, or lower its status. Nothing has been changed.";

        return new CanonFinding(
            RuleCode,
            Severity,

            // The links as a set: the circle is what they are together, in no order.
            [.. loop.RelationshipIds],
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                .. entries.Select(id => new CanonFindingSubject(CanonSubjectKind.Entity, id, "in the circle")),
                .. steps.Select(row => new CanonFindingSubject(CanonSubjectKind.Relationship, row.RelationshipId, "family link")),
            ],
            UnorderedFrom: 0);
    }

    /// <summary>"A", "A and B", "A, B and C".</summary>
    private static string Joined(IEnumerable<string> items)
    {
        var list = items.ToList();
        return list.Count <= 1
            ? string.Concat(list)
            : $"{string.Join(", ", list.Take(list.Count - 1))} and {list[^1]}";
    }

    private sealed record Row(
        Guid RelationshipId,
        Guid RelationshipTypeId,
        Guid ParentId,
        string ParentName,
        Guid ChildId,
        string ChildName,
        RelationshipFamilySemantic Semantic,
        string TypeName);
}
