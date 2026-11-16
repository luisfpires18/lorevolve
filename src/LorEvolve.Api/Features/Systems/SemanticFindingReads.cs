using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// Reading a submitted semantic finding back, shared by the author's own routes and the MCP read tool so both see one
/// shape (#154).
/// </summary>
public static class SemanticFindingReads
{
    /// <summary>The status as it travels: text, so a new status never shifts an existing one.</summary>
    public static string Status(SemanticFindingStatus status) => status switch
    {
        SemanticFindingStatus.Accepted => "accepted",
        SemanticFindingStatus.Dismissed => "dismissed",
        _ => "unverified",
    };

    /// <summary>The citation's kind as it travels, in the same style.</summary>
    public static string Kind(SemanticCitationKind kind) => kind switch
    {
        SemanticCitationKind.LoreEntry => "lore_entry",
        SemanticCitationKind.Relationship => "relationship",
        SemanticCitationKind.TimelineMoment => "timeline_moment",
        SemanticCitationKind.Scene => "scene",
        SemanticCitationKind.Manuscript => "manuscript",
        SemanticCitationKind.WorldRule => "world_rule",
        _ => "system_rule",
    };

    /// <summary>The kind a client named, or null when it named something this build does not know.</summary>
    public static SemanticCitationKind? KindOf(string? wire) => wire?.Trim().ToLowerInvariant() switch
    {
        "lore_entry" => SemanticCitationKind.LoreEntry,
        "relationship" => SemanticCitationKind.Relationship,
        "timeline_moment" => SemanticCitationKind.TimelineMoment,
        "scene" => SemanticCitationKind.Scene,
        "manuscript" => SemanticCitationKind.Manuscript,
        "world_rule" => SemanticCitationKind.WorldRule,
        "system_rule" => SemanticCitationKind.SystemRule,
        _ => null,
    };

    /// <summary>Every kind a client may name, for a tool description and a refusal that says what was expected.</summary>
    public static readonly string[] Kinds =
    [
        "lore_entry", "relationship", "timeline_moment", "scene", "manuscript", "world_rule", "system_rule",
    ];

    /// <summary>One page of a universe's submitted claims, newest first inside what is still waiting.</summary>
    public static async Task<WorldLogicPage<SemanticFindingRow>> ListAsync(
        LorEvolveDbContext db,
        Guid universeId,
        SemanticFindingStatus? status,
        Guid? ruleId,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var (wantedPage, wantedSize) = WorldLogicAccess.Paging(page, pageSize);

        var query = db.SemanticFindings.AsNoTracking().Where(finding => finding.UniverseId == universeId);

        if (status is { } wantedStatus)
        {
            query = query.Where(finding => finding.Status == wantedStatus);
        }

        if (ruleId is { } wantedRule)
        {
            query = query.Where(finding => finding.RuleId == wantedRule);
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var rows = await query
            // What is still waiting comes first, then the newest.
            .OrderBy(finding => finding.Status == SemanticFindingStatus.Unverified ? 0 : 1)
            .ThenByDescending(finding => finding.CreatedAt)
            .ThenBy(finding => finding.Id)
            .Skip((wantedPage - 1) * wantedSize)
            .Take(wantedSize)
            .Select(Projection())
            .ToListAsync(cancellationToken);

        return new WorldLogicPage<SemanticFindingRow>(
            [.. rows.Select(Mapped)],
            wantedPage,
            wantedSize,
            totalCount,
            WorldLogicAccess.TotalPages(totalCount, wantedSize));
    }

    /// <summary>One submitted claim in full, or null when nothing with that id is in this universe.</summary>
    public static async Task<SemanticFindingDetail?> DetailAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid findingId,
        CancellationToken cancellationToken)
    {
        var row = await db.SemanticFindings.AsNoTracking()
            .Where(finding => finding.Id == findingId && finding.UniverseId == universeId)
            .Select(Projection())
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        var citations = await db.SemanticFindingCitations.AsNoTracking()
            .Where(citation => citation.FindingId == findingId)
            .OrderBy(citation => citation.SortOrder)
            .Select(citation => new
            {
                citation.Kind,
                citation.SourceId,
                citation.SourceVersion,
                citation.RangeStart,
                citation.RangeLength,
                citation.Note,
            })
            .ToListAsync(cancellationToken);

        var current = await CurrentVersionsAsync(
            db,
            universeId,
            [.. citations.Select(citation => (citation.Kind, citation.SourceId))],
            cancellationToken);

        return new SemanticFindingDetail(
            Mapped(row),
            row.Claim,
            [
                .. citations.Select(citation =>
                {
                    var now = current.GetValueOrDefault((citation.Kind, citation.SourceId));
                    return new SemanticCitationRow(
                        Kind(citation.Kind),
                        citation.SourceId,
                        citation.SourceVersion,
                        now,
                        // Stale only when both numbers are known and they differ. An unknown version is not
                        // evidence that the record changed, so it never reads as stale.
                        citation.SourceVersion is { } read && now is { } live && read != live,
                        citation.RangeStart,
                        citation.RangeLength,
                        citation.Note);
                }),
            ],
            row.DecisionNote);
    }

    /// <summary>
    /// The version each cited record carries now, for the kinds that have one: a lore entry, a scene, a scene's
    /// manuscript and a World Logic rule. A relationship, a timeline moment and a world rule are stored without a
    /// version (ADR 0047's "stored form"), so nothing is looked up for them and a reader is told null rather than a
    /// number that does not exist.
    /// </summary>
    private static async Task<Dictionary<(SemanticCitationKind Kind, Guid Id), int?>> CurrentVersionsAsync(
        LorEvolveDbContext db,
        Guid universeId,
        IReadOnlyList<(SemanticCitationKind Kind, Guid Id)> cited,
        CancellationToken cancellationToken)
    {
        var found = new Dictionary<(SemanticCitationKind, Guid), int?>();

        async Task AddAsync(SemanticCitationKind kind, Func<Guid[], Task<List<(Guid Id, int Version)>>> read)
        {
            var ids = cited.Where(item => item.Kind == kind).Select(item => item.Id).Distinct().ToArray();
            if (ids.Length == 0)
            {
                return;
            }

            foreach (var (id, version) in await read(ids))
            {
                found[(kind, id)] = version;
            }
        }

        await AddAsync(
            SemanticCitationKind.LoreEntry,
            async ids => await db.Entities.AsNoTracking()
                .Where(entry => ids.Contains(entry.Id) && entry.UniverseId == universeId)
                .Select(entry => ValueTuple.Create(entry.Id, entry.Version))
                .ToListAsync(cancellationToken));

        await AddAsync(
            SemanticCitationKind.SystemRule,
            async ids => await db.SystemRules.AsNoTracking()
                .Where(rule => ids.Contains(rule.Id) && rule.UniverseId == universeId)
                .Select(rule => ValueTuple.Create(rule.Id, rule.Version))
                .ToListAsync(cancellationToken));

        // A scene reaches its universe through its story, which EF's universe filter already follows, so no
        // IgnoreQueryFilters is needed and the scope still holds.
        await AddAsync(
            SemanticCitationKind.Scene,
            async ids => await db.Scenes.AsNoTracking()
                .Where(scene => ids.Contains(scene.Id) && scene.Story!.UniverseId == universeId)
                .Select(scene => ValueTuple.Create(scene.Id, scene.Version))
                .ToListAsync(cancellationToken));

        // A manuscript is keyed by its scene, so a client cites the scene's id for both kinds and the kind says
        // which version it read.
        await AddAsync(
            SemanticCitationKind.Manuscript,
            async ids => await db.SceneManuscripts.AsNoTracking()
                .Where(manuscript => ids.Contains(manuscript.SceneId) && manuscript.Scene!.Story!.UniverseId == universeId)
                .Select(manuscript => ValueTuple.Create(manuscript.SceneId, manuscript.Version))
                .ToListAsync(cancellationToken));

        return found;
    }

    /// <summary>What a row read from the database carries, before the excerpt and the status text are made.</summary>
    private sealed record Read(
        Guid Id,
        string Title,
        string Claim,
        Guid? RuleId,
        string? RuleTitle,
        Guid? ProjectId,
        SemanticFindingStatus Status,
        string? ClientName,
        int CitationCount,
        DateTime CreatedAt,
        DateTime UpdatedAt,
        DateTime? DecidedAt,
        string? DecisionNote);

    private static System.Linq.Expressions.Expression<Func<SemanticFinding, Read>> Projection() =>
        finding => new Read(
            finding.Id,
            finding.Title,
            finding.Claim,
            finding.RuleId,
            finding.Rule!.Title,
            finding.ProjectId,
            finding.Status,
            finding.ClientName,
            finding.Citations.Count,
            finding.CreatedAt,
            finding.UpdatedAt,
            finding.DecidedAt,
            finding.DecisionNote);

    private static SemanticFindingRow Mapped(Read row)
    {
        var (excerpt, isShortened) = WorldLogicAccess.Excerpt(row.Claim);
        return new SemanticFindingRow(
            row.Id,
            row.Title,
            excerpt,
            isShortened,
            row.RuleId,
            row.RuleTitle,
            row.ProjectId,
            Status(row.Status),
            row.ClientName,
            row.CitationCount,
            Utc(row.CreatedAt),
            Utc(row.UpdatedAt),
            row.DecidedAt is { } decided ? Utc(decided) : null);
    }
}
