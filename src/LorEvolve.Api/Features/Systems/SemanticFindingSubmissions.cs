using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>What a connected client sends when it submits a claim. Plain data: no MCP type reaches the domain.</summary>
public sealed record SemanticFindingInput(
    string? Title,
    string? Claim,
    string? RuleId = null,
    string? ProjectId = null,
    IReadOnlyList<SemanticCitationInput>? Citations = null);

/// <summary>One record the claim cites, as the client named it.</summary>
public sealed record SemanticCitationInput(
    string? Kind,
    string? SourceId,
    string? Note = null,
    int? SourceVersion = null,
    int? RangeStart = null,
    int? RangeLength = null);

/// <summary>One thing wrong with a submission: which citation, which field, a code and a sentence.</summary>
public sealed record SemanticFindingProblem(int? Citation, string Field, string Code, string Message);

/// <summary>Either the claim that was written, or everything wrong with it. Never both.</summary>
public sealed record SemanticFindingResult(SemanticFinding? Finding, IReadOnlyList<SemanticFindingProblem> Problems);

/// <summary>
/// Writing a submitted semantic finding (#154).
///
/// <para><b>The universe is the caller's, never the submission's.</b> <paramref name="universeId"/> comes from the
/// connection's token, and every id in the submission is checked against that universe before anything is written. A
/// client cannot cite, scope or blame a record it was never shown, so a claim cannot reach outside its scope even
/// when it names an id it guessed.</para>
///
/// <para><b>Nothing here records a violation.</b> The status written is always
/// <see cref="SemanticFindingStatus.Unverified"/>; there is no parameter that could change it, and the status set has
/// no value meaning "proven" (ADR 0072).</para>
/// </summary>
public static class SemanticFindingSubmissions
{
    public static async Task<SemanticFindingResult> SubmitAsync(
        LorEvolveDbContext db,
        TimeProvider clock,
        Guid universeId,
        string submittedByUserId,
        Guid connectionId,
        string? clientName,
        SemanticFindingInput input,
        CancellationToken cancellationToken)
    {
        var problems = new List<SemanticFindingProblem>();

        var title = input.Title?.Trim() ?? string.Empty;
        if (title.Length == 0)
        {
            problems.Add(new(null, "title", "required", "Insert one line naming what you observed."));
        }
        else if (title.Length > SemanticFindingLimits.TitleMaxLength)
        {
            problems.Add(new(null, "title", "too_long",
                $"Keep the title to {WorldLogicAccess.Number(SemanticFindingLimits.TitleMaxLength)} characters or fewer."));
        }

        var claim = input.Claim?.Trim() ?? string.Empty;
        if (claim.Length == 0)
        {
            problems.Add(new(null, "claim", "required", "Insert what you observed, in your own words."));
        }
        else if (claim.Length > SemanticFindingLimits.ClaimMaxLength)
        {
            problems.Add(new(null, "claim", "too_long",
                $"Keep the claim to {WorldLogicAccess.Number(SemanticFindingLimits.ClaimMaxLength)} characters or fewer."));
        }

        var projectId = await ProjectAsync(db, universeId, input.ProjectId, problems, cancellationToken);
        var ruleId = await RuleAsync(db, universeId, projectId, input.RuleId, problems, cancellationToken);
        var citations = await CitationsAsync(db, universeId, projectId, input.Citations, problems, cancellationToken);

        if (problems.Count == 0 && await WaitingAsync(db, universeId, cancellationToken) >= SemanticFindingLimits.MaxUnverifiedPerUniverse)
        {
            problems.Add(new(null, "claim", "too_many_waiting",
                $"This universe already has {WorldLogicAccess.Number(SemanticFindingLimits.MaxUnverifiedPerUniverse)} observations "
                + "waiting for the author. Nothing was submitted: ask them to go through the ones they have first."));
        }

        if (problems.Count > 0)
        {
            return new SemanticFindingResult(null, problems);
        }

        var now = clock.GetUtcNow().UtcDateTime;
        var finding = new SemanticFinding
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            ProjectId = projectId,
            RuleId = ruleId,
            Title = title,
            Claim = claim,
            // The only status a submission can produce. Nothing has checked the claim.
            Status = SemanticFindingStatus.Unverified,
            ConnectionId = connectionId,
            ClientName = clientName,
            SubmittedByUserId = submittedByUserId,
            CreatedAt = now,
            UpdatedAt = now,
        };

        for (var index = 0; index < citations.Count; index++)
        {
            var cited = citations[index];
            finding.Citations.Add(new SemanticFindingCitation
            {
                FindingId = finding.Id,
                SortOrder = index,
                Kind = cited.Kind,
                SourceId = cited.SourceId,
                SourceVersion = cited.SourceVersion,
                RangeStart = cited.RangeStart,
                RangeLength = cited.RangeLength,
                Note = cited.Note,
            });
        }

        db.SemanticFindings.Add(finding);
        await db.SaveChangesAsync(cancellationToken);

        return new SemanticFindingResult(finding, []);
    }

    /// <summary>How many of this universe's claims are still waiting for the author.</summary>
    private static Task<int> WaitingAsync(LorEvolveDbContext db, Guid universeId, CancellationToken cancellationToken) =>
        db.SemanticFindings.AsNoTracking()
            .CountAsync(
                finding => finding.UniverseId == universeId && finding.Status == SemanticFindingStatus.Unverified,
                cancellationToken);

    private static async Task<Guid?> RuleAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid? claimProjectId,
        string? sent,
        List<SemanticFindingProblem> problems,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sent))
        {
            return null;
        }

        if (!Guid.TryParse(sent, out var id))
        {
            problems.Add(new(null, "ruleId", "not_an_id", "Insert a rule id exactly as a read tool gave it."));
            return null;
        }

        var rule = await db.SystemRules.AsNoTracking()
            .Where(candidate => candidate.Id == id && candidate.UniverseId == universeId)
            .Select(candidate => new { candidate.ProjectId })
            .FirstOrDefaultAsync(cancellationToken);

        if (rule is null)
        {
            problems.Add(new(null, "ruleId", "not_found", "No World Logic rule with that id is in this universe."));
            return null;
        }

        // The same scope rule the citations are held to: a rule belonging to one project is only about that project.
        if (rule.ProjectId is { } owner && owner != claimProjectId)
        {
            problems.Add(new(null, "ruleId", "out_of_scope",
                claimProjectId is null
                    ? "That rule belongs to one project, so a claim about the whole universe cannot be about it. Scope the claim to that project with projectId."
                    : "That rule belongs to a different project from the one this claim is scoped to."));
            return null;
        }

        return id;
    }

    private static async Task<Guid?> ProjectAsync(
        LorEvolveDbContext db,
        Guid universeId,
        string? sent,
        List<SemanticFindingProblem> problems,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sent))
        {
            return null;
        }

        if (!Guid.TryParse(sent, out var id))
        {
            problems.Add(new(null, "projectId", "not_an_id", "Insert a project id exactly as list_projects gave it."));
            return null;
        }

        if (!await WorldLogicAccess.IsProjectOfUniverseAsync(db, universeId, id, cancellationToken))
        {
            problems.Add(new(null, "projectId", "not_found", "No project with that id is in this universe."));
            return null;
        }

        return id;
    }

    /// <summary>One citation, after its kind, id and note have been read and checked.</summary>
    private sealed record Cited(SemanticCitationKind Kind, Guid SourceId, string Note, int? SourceVersion, int? RangeStart, int? RangeLength);

    private static async Task<List<Cited>> CitationsAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid? claimProjectId,
        IReadOnlyList<SemanticCitationInput>? sent,
        List<SemanticFindingProblem> problems,
        CancellationToken cancellationToken)
    {
        var count = sent?.Count ?? 0;
        if (count < SemanticFindingLimits.MinCitations)
        {
            problems.Add(new(null, "citations", "required",
                "Cite at least one record this claim is about, so the author can check it. An uncited observation is not a finding."));
            return [];
        }

        if (count > SemanticFindingLimits.MaxCitations)
        {
            problems.Add(new(null, "citations", "too_many",
                $"Cite at most {WorldLogicAccess.Number(SemanticFindingLimits.MaxCitations)} records. Split a wider observation into separate findings."));
            return [];
        }

        var read = new List<Cited>();

        for (var index = 0; index < count; index++)
        {
            var citation = sent![index];

            var kind = SemanticFindingReads.KindOf(citation.Kind);
            if (kind is null)
            {
                problems.Add(new(index, "kind", "unknown_kind",
                    $"Insert one of: {string.Join(", ", SemanticFindingReads.Kinds)}."));
                continue;
            }

            if (!Guid.TryParse(citation.SourceId, out var sourceId))
            {
                problems.Add(new(index, "sourceId", "not_an_id", "Insert the record's id exactly as a read tool gave it."));
                continue;
            }

            var note = citation.Note?.Trim() ?? string.Empty;
            if (note.Length == 0)
            {
                problems.Add(new(index, "note", "required", "Say what this record contributes to the claim."));
                continue;
            }

            if (note.Length > SemanticFindingLimits.CitationNoteMaxLength)
            {
                problems.Add(new(index, "note", "too_long",
                    $"Keep a citation's note to {WorldLogicAccess.Number(SemanticFindingLimits.CitationNoteMaxLength)} characters or fewer."));
                continue;
            }

            if (citation.SourceVersion is { } version && version < 1)
            {
                problems.Add(new(index, "sourceVersion", "out_of_range", "A version is 1 or more. Leave it out if the record has none."));
                continue;
            }

            if (citation.RangeStart is { } start && start < 0)
            {
                problems.Add(new(index, "rangeStart", "out_of_range", "A range starts at 0 or more."));
                continue;
            }

            if (citation.RangeLength is { } length && length < 1)
            {
                problems.Add(new(index, "rangeLength", "out_of_range", "A range covers 1 character or more. Leave it out for the whole record."));
                continue;
            }

            read.Add(new(kind.Value, sourceId, note, citation.SourceVersion, citation.RangeStart, citation.RangeLength));
        }

        if (problems.Count > 0)
        {
            return [];
        }

        // Nothing may be cited that this universe does not hold, nothing outside the claim's own scope, and no range
        // that is not inside the prose it points at. This is the boundary in code: the ids and offsets come from the
        // client, the universe and the scope come from the token and the claim, and a mismatch is refused rather
        // than stored.
        var inside = await ResolveAsync(db, universeId, read, cancellationToken);

        for (var index = 0; index < read.Count; index++)
        {
            var citation = read[index];

            if (!inside.TryGetValue((citation.Kind, citation.SourceId), out var cited))
            {
                problems.Add(new(index, "sourceId", "not_found",
                    "Nothing of that kind with that id is in this universe. Cite a record you read from this connection."));
                continue;
            }

            // A rule that belongs to one project is only in scope for a claim about that same project. A claim about
            // the whole universe, or about another project, would be citing something its reader cannot see in
            // context, and the rules list this connection read is scoped the same way.
            if (cited.ProjectId is { } owner && owner != claimProjectId)
            {
                problems.Add(new(index, "sourceId", "out_of_scope",
                    claimProjectId is null
                        ? "That rule belongs to one project, so a claim about the whole universe cannot cite it. Scope the claim to that project with projectId."
                        : "That rule belongs to a different project from the one this claim is scoped to."));
                continue;
            }

            if (citation.RangeStart is null && citation.RangeLength is null)
            {
                continue;
            }

            // A range is a span of prose, and a manuscript is the only thing cited here that has any. A range on
            // anything else would point into text that does not exist.
            if (cited.TextLength is not { } length)
            {
                problems.Add(new(index, "rangeStart", "range_not_supported",
                    "A range only applies to a manuscript, which is the prose cited here. Leave it out for any other kind."));
                continue;
            }

            // The range is checked against the prose as it stands now, which is the only text there is to check
            // against. A claim read at an earlier version can therefore be refused because the prose has since been
            // shortened; that is the honest answer, and read_scene_manuscript gives the current text and version.
            var start = citation.RangeStart ?? 0;
            var covered = citation.RangeLength ?? (length - start);

            if (start >= length || covered < 1 || start + covered > length)
            {
                problems.Add(new(index, "rangeStart", "out_of_range",
                    $"That range is not inside the manuscript, which is {WorldLogicAccess.Number(length)} characters now. "
                    + "Read it again and cite the range in the text you were given."));
            }
        }

        return problems.Count > 0 ? [] : read;
    }

    /// <summary>
    /// What this universe actually holds of the cited records, one query per kind that was cited: whether it is there
    /// at all, which project owns it where anything does, and how long its prose is where it has any. A scene and its
    /// manuscript reach the universe through the scene's story, which EF's own universe filter follows, so no
    /// <c>IgnoreQueryFilters</c> is needed and the universe bound still holds.
    /// </summary>
    private static async Task<Dictionary<(SemanticCitationKind Kind, Guid Id), Resolved>> ResolveAsync(
        LorEvolveDbContext db,
        Guid universeId,
        IReadOnlyList<Cited> cited,
        CancellationToken cancellationToken)
    {
        var found = new Dictionary<(SemanticCitationKind, Guid), Resolved>();

        async Task AddAsync(SemanticCitationKind kind, Func<Guid[], Task<List<Resolved>>> read)
        {
            var ids = cited.Where(item => item.Kind == kind).Select(item => item.SourceId).Distinct().ToArray();
            if (ids.Length == 0)
            {
                return;
            }

            foreach (var row in await read(ids))
            {
                found[(kind, row.Id)] = row;
            }
        }

        await AddAsync(
            SemanticCitationKind.LoreEntry,
            async ids => await db.Entities.AsNoTracking()
                .Where(entry => ids.Contains(entry.Id) && entry.UniverseId == universeId)
                .Select(entry => new Resolved(entry.Id, null, null))
                .ToListAsync(cancellationToken));

        await AddAsync(
            SemanticCitationKind.Relationship,
            async ids => await db.Relationships.AsNoTracking()
                .Where(relationship => ids.Contains(relationship.Id) && relationship.UniverseId == universeId)
                .Select(relationship => new Resolved(relationship.Id, null, null))
                .ToListAsync(cancellationToken));

        await AddAsync(
            SemanticCitationKind.TimelineMoment,
            async ids => await db.TimelineEntries.AsNoTracking()
                .Where(moment => ids.Contains(moment.Id) && moment.UniverseId == universeId)
                .Select(moment => new Resolved(moment.Id, null, null))
                .ToListAsync(cancellationToken));

        await AddAsync(
            SemanticCitationKind.Scene,
            async ids => await db.Scenes.AsNoTracking()
                .Where(scene => ids.Contains(scene.Id) && scene.Story!.UniverseId == universeId)
                .Select(scene => new Resolved(scene.Id, null, null))
                .ToListAsync(cancellationToken));

        // The one kind a range applies to, so the one that reports its length. It is keyed by its scene, so a client
        // cites the scene's id and the kind says which of the two it read.
        await AddAsync(
            SemanticCitationKind.Manuscript,
            async ids => await db.SceneManuscripts.AsNoTracking()
                .Where(manuscript => ids.Contains(manuscript.SceneId) && manuscript.Scene!.Story!.UniverseId == universeId)
                .Select(manuscript => new Resolved(manuscript.SceneId, null, manuscript.Content.Length))
                .ToListAsync(cancellationToken));

        // A trashed world rule is not something a claim may be about: it is not part of the universe any more.
        await AddAsync(
            SemanticCitationKind.WorldRule,
            async ids => await db.WorldRules.AsNoTracking()
                .Where(rule => ids.Contains(rule.Id) && rule.UniverseId == universeId && rule.DeletedAt == null)
                .Select(rule => new Resolved(rule.Id, null, null))
                .ToListAsync(cancellationToken));

        // The one kind that can belong to a project rather than to the whole universe (ADR 0072).
        await AddAsync(
            SemanticCitationKind.SystemRule,
            async ids => await db.SystemRules.AsNoTracking()
                .Where(rule => ids.Contains(rule.Id) && rule.UniverseId == universeId)
                .Select(rule => new Resolved(rule.Id, rule.ProjectId, null))
                .ToListAsync(cancellationToken));

        return found;
    }

    /// <summary>
    /// One cited record as this universe holds it: its id, the project that owns it where one does, and the length of
    /// its prose where it has any. Null in both means a universe-wide record with no text a range could point into.
    /// </summary>
    private sealed record Resolved(Guid Id, Guid? ProjectId, int? TextLength);
}
