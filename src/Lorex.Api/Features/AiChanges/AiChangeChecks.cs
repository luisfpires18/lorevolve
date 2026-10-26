using System.Text.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.AiChanges;

/// <summary>
/// One operation while it is checked: its normalised values as records, its place among the others, and what is wrong
/// with it. Built from an AI's submission when staging, and from the stored row whenever the proposal is read or approved -
/// the same checks run on both (ADR 0047).
/// </summary>
internal sealed class AiChangeWork
{
    public Guid OperationId { get; init; }

    public required string Key { get; init; }

    public int Sequence { get; init; }

    public AiChangeResource Resource { get; init; }

    public AiChangeAction Action { get; init; }

    public Guid? TargetId { get; set; }

    public int? BaseVersion { get; set; }

    public object? Before { get; set; }

    public required object Proposed { get; set; }

    public AiChangeOperationStatus Status { get; init; }

    public Guid? ResultId { get; init; }

    public List<string> DependsOn { get; set; } = [];

    public List<AiChangeIssue> Issues { get; } = [];

    /// <summary>The target changed after the operation was staged: it can only be rejected.</summary>
    public bool IsConflict { get; set; }

    public bool IsPending => Status == AiChangeOperationStatus.Pending;

    public void Problem(string code, string message, string? field = null) => Issues.Add(new AiChangeIssue(code, message, field));

    public void Problems(Dictionary<string, string[]>? errors)
    {
        foreach (var (field, messages) in errors ?? [])
        {
            foreach (var message in messages)
            {
                Problem(AiChangeCodes.Invalid, message, field);
            }
        }
    }

    public void Conflict(string message)
    {
        IsConflict = true;
        Problem(AiChangeCodes.ChangedSince, message);
    }

    public static AiChangeWork From(AiChangeOperation row) => new()
    {
        OperationId = row.Id,
        Key = row.Key,
        Sequence = row.Sequence,
        Resource = row.Resource,
        Action = row.Action,
        TargetId = row.TargetId,
        BaseVersion = row.BaseVersion,
        Before = row.Before is null ? null : AiChangeJson.ReadBefore(row.Resource, row.Action, row.Before),
        Proposed = AiChangeJson.ReadProposed(row.Resource, row.Action, row.Proposed),
        Status = row.Status,
        ResultId = row.ResultId,
        DependsOn = JsonSerializer.Deserialize<List<string>>(row.DependsOn, AiChangeJson.Options) ?? [],
    };
}

/// <summary>The stable codes an issue carries, so a client or an AI never matches prose.</summary>
public static class AiChangeCodes
{
    public const string Invalid = "invalid";
    public const string NotFound = "not_found";
    public const string Trashed = "in_trash";
    public const string ChangedSince = "changed_since";
    public const string Duplicate = "duplicate";
    public const string NeedsRejected = "needs_rejected_change";
    public const string UnknownRef = "unknown_ref";
    public const string WrongRef = "wrong_ref";
    public const string Cycle = "circular_refs";
    public const string NotAllowed = "not_allowed";
    public const string Unsupported = "unsupported";
    public const string TooLarge = "too_large";

    /// <summary>A picture change whose file the person has not uploaded in LoreX yet: it waits, and can't be approved until then.</summary>
    public const string AwaitingUpload = "awaiting_upload";

    // ---------- The refusals of the review routes ----------
    public const string ProposalChanged = "ai_change_proposal_changed";
    public const string AlreadyDecided = "ai_change_already_decided";
    public const string ApprovalMismatch = "ai_change_approval_id_reused";
    public const string NotOpen = "ai_change_not_open";
    public const string MissingDependency = "ai_change_missing_dependency";
    public const string CannotApprove = "ai_change_cannot_approve";
    public const string CommitRefused = "ai_change_commit_refused";
    public const string Blocked = "ai_change_blocked";
}

/// <summary>How the values are written to their JSON columns and read back: this feature's own records, nothing else.</summary>
internal static class AiChangeJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static string Write(object value) => JsonSerializer.Serialize(value, value.GetType(), Options);

    public static object ReadProposed(AiChangeResource resource, AiChangeAction action, string json) =>
        action switch
        {
            AiChangeAction.Remove => Read<RemoveValues>(json),
            AiChangeAction.Reorder => Read<OrderValues>(json),
            _ => resource switch
            {
                AiChangeResource.LoreEntry => Read<LoreValues>(json),
                AiChangeResource.Relationship => Read<RelationshipValues>(json),
                AiChangeResource.Story => Read<StoryValues>(json),
                AiChangeResource.Chapter => Read<ChapterValues>(json),
                AiChangeResource.Scene => Read<SceneValues>(json),
                AiChangeResource.Manuscript => Read<ManuscriptValues>(json),
                AiChangeResource.Article => Read<ArticleValues>(json),
                AiChangeResource.PlotArc => Read<PlotArcValues>(json),
                AiChangeResource.PlotBeat => Read<PlotBeatValues>(json),
                AiChangeResource.WorldRule => Read<WorldRuleValues>(json),
                AiChangeResource.Idea => Read<IdeaValues>(json),
                AiChangeResource.LoreType => Read<TypeValues>(json),
                AiChangeResource.LoreField => Read<FieldValues>(json),
                AiChangeResource.LoreGroup => Read<GroupValues>(json),
                AiChangeResource.RelationshipType => Read<RelationshipKindValues>(json),
                AiChangeResource.Chronology => Read<ChronologyValues>(json),
                AiChangeResource.ValidationTerm => Read<TermValues>(json),
                AiChangeResource.Progression => Read<ProgressionValues>(json),
                AiChangeResource.Media => Read<MediaValues>(json),
                _ => Read<TimelineValues>(json),
            },
        };

    public static object ReadBefore(AiChangeResource resource, AiChangeAction action, string json) => (resource, action) switch
    {
        (_, AiChangeAction.Reorder) => Read<OrderValues>(json),
        (AiChangeResource.LoreEntry, _) => Read<LoreValues>(json),
        (AiChangeResource.Relationship, _) => Read<RelationshipValues>(json),
        (AiChangeResource.Story, _) => Read<StoryValues>(json),
        (AiChangeResource.Chapter, _) => Read<ChapterValues>(json),
        (AiChangeResource.Scene, _) => Read<SceneValues>(json),
        (AiChangeResource.TimelineEvent, _) => Read<TimelineValues>(json),
        (AiChangeResource.PlotArc, _) => Read<PlotArcValues>(json),
        (AiChangeResource.PlotBeat, _) => Read<PlotBeatValues>(json),
        (AiChangeResource.WorldRule, _) => Read<WorldRuleValues>(json),
        (AiChangeResource.Idea, _) => Read<IdeaValues>(json),
        (AiChangeResource.LoreType, _) => Read<TypeValues>(json),
        (AiChangeResource.LoreField, _) => Read<FieldValues>(json),
        (AiChangeResource.LoreGroup, _) => Read<GroupValues>(json),
        (AiChangeResource.RelationshipType, _) => Read<RelationshipKindValues>(json),
        (AiChangeResource.Chronology, _) => Read<ChronologyValues>(json),
        (AiChangeResource.ValidationTerm, _) => Read<TermValues>(json),
        (AiChangeResource.Progression, _) => Read<Progression.ProgressionSnapshot>(json),
        _ => throw new InvalidOperationException($"A {resource} change keeps no stored form."),
    };

    private static T Read<T>(string json) => JsonSerializer.Deserialize<T>(json, Options)
        ?? throw new InvalidOperationException("A stored AI change could not be read.");
}

/// <summary>
/// The forms of existing content as an AI change reads them: one record per resource, built from what is stored now, with
/// every list in a fixed order - so a form read twice is equal exactly when nothing it shows was changed in between.
/// That equality is the only edit check chapters, relationships and moments have (they carry no edit version, ADR 0043).
/// </summary>
internal static partial class AiChangeSnapshots
{
    public static async Task<(LoreValues Form, int Version)?> LoreAsync(LorexDbContext db, Guid universeId, Guid entityId, CancellationToken cancellationToken)
    {
        var detail = await EntityEndpoints.LoadDetailAsync(db, universeId, entityId, cancellationToken, liveOnly: true);
        if (detail is null)
        {
            return null;
        }

        var fields = detail.Fields
            .Select(field => new LoreFieldValue(
                field.FieldDefinitionId,
                field.Text,
                field.Number,
                field.Boolean,
                field.Date,
                [.. field.OptionIds.Order()],
                field.ReferencedEntityId is { } linked ? AiRef.To(linked) : null,
                field.EraId))
            .OrderBy(field => field.FieldId)
            .ToList();

        return (new LoreValues(
            detail.EntityTypeId,
            detail.Name,
            detail.Summary,
            detail.CanonStatus,
            [.. detail.Aliases.Order(StringComparer.Ordinal)],
            [.. detail.Tags.Order(StringComparer.Ordinal)],
            fields), detail.Version);
    }

    public static Task<RelationshipValues?> RelationshipAsync(LorexDbContext db, Guid universeId, Guid relationshipId, CancellationToken cancellationToken) =>
        db.Relationships.AsNoTracking()
            .Where(row => row.Id == relationshipId
                && row.UniverseId == universeId
                && row.DeletedAt == null
                && row.SourceEntity!.DeletedAt == null
                && row.TargetEntity!.DeletedAt == null)
            .Select(row => new RelationshipValues(
                row.RelationshipTypeId,
                new AiRef(row.SourceEntityId, null),
                new AiRef(row.TargetEntityId, null),
                row.CanonStatus,
                row.StartDate,
                row.EndDate,
                row.Notes))
            .FirstOrDefaultAsync(cancellationToken);

    public static async Task<(StoryValues Form, int Version)?> StoryAsync(LorexDbContext db, Guid universeId, Guid storyId, CancellationToken cancellationToken)
    {
        var story = await db.Stories.AsNoTracking()
            .Where(row => row.Id == storyId && row.UniverseId == universeId && row.DeletedAt == null)
            .Select(row => new { Form = new StoryValues(row.Title, row.Premise, row.Status), row.Version })
            .FirstOrDefaultAsync(cancellationToken);
        return story is null ? null : (story.Form, story.Version);
    }

    public static Task<ChapterValues?> ChapterAsync(LorexDbContext db, Guid universeId, Guid chapterId, CancellationToken cancellationToken) =>
        db.Chapters.AsNoTracking()
            .Where(row => row.Id == chapterId
                && row.DeletedAt == null
                && row.Story!.UniverseId == universeId
                && row.Story.DeletedAt == null)
            .Select(row => new ChapterValues(new AiRef(row.StoryId, null), row.Title, row.Summary, row.Notes))
            .FirstOrDefaultAsync(cancellationToken);

    public static async Task<(SceneValues Form, int Version)?> SceneAsync(LorexDbContext db, Guid universeId, Guid sceneId, CancellationToken cancellationToken)
    {
        var row = await db.Scenes.AsNoTracking()
            .Where(scene => scene.Id == sceneId
                && scene.DeletedAt == null
                && scene.Story!.UniverseId == universeId
                && scene.Story.DeletedAt == null)
            .Select(scene => new
            {
                scene.StoryId,
                scene.ChapterId,
                scene.Title,
                scene.Summary,
                scene.Notes,
                scene.PovEntityId,
                scene.EraId,
                scene.Year,
                scene.Month,
                scene.MonthId,
                scene.Day,
                Lore = scene.EntityLinks.Select(link => link.EntityId).ToList(),
                scene.Version,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        return (new SceneValues(
            AiRef.To(row.StoryId),
            row.ChapterId is { } chapter ? AiRef.To(chapter) : null,
            row.Title,
            row.Summary,
            row.Notes,
            row.PovEntityId is { } pov ? AiRef.To(pov) : null,
            row.Year is null ? null : new ChronologyValue(row.EraId, row.Year, row.Month, row.Day, row.MonthId),
            [.. row.Lore.Order().Select(AiRef.To)]), row.Version);
    }

    public static async Task<TimelineValues?> MomentAsync(LorexDbContext db, Guid universeId, Guid entryId, CancellationToken cancellationToken)
    {
        var row = await db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.Id == entryId && entry.UniverseId == universeId && entry.DeletedAt == null)
            .Select(entry => new
            {
                entry.Title,
                entry.Description,
                entry.CanonStatus,
                entry.DateKind,
                entry.StartYear,
                entry.StartMonth,
                entry.StartDay,
                entry.EndYear,
                entry.EndMonth,
                entry.EndDay,
                entry.EraLabel,
                entry.StartEraId,
                entry.EndEraId,
                entry.StartMonthId,
                entry.EndMonthId,
                Participants = entry.EntityLinks.Select(link => link.EntityId).ToList(),
                Stories = entry.StoryLinks.Select(link => link.StoryId).ToList(),
                HasDetails = entry.Validation != null,
                EventKindId = entry.Validation != null ? entry.Validation.EventKindTermId : null,
                MethodId = entry.Validation != null ? entry.Validation.MethodTermId : null,
                ParticipantId = entry.Validation != null ? entry.Validation.ParticipantEntityId : null,
            })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? null
            : new TimelineValues(
                row.Title,
                row.Description,
                row.CanonStatus,
                row.DateKind,
                row.StartYear,
                row.StartMonth,
                row.StartDay,
                row.EndYear,
                row.EndMonth,
                row.EndDay,
                row.EraLabel,
                row.StartEraId,
                row.EndEraId,
                row.StartMonthId,
                row.EndMonthId,
                [.. row.Participants.Order().Select(AiRef.To)],
                [.. row.Stories.Order().Select(AiRef.To)],
                row.HasDetails
                    ? new MomentDetailsValues(row.EventKindId, row.MethodId, row.ParticipantId is { } participant ? AiRef.To(participant) : null)
                    : null);
    }

    /// <summary>
    /// Whether a moment is as a change staged over it found it. A change stored before issue 45 holds no stories or details
    /// (ADR 0048): it is compared, and applied, without them.
    /// </summary>
    public static bool SameMoment(TimelineValues stored, TimelineValues? before) =>
        before is not null && Same(before.Stories is null ? stored with { Stories = null, Details = null } : stored, before);

    public static async Task<(string Content, int Version)?> ManuscriptAsync(LorexDbContext db, Guid sceneId, CancellationToken cancellationToken)
    {
        var row = await db.SceneManuscripts.AsNoTracking()
            .Where(manuscript => manuscript.SceneId == sceneId)
            .Select(manuscript => new { manuscript.Content, manuscript.Version })
            .FirstOrDefaultAsync(cancellationToken);
        return row is null ? (string.Empty, 0) : (row.Content, row.Version);
    }

    /// <summary>Whether two forms say the same thing: compared as their JSON, which every list above writes in a fixed order.</summary>
    public static bool Same(object? first, object? second) =>
        first is not null && second is not null && AiChangeJson.Write(first) == AiChangeJson.Write(second);
}

/// <summary>
/// Who may stage and who may apply which change - the universe's own permission matrix (ADR 0041), never a rule of this
/// feature's. An owner or Editor stages and approves what their role writes. A Reviewer stages only what Suggested Changes
/// already lets them propose (ADR 0044): edits to an entry, a story or a scene. A Viewer stages nothing.
///
/// An idea is account data, not universe content (ADR 0030): only the universe's owner keeps ideas in it, so only the owner
/// stages or approves an idea change, and only over their own ideas (ADR 0048). No collaborator role reaches one.
/// </summary>
internal static class AiChangePermissions
{
    public static UniverseCapability ToApply(AiChangeAction action) =>
        action == AiChangeAction.Remove ? UniverseCapability.ManageTrash : UniverseCapability.EditContent;

    /// <summary>
    /// A definition rather than content (ADR 0062): staged only where schema proposing was allowed, never beside content, and
    /// only by a role that edits types by hand - a Reviewer's suggestions never reach the schema.
    /// </summary>
    public static bool IsSchema(AiChangeResource resource) =>
        resource is AiChangeResource.LoreType or AiChangeResource.LoreField or AiChangeResource.LoreGroup
            or AiChangeResource.RelationshipType or AiChangeResource.Chronology or AiChangeResource.ValidationTerm;

    public static bool MayStage(UniverseRole role, AiChangeResource resource, AiChangeAction action) =>
        resource == AiChangeResource.Idea
            ? role == UniverseRole.Owner
            : IsSchema(resource)
                ? UniverseAccess.Allows(role, UniverseCapability.EditContent)
            : UniverseAccess.Allows(role, ToApply(action))
                || (action == AiChangeAction.Update
                    && resource is AiChangeResource.LoreEntry or AiChangeResource.Story or AiChangeResource.Scene
                    && UniverseAccess.Allows(role, UniverseCapability.SuggestChanges));

    /// <summary>Whether a role can stage anything at all: what an AI's propose tools and the consent screen ask first.</summary>
    public static bool MayStageAnything(UniverseRole role) =>
        UniverseAccess.Allows(role, UniverseCapability.EditContent) || UniverseAccess.Allows(role, UniverseCapability.SuggestChanges);

    public static bool MayApprove(UniverseRole role, AiChangeResource resource, AiChangeAction action) =>
        resource == AiChangeResource.Idea ? role == UniverseRole.Owner
            : IsSchema(resource) ? UniverseAccess.Allows(role, UniverseCapability.EditContent)
            : UniverseAccess.Allows(role, ToApply(action));

    /// <summary>Reads every proposal in the universe, and edits and rejects their changes: the people who could approve them.</summary>
    public static bool MayReview(UniverseRole role) => UniverseAccess.Allows(role, UniverseCapability.EditContent);
}

/// <summary>
/// The checks every pending operation passes before it is staged, every time its proposal is read, and again inside the
/// approval's own transaction: the same checks each resource's save makes - its own validators, its references re-resolved
/// inside this universe - plus what a batch needs: references to other changes of the proposal, of the right kind and
/// not rejected; no duplicates inside the batch; and, for a change to something that already exists, that nothing saved
/// it since the change was staged. Reads only. The save path itself checks everything once more when it runs.
///
/// <paramref name="proposerId"/> is the account the proposal was staged for: an idea change is held to that account's own
/// ideas, and to that account still owning the universe (ADR 0048).
/// </summary>
internal sealed partial class AiChangeChecker(LorexDbContext db, Guid universeId, string proposerId)
{
    private readonly Dictionary<string, AiChangeWork> _byKey = new(StringComparer.Ordinal);

    private UniverseChronology? _chronology;

    private Dictionary<Guid, (Guid TypeId, bool Trashed)> _entities = [];

    private Dictionary<Guid, (string Name, List<EntityFieldDefinition> Fields)> _types = [];

    private Dictionary<Guid, bool> _relationshipTypes = [];

    private Dictionary<Guid, bool> _stories = [];

    private Dictionary<Guid, (Guid StoryId, bool Trashed)> _chapters = [];

    private Dictionary<Guid, (Guid StoryId, bool Trashed)> _scenes = [];

    private HashSet<(Guid GroupId, Guid TypeId)> _groupMembers = [];

    private Dictionary<Guid, (Guid StoryId, bool Trashed)> _arcs = [];

    private Dictionary<Guid, (Guid ArcId, Guid StoryId, bool Trashed)> _beats = [];

    public async Task CheckAsync(IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        _byKey.Clear();
        foreach (var work in works)
        {
            _byKey.TryAdd(work.Key, work);
        }

        await LoadAsync(works, cancellationToken);
        if (works.Any(work => AiChangePermissions.IsSchema(work.Resource)))
        {
            await LoadSchemaAsync(cancellationToken);
        }

        foreach (var work in works.Where(work => work.IsPending))
        {
            work.DependsOn = [.. References(work).Select(reference => reference.Key).OfType<string>().Distinct(StringComparer.Ordinal)];
            CheckReferences(work);

            switch (work.Resource, work.Action)
            {
                case (_, AiChangeAction.Remove):
                    await CheckRemoveAsync(work, cancellationToken);
                    break;
                case (_, AiChangeAction.Reorder):
                    await CheckOrderAsync(work, works, cancellationToken);
                    break;
                case (AiChangeResource.Article, _):
                    await CheckArticleAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.PlotArc, _):
                    await CheckPlotArcAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.PlotBeat, _):
                    await CheckPlotBeatAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.WorldRule, _):
                    await CheckWorldRuleAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.Idea, _):
                    await CheckIdeaAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.LoreType, _):
                    await CheckLoreTypeAsync(work, works, cancellationToken);
                    break;
                case (AiChangeResource.LoreField, _):
                    await CheckLoreFieldAsync(work, works, cancellationToken);
                    break;
                case (AiChangeResource.LoreGroup, _):
                    await CheckLoreGroupAsync(work, works, cancellationToken);
                    break;
                case (AiChangeResource.RelationshipType, _):
                    await CheckRelationshipKindAsync(work, works, cancellationToken);
                    break;
                case (AiChangeResource.Chronology, _):
                    await CheckChronologyAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.ValidationTerm, _):
                    await CheckTermAsync(work, works, cancellationToken);
                    break;
                case (AiChangeResource.Progression, _):
                    await CheckProgressionAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.Media, _):
                    await CheckMediaAsync(work, works, cancellationToken);
                    break;
                case (AiChangeResource.LoreEntry, _):
                    await CheckLoreAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.Relationship, _):
                    await CheckRelationshipAsync(work, works, cancellationToken);
                    break;
                case (AiChangeResource.Story, _):
                    await CheckStoryAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.Chapter, _):
                    await CheckChapterAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.Scene, _):
                    await CheckSceneAsync(work, cancellationToken);
                    break;
                case (AiChangeResource.Manuscript, _):
                    await CheckManuscriptAsync(work, cancellationToken);
                    break;
                default:
                    await CheckMomentAsync(work, cancellationToken);
                    break;
            }
        }

        CheckCycles(works);
        CheckTargets(works);
    }

    /// <summary>
    /// One change per existing item in a proposal: a second edit of something would be refused by the first one's new version,
    /// so they are combined before staging, not discovered at approval.
    /// </summary>
    private static void CheckTargets(IReadOnlyList<AiChangeWork> works)
    {
        var seen = new HashSet<(AiChangeResource, Guid)>();
        foreach (var work in works.Where(work => work.IsPending && work.Action is AiChangeAction.Update or AiChangeAction.Remove && work.TargetId is not null).OrderBy(work => work.Sequence))
        {
            if (!seen.Add((work.Resource, work.TargetId!.Value)))
            {
                work.Problem(AiChangeCodes.Duplicate, "Another change in this proposal already changes this. Put both in one change.");
            }
        }
    }

    // ---------- References ----------

    /// <summary>Every reference an operation's values make, with the kind of thing each must be.</summary>
    internal static IEnumerable<(AiRef Ref, AiChangeResource Kind, string Field)> Typed(AiChangeWork work) => work.Proposed switch
    {
        LoreValues lore => lore.Fields.Where(field => field.Entry is not null)
            .Select(field => (field.Entry!, AiChangeResource.LoreEntry, $"fields.{field.FieldId}")),
        RelationshipValues relationship =>
        [
            (relationship.Source, AiChangeResource.LoreEntry, "source"),
            (relationship.Target, AiChangeResource.LoreEntry, "target"),
        ],
        ChapterValues chapter => [(chapter.Story, AiChangeResource.Story, "story")],
        SceneValues scene =>
        [
            (scene.Story, AiChangeResource.Story, "story"),
            .. scene.Chapter is { } chapter ? [(chapter, AiChangeResource.Chapter, "chapter")] : Array.Empty<(AiRef, AiChangeResource, string)>(),
            .. scene.PointOfView is { } pov ? [(pov, AiChangeResource.LoreEntry, "pointOfView")] : Array.Empty<(AiRef, AiChangeResource, string)>(),
            .. scene.Lore.Select(lore => (lore, AiChangeResource.LoreEntry, "lore")),
        ],
        ManuscriptValues manuscript => [(manuscript.Scene, AiChangeResource.Scene, "scene")],
        TimelineValues moment =>
        [
            .. moment.Participants.Select(participant => (participant, AiChangeResource.LoreEntry, "participants")),
            .. (moment.Stories ?? []).Select(story => (story, AiChangeResource.Story, "stories")),
            .. moment.Details?.Participant is { } participant ? [(participant, AiChangeResource.LoreEntry, "details.participant")] : Array.Empty<(AiRef, AiChangeResource, string)>(),
        ],
        ArticleValues article => [(article.Entry, AiChangeResource.LoreEntry, "entry")],
        PlotArcValues arc => [(arc.Story, AiChangeResource.Story, "story")],
        PlotBeatValues beat =>
        [
            (beat.Arc, AiChangeResource.PlotArc, "arc"),
            .. beat.Scenes.Select(scene => (scene, AiChangeResource.Scene, "scenes")),
            .. beat.Lore.Select(lore => (lore, AiChangeResource.LoreEntry, "lore")),
        ],
        IdeaValues idea => idea.References.Select(reference => (reference.Target, IdeaKind(reference.Kind), "references")),
        MediaValues media => [(AiRef.To(media.EntityId), AiChangeResource.LoreEntry, "entry")],
        TypeValues type =>
        [
            .. type.Parent is { } parent ? [(parent, AiChangeResource.LoreType, "parent")] : Array.Empty<(AiRef, AiChangeResource, string)>(),
            .. type.Groups.Select(group => (group, AiChangeResource.LoreGroup, "groups")),
        ],
        FieldValues field =>
        [
            (field.Type, AiChangeResource.LoreType, "type"),
            .. field.TargetType is { } linksToType ? [(linksToType, AiChangeResource.LoreType, "linksToType")] : Array.Empty<(AiRef, AiChangeResource, string)>(),
            .. field.TargetGroup is { } linksToGroup ? [(linksToGroup, AiChangeResource.LoreGroup, "linksToGroup")] : Array.Empty<(AiRef, AiChangeResource, string)>(),
        ],
        OrderValues order =>
        [
            (order.Story, AiChangeResource.Story, "story"),
            .. order.Chapter is { } chapter ? [(chapter, AiChangeResource.Chapter, "chapter")] : Array.Empty<(AiRef, AiChangeResource, string)>(),
            .. order.Arc is { } arc ? [(arc, AiChangeResource.PlotArc, "arc")] : Array.Empty<(AiRef, AiChangeResource, string)>(),
            .. order.Items.Select(item => (item, work.Resource, "items")),
        ],
        _ => [],
    };

    /// <summary>The kind of change that creates what an idea reference names.</summary>
    internal static AiChangeResource IdeaKind(Ideas.IdeaReferenceKind kind) => kind switch
    {
        Ideas.IdeaReferenceKind.Story => AiChangeResource.Story,
        Ideas.IdeaReferenceKind.Scene => AiChangeResource.Scene,
        Ideas.IdeaReferenceKind.PlotArc => AiChangeResource.PlotArc,
        Ideas.IdeaReferenceKind.PlotBeat => AiChangeResource.PlotBeat,
        _ => AiChangeResource.LoreEntry,
    };

    private static IEnumerable<AiRef> References(AiChangeWork work) => Typed(work).Select(reference => reference.Ref);

    /// <summary>
    /// A reference to another change must name a create of the right kind in this proposal, that is not rejected. One to
    /// a change already applied stands for what it made, and is checked like any existing id.
    /// </summary>
    private void CheckReferences(AiChangeWork work)
    {
        foreach (var (reference, kind, field) in Typed(work))
        {
            if (reference.Key is not { } key)
            {
                continue;
            }

            if (!_byKey.TryGetValue(key, out var other) || other == work)
            {
                work.Problem(AiChangeCodes.UnknownRef, $"This refers to \"{key}\", which is not another change in this proposal.", field);
            }
            else if (other.Resource != kind || other.Action != AiChangeAction.Create)
            {
                work.Problem(AiChangeCodes.WrongRef, $"This refers to \"{key}\", which doesn't create {Article(kind)}.", field);
            }
            else if (other.Status == AiChangeOperationStatus.Rejected)
            {
                work.Problem(AiChangeCodes.NeedsRejected, $"This needs \"{key}\", which was rejected.", field);
            }
        }
    }

    /// <summary>What a reference stands for now: an existing id (given, or made by an applied change), or a pending create.</summary>
    private (Guid? Id, AiChangeWork? Pending) Resolve(AiRef reference)
    {
        if (reference.Id is { } id)
        {
            return (id, null);
        }

        return reference.Key is { } key && _byKey.TryGetValue(key, out var other)
            ? other.Status == AiChangeOperationStatus.Committed ? (other.ResultId, null) : (null, other)
            : (null, null);
    }

    /// <summary>
    /// A reference to a lore entry, checked: an existing one of this universe, live - or kept, when the stored form already
    /// held it - or one this proposal creates. The entry's type when it is known, for link fields limited to a type or group.
    /// </summary>
    private Guid? CheckEntry(AiChangeWork work, AiRef reference, string field, HashSet<Guid>? kept = null)
    {
        var (id, pending) = Resolve(reference);
        if (pending is not null)
        {
            return (pending.Proposed as LoreValues)?.TypeId;
        }

        if (id is not { } existing)
        {
            return null;
        }

        if (!_entities.TryGetValue(existing, out var entity))
        {
            work.Problem(AiChangeCodes.NotFound, "That lore entry isn't in this universe.", field);
            return null;
        }

        if (entity.Trashed && kept?.Contains(existing) != true)
        {
            work.Problem(AiChangeCodes.Trashed, "That lore entry is in the Trash. Restore it before linking it.", field);
        }

        return entity.TypeId;
    }

    /// <summary>A reference to a story: an existing live story of this universe, or one this proposal creates.</summary>
    private void CheckStory(AiChangeWork work, AiRef reference, string field)
    {
        var (id, _) = Resolve(reference);
        if (id is { } existing && _stories.GetValueOrDefault(existing, true))
        {
            work.Problem(AiChangeCodes.NotFound, "That story isn't in this universe, or it is in the Trash.", field);
        }
    }

    // ---------- Each resource ----------

    private async Task CheckLoreAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var lore = (LoreValues)work.Proposed;
        Guid entityId = Guid.Empty;

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.LoreAsync(db, universeId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "This lore entry isn't in this universe any more. It may be in the Trash.");
                return;
            }

            if (stored.Version != work.BaseVersion)
            {
                work.Conflict("Someone saved this entry after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }

            if (stored.Form.TypeId != lore.TypeId)
            {
                work.Problem(AiChangeCodes.Unsupported, "An AI change can't move an entry to another type.");
            }

            entityId = work.TargetId.Value;
        }

        var request = new EntityRequest(lore.TypeId, lore.Name, lore.Summary, lore.CanonStatus, lore.Aliases, lore.Tags, null);
        work.Problems(LoreValidation.ValidateEntity(request));

        if (!_types.TryGetValue(lore.TypeId, out var type))
        {
            work.Problem(AiChangeCodes.NotFound, "Choose a lore type from this universe.", "typeId");
            return;
        }

        var active = type.Fields.ToDictionary(definition => definition.Id);
        var pendingLinks = new HashSet<Guid>();
        var keptLinks = work.Before is LoreValues before
            ? before.Fields.Select(value => value.Entry?.Id).OfType<Guid>().ToHashSet()
            : [];
        var inputs = new List<FieldValueInput>();

        foreach (var value in lore.Fields)
        {
            if (!active.TryGetValue(value.FieldId, out var definition))
            {
                work.Problem(AiChangeCodes.NotFound, "That field isn't one of this type's fields. Choose fields from get_change_options.", $"fields.{value.FieldId}");
                continue;
            }

            // A value in the wrong member would be dropped by the save without a word; it is refused here instead.
            if (Mismatch(definition, value) is { } wrong)
            {
                work.Problem(AiChangeCodes.Invalid, wrong, $"fields.{value.FieldId}");
                continue;
            }

            if (value.Entry is { } link)
            {
                var linkedType = CheckEntry(work, link, $"fields.{value.FieldId}", keptLinks);
                if (linkedType is { } typeId && !Accepts(definition, typeId))
                {
                    work.Problem(AiChangeCodes.Invalid, $"{definition.Name} can't link to an entry of that type.", $"fields.{value.FieldId}");
                }

                if (Resolve(link) is { Id: { } linkedId })
                {
                    inputs.Add(new FieldValueInput(value.FieldId, null, null, null, null, null, linkedId));
                }
                else
                {
                    pendingLinks.Add(value.FieldId);
                }

                continue;
            }

            inputs.Add(new FieldValueInput(value.FieldId, value.Text, value.Number, value.Boolean, value.Date, value.OptionIds, null, value.EraId));
        }

        // The save's own preparation of the values: kinds, options, eras, required fields. A field filled by an entry this
        // proposal creates is checked above instead, so its "required" is satisfied here.
        var (_, _, errors) = await EntityEndpoints.PrepareFieldValuesAsync(db, universeId, entityId, request with { Fields = inputs }, cancellationToken);
        foreach (var (field, messages) in errors)
        {
            if (!Guid.TryParse(field, out var fieldId) || !pendingLinks.Contains(fieldId))
            {
                foreach (var message in messages)
                {
                    work.Problem(AiChangeCodes.Invalid, message, $"fields.{field}");
                }
            }
        }
    }

    /// <summary>
    /// What is wrong with a value's shape for its field, or null: exactly the member its kind reads is set, choices are the
    /// field's own and a single choice is one.
    /// </summary>
    private static string? Mismatch(EntityFieldDefinition definition, LoreFieldValue value)
    {
        var text = value.Text is not null;
        var number = value.Number is not null;
        var flag = value.Boolean is not null;
        var date = value.Date is not null;
        var options = value.OptionIds.Count > 0;
        var entry = value.Entry is not null;
        var set = new[] { text, number, flag, date, options, entry }.Count(member => member);

        var (wanted, member) = definition.Kind switch
        {
            EntityFieldKind.ShortText or EntityFieldKind.LongText => (text, "text"),
            EntityFieldKind.Number => (number, "number"),
            EntityFieldKind.Boolean => (flag, "boolean"),
            EntityFieldKind.Date => (date, "date"),
            EntityFieldKind.Select or EntityFieldKind.MultiSelect => (options, "optionIds"),
            _ => (entry, "entry"),
        };

        if (!wanted || set != 1)
        {
            return $"{definition.Name} takes its value in {member}, and nothing else.";
        }

        if (value.EraId is not null && definition.Kind != EntityFieldKind.Number)
        {
            return $"{definition.Name} isn't a number, so it has no date period.";
        }

        var allowed = definition.Options.Select(option => option.Id).ToHashSet();
        if (options && value.OptionIds.Any(option => !allowed.Contains(option)))
        {
            return $"That isn't one of {definition.Name}'s choices. Choose from get_change_options.";
        }

        return definition.Kind == EntityFieldKind.Select && value.OptionIds.Count > 1
            ? $"{definition.Name} takes one choice."
            : null;
    }

    /// <summary>
    /// Whether a link field accepts an entry of this type, by the save's own rule: any type, its type or one nested beneath it,
    /// or a type in its group.
    /// </summary>
    private bool Accepts(EntityFieldDefinition definition, Guid typeId) =>
        EntityEndpoints.LinkAllows(definition.TargetEntityTypeId, definition.TargetGroupId, typeId, _typeParents, _groupMembers);

    private async Task CheckRelationshipAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var relationship = (RelationshipValues)work.Proposed;

        if (work.Action == AiChangeAction.Update)
        {
            var stored = await AiChangeSnapshots.RelationshipAsync(db, universeId, work.TargetId!.Value, cancellationToken);
            if (stored is null)
            {
                work.Problem(AiChangeCodes.NotFound, "This relationship isn't in this universe any more, or one of its entries is in the Trash.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone changed this relationship after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }
        }

        if (!_relationshipTypes.ContainsKey(relationship.TypeId))
        {
            work.Problem(AiChangeCodes.NotFound, "Choose a relationship type from this universe.", "typeId");
        }

        CheckEntry(work, relationship.Source, "source");
        CheckEntry(work, relationship.Target, "target");

        if (relationship.Source == relationship.Target)
        {
            work.Problem(AiChangeCodes.Invalid, "Relate two different entries.", "target");
        }

        // The save's own shape checks, with the two ends as they will be.
        work.Problems(RelationshipValidation.ValidateRelationship(new RelationshipRequest(
            relationship.TypeId, Guid.NewGuid(), Guid.NewGuid(), relationship.CanonStatus, relationship.StartDate, relationship.EndDate, relationship.Notes)));

        // A link that moves an end keeps its periods (Issue #18): one naming an era of the end it leaves would refuse the
        // commit, so it is said here, where the author can still change the link in LoreX first.
        if (work.Action == AiChangeAction.Update && work.TargetId is { } moving
            && Resolve(relationship.Source).Id is { } newSource && Resolve(relationship.Target).Id is { } newTarget
            && await db.RelationshipPeriods.AsNoTracking().AnyAsync(
                period => period.RelationshipId == moving
                    && period.EntityEraId != null
                    && period.EntityEra!.EntityId != newSource
                    && period.EntityEra.EntityId != newTarget,
                cancellationToken))
        {
            work.Problem(
                AiChangeCodes.Invalid,
                "This relationship holds during an era of an entry it would no longer connect. Change that period in LoreX first.",
                "source");
        }

        var symmetric = _relationshipTypes.GetValueOrDefault(relationship.TypeId);
        if (Resolve(relationship.Source).Id is { } source && Resolve(relationship.Target).Id is { } target
            && _relationshipTypes.ContainsKey(relationship.TypeId)
            && await RelationshipEndpoints.FindDuplicateAsync(
                db,
                universeId,
                new RelationshipRequest(relationship.TypeId, source, target, relationship.CanonStatus, null, null, null),
                work.Action == AiChangeAction.Update ? work.TargetId : null,
                cancellationToken) is not null)
        {
            work.Problem(AiChangeCodes.Duplicate, "This relationship already exists.");
        }

        // The same link twice in one proposal would be refused on its second commit; say so before.
        if (works.Any(other => other != work
                && other.IsPending
                && other.Sequence < work.Sequence
                && other.Resource == AiChangeResource.Relationship
                && other.Proposed is RelationshipValues earlier
                && earlier.TypeId == relationship.TypeId
                && ((earlier.Source == relationship.Source && earlier.Target == relationship.Target)
                    || (symmetric && earlier.Source == relationship.Target && earlier.Target == relationship.Source))))
        {
            work.Problem(AiChangeCodes.Duplicate, "Another change in this proposal makes the same relationship.");
        }
    }

    private async Task CheckStoryAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var story = (StoryValues)work.Proposed;

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.StoryAsync(db, universeId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "This story isn't in this universe any more. It may be in the Trash.");
                return;
            }

            if (stored.Version != work.BaseVersion)
            {
                work.Conflict("Someone saved this story after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }
        }

        work.Problems(StoryValidation.ValidateStory(new StoryRequest(story.Title, story.Premise, story.Status)));
    }

    private async Task CheckChapterAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var chapter = (ChapterValues)work.Proposed;

        if (work.Action == AiChangeAction.Update)
        {
            var stored = await AiChangeSnapshots.ChapterAsync(db, universeId, work.TargetId!.Value, cancellationToken);
            if (stored is null)
            {
                work.Problem(AiChangeCodes.NotFound, "This chapter isn't in this universe any more. It may be in the Trash.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone changed this chapter after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }
        }
        else
        {
            CheckStory(work, chapter.Story, "story");
        }

        work.Problems(StoryValidation.ValidateChapter(new ChapterRequest(chapter.Title, chapter.Summary, chapter.Notes)));
    }

    private async Task CheckSceneAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var scene = (SceneValues)work.Proposed;
        var kept = new HashSet<Guid>();
        Guid? storedChapter = null;

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.SceneAsync(db, universeId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "This scene isn't in this universe any more. It may be in the Trash.");
                return;
            }

            if (stored.Version != work.BaseVersion)
            {
                work.Conflict("Someone saved this scene after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }

            kept = [.. stored.Form.Lore.Select(lore => lore.Id).OfType<Guid>(), .. stored.Form.PointOfView?.Id is { } pov ? [pov] : Array.Empty<Guid>()];
            storedChapter = stored.Form.Chapter?.Id;
        }
        else
        {
            CheckStory(work, scene.Story, "story");
        }

        // A chapter of the same story: an existing one of the scene's own story, or one this proposal creates in it.
        if (scene.Chapter is { } chapterRef)
        {
            var (chapterId, pendingChapter) = Resolve(chapterRef);
            if (pendingChapter?.Proposed is ChapterValues proposedChapter && proposedChapter.Story != scene.Story)
            {
                work.Problem(AiChangeCodes.WrongRef, "That chapter is in another story.", "chapter");
            }
            else if (chapterId is { } existingChapter && existingChapter != storedChapter
                && (!_chapters.TryGetValue(existingChapter, out var found) || found.Trashed || Resolve(scene.Story).Id != found.StoryId))
            {
                work.Problem(AiChangeCodes.NotFound, "Choose a chapter from this scene's story.", "chapter");
            }
        }

        if (scene.PointOfView is { } point)
        {
            CheckEntry(work, point, "pointOfView", kept);
        }

        foreach (var lore in scene.Lore)
        {
            CheckEntry(work, lore, "lore", kept);
        }

        _chronology ??= await UniverseChronology.LoadAsync(db, universeId, cancellationToken);
        work.Problems(StoryValidation.ValidateScene(
            new SceneRequest(scene.Title, scene.Summary, scene.Notes, null, scene.Date, [.. scene.Lore.Select(_ => Guid.NewGuid())]),
            _chronology));
    }

    private async Task CheckManuscriptAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var manuscript = (ManuscriptValues)work.Proposed;
        var (sceneId, pendingScene) = Resolve(manuscript.Scene);

        if (manuscript.Text.Length > AiChangeLimits.MaxManuscriptCharacters)
        {
            work.Problem(AiChangeCodes.TooLarge, $"One change can carry up to {AiChangeLimits.MaxManuscriptCharacters:N0} characters of prose. Split it into more changes or scenes.", "text");
        }

        if (pendingScene is not null)
        {
            return;
        }

        if (sceneId is not { } existing || !_scenes.TryGetValue(existing, out var scene) || scene.Trashed)
        {
            work.Problem(AiChangeCodes.NotFound, "That scene isn't in this universe, or it is in the Trash.", "scene");
            return;
        }

        var (current, version) = (await AiChangeSnapshots.ManuscriptAsync(db, existing, cancellationToken))!.Value;
        if (version != work.BaseVersion)
        {
            work.Conflict("This scene's manuscript was saved after the AI wrote this change, so it can't be applied. Nothing newer will be overwritten. Reject it, or ask for the change again.");
        }

        // The scene's own bound, as the save holds it, on the prose as it would be stored.
        var length = manuscript.Append ? AiChangeText.Appended(current, manuscript.Text).Length : manuscript.Text.Length;
        if (length > StoryLimits.ManuscriptMaxLength)
        {
            work.Problem(AiChangeCodes.TooLarge, $"The manuscript would be longer than a scene can hold ({StoryLimits.ManuscriptMaxLength:N0} characters). Split it into more scenes.", "text");
        }
    }

    private async Task CheckMomentAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var moment = (TimelineValues)work.Proposed;
        var kept = new HashSet<Guid>();

        var keptStories = new HashSet<Guid>();
        Guid? keptParticipant = null;

        if (work.Action == AiChangeAction.Update)
        {
            var stored = await AiChangeSnapshots.MomentAsync(db, universeId, work.TargetId!.Value, cancellationToken);
            if (stored is null)
            {
                work.Problem(AiChangeCodes.NotFound, "This timeline moment isn't in this universe any more. It may be in the Trash.");
                return;
            }

            if (!AiChangeSnapshots.SameMoment(stored, work.Before as TimelineValues))
            {
                work.Conflict("Someone changed this moment after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }

            kept = [.. stored.Participants.Select(participant => participant.Id).OfType<Guid>()];
            keptStories = [.. (stored.Stories ?? []).Select(story => story.Id).OfType<Guid>()];
            keptParticipant = stored.Details?.Participant?.Id;
        }

        foreach (var participant in moment.Participants)
        {
            CheckEntry(work, participant, "participants", kept);
        }

        // Stories of this universe: live, or in the Trash and already linked, as the moment's own save allows.
        var stories = moment.Stories ?? [];
        if (stories.Count > TimelineLimits.MaxLinkedStories)
        {
            work.Problem(AiChangeCodes.Invalid, $"A moment can be linked to up to {TimelineLimits.MaxLinkedStories} stories.", "stories");
        }

        foreach (var story in stories)
        {
            if (Resolve(story).Id is { } storyId && !keptStories.Contains(storyId))
            {
                CheckStory(work, story, "stories");
            }
        }

        if (moment.Details is { } details)
        {
            var participantId = details.Participant is { } participantRef ? Resolve(participantRef).Id : null;
            if (details.Participant is { } named)
            {
                CheckEntry(work, named, "details.participant", keptParticipant is { } held ? [held] : null);
            }

            // The terms are checked by the moment's own rule; an entry this proposal creates is checked above instead.
            if (await RuleValidation.RuleValidationInput.ValidateMomentAsync(
                    db,
                    universeId,
                    new RuleValidation.TimelineValidationRequest(details.EventKindId, details.MethodId, participantId),
                    keptParticipant,
                    cancellationToken) is { } errors)
            {
                work.Problems(errors.Where(error => error.Key != "participantEntityId").ToDictionary(error => error.Key, error => error.Value));
            }
        }

        _chronology ??= await UniverseChronology.LoadAsync(db, universeId, cancellationToken);
        work.Problems(TimelineValidation.Validate(AiChangeRequests.Moment(moment, [.. moment.Participants.Select(_ => Guid.NewGuid())], null, null), _chronology));
    }

    private async Task CheckRemoveAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var target = work.TargetId!.Value;
        var (exists, version, same) = work.Resource switch
        {
            AiChangeResource.Relationship => await AiChangeSnapshots.RelationshipAsync(db, universeId, target, cancellationToken) is { } relationship
                ? (true, (int?)null, AiChangeSnapshots.Same(relationship, work.Before))
                : (false, null, true),
            AiChangeResource.TimelineEvent => await AiChangeSnapshots.MomentAsync(db, universeId, target, cancellationToken) is { } moment
                ? (true, null, AiChangeSnapshots.SameMoment(moment, work.Before as TimelineValues))
                : (false, null, true),
            AiChangeResource.PlotArc => await AiChangeSnapshots.PlotArcAsync(db, universeId, target, cancellationToken) is { } arc
                ? (true, null, AiChangeSnapshots.Same(arc, work.Before))
                : (false, null, true),
            AiChangeResource.PlotBeat => await AiChangeSnapshots.PlotBeatAsync(db, universeId, target, cancellationToken) is { } beat
                ? (true, null, AiChangeSnapshots.Same(beat, work.Before))
                : (false, null, true),
            AiChangeResource.WorldRule => await AiChangeSnapshots.WorldRuleAsync(db, universeId, target, cancellationToken) is { } rule
                ? (true, null, AiChangeSnapshots.Same(rule, work.Before))
                : (false, null, true),
            AiChangeResource.Idea => await AiChangeSnapshots.IdeaAsync(db, universeId, proposerId, target, cancellationToken) is { } idea
                ? (true, null, AiChangeSnapshots.Same(idea, work.Before))
                : (false, null, true),
            AiChangeResource.LoreEntry => await AiChangeSnapshots.LoreAsync(db, universeId, target, cancellationToken) is { } lore
                ? (true, (int?)lore.Version, true)
                : (false, null, true),
            AiChangeResource.Story => await AiChangeSnapshots.StoryAsync(db, universeId, target, cancellationToken) is { } story
                ? (true, story.Version, true)
                : (false, null, true),
            AiChangeResource.Scene => await AiChangeSnapshots.SceneAsync(db, universeId, target, cancellationToken) is { } scene
                ? (true, scene.Version, true)
                : (false, null, true),
            AiChangeResource.Chapter => await AiChangeSnapshots.ChapterAsync(db, universeId, target, cancellationToken) is { } chapter
                ? (true, null, AiChangeSnapshots.Same(chapter, work.Before))
                : (false, null, true),

            // An archived field is gone from forms already: archiving it again would be nothing, so it is not found here.
            AiChangeResource.LoreField => await AiChangeSnapshots.FieldAsync(db, universeId, target, cancellationToken) is { Archived: false } field
                ? (true, (int?)field.Version, true)
                : (false, null, true),
            _ => (false, null, true),
        };

        if (work.Resource is AiChangeResource.Manuscript or AiChangeResource.Article)
        {
            work.Problem(AiChangeCodes.Unsupported, AiChangeText.NoTrash(work.Resource));
            return;
        }

        if (work.Resource == AiChangeResource.Idea)
        {
            await CheckIdeaOwnerAsync(work, cancellationToken);
        }

        if (!exists)
        {
            work.Problem(AiChangeCodes.NotFound, "This isn't in this universe any more. It may already be in the Trash.");
        }
        else if (version != work.BaseVersion || !same)
        {
            work.Conflict("Someone changed this after the AI suggested removing it, so it can't be applied. Reject it, or ask again.");
        }
    }

    // ---------- The batch ----------

    /// <summary>Creates that need each other in a ring can never be applied in any order: each one in the ring is refused.</summary>
    private void CheckCycles(IReadOnlyList<AiChangeWork> works)
    {
        var state = new Dictionary<string, int>(StringComparer.Ordinal);
        var inRing = new HashSet<string>(StringComparer.Ordinal);

        void Visit(AiChangeWork work, Stack<string> path)
        {
            state[work.Key] = 1;
            path.Push(work.Key);
            foreach (var key in work.DependsOn)
            {
                if (!_byKey.TryGetValue(key, out var next) || !next.IsPending)
                {
                    continue;
                }

                if (state.GetValueOrDefault(next.Key) == 1)
                {
                    foreach (var member in path.TakeWhile(member => member != next.Key).Append(next.Key))
                    {
                        inRing.Add(member);
                    }
                }
                else if (state.GetValueOrDefault(next.Key) == 0)
                {
                    Visit(next, path);
                }
            }

            path.Pop();
            state[work.Key] = 2;
        }

        foreach (var work in works.Where(work => work.IsPending && !state.ContainsKey(work.Key)))
        {
            Visit(work, new Stack<string>());
        }

        foreach (var key in inRing)
        {
            _byKey[key].Problem(AiChangeCodes.Cycle, "These changes need each other in a ring, so none of them can be applied first. Create one, then link it in a later proposal.");
        }
    }

    /// <summary>Everything the checks look up, read once for the whole proposal and only from this universe.</summary>
    private async Task LoadAsync(IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var all = works.SelectMany(Typed).Select(reference => Resolve(reference.Ref).Id).OfType<Guid>().ToHashSet();
        var entityIds = all.ToList();

        _entities = entityIds.Count == 0
            ? []
            : await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && entityIds.Contains(entity.Id))
                .ToDictionaryAsync(entity => entity.Id, entity => (entity.EntityTypeId, entity.DeletedAt != null), cancellationToken);

        // A universe's types and active fields with their choices: a handful of each, read whole.
        var fields = (await db.EntityFieldDefinitions.AsNoTracking()
                .Include(field => field.Options)
                .Where(field => field.EntityType!.UniverseId == universeId && field.ArchivedAt == null)
                .ToListAsync(cancellationToken))
            .ToLookup(field => field.EntityTypeId);
        var types = await db.EntityTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .Select(type => new { type.Id, type.Name, type.ParentId })
            .ToListAsync(cancellationToken);
        _types = types.ToDictionary(type => type.Id, type => (type.Name, new List<EntityFieldDefinition>()));
        _typeParents = types.ToDictionary(type => type.Id, type => type.ParentId);
        foreach (var (typeId, type) in _types)
        {
            type.Fields.AddRange(fields[typeId]);
        }

        _groupMembers = [.. (await db.EntityTypeGroupMembers.AsNoTracking()
                .Where(member => member.Group!.UniverseId == universeId)
                .Select(member => new { member.EntityTypeGroupId, member.EntityTypeId })
                .ToListAsync(cancellationToken))
            .Select(member => (member.EntityTypeGroupId, member.EntityTypeId))];

        _relationshipTypes = await db.RelationshipTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .ToDictionaryAsync(type => type.Id, type => type.IsSymmetric, cancellationToken);

        _stories = await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == universeId && all.Contains(story.Id))
            .ToDictionaryAsync(story => story.Id, story => story.DeletedAt != null, cancellationToken);

        // Projected in the query: a dictionary's selectors run on the rows, where the story is not loaded.
        _chapters = (await db.Chapters.AsNoTracking()
                .Where(chapter => chapter.Story!.UniverseId == universeId && all.Contains(chapter.Id))
                .Select(chapter => new { chapter.Id, chapter.StoryId, Trashed = chapter.DeletedAt != null || chapter.Story!.DeletedAt != null })
                .ToListAsync(cancellationToken))
            .ToDictionary(chapter => chapter.Id, chapter => (chapter.StoryId, chapter.Trashed));

        _scenes = (await db.Scenes.AsNoTracking()
                .Where(scene => scene.Story!.UniverseId == universeId && all.Contains(scene.Id))
                .Select(scene => new { scene.Id, scene.StoryId, Trashed = scene.DeletedAt != null || scene.Story!.DeletedAt != null })
                .ToListAsync(cancellationToken))
            .ToDictionary(scene => scene.Id, scene => (scene.StoryId, scene.Trashed));

        _arcs = (await db.PlotArcs.AsNoTracking()
                .Where(arc => arc.Story!.UniverseId == universeId && all.Contains(arc.Id))
                .Select(arc => new { arc.Id, arc.StoryId, Trashed = arc.DeletedAt != null || arc.Story!.DeletedAt != null })
                .ToListAsync(cancellationToken))
            .ToDictionary(arc => arc.Id, arc => (arc.StoryId, arc.Trashed));

        _beats = (await db.PlotBeats.AsNoTracking()
                .Where(beat => beat.PlotArc!.Story!.UniverseId == universeId && all.Contains(beat.Id))
                .Select(beat => new
                {
                    beat.Id,
                    beat.PlotArcId,
                    beat.PlotArc!.StoryId,
                    Trashed = beat.DeletedAt != null || beat.PlotArc.DeletedAt != null || beat.PlotArc.Story!.DeletedAt != null,
                })
                .ToListAsync(cancellationToken))
            .ToDictionary(beat => beat.Id, beat => (beat.PlotArcId, beat.StoryId, beat.Trashed));
    }

    private static string Article(AiChangeResource kind) => kind switch
    {
        AiChangeResource.LoreEntry => "a lore entry",
        AiChangeResource.Story => "a story",
        AiChangeResource.Chapter => "a chapter",
        AiChangeResource.Scene => "a scene",
        AiChangeResource.PlotArc => "a plot arc",
        AiChangeResource.PlotBeat => "a plot beat",
        AiChangeResource.LoreType => "a lore type",
        AiChangeResource.LoreGroup => "a group",
        _ => "that",
    };
}

/// <summary>Builds the resources' own request records from stored values, with every reference resolved to a real id.</summary>
internal static class AiChangeRequests
{
    /// <summary>
    /// The moment's request. <paramref name="stories"/> and <paramref name="details"/> are what to store - null keeps what is
    /// stored, which is how a change from before issue 45, holding neither, is applied (ADR 0048).
    /// </summary>
    public static TimelineEntryRequest Moment(
        TimelineValues moment,
        List<Guid> participants,
        List<Guid>? stories,
        RuleValidation.TimelineValidationRequest? details) => new(
        moment.Title,
        moment.Description,
        moment.CanonStatus,
        moment.DateKind,
        moment.StartYear,
        moment.StartMonth,
        moment.StartDay,
        moment.EndYear,
        moment.EndMonth,
        moment.EndDay,
        moment.EraLabel,
        participants,
        moment.StartEraId,
        moment.EndEraId,
        details,
        stories,
        moment.StartMonthId,
        moment.EndMonthId);
}

/// <summary>Small pieces of text shared by staging, review and commit.</summary>
internal static class AiChangeText
{
    /// <summary>Prose added after the prose already there: a blank line between, none before an empty manuscript.</summary>
    public static string Appended(string current, string added) =>
        current.Length == 0 ? added : current.TrimEnd('\n', '\r') + "\n\n" + added;

    public static string NoTrash(AiChangeResource resource) => resource switch
    {
        AiChangeResource.Article => "An article isn't removed. To empty one, replace it with no blocks, and its saved versions keep the old article.",
        AiChangeResource.Progression => "An AI change never removes an era, form, ability or appearance. Remove one by hand on the entry's Progression page, where it shows what goes with it.",
        _ => "A manuscript isn't removed. To empty one, replace its text, and its saved versions keep the old prose.",
    };

    /// <summary>Why an AI can't remove a definition: none has a Trash, and LoreX deletes one only by hand, only once nothing uses it.</summary>
    public static string NoSchemaRemoval(AiChangeResource resource) => resource switch
    {
        AiChangeResource.LoreType => "An AI change can't delete a lore type. Delete it by hand in LoreX's Types, once no entry, nested type or field uses it.",
        AiChangeResource.LoreGroup => "An AI change can't delete a group. Delete it by hand in LoreX's Types, once no field is limited to it.",
        AiChangeResource.RelationshipType => "An AI change can't delete a relationship kind. Delete it by hand in LoreX, once no relationship uses it.",
        AiChangeResource.Chronology => "An AI change can't remove the reckoning. Date periods and months are removed by hand in Chronology, once nothing is dated in them.",
        _ => "An AI change can't delete an event kind or a method. Delete it by hand in World rules, once no rule or moment names it.",
    };
}
