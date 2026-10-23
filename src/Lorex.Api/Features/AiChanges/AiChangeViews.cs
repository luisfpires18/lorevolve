using System.Globalization;
using Lorex.Api.Data;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.AiChanges;

/// <summary>
/// The review's reading of a proposal (ADR 0047): each change as LoreX describes it - a title, before and after lines with
/// names resolved live, what a removal touches, and what is wrong with it now - never the AI's JSON. Every string that
/// came from the AI stays plain text; the client draws it as text. Reads only.
/// </summary>
internal static class AiChangeViews
{
    /// <summary>The proposals a reader is shown: every one in a universe where they could approve, and their own elsewhere - only while they can still read it.</summary>
    public static IQueryable<AiChangeProposal> Visible(LorexDbContext db, string userId) =>
        db.AiChangeProposals.Where(proposal =>
            proposal.Universe!.OwnerId == userId
            || db.UniverseMemberships.Any(membership => membership.UniverseId == proposal.UniverseId
                && membership.UserId == userId
                && (membership.Role == UniverseRole.Editor || proposal.ProposedByUserId == userId)));

    public static IQueryable<AiChangeProposalSummary> Summaries(LorexDbContext db, IQueryable<AiChangeProposal> proposals, string userId) =>
        proposals.Select(proposal => new AiChangeProposalSummary(
            proposal.Id,
            proposal.UniverseId,
            proposal.Universe!.Name,
            proposal.Source,
            proposal.ClientName,
            db.Users.Where(user => user.Id == proposal.ProposedByUserId).Select(user => user.UserName).FirstOrDefault(),
            proposal.ProposedByUserId == userId,
            proposal.Summary,
            proposal.Status,
            proposal.CreatedAt,
            proposal.ExpiresAt,
            proposal.Operations.Count,
            proposal.Operations.Count(operation => operation.Status == AiChangeOperationStatus.Pending),
            proposal.Operations.Count(operation => operation.Status == AiChangeOperationStatus.Committed),
            proposal.Operations.Count(operation => operation.Action == AiChangeAction.Create),
            proposal.Operations.Count(operation => operation.Action == AiChangeAction.Update),
            proposal.Operations.Count(operation => operation.Action == AiChangeAction.Remove)));

    /// <summary>
    /// Why nothing in an open proposal can be approved, or null: the person it was staged for can no longer stage those
    /// changes, or the app it came through was disconnected or stopped from proposing. Then it can only be rejected.
    /// </summary>
    public static async Task<string?> BlockedAsync(LorexDbContext db, AiChangeProposal proposal, CancellationToken cancellationToken)
    {
        var role = await UniverseAccess.RoleAsync(db, proposal.UniverseId, proposal.ProposedByUserId, cancellationToken);
        if (role is not { } effective || !AiChangePermissions.MayStageAnything(effective))
        {
            return "The person who asked for these changes can no longer propose changes in this universe, so they can only be rejected.";
        }

        if (proposal.Source == AiChangeSource.Mcp
            && !await db.McpConnections.AnyAsync(connection => connection.Id == proposal.McpConnectionId && connection.CanPropose, cancellationToken))
        {
            return "The app that sent these changes was disconnected or can no longer propose changes, so they can only be rejected.";
        }

        return null;
    }

    public static async Task<AiChangeProposalResponse?> ReadAsync(
        LorexDbContext db,
        Guid universeId,
        Guid proposalId,
        string userId,
        UniverseRole role,
        CancellationToken cancellationToken)
    {
        var mayReview = AiChangePermissions.MayReview(role);
        var proposal = await db.AiChangeProposals.AsNoTracking()
            .Include(row => row.Operations)
            .FirstOrDefaultAsync(row => row.Id == proposalId
                && row.UniverseId == universeId
                && (mayReview || row.ProposedByUserId == userId), cancellationToken);

        if (proposal is null)
        {
            return null;
        }

        var summary = await Summaries(db, db.AiChangeProposals.Where(row => row.Id == proposalId), userId).SingleAsync(cancellationToken);
        var works = proposal.Operations.OrderBy(operation => operation.Sequence).Select(AiChangeWork.From).ToList();
        await new AiChangeChecker(db, universeId).CheckAsync(works, cancellationToken);

        var names = await Names.LoadAsync(db, universeId, works, cancellationToken);
        var resolvers = (await db.AiChangeOperations.AsNoTracking()
                .Where(operation => operation.ProposalId == proposalId && operation.ResolvedByUserId != null)
                .Select(operation => new
                {
                    operation.Id,
                    Name = db.Users.Where(user => user.Id == operation.ResolvedByUserId).Select(user => user.UserName).FirstOrDefault(),
                })
                .ToListAsync(cancellationToken))
            .ToDictionary(row => row.Id, row => row.Name);

        var rows = proposal.Operations.ToDictionary(operation => operation.Id);
        var open = proposal.Status == AiChangeProposalStatus.Open;
        var operations = new List<AiChangeOperationResponse>();
        foreach (var work in works)
        {
            var row = rows[work.OperationId];
            var neededBy = works.Where(other => other.DependsOn.Contains(work.Key)).Select(other => other.Key).ToList();
            var (title, lines) = Describe(work, names);
            operations.Add(new AiChangeOperationResponse(
                work.OperationId,
                work.Key,
                work.Sequence,
                work.Resource,
                work.Action,
                work.Status,
                title,
                work.TargetId,
                StoryOf(work, names),
                lines,
                work.DependsOn,
                neededBy,
                work.IsPending ? work.Issues : [],
                work.IsPending && work.IsConflict,
                work.Action == AiChangeAction.Remove && work.IsPending ? await ImpactAsync(db, universeId, work, cancellationToken) : null,
                work.IsPending && open && mayReview && !work.IsConflict ? Editable(work.Proposed) : null,
                await ProseAsync(db, work, cancellationToken),
                row.ResultId,
                resolvers.GetValueOrDefault(row.Id),
                row.ResolvedAt is { } at ? DateTime.SpecifyKind(at, DateTimeKind.Utc) : null,
                row.ResolutionNote));
        }

        return new AiChangeProposalResponse(
            summary with
            {
                CreatedAt = DateTime.SpecifyKind(summary.CreatedAt, DateTimeKind.Utc),
                ExpiresAt = DateTime.SpecifyKind(summary.ExpiresAt, DateTimeKind.Utc),
            },
            proposal.Revision,
            mayReview && open,
            open ? await BlockedAsync(db, proposal, cancellationToken) : null,
            operations);
    }

    // ---------- Describing a change ----------

    private static (string Title, List<AiChangeLine> Lines) Describe(AiChangeWork work, Names names)
    {
        var lines = new List<AiChangeLine>();
        void Line(string label, string? before, string? after)
        {
            if (work.Action == AiChangeAction.Create)
            {
                if (after is not null)
                {
                    lines.Add(new AiChangeLine(label, null, after));
                }
            }
            else if (before != after)
            {
                lines.Add(new AiChangeLine(label, before, after));
            }
        }

        switch (work.Proposed, work.Before)
        {
            case (RemoveValues, var before):
                var named = before switch
                {
                    LoreValues lore => $"{lore.Name} ({names.Type(lore.TypeId)})",
                    StoryValues story => story.Title,
                    ChapterValues chapter => chapter.Title,
                    SceneValues scene => scene.Title,
                    _ => "this",
                };
                return ($"Move {Noun(work.Resource)} {named} to the Trash", lines);

            case (LoreValues lore, var before):
            {
                var old = before as LoreValues;
                Line("Type", old is null ? null : names.Type(old.TypeId), names.Type(lore.TypeId));
                Line("Name", old?.Name, lore.Name);
                Line("Summary", old?.Summary, lore.Summary);
                Line("Canon status", old is null ? null : Canon(old.CanonStatus), Canon(lore.CanonStatus));
                Line("Aliases", Join(old?.Aliases), Join(lore.Aliases));
                Line("Tags", Join(old?.Tags), Join(lore.Tags));
                var fieldIds = lore.Fields.Select(field => field.FieldId).Union(old?.Fields.Select(field => field.FieldId) ?? []).ToList();
                foreach (var fieldId in fieldIds.OrderBy(names.FieldOrder))
                {
                    Line(
                        names.Field(fieldId),
                        old?.Fields.FirstOrDefault(field => field.FieldId == fieldId) is { } was ? names.Value(was) : null,
                        lore.Fields.FirstOrDefault(field => field.FieldId == fieldId) is { } now ? names.Value(now) : null);
                }

                return (work.Action == AiChangeAction.Create
                    ? $"New {names.Type(lore.TypeId)}: {lore.Name}"
                    : $"Edit {old?.Name ?? lore.Name}", lines);
            }

            case (RelationshipValues relationship, var before):
            {
                var old = before as RelationshipValues;
                Line("Kind", old is null ? null : names.RelationshipType(old.TypeId), names.RelationshipType(relationship.TypeId));
                Line("From", old is null ? null : names.Entry(old.Source), names.Entry(relationship.Source));
                Line("To", old is null ? null : names.Entry(old.Target), names.Entry(relationship.Target));
                Line("Canon status", old is null ? null : Canon(old.CanonStatus), Canon(relationship.CanonStatus));
                Line("Notes", old?.Notes, relationship.Notes);
                var reads = $"{names.Entry(relationship.Source)} {names.RelationshipType(relationship.TypeId)} {names.Entry(relationship.Target)}";
                return (work.Action == AiChangeAction.Create ? $"New relationship: {reads}" : $"Edit relationship: {reads}", lines);
            }

            case (StoryValues story, var before):
            {
                var old = before as StoryValues;
                Line("Title", old?.Title, story.Title);
                Line("Premise", old?.Premise, story.Premise);
                Line("Status", old?.Status.ToString(), story.Status.ToString());
                return (work.Action == AiChangeAction.Create ? $"New story: {story.Title}" : $"Edit story: {old?.Title ?? story.Title}", lines);
            }

            case (ChapterValues chapter, var before):
            {
                var old = before as ChapterValues;
                Line("Story", old is null ? null : names.Story(old.Story), names.Story(chapter.Story));
                Line("Title", old?.Title, chapter.Title);
                Line("Summary", old?.Summary, chapter.Summary);
                Line("Notes", old?.Notes, chapter.Notes);
                return (work.Action == AiChangeAction.Create ? $"New chapter: {chapter.Title}" : $"Edit chapter: {old?.Title ?? chapter.Title}", lines);
            }

            case (SceneValues scene, var before):
            {
                var old = before as SceneValues;
                Line("Story", old is null ? null : names.Story(old.Story), names.Story(scene.Story));
                Line("Chapter", old is null ? null : names.Chapter(old.Chapter), names.Chapter(scene.Chapter));
                Line("Title", old?.Title, scene.Title);
                Line("Summary", old?.Summary, scene.Summary);
                Line("Notes", old?.Notes, scene.Notes);
                Line("Point of view", old?.PointOfView is { } wasPov ? names.Entry(wasPov) : null, scene.PointOfView is { } pov ? names.Entry(pov) : null);
                Line("When", names.Point(old?.Date), names.Point(scene.Date));
                Line("Lore", Join(old?.Lore.Select(names.Entry)), Join(scene.Lore.Select(names.Entry)));
                return (work.Action == AiChangeAction.Create ? $"New scene: {scene.Title}" : $"Edit scene: {old?.Title ?? scene.Title}", lines);
            }

            case (ManuscriptValues manuscript, _):
                lines.Add(new AiChangeLine("Scene", null, names.Scene(manuscript.Scene)));
                return (manuscript.Append
                    ? $"Add prose to {names.Scene(manuscript.Scene)}"
                    : $"Rewrite the prose of {names.Scene(manuscript.Scene)}", lines);

            case (TimelineValues moment, var before):
            {
                var old = before as TimelineValues;
                Line("Title", old?.Title, moment.Title);
                Line("Description", old?.Description, moment.Description);
                Line("Canon status", old is null ? null : Canon(old.CanonStatus), Canon(moment.CanonStatus));
                Line("When", old is null ? null : names.When(old), names.When(moment));
                Line("Taking part", Join(old?.Participants.Select(names.Entry)), Join(moment.Participants.Select(names.Entry)));
                return (work.Action == AiChangeAction.Create ? $"New timeline moment: {moment.Title}" : $"Edit timeline moment: {old?.Title ?? moment.Title}", lines);
            }

            default:
                return ("Change", lines);
        }
    }

    private static Guid? StoryOf(AiChangeWork work, Names names) => work.Proposed switch
    {
        RemoveValues remove => remove.StoryId ?? (work.Resource == AiChangeResource.Story ? work.TargetId : null),
        StoryValues => work.TargetId,
        ChapterValues chapter => chapter.Story.Id,
        SceneValues scene => scene.Story.Id,
        ManuscriptValues manuscript => manuscript.StoryId ?? names.StoryOfScene(manuscript.Scene),
        _ => null,
    };

    private static AiChangeEditable? Editable(object proposed) => proposed switch
    {
        LoreValues lore => new AiChangeEditable(Name: lore.Name, Summary: lore.Summary ?? string.Empty, CanonStatus: lore.CanonStatus),
        StoryValues story => new AiChangeEditable(Title: story.Title, Premise: story.Premise ?? string.Empty),
        ChapterValues chapter => new AiChangeEditable(Title: chapter.Title, Summary: chapter.Summary ?? string.Empty, Notes: chapter.Notes ?? string.Empty),
        SceneValues scene => new AiChangeEditable(Title: scene.Title, Summary: scene.Summary ?? string.Empty, Notes: scene.Notes ?? string.Empty),
        RelationshipValues relationship => new AiChangeEditable(Notes: relationship.Notes ?? string.Empty, CanonStatus: relationship.CanonStatus),
        TimelineValues moment => new AiChangeEditable(Title: moment.Title, Description: moment.Description ?? string.Empty, CanonStatus: moment.CanonStatus),
        ManuscriptValues manuscript => new AiChangeEditable(Text: manuscript.Text),
        _ => null,
    };

    /// <summary>A manuscript change's prose, with the prose stored now while the change still applies to it.</summary>
    private static async Task<AiChangeProse?> ProseAsync(LorexDbContext db, AiChangeWork work, CancellationToken cancellationToken)
    {
        if (work.Proposed is not ManuscriptValues manuscript)
        {
            return null;
        }

        string? current = null;
        if (work.IsPending && !work.IsConflict && manuscript.Scene.Id is { } sceneId)
        {
            current = (await AiChangeSnapshots.ManuscriptAsync(db, sceneId, cancellationToken))!.Value.Content;
        }

        return new AiChangeProse(manuscript.Append, current, manuscript.Text);
    }

    /// <summary>What a removal touches, counted now. Everything it names stays stored and comes back with a restore.</summary>
    private static async Task<AiChangeImpact> ImpactAsync(LorexDbContext db, Guid universeId, AiChangeWork work, CancellationToken cancellationToken)
    {
        var id = work.TargetId!.Value;
        var notes = new List<string> { "It goes to the Trash, not away for good: it can be restored from there with everything it holds." };

        switch (work.Resource)
        {
            case AiChangeResource.LoreEntry:
                var relationships = await db.Relationships.CountAsync(row => row.UniverseId == universeId && row.DeletedAt == null && (row.SourceEntityId == id || row.TargetEntityId == id), cancellationToken);
                var links = await db.EntityFieldValues.CountAsync(value => value.ReferencedEntityId == id && value.Entity!.DeletedAt == null, cancellationToken);
                var scenes = await db.Scenes.CountAsync(scene => scene.DeletedAt == null && (scene.PovEntityId == id || scene.EntityLinks.Any(link => link.EntityId == id)), cancellationToken);
                var moments = await db.TimelineEntryLinks.CountAsync(link => link.EntityId == id && link.TimelineEntry!.DeletedAt == null, cancellationToken);
                if (relationships > 0)
                {
                    notes.Add($"{Count(relationships, "relationship")} are hidden while it's in the Trash, and come back when it's restored.");
                }

                if (links > 0)
                {
                    notes.Add($"{Count(links, "link")} from other entries stay, marked as in the Trash.");
                }

                if (scenes + moments > 0)
                {
                    notes.Add($"It stays linked to {Count(scenes, "scene")} and {Count(moments, "timeline moment")}.");
                }

                break;

            case AiChangeResource.Story:
                var chapters = await db.Chapters.CountAsync(chapter => chapter.StoryId == id && chapter.DeletedAt == null, cancellationToken);
                var told = await db.Scenes.CountAsync(scene => scene.StoryId == id && scene.DeletedAt == null, cancellationToken);
                notes.Add($"Its {Count(chapters, "chapter")} and {Count(told, "scene")}, prose and plot included, go with it and come back with it.");
                break;

            case AiChangeResource.Chapter:
                var held = await db.Scenes.CountAsync(scene => scene.ChapterId == id && scene.DeletedAt == null, cancellationToken);
                notes.Add(held == 0
                    ? "It holds no scenes."
                    : $"Its {Count(held, "scene")} move to Unchaptered, in their order. No scene is removed.");
                break;

            case AiChangeResource.Scene:
                var prose = await db.SceneManuscripts.Where(manuscript => manuscript.SceneId == id).Select(manuscript => manuscript.Content.Length).FirstOrDefaultAsync(cancellationToken);
                notes.Add(prose == 0
                    ? "It has no prose yet."
                    : $"Its prose ({prose.ToString("N0", CultureInfo.InvariantCulture)} characters) and saved versions go with it.");
                break;
        }

        return new AiChangeImpact(notes);
    }

    private static string Count(int count, string noun) => count == 1 ? $"1 {noun}" : $"{count} {noun}s";

    private static string Noun(AiChangeResource resource) => resource switch
    {
        AiChangeResource.LoreEntry => "lore entry",
        AiChangeResource.Story => "story",
        AiChangeResource.Chapter => "chapter",
        AiChangeResource.Scene => "scene",
        _ => "item",
    };

    private static string Canon(CanonStatus status) => status switch
    {
        CanonStatus.Canon => "Canon",
        CanonStatus.Draft => "Draft",
        _ => "Idea",
    };

    private static string? Join(IEnumerable<string>? values) => values?.ToList() is { Count: > 0 } list ? string.Join(", ", list) : null;

    /// <summary>The names a review shows, read once for a proposal and only from its universe.</summary>
    private sealed class Names
    {
        private Dictionary<Guid, string> _types = [];
        private Dictionary<Guid, (string Name, EntityFieldKind Kind, int Order, Dictionary<Guid, string> Options)> _fields = [];
        private Dictionary<Guid, string> _relationshipTypes = [];
        private Dictionary<Guid, string> _entries = [];
        private Dictionary<Guid, string> _stories = [];
        private Dictionary<Guid, string> _chapters = [];
        private Dictionary<Guid, (string Title, Guid StoryId)> _scenes = [];
        private Dictionary<string, AiChangeWork> _pending = [];
        private UniverseChronology _chronology = UniverseChronology.Plain;

        public static async Task<Names> LoadAsync(LorexDbContext db, Guid universeId, List<AiChangeWork> works, CancellationToken cancellationToken)
        {
            var ids = works
                .SelectMany(work => AiChangeChecker.Typed(work).Select(reference => reference.Ref.Id)
                    .Concat(work.Before is null ? [] : AiChangeChecker.Typed(new AiChangeWork { Key = work.Key, Proposed = work.Before }).Select(reference => reference.Ref.Id))
                    .Append(work.TargetId)
                    .Append(work.ResultId))
                .OfType<Guid>()
                .ToHashSet();

            var fields = await db.EntityFieldDefinitions.AsNoTracking()
                .Where(field => field.EntityType!.UniverseId == universeId)
                .Select(field => new { field.Id, field.Name, field.Kind, field.DisplayOrder, Options = field.Options.Select(option => new { option.Id, option.Value }).ToList() })
                .ToListAsync(cancellationToken);

            return new Names
            {
                _types = await db.EntityTypes.AsNoTracking().Where(type => type.UniverseId == universeId).ToDictionaryAsync(type => type.Id, type => type.Name, cancellationToken),
                _fields = fields.ToDictionary(field => field.Id, field => (field.Name, field.Kind, field.DisplayOrder, field.Options.ToDictionary(option => option.Id, option => option.Value))),
                _relationshipTypes = await db.RelationshipTypes.AsNoTracking().Where(type => type.UniverseId == universeId).ToDictionaryAsync(type => type.Id, type => type.Name, cancellationToken),
                _entries = await db.Entities.AsNoTracking().Where(entity => entity.UniverseId == universeId && ids.Contains(entity.Id)).ToDictionaryAsync(entity => entity.Id, entity => entity.Name, cancellationToken),
                _stories = await db.Stories.AsNoTracking().Where(story => story.UniverseId == universeId && ids.Contains(story.Id)).ToDictionaryAsync(story => story.Id, story => story.Title, cancellationToken),
                _chapters = await db.Chapters.AsNoTracking().Where(chapter => chapter.Story!.UniverseId == universeId && ids.Contains(chapter.Id)).ToDictionaryAsync(chapter => chapter.Id, chapter => chapter.Title, cancellationToken),
                _scenes = await db.Scenes.AsNoTracking().Where(scene => scene.Story!.UniverseId == universeId && ids.Contains(scene.Id)).ToDictionaryAsync(scene => scene.Id, scene => (scene.Title, scene.StoryId), cancellationToken),
                _pending = works.ToDictionary(work => work.Key, StringComparer.Ordinal),
                _chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken),
            };
        }

        public string Type(Guid id) => _types.GetValueOrDefault(id) ?? "Unknown type";

        public string Field(Guid id) => _fields.TryGetValue(id, out var field) ? field.Name : "Unknown field";

        public int FieldOrder(Guid id) => _fields.TryGetValue(id, out var field) ? field.Order : int.MaxValue;

        public string RelationshipType(Guid id) => _relationshipTypes.GetValueOrDefault(id) ?? "(unknown kind)";

        public string Entry(AiRef reference) => Named(reference, _entries, work => (work.Proposed as LoreValues)?.Name);

        public string Story(AiRef reference) => Named(reference, _stories, work => (work.Proposed as StoryValues)?.Title);

        public string? Chapter(AiRef? reference) => reference is null ? "Unchaptered" : Named(reference, _chapters, work => (work.Proposed as ChapterValues)?.Title);

        public string Scene(AiRef reference) => reference.Id is { } id
            ? _scenes.TryGetValue(id, out var scene) ? scene.Title : "a scene that isn't here any more"
            : Named(reference, [], work => (work.Proposed as SceneValues)?.Title);

        public Guid? StoryOfScene(AiRef reference) => reference.Id is { } id && _scenes.TryGetValue(id, out var scene) ? scene.StoryId : null;

        /// <summary>An existing item's name, or a create of this proposal's own: "Arin (new)". Once applied, what it made.</summary>
        private string Named(AiRef reference, Dictionary<Guid, string> existing, Func<AiChangeWork, string?> proposed)
        {
            if (reference.Id is { } id)
            {
                return existing.GetValueOrDefault(id) ?? "something that isn't here any more";
            }

            if (reference.Key is { } key && _pending.TryGetValue(key, out var work))
            {
                if (work.ResultId is { } made && existing.TryGetValue(made, out var name))
                {
                    return name;
                }

                return $"{proposed(work) ?? key} (new)";
            }

            return $"\"{reference.Key}\"";
        }

        public string Value(LoreFieldValue value)
        {
            var kind = _fields.TryGetValue(value.FieldId, out var field) ? field.Kind : EntityFieldKind.ShortText;
            return kind switch
            {
                EntityFieldKind.Number when value.Number is { } number => value.EraId is { } era
                    ? _chronology.FormatYear(era, number)
                    : number.ToString(CultureInfo.InvariantCulture),
                EntityFieldKind.Boolean => value.Boolean == true ? "Yes" : "No",
                EntityFieldKind.Date => value.Date?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? string.Empty,
                EntityFieldKind.Select or EntityFieldKind.MultiSelect => string.Join(", ", value.OptionIds.Select(option => field.Options?.GetValueOrDefault(option) ?? "(unknown choice)")),
                EntityFieldKind.EntityReference when value.Entry is { } entry => Entry(entry),
                _ => value.Text ?? string.Empty,
            };
        }

        public string? Point(ChronologyValue? point) => point?.Year is { } year
            ? string.Join(' ', new[]
            {
                point.Day?.ToString(CultureInfo.InvariantCulture),
                point.MonthId is { } month ? _chronology.Month(month)?.Name : point.Month?.ToString(CultureInfo.InvariantCulture),
                _chronology.FormatYear(point.EraId, year),
            }.Where(part => part is not null))
            : null;

        public string When(TimelineValues moment)
        {
            if (moment.DateKind == TimelineDateKind.Unknown || moment.StartYear is null)
            {
                return "Unknown date";
            }

            var start = Point(new ChronologyValue(moment.StartEraId, moment.StartYear, moment.StartMonth, moment.StartDay, moment.StartMonthId));
            var label = moment.EraLabel is null ? string.Empty : $" {moment.EraLabel}";
            return moment.DateKind switch
            {
                TimelineDateKind.Range when moment.EndYear is not null =>
                    $"{start} to {Point(new ChronologyValue(moment.EndEraId, moment.EndYear, moment.EndMonth, moment.EndDay, moment.EndMonthId))}{label}",
                TimelineDateKind.Approximate => $"About {start}{label}",
                _ => $"{start}{label}",
            };
        }
    }
}
