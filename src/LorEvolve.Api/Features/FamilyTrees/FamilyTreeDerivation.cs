using LorEvolve.Api.Features.Relationships;

namespace LorEvolve.Api.Features.FamilyTrees;

/// <summary>One explicit parent link, reduced to what derivation reads: ids and the family meaning. Never a name.</summary>
public sealed record FamilyLink(
    Guid RelationshipId,
    Guid RelationshipTypeId,
    Guid ParentEntityId,
    Guid ChildEntityId,
    RelationshipFamilySemantic Semantic);

/// <summary>A relative found by walking parent links, and every path that found it.</summary>
public sealed record DerivedRelative(Guid EntityId, IReadOnlyList<IReadOnlyList<Guid>> Paths);

/// <summary>Each family position around one entry, by id.</summary>
public sealed record DerivedFamily(
    IReadOnlyList<DerivedRelative> Parents,
    IReadOnlyList<DerivedRelative> Grandparents,
    IReadOnlyList<DerivedRelative> Siblings,
    IReadOnlyList<DerivedRelative> Children,
    IReadOnlyList<DerivedRelative> Grandchildren,
    IReadOnlyList<DerivedRelative> AuntsUncles,
    IReadOnlyList<DerivedRelative> Cousins,
    IReadOnlyList<DerivedRelative> NiecesNephews);

/// <summary>A circle of parent links: entries each reachable from every other, and the links between them.</summary>
public sealed record DerivedLoop(IReadOnlyList<Guid> EntityIds, IReadOnlyList<Guid> RelationshipIds);

/// <summary>
/// Family positions derived from explicit parent links, in memory and by id (ADR 0035). Nothing here reads a name, an entry's
/// type, an alias, a date or a word, and nothing it derives is stored: a sibling is two parent links from one parent,
/// recomputed on every read.
///
/// Bounded by construction. Every position is a fixed walk of one to four links from the focal entry, so no circle of links can
/// make it recurse, and the same entry reached through several branches is one relative with several paths. Circles are found
/// on their own, by <see cref="Loops"/>.
/// </summary>
public static class FamilyTreeDerivation
{
    public static DerivedFamily Relatives(Guid focalEntityId, IEnumerable<FamilyLink> links)
    {
        var distinct = Distinct(links);
        var byChild = distinct.ToLookup(link => link.ChildEntityId);
        var byParent = distinct.ToLookup(link => link.ParentEntityId);

        var parentLinks = byChild[focalEntityId].ToList();
        var childLinks = byParent[focalEntityId].ToList();
        var parentIds = parentLinks.Select(link => link.ParentEntityId).ToHashSet();
        var childIds = childLinks.Select(link => link.ChildEntityId).ToHashSet();

        // A sibling: the shared parent's link to the focal entry, then that parent's link to the sibling.
        var siblingSteps = parentLinks
            .SelectMany(parent => byParent[parent.ParentEntityId].Select(sibling => (Parent: parent, Sibling: sibling)))
            .Where(step => step.Sibling.ChildEntityId != focalEntityId)
            .ToList();
        var siblingIds = siblingSteps.Select(step => step.Sibling.ChildEntityId).ToHashSet();

        // A parent's sibling: the parent's link, the grandparent's link to the parent, then the grandparent's link to the other
        // child. A parent is never also named an aunt or uncle.
        var uncleSteps = parentLinks
            .SelectMany(parent => byChild[parent.ParentEntityId].Select(grandparent => (Parent: parent, Grandparent: grandparent)))
            .SelectMany(step => byParent[step.Grandparent.ParentEntityId]
                .Where(uncle => uncle.ChildEntityId != step.Parent.ParentEntityId && !parentIds.Contains(uncle.ChildEntityId))
                .Select(uncle => (step.Parent, step.Grandparent, Uncle: uncle)))
            .ToList();

        return new DerivedFamily(
            Parents: Collect(focalEntityId, parentLinks.Select(link => (link.ParentEntityId, Path(link)))),
            Grandparents: Collect(
                focalEntityId,
                parentLinks.SelectMany(parent => byChild[parent.ParentEntityId]
                    .Select(grandparent => (grandparent.ParentEntityId, Path(parent, grandparent))))),
            Siblings: Collect(
                focalEntityId,
                parentLinks.SelectMany(parent => byParent[parent.ParentEntityId]
                    .Select(sibling => (sibling.ChildEntityId, Path(parent, sibling))))),
            Children: Collect(focalEntityId, childLinks.Select(link => (link.ChildEntityId, Path(link)))),
            Grandchildren: Collect(
                focalEntityId,
                childLinks.SelectMany(child => byParent[child.ChildEntityId]
                    .Select(grandchild => (grandchild.ChildEntityId, Path(child, grandchild))))),
            AuntsUncles: Collect(
                focalEntityId,
                uncleSteps.Select(step => (step.Uncle.ChildEntityId, Path(step.Parent, step.Grandparent, step.Uncle)))),
            Cousins: Collect(
                focalEntityId,
                uncleSteps.SelectMany(step => byParent[step.Uncle.ChildEntityId]
                    .Where(cousin => !siblingIds.Contains(cousin.ChildEntityId))
                    .Select(cousin => (cousin.ChildEntityId, Path(step.Parent, step.Grandparent, step.Uncle, cousin))))),
            NiecesNephews: Collect(
                focalEntityId,
                siblingSteps.SelectMany(step => byParent[step.Sibling.ChildEntityId]
                    .Where(niece => !childIds.Contains(niece.ChildEntityId))
                    .Select(niece => (niece.ChildEntityId, Path(step.Parent, step.Sibling, niece))))));
    }

    /// <summary>
    /// Every circle among <paramref name="links"/>: each strongly connected group of entries, with the links that run between its
    /// own members - every one of which lies on a circle. One answer per group rather than per elementary cycle, whose number can
    /// grow exponentially. Found without recursion (Tarjan's algorithm over an explicit stack), so a long chain cannot exhaust
    /// the stack, and walked in id order, so the same links always give the same answer.
    /// </summary>
    public static IReadOnlyList<DerivedLoop> Loops(IEnumerable<FamilyLink> links)
    {
        var distinct = Distinct(links);
        var successors = distinct
            .GroupBy(link => link.ParentEntityId)
            .ToDictionary(
                group => group.Key,
                group => group.Select(link => link.ChildEntityId).Distinct().OrderBy(Key, StringComparer.Ordinal).ToList());
        var entries = distinct
            .SelectMany(link => new[] { link.ParentEntityId, link.ChildEntityId })
            .Distinct()
            .OrderBy(Key, StringComparer.Ordinal)
            .ToList();

        var index = new Dictionary<Guid, int>();
        var low = new Dictionary<Guid, int>();
        var open = new Stack<Guid>();
        var isOpen = new HashSet<Guid>();
        var groups = new List<HashSet<Guid>>();
        var visited = 0;

        foreach (var root in entries)
        {
            if (index.ContainsKey(root))
            {
                continue;
            }

            var walk = new Stack<(Guid Entry, int Next)>();
            Enter(root);

            while (walk.Count > 0)
            {
                var (entry, next) = walk.Pop();
                var children = successors.GetValueOrDefault(entry) ?? [];

                if (next < children.Count)
                {
                    walk.Push((entry, next + 1));
                    var child = children[next];

                    if (!index.TryGetValue(child, out var childIndex))
                    {
                        Enter(child);
                    }
                    else if (isOpen.Contains(child))
                    {
                        low[entry] = Math.Min(low[entry], childIndex);
                    }

                    continue;
                }

                if (low[entry] == index[entry])
                {
                    var group = new HashSet<Guid>();
                    Guid member;

                    do
                    {
                        member = open.Pop();
                        isOpen.Remove(member);
                        group.Add(member);
                    }
                    while (member != entry);

                    groups.Add(group);
                }

                if (walk.Count > 0)
                {
                    var parent = walk.Peek().Entry;
                    low[parent] = Math.Min(low[parent], low[entry]);
                }
            }

            void Enter(Guid entry)
            {
                index[entry] = visited;
                low[entry] = visited;
                visited++;
                open.Push(entry);
                isOpen.Add(entry);
                walk.Push((entry, 0));
            }
        }

        return
        [
            .. groups
                .Select(group => (
                    Entries: group,
                    Links: distinct.Where(link => group.Contains(link.ParentEntityId) && group.Contains(link.ChildEntityId)).ToList()))
                .Where(found => found.Entries.Count > 1 || found.Links.Count > 0)
                .Select(found => new DerivedLoop(
                    [.. found.Entries.OrderBy(Key, StringComparer.Ordinal)],
                    [.. found.Links.Select(link => link.RelationshipId).OrderBy(Key, StringComparer.Ordinal)]))
                .OrderBy(loop => Key(loop.EntityIds[0]), StringComparer.Ordinal),
        ];
    }

    private static IReadOnlyList<Guid> Path(params FamilyLink[] steps) => [.. steps.Select(step => step.RelationshipId)];

    /// <summary>
    /// The links to walk: each row once, and each connection once.
    /// </summary>
    /// <remarks>
    /// The second of those is for stored data alone. Nothing can author the same kind between the same two
    /// entries twice any more - the relationship routes refuse it - but databases written before that rule
    /// existed hold pairs that were, and those rows stay exactly where their author put them: readable in
    /// Relations, editable, removable. A tree simply stops drawing the same connection twice and stops
    /// listing the same person as a child twice, which is all the duplicate was ever visible as.
    ///
    /// Same kind, same pair, same way round - the relationship routes' rule, by id, so two different kinds
    /// that happen to carry the same family meaning stay two connections and are both drawn. Ordered before
    /// the collapse so the row that survives is the same row on every read.
    /// </remarks>
    private static List<FamilyLink> Distinct(IEnumerable<FamilyLink> links) =>
    [
        .. links
            .DistinctBy(link => link.RelationshipId)
            .OrderBy(link => Key(link.RelationshipId), StringComparer.Ordinal)
            .DistinctBy(link => (link.RelationshipTypeId, link.ParentEntityId, link.ChildEntityId)),
    ];

    /// <summary>
    /// One relative per entry, never the focal entry, each path once. Ordered by id here; whoever names them orders them by name.
    /// </summary>
    private static IReadOnlyList<DerivedRelative> Collect(
        Guid focalEntityId,
        IEnumerable<(Guid EntityId, IReadOnlyList<Guid> Path)> found) =>
    [
        .. found
            .Where(item => item.EntityId != focalEntityId)
            .GroupBy(item => item.EntityId)
            .Select(group => new DerivedRelative(
                group.Key,
                [
                    .. group
                        .Select(item => item.Path)
                        .DistinctBy(PathKey)
                        .OrderBy(PathKey, StringComparer.Ordinal),
                ]))
            .OrderBy(relative => Key(relative.EntityId), StringComparer.Ordinal),
    ];

    private static string Key(Guid id) => id.ToString("N");

    private static string PathKey(IReadOnlyList<Guid> path) => string.Join('/', path.Select(Key));
}
