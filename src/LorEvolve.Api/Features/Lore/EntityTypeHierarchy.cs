namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// The one place that walks a universe's type forest (ADR 0007 amendment, 2026-10-01): the canonical order every list and
/// backup uses, a branch's members, and the cycle test. A universe holds tens of types, so the graph is loaded whole and walked
/// in memory - never recursive SQL - and every walk keeps a visited set, so a malformed graph (a cycle that got into a row some
/// other way) ends the walk instead of looping. No depth limit anywhere.
/// </summary>
public static class EntityTypeHierarchy
{
    /// <summary>
    /// Parent before its descendants, each sibling group by <paramref name="order"/>, then name, then id, so ties and gaps
    /// never make the order depend on how rows were read. A node no root reaches - an orphan or a cycle, which the API and
    /// restore never write - is appended after, in the same sibling order, so nothing is ever dropped from a list.
    /// </summary>
    public static List<T> Preorder<T>(
        IReadOnlyCollection<T> nodes,
        Func<T, Guid> id,
        Func<T, Guid?> parent,
        Func<T, int> order,
        Func<T, string> name)
    {
        var ids = nodes.Select(id).ToHashSet();
        var children = nodes
            .GroupBy(node => parent(node) is { } p && ids.Contains(p) ? p : (Guid?)null)
            .ToDictionary(
                group => group.Key ?? Guid.Empty,
                group => group
                    .OrderBy(order)
                    .ThenBy(name, StringComparer.Ordinal)
                    .ThenBy(node => id(node))
                    .ToList());

        var result = new List<T>(nodes.Count);
        var visited = new HashSet<Guid>();

        void Visit(T node)
        {
            if (!visited.Add(id(node)))
            {
                return;
            }

            result.Add(node);
            if (children.TryGetValue(id(node), out var below))
            {
                foreach (var child in below)
                {
                    Visit(child);
                }
            }
        }

        // Roots are the nodes with no parent, or a parent that is not in the set.
        if (children.TryGetValue(Guid.Empty, out var roots))
        {
            foreach (var root in roots)
            {
                Visit(root);
            }
        }

        foreach (var node in nodes
            .Where(node => !visited.Contains(id(node)))
            .OrderBy(order)
            .ThenBy(name, StringComparer.Ordinal)
            .ThenBy(node => id(node)))
        {
            Visit(node);
        }

        return result;
    }

    /// <summary><paramref name="rootId"/> and every type beneath it, at any depth.</summary>
    public static HashSet<Guid> Branch(IReadOnlyDictionary<Guid, Guid?> parentOf, Guid rootId)
    {
        var childrenOf = parentOf
            .Where(pair => pair.Value is not null)
            .GroupBy(pair => pair.Value!.Value)
            .ToDictionary(group => group.Key, group => group.Select(pair => pair.Key).ToList());

        var branch = new HashSet<Guid> { rootId };
        var pending = new Stack<Guid>();
        pending.Push(rootId);

        while (pending.TryPop(out var current))
        {
            if (!childrenOf.TryGetValue(current, out var below))
            {
                continue;
            }

            foreach (var child in below)
            {
                if (branch.Add(child))
                {
                    pending.Push(child);
                }
            }
        }

        return branch;
    }

    /// <summary>
    /// <paramref name="typeId"/> and every type above it. Walks up; a parent that is not in the graph, or a loop already in the
    /// data, ends the walk, so a broken graph only ever leaves a type with fewer ancestors, never more.
    /// </summary>
    public static HashSet<Guid> Lineage(IReadOnlyDictionary<Guid, Guid?> parentOf, Guid typeId)
    {
        var lineage = new HashSet<Guid> { typeId };
        var current = typeId;

        while (parentOf.TryGetValue(current, out var up) && up is { } parent && parentOf.ContainsKey(parent) && lineage.Add(parent))
        {
            current = parent;
        }

        return lineage;
    }

    /// <summary>
    /// Whether <paramref name="typeId"/> is <paramref name="ancestorId"/> or nested beneath it at any depth: what a link field
    /// limited to <paramref name="ancestorId"/> accepts (ADR 0007 amendment, Issue #61).
    /// </summary>
    public static bool IsWithin(IReadOnlyDictionary<Guid, Guid?> parentOf, Guid typeId, Guid ancestorId) =>
        Lineage(parentOf, typeId).Contains(ancestorId);

    /// <summary>
    /// Whether making <paramref name="parentId"/> the parent of <paramref name="typeId"/> would close a loop: the parent is the
    /// type itself, or one of its descendants. Walks up from the would-be parent; a loop already in the data ends the walk.
    /// </summary>
    public static bool WouldCycle(IReadOnlyDictionary<Guid, Guid?> parentOf, Guid typeId, Guid parentId)
    {
        var seen = new HashSet<Guid>();
        Guid? current = parentId;

        while (current is { } node && seen.Add(node))
        {
            if (node == typeId)
            {
                return true;
            }

            current = parentOf.TryGetValue(node, out var up) ? up : null;
        }

        return current is not null;
    }

    /// <summary>
    /// Whether the graph is a forest: every parent is a node of it, and following parents from any node ends at a root. What
    /// a backup's types must be before anything of them is written.
    /// </summary>
    public static bool IsForest(IReadOnlyDictionary<Guid, Guid?> parentOf)
    {
        var settled = new HashSet<Guid>();

        foreach (var start in parentOf.Keys)
        {
            var path = new HashSet<Guid>();
            Guid? current = start;

            while (current is { } node && !settled.Contains(node))
            {
                if (!parentOf.TryGetValue(node, out var up) || !path.Add(node))
                {
                    return false;
                }

                current = up;
            }

            settled.UnionWith(path);
        }

        return true;
    }
}
