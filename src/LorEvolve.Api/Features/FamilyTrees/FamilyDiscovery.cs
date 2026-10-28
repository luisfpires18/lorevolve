namespace LorEvolve.Api.Features.FamilyTrees;

/// <summary>
/// The families a universe already holds, worked out from its family links and nothing else (ADR 0035 amendment, 035).
///
/// A family is one connected group of live entries joined by links whose kind has a family meaning - a parent of either kind
/// or a non-structural one - read without direction: who is whose parent matters to the tree, not to who belongs together. It is
/// a view of the relationships, never a record of its own: there is no family row, id or name, and the same links always group
/// the same way.
///
/// A group is offered only if at least one member's type is enabled for the Family Tree, because the page opens the tree on
/// such a member, as its picker would. Every member counts towards its size all the same: a relative whose type was disabled is
/// still family. Pure: the endpoint hands it what it read, and it reads nothing.
/// </summary>
internal static class FamilyDiscovery
{
    public const int DefaultPageSize = 12;

    public const int MaxPageSize = 40;

    /// <summary>How many members a family is introduced by. Its size is always the whole group.</summary>
    public const int PreviewSize = 3;

    /// <summary>One family link, as stored. Direction is kept but not used: grouping is undirected.</summary>
    public sealed record Edge(Guid SourceEntityId, Guid TargetEntityId);

    /// <summary>A live entry at one end of a family link, with only what grouping, search and the preview need.</summary>
    public sealed record Member(Guid EntityId, string Name, bool FamilyTreeEligible);

    /// <summary>
    /// Every family the links make, best first. With a search, only families with a member whose name holds it, each once
    /// however many members match: an exact name, then one that starts with it, then one that contains it, case aside.
    /// </summary>
    public static List<FamilyDiscoveryItem> Families(IEnumerable<Edge> edges, IEnumerable<Member> members, string? search)
    {
        var known = members.ToDictionary(member => member.EntityId);
        var needle = string.IsNullOrWhiteSpace(search) ? null : search.Trim();

        // Union-find over the links, so a circle of links or the same link written twice only joins what is already joined.
        // A link from an entry to itself joins nobody, and an end that is not a live member is no bridge.
        var root = new Dictionary<Guid, Guid>();
        var neighbours = new Dictionary<Guid, HashSet<Guid>>();

        Guid Find(Guid id)
        {
            while (root[id] != id)
            {
                root[id] = root[root[id]];
                id = root[id];
            }

            return id;
        }

        foreach (var edge in edges)
        {
            var (from, to) = (edge.SourceEntityId, edge.TargetEntityId);
            if (from == to || !known.ContainsKey(from) || !known.ContainsKey(to))
            {
                continue;
            }

            foreach (var (one, other) in new[] { (from, to), (to, from) })
            {
                root.TryAdd(one, one);
                if (!neighbours.TryGetValue(one, out var near))
                {
                    neighbours[one] = near = [];
                }

                near.Add(other);
            }

            var (a, b) = (Find(from), Find(to));
            if (a != b)
            {
                root[a] = b;
            }
        }

        var families = new List<(FamilyDiscoveryItem Item, int Match, Member Focus)>();

        // Every group here has two members at least: only a link between two different entries put anyone in one.
        foreach (var group in root.Keys.GroupBy(Find))
        {
            var people = group.Select(id => known[id]).ToList();

            // The tree opens on the eligible member with the most family links of its own, the likeliest to show a useful
            // tree rather than a leaf; then by name, then by id, so the same links always choose the same member.
            var focus = people
                .Where(member => member.FamilyTreeEligible)
                .OrderByDescending(member => neighbours[member.EntityId].Count)
                .ThenBy(member => member, ByName)
                .FirstOrDefault();

            if (focus is null)
            {
                continue;
            }

            var match = needle is null ? 0 : people.Min(member => MatchOf(member.Name, needle));
            if (match == NoMatch)
            {
                continue;
            }

            // The focal member first, then those the search found, then the rest, each by name: a family found by one of
            // its members shows that member.
            var preview = people
                .Where(member => member != focus)
                .OrderBy(member => needle is null ? 0 : MatchOf(member.Name, needle))
                .ThenBy(member => member, ByName)
                .Prepend(focus)
                .Take(PreviewSize)
                .Select(member => new FamilyDiscoveryMember(member.EntityId, member.Name))
                .ToList();

            families.Add((new FamilyDiscoveryItem(focus.EntityId, people.Count, preview), match, focus));
        }

        return
        [
            .. families
                .OrderBy(family => family.Match)
                .ThenBy(family => family.Focus, ByName)
                .Select(family => family.Item),
        ];
    }

    private const int NoMatch = int.MaxValue;

    private static int MatchOf(string name, string needle) =>
        name.Equals(needle, StringComparison.OrdinalIgnoreCase) ? 0
        : name.StartsWith(needle, StringComparison.OrdinalIgnoreCase) ? 1
        : name.Contains(needle, StringComparison.OrdinalIgnoreCase) ? 2
        : NoMatch;

    /// <summary>By name, case aside and then exactly, then by id: one order whatever the database returned.</summary>
    private static readonly Comparer<Member> ByName = Comparer<Member>.Create((left, right) =>
    {
        var order = StringComparer.OrdinalIgnoreCase.Compare(left.Name, right.Name);
        if (order == 0)
        {
            order = StringComparer.Ordinal.Compare(left.Name, right.Name);
        }

        return order != 0 ? order : left.EntityId.CompareTo(right.EntityId);
    });
}
