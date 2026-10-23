using System.Text.RegularExpressions;
using Lorex.Api.Data;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.AiChanges;

/// <summary>Where a submission came from, as the server knows it: never anything the AI said about itself.</summary>
internal sealed record AiChangeOrigin(AiChangeSource Source, Guid? McpConnectionId = null, string? ClientName = null);

/// <summary>One problem with a submission: which change (by its place and its id, when it has them), and what is wrong.</summary>
public sealed record AiChangeStageIssue(int? Index, string? Id, string Code, string Message, string? Field = null);

/// <summary>What staging came to: the stored proposal, or every problem found - and then nothing was stored.</summary>
internal sealed record AiChangeStaged(AiChangeProposal? Proposal, IReadOnlyList<AiChangeStageIssue> Issues);

/// <summary>
/// Stages an AI's submission as a proposal (ADR 0047): the one way either entry point hands LoreX changes. All or nothing -
/// every operation is normalised, permitted and checked, and the proposal is stored only when none has a problem; otherwise
/// every problem is returned at once, so the AI can fix them and send it again. Staging writes the proposal and nothing
/// else: no content, no history, no search index.
/// </summary>
internal static partial class AiChangeStaging
{
    [GeneratedRegex("^[A-Za-z0-9][A-Za-z0-9_.-]*$")]
    private static partial Regex KeyPattern();

    public static async Task<AiChangeStaged> StageAsync(
        LorexDbContext db,
        TimeProvider clock,
        Guid universeId,
        string userId,
        AiChangeOrigin origin,
        AiChangeSubmission? submission,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        await AiChangeRetention.SweepAsync(db, now, cancellationToken);

        List<AiChangeStageIssue> issues = [];
        void Whole(string code, string message) => issues.Add(new AiChangeStageIssue(null, null, code, message));

        // The person's role now, in the universe the server named: never one the AI sent.
        var role = await UniverseAccess.RoleAsync(db, universeId, userId, cancellationToken);
        if (role is not { } effective || !AiChangePermissions.MayStageAnything(effective))
        {
            Whole(AiChangeCodes.NotAllowed, "Your role in this universe can only read, so an AI can't propose changes for you here.");
            return new AiChangeStaged(null, issues);
        }

        var inputs = submission?.Operations;
        if (inputs is not { Count: > 0 })
        {
            Whole(AiChangeCodes.Invalid, "Send at least one change.");
            return new AiChangeStaged(null, issues);
        }

        if (inputs.Count > AiChangeLimits.MaxOperations)
        {
            Whole(AiChangeCodes.TooLarge, $"One proposal can hold up to {AiChangeLimits.MaxOperations} changes. This has {inputs.Count}. Split it into smaller proposals.");
            return new AiChangeStaged(null, issues);
        }

        var summary = submission!.Summary?.Trim();
        if (summary is { Length: > AiChangeLimits.SummaryMaxLength })
        {
            Whole(AiChangeCodes.TooLarge, $"Keep the summary under {AiChangeLimits.SummaryMaxLength} characters.");
        }

        var open = await db.AiChangeProposals.CountAsync(
            proposal => proposal.UniverseId == universeId && proposal.ProposedByUserId == userId && proposal.Status == AiChangeProposalStatus.Open,
            cancellationToken);
        if (open >= AiChangeLimits.MaxOpenPerAccount)
        {
            Whole(AiChangeCodes.TooLarge, $"You already have {open} proposals waiting for review in this universe. Approve or reject some of them in LoreX first.");
        }

        var works = new List<AiChangeWork>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        for (var index = 0; index < inputs.Count; index++)
        {
            var input = inputs[index];
            var key = input?.Id?.Trim();
            void Problem(string code, string message, string? field = null) => issues.Add(new AiChangeStageIssue(index, key, code, message, field));

            if (input is null)
            {
                Problem(AiChangeCodes.Invalid, "This change is empty.");
                continue;
            }

            if (string.IsNullOrEmpty(key) || key.Length > AiChangeLimits.KeyMaxLength || !KeyPattern().IsMatch(key))
            {
                Problem(AiChangeCodes.Invalid, $"Give every change an id of up to {AiChangeLimits.KeyMaxLength} letters, digits, dashes, dots or underscores.", "id");
                continue;
            }

            if (!seen.Add(key))
            {
                Problem(AiChangeCodes.Duplicate, $"Two changes use the id \"{key}\". Give each its own.", "id");
                continue;
            }

            if (Action(input.Action) is not { } action || Resource(input.Resource) is not { } resource)
            {
                Problem(AiChangeCodes.Invalid, "Say what the change does (create, update, remove or reorder) and to what (lore_entry, article, relationship, story, chapter, scene, manuscript, plot_arc, plot_beat, timeline_event, world_rule or idea).");
                continue;
            }

            // Prose has one change: written over the manuscript or article there is, which the first save creates.
            if (resource is AiChangeResource.Manuscript or AiChangeResource.Article && action == AiChangeAction.Create)
            {
                action = AiChangeAction.Update;
            }

            if (action == AiChangeAction.Remove && resource is AiChangeResource.Manuscript or AiChangeResource.Article)
            {
                Problem(AiChangeCodes.Unsupported, AiChangeText.NoTrash(resource));
                continue;
            }

            if (action == AiChangeAction.Reorder
                && resource is not (AiChangeResource.Chapter or AiChangeResource.Scene or AiChangeResource.PlotArc or AiChangeResource.PlotBeat))
            {
                Problem(AiChangeCodes.Unsupported, "Only a story's chapters or plot arcs, a chapter's scenes and an arc's beats have an order to set.");
                continue;
            }

            if (!AiChangePermissions.MayStage(effective, resource, action))
            {
                Problem(AiChangeCodes.NotAllowed, resource == AiChangeResource.Idea
                    ? "Ideas are the universe owner's own, so only the owner can have an AI propose them."
                    : effective == UniverseRole.Reviewer
                        ? "As a Reviewer, you can only have an AI suggest edits to existing lore entries, stories and scenes."
                        : "Your role in this universe doesn't allow this change.");
                continue;
            }

            var built = new Builder(db, universeId, userId, key, index, resource, action, input, Problem);
            if (await built.BuildAsync(cancellationToken) is { } work)
            {
                works.Add(work);
            }
        }

        await new AiChangeChecker(db, universeId, userId).CheckAsync(works, cancellationToken);
        foreach (var work in works)
        {
            foreach (var issue in work.Issues)
            {
                issues.Add(new AiChangeStageIssue(work.Sequence, work.Key, issue.Code, issue.Message, issue.Field));
            }
        }

        var payload = works.Sum(work => AiChangeJson.Write(work.Proposed).Length + (work.Before is null ? 0 : AiChangeJson.Write(work.Before).Length));
        if (payload > AiChangeLimits.MaxPayloadCharacters)
        {
            Whole(AiChangeCodes.TooLarge, "This proposal is too large to review in one go. Split it into smaller proposals.");
        }

        if (issues.Count > 0)
        {
            return new AiChangeStaged(null, [.. issues.OrderBy(issue => issue.Index ?? -1)]);
        }

        var proposal = new AiChangeProposal
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            ProposedByUserId = userId,
            Source = origin.Source,
            McpConnectionId = origin.McpConnectionId,
            ClientName = origin.ClientName is { } name ? name[..Math.Min(name.Length, AiChangeLimits.ClientNameMaxLength)] : null,
            Summary = string.IsNullOrEmpty(summary) ? null : summary,
            Status = AiChangeProposalStatus.Open,
            CreatedAt = now,
            ExpiresAt = now + AiChangeLimits.OpenLifetime,
            Operations =
            [
                .. works.Select(work => new AiChangeOperation
                {
                    Id = Guid.NewGuid(),
                    Sequence = work.Sequence,
                    Key = work.Key,
                    Resource = work.Resource,
                    Action = work.Action,
                    TargetId = work.TargetId,
                    BaseVersion = work.BaseVersion,
                    Before = work.Before is null ? null : AiChangeJson.Write(work.Before),
                    Proposed = AiChangeJson.Write(work.Proposed),
                    DependsOn = AiChangeJson.Write(work.DependsOn),
                    Status = AiChangeOperationStatus.Pending,
                }),
            ],
        };

        db.AiChangeProposals.Add(proposal);
        await db.SaveChangesAsync(cancellationToken);
        return new AiChangeStaged(proposal, []);
    }

    private static AiChangeAction? Action(string? text) => text?.Trim().ToLowerInvariant() switch
    {
        "create" => AiChangeAction.Create,
        "update" => AiChangeAction.Update,
        "remove" or "delete" or "trash" => AiChangeAction.Remove,
        "reorder" or "order" => AiChangeAction.Reorder,
        _ => null,
    };

    private static AiChangeResource? Resource(string? text) => text?.Trim().ToLowerInvariant().Replace('-', '_') switch
    {
        "lore_entry" or "lore" or "entry" => AiChangeResource.LoreEntry,
        "relationship" => AiChangeResource.Relationship,
        "story" => AiChangeResource.Story,
        "chapter" => AiChangeResource.Chapter,
        "scene" => AiChangeResource.Scene,
        "manuscript" => AiChangeResource.Manuscript,
        "timeline_event" or "timeline_moment" or "moment" => AiChangeResource.TimelineEvent,
        "article" => AiChangeResource.Article,
        "plot_arc" or "arc" => AiChangeResource.PlotArc,
        "plot_beat" or "beat" => AiChangeResource.PlotBeat,
        "world_rule" or "rule" => AiChangeResource.WorldRule,
        "idea" => AiChangeResource.Idea,
        _ => null,
    };

    /// <summary>
    /// One operation's values from the AI's input: a create's from the input alone; an update's as the stored form with
    /// only what the input sets changed, bound to the version (or the form) it was staged over; a removal's target, as it
    /// is now. Problems go to <c>problem</c>; nothing is built while any is found.
    /// </summary>
    private sealed partial class Builder(
        LorexDbContext db,
        Guid universeId,
        string userId,
        string key,
        int index,
        AiChangeResource resource,
        AiChangeAction action,
        AiChangeOperationInput input,
        Action<string, string, string?> problem)
    {
        private bool _failed;

        private void Fail(string code, string message, string? field = null)
        {
            _failed = true;
            problem(code, message, field);
        }

        public async Task<AiChangeWork?> BuildAsync(CancellationToken cancellationToken)
        {
            if (action is AiChangeAction.Update or AiChangeAction.Remove
                && resource is not (AiChangeResource.Manuscript or AiChangeResource.Article)
                && input.TargetId is null)
            {
                Fail(AiChangeCodes.Invalid, "Say which item this changes: its id goes in targetId.", "targetId");
                return null;
            }

            var built = (resource, action) switch
            {
                (_, AiChangeAction.Reorder) => await OrderAsync(cancellationToken),
                (AiChangeResource.Article, _) => await ArticleAsync(cancellationToken),
                (AiChangeResource.PlotArc, _) => await PlotArcAsync(cancellationToken),
                (AiChangeResource.PlotBeat, _) => await PlotBeatAsync(cancellationToken),
                (AiChangeResource.WorldRule, _) => await WorldRuleAsync(cancellationToken),
                (AiChangeResource.Idea, _) => await IdeaAsync(cancellationToken),

                (AiChangeResource.LoreEntry, AiChangeAction.Create) => Work(null, null, Lore(input.Lore, null)),
                (AiChangeResource.LoreEntry, AiChangeAction.Update) => await StoredAsync(
                    () => AiChangeSnapshots.LoreAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored.Form, stored.Version, Lore(input.Lore, stored.Form))),
                (AiChangeResource.LoreEntry, _) => await StoredAsync(
                    () => AiChangeSnapshots.LoreAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored.Form, stored.Version, new RemoveValues(null))),

                (AiChangeResource.Relationship, AiChangeAction.Create) => Work(null, null, Relationship(input.Relationship, null)),
                (AiChangeResource.Relationship, AiChangeAction.Update) => await StoredAsync(
                    () => AiChangeSnapshots.RelationshipAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, Relationship(input.Relationship, stored))),
                (AiChangeResource.Relationship, _) => await StoredAsync(
                    () => AiChangeSnapshots.RelationshipAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, new RemoveValues(null))),

                (AiChangeResource.Story, AiChangeAction.Create) => Work(null, null, Story(input.Story, null)),
                (AiChangeResource.Story, AiChangeAction.Update) => await StoredAsync(
                    () => AiChangeSnapshots.StoryAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored.Form, stored.Version, Story(input.Story, stored.Form))),
                (AiChangeResource.Story, _) => await StoredAsync(
                    () => AiChangeSnapshots.StoryAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored.Form, stored.Version, new RemoveValues(input.TargetId))),

                (AiChangeResource.Chapter, AiChangeAction.Create) => Work(null, null, Chapter(input.Chapter, null)),
                (AiChangeResource.Chapter, AiChangeAction.Update) => await StoredAsync(
                    () => AiChangeSnapshots.ChapterAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, Chapter(input.Chapter, stored))),
                (AiChangeResource.Chapter, _) => await StoredAsync(
                    () => AiChangeSnapshots.ChapterAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, new RemoveValues(stored.Story.Id))),

                (AiChangeResource.Scene, AiChangeAction.Create) => Work(null, null, Scene(input.Scene, null)),
                (AiChangeResource.Scene, AiChangeAction.Update) => await StoredAsync(
                    () => AiChangeSnapshots.SceneAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored.Form, stored.Version, Scene(input.Scene, stored.Form))),
                (AiChangeResource.Scene, _) => await StoredAsync(
                    () => AiChangeSnapshots.SceneAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored.Form, stored.Version, new RemoveValues(stored.Form.Story.Id))),

                (AiChangeResource.Manuscript, _) => await ManuscriptAsync(cancellationToken),

                (_, AiChangeAction.Create) => Work(null, null, Moment(input.Timeline, null)),
                (_, AiChangeAction.Update) => await StoredAsync(
                    () => AiChangeSnapshots.MomentAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, Moment(input.Timeline, stored))),
                _ => await StoredAsync(
                    () => AiChangeSnapshots.MomentAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, new RemoveValues(null))),
            };

            if (_failed || built is null)
            {
                return null;
            }

            // An expected version the AI read is held to what is stored now; without one, the change is bound to now.
            if (input.ExpectedVersion is { } expected && built.BaseVersion is { } stored && expected != stored
                && resource is not (AiChangeResource.Manuscript or AiChangeResource.Article))
            {
                Fail(AiChangeCodes.ChangedSince, $"This was saved after you read it (you read version {expected}; it is now {stored}). Read it again, then propose the change.", "expectedVersion");
                return null;
            }

            if (action == AiChangeAction.Update && built.Before is not null && AiChangeSnapshots.Same(built.Before, built.Proposed))
            {
                Fail(AiChangeCodes.Invalid, "This change wouldn't change anything.");
                return null;
            }

            return built;
        }

        private AiChangeWork? Work(object? before, int? version, object? proposed) =>
            proposed is null || _failed
                ? null
                : new AiChangeWork
                {
                    Key = key,
                    Sequence = index,
                    Resource = resource,
                    Action = action,
                    TargetId = action is AiChangeAction.Create or AiChangeAction.Reorder || resource is AiChangeResource.Manuscript or AiChangeResource.Article
                        ? null
                        : input.TargetId,
                    BaseVersion = version,
                    Before = before,
                    Proposed = proposed,
                    Status = AiChangeOperationStatus.Pending,
                };

        private async Task<AiChangeWork?> StoredAsync<T>(Func<Task<T?>> read, Func<T, AiChangeWork?> build)
            where T : class
        {
            var stored = await read();
            if (stored is null)
            {
                Fail(AiChangeCodes.NotFound, "Nothing with that id is in this universe. It may be in the Trash.", "targetId");
                return null;
            }

            return build(stored);
        }

        private async Task<AiChangeWork?> StoredAsync<T>(Func<Task<T?>> read, Func<T, AiChangeWork?> build)
            where T : struct
        {
            var stored = await read();
            if (stored is null)
            {
                Fail(AiChangeCodes.NotFound, "Nothing with that id is in this universe. It may be in the Trash.", "targetId");
                return null;
            }

            return build(stored.Value);
        }

        // ---------- Each resource's values ----------

        private LoreValues? Lore(AiLoreInput? lore, LoreValues? before)
        {
            if (lore is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the entry's values in lore.", "lore");
                return null;
            }

            if (before is not null && lore.TypeId is { } typeId && typeId != before.TypeId)
            {
                Fail(AiChangeCodes.Unsupported, "An AI change can't move an entry to another type.", "lore.typeId");
            }

            if (before is null && lore.TypeId is null)
            {
                Fail(AiChangeCodes.Invalid, "Choose the entry's lore type: its id goes in lore.typeId.", "lore.typeId");
                return null;
            }

            var fields = (before?.Fields ?? []).ToDictionary(field => field.FieldId);
            var named = new HashSet<Guid>();
            foreach (var field in lore.Fields ?? [])
            {
                if (field?.FieldId is not { } fieldId)
                {
                    Fail(AiChangeCodes.Invalid, "Every field value needs its fieldId.", "lore.fields");
                    continue;
                }

                if (!named.Add(fieldId))
                {
                    Fail(AiChangeCodes.Duplicate, "The same field is listed twice.", $"lore.fields.{fieldId}");
                    continue;
                }

                if (field.Clear == true)
                {
                    fields.Remove(fieldId);
                    continue;
                }

                fields[fieldId] = new LoreFieldValue(
                    fieldId,
                    field.Text,
                    field.Number,
                    field.Boolean,
                    field.Date is { } date ? DateTime.SpecifyKind(date.Date, DateTimeKind.Utc) : null,
                    [.. (field.OptionIds ?? []).Distinct().Order()],
                    Ref(field.Entry, $"lore.fields.{fieldId}"),
                    field.EraId);
            }

            var canon = lore.CanonStatus is null ? before?.CanonStatus ?? CanonStatus.Idea : Canon(lore.CanonStatus, "lore.canonStatus");

            return new LoreValues(
                before?.TypeId ?? lore.TypeId!.Value,
                (lore.Name ?? before?.Name ?? string.Empty).Trim(),
                Cleared(lore.Summary, before?.Summary),
                canon ?? CanonStatus.Idea,
                lore.Aliases is null ? before?.Aliases ?? [] : [.. EntityEndpoints.NormalizedAliases(lore.Aliases).Order(StringComparer.Ordinal)],
                lore.Tags is null ? before?.Tags ?? [] : [.. EntityEndpoints.NormalizedTags(lore.Tags).Values.Order(StringComparer.Ordinal)],
                [.. fields.Values.OrderBy(field => field.FieldId)]);
        }

        private RelationshipValues? Relationship(AiRelationshipInput? relationship, RelationshipValues? before)
        {
            if (relationship is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the relationship's values in relationship.", "relationship");
                return null;
            }

            var typeId = relationship.TypeId ?? before?.TypeId;
            var source = relationship.Source is null ? before?.Source : Ref(relationship.Source, "relationship.source");
            var target = relationship.Target is null ? before?.Target : Ref(relationship.Target, "relationship.target");
            if (typeId is null || source is null || target is null)
            {
                Fail(AiChangeCodes.Invalid, "A relationship needs typeId, source and target.", "relationship");
                return null;
            }

            var canon = relationship.CanonStatus is null ? before?.CanonStatus ?? CanonStatus.Idea : Canon(relationship.CanonStatus, "relationship.canonStatus");
            var start = relationship.ClearStartDate == true ? null : Day(relationship.StartDate) ?? before?.StartDate;
            var end = relationship.ClearEndDate == true ? null : Day(relationship.EndDate) ?? before?.EndDate;
            return new RelationshipValues(typeId.Value, source, target, canon ?? CanonStatus.Idea, start, end, Cleared(relationship.Notes, before?.Notes));
        }

        private StoryValues? Story(AiStoryInput? story, StoryValues? before)
        {
            if (story is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the story's values in story.", "story");
                return null;
            }

            StoryStatus? status = story.Status?.Trim().ToLowerInvariant() switch
            {
                null => before?.Status ?? StoryStatus.Planning,
                "planning" => StoryStatus.Planning,
                "drafting" => StoryStatus.Drafting,
                "complete" or "completed" => StoryStatus.Complete,
                _ => null,
            };

            if (status is null)
            {
                Fail(AiChangeCodes.Invalid, "A story's status is planning, drafting or complete.", "story.status");
                return null;
            }

            return new StoryValues((story.Title ?? before?.Title ?? string.Empty).Trim(), Cleared(story.Premise, before?.Premise), status.Value);
        }

        private ChapterValues? Chapter(AiChapterInput? chapter, ChapterValues? before)
        {
            if (chapter is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the chapter's values in chapter.", "chapter");
                return null;
            }

            var story = before?.Story ?? Ref(chapter.Story, "chapter.story");
            if (story is null)
            {
                Fail(AiChangeCodes.Invalid, "Say which story the chapter is in.", "chapter.story");
                return null;
            }

            return new ChapterValues(story, (chapter.Title ?? before?.Title ?? string.Empty).Trim(), Cleared(chapter.Summary, before?.Summary), Cleared(chapter.Notes, before?.Notes));
        }

        private SceneValues? Scene(AiSceneInput? scene, SceneValues? before)
        {
            if (scene is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the scene's values in scene.", "scene");
                return null;
            }

            var story = before?.Story ?? Ref(scene.Story, "scene.story");
            if (story is null)
            {
                Fail(AiChangeCodes.Invalid, "Say which story the scene is in.", "scene.story");
                return null;
            }

            var lore = scene.Lore is null
                ? before?.Lore ?? []
                : scene.Lore.Select(reference => Ref(reference, "scene.lore")).OfType<AiRef>().Distinct().ToList();

            return new SceneValues(
                story,
                scene.Chapter is null ? before?.Chapter : Ref(scene.Chapter, "scene.chapter"),
                (scene.Title ?? before?.Title ?? string.Empty).Trim(),
                Cleared(scene.Summary, before?.Summary),
                Cleared(scene.Notes, before?.Notes),
                scene.PointOfView is null ? before?.PointOfView : Ref(scene.PointOfView, "scene.pointOfView"),
                scene.Date is null ? before?.Date : new ChronologyValue(scene.Date.EraId, scene.Date.Year, scene.Date.Month, scene.Date.Day, scene.Date.MonthId),
                [.. lore.OrderBy(reference => reference.Id).ThenBy(reference => reference.Key, StringComparer.Ordinal)]);
        }

        private async Task<AiChangeWork?> ManuscriptAsync(CancellationToken cancellationToken)
        {
            var manuscript = input.Manuscript;
            if (manuscript is null || Ref(manuscript.Scene, "manuscript.scene") is not { } scene)
            {
                Fail(AiChangeCodes.Invalid, "Put the prose in manuscript, with the scene it belongs to.", "manuscript");
                return null;
            }

            bool? append = manuscript.Mode?.Trim().ToLowerInvariant() switch
            {
                "append" => true,
                "replace" => false,
                _ => null,
            };

            if (append is null || manuscript.Text is null)
            {
                Fail(AiChangeCodes.Invalid, "Say whether the text is appended or replaces the prose (mode), and send the text.", "manuscript.mode");
                return null;
            }

            if (append.Value && manuscript.Text.Trim().Length == 0)
            {
                Fail(AiChangeCodes.Invalid, "There's no text to add.", "manuscript.text");
                return null;
            }

            // A scene this proposal creates starts with no prose: version 0, nothing to overwrite.
            if (scene.Id is not { } sceneId)
            {
                return Work(null, 0, new ManuscriptValues(scene, null, append.Value, manuscript.Text));
            }

            var storyId = await db.Scenes.AsNoTracking()
                .Where(row => row.Id == sceneId && row.DeletedAt == null && row.Story!.UniverseId == universeId && row.Story.DeletedAt == null)
                .Select(row => (Guid?)row.StoryId)
                .FirstOrDefaultAsync(cancellationToken);
            if (storyId is null)
            {
                Fail(AiChangeCodes.NotFound, "That scene isn't in this universe, or it is in the Trash.", "manuscript.scene");
                return null;
            }

            var (current, version) = (await AiChangeSnapshots.ManuscriptAsync(db, sceneId, cancellationToken))!.Value;

            // Replacing prose must name the version it was written over, so newer prose is never overwritten unseen.
            if (!append.Value && input.ExpectedVersion is null)
            {
                Fail(AiChangeCodes.Invalid, "To replace a manuscript, read it first and send its manuscriptVersion as expectedVersion.", "expectedVersion");
                return null;
            }

            if (input.ExpectedVersion is { } expected && expected != version)
            {
                Fail(AiChangeCodes.ChangedSince, $"This manuscript was saved after you read it (you read version {expected}; it is now {version}). Read it again first.", "expectedVersion");
                return null;
            }

            if (!append.Value && string.Equals(current, manuscript.Text, StringComparison.Ordinal))
            {
                Fail(AiChangeCodes.Invalid, "This change wouldn't change anything.");
                return null;
            }

            var work = Work(null, version, new ManuscriptValues(scene, storyId, append.Value, manuscript.Text));
            if (work is not null)
            {
                work.TargetId = sceneId;
            }

            return work;
        }

        private TimelineValues? Moment(AiTimelineInput? moment, TimelineValues? before)
        {
            if (moment is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the moment's values in timeline.", "timeline");
                return null;
            }

            var canon = moment.CanonStatus is null ? before?.CanonStatus ?? CanonStatus.Idea : Canon(moment.CanonStatus, "timeline.canonStatus");
            var participants = moment.Participants is null
                ? before?.Participants ?? []
                : moment.Participants.Select(reference => Ref(reference, "timeline.participants")).OfType<AiRef>().Distinct().ToList();
            var title = (moment.Title ?? before?.Title ?? string.Empty).Trim();
            var description = Cleared(moment.Description, before?.Description);
            var ordered = Sorted(participants);
            var stories = moment.Stories is null
                ? before?.Stories ?? []
                : Sorted(moment.Stories.Select(reference => Ref(reference, "timeline.stories")).OfType<AiRef>().Distinct());
            var details = moment.ClearDetails == true
                ? null
                : moment.Details is { } asked
                    ? new MomentDetailsValues(asked.EventKindId, asked.MethodId, Ref(asked.Participant, "timeline.details.participant"))
                    : before?.Details;
            if (details is { EventKindId: null, MethodId: null, Participant: null })
            {
                details = null;
            }

            if (moment.Date is not { } date)
            {
                return before is null
                    ? new TimelineValues(title, description, canon ?? CanonStatus.Idea, TimelineDateKind.Unknown, null, null, null, null, null, null, null, null, null, null, null, ordered, stories, details)
                    : before with { Title = title, Description = description, CanonStatus = canon ?? before.CanonStatus, Participants = ordered, Stories = stories, Details = details };
            }

            TimelineDateKind? kind = date.Kind?.Trim().ToLowerInvariant() switch
            {
                "exact" => TimelineDateKind.Exact,
                "approximate" => TimelineDateKind.Approximate,
                "range" => TimelineDateKind.Range,
                "unknown" or null => TimelineDateKind.Unknown,
                _ => null,
            };

            if (kind is null)
            {
                Fail(AiChangeCodes.Invalid, "A moment's date kind is exact, approximate, range or unknown.", "timeline.date.kind");
                return null;
            }

            return new TimelineValues(
                title,
                description,
                canon ?? CanonStatus.Idea,
                kind.Value,
                date.StartYear,
                date.StartMonth,
                date.StartDay,
                date.EndYear,
                date.EndMonth,
                date.EndDay,
                string.IsNullOrWhiteSpace(date.EraLabel) ? null : date.EraLabel.Trim(),
                date.StartEraId,
                date.EndEraId,
                date.StartMonthId,
                date.EndMonthId,
                ordered,
                stories,
                details);
        }

        // ---------- Shared pieces ----------

        /// <summary>A reference the AI gave: exactly one of an id and another change's id.</summary>
        private AiRef? Ref(AiRefInput? reference, string field)
        {
            if (reference is null)
            {
                return null;
            }

            var other = reference.Ref?.Trim();
            if ((reference.Id is null) == string.IsNullOrEmpty(other))
            {
                Fail(AiChangeCodes.Invalid, "A reference needs exactly one of id (something that exists) and ref (another change's id).", field);
                return null;
            }

            return reference.Id is { } id ? AiRef.To(id) : new AiRef(null, other);
        }

        private CanonStatus? Canon(string text, string field)
        {
            CanonStatus? status = text.Trim().ToLowerInvariant() switch
            {
                "idea" => CanonStatus.Idea,
                "draft" => CanonStatus.Draft,
                "canon" => CanonStatus.Canon,
                _ => null,
            };

            if (status is null)
            {
                Fail(AiChangeCodes.Invalid, "A canon status is idea, draft or canon.", field);
            }

            return status;
        }

        /// <summary>An optional text on an update: left out keeps it, an empty one clears it.</summary>
        private static string? Cleared(string? text, string? before) =>
            text is null ? before : string.IsNullOrWhiteSpace(text) ? null : text.Trim();

        /// <summary>A set of references in the fixed order a stored form holds them, so two equal sets compare equal.</summary>
        private static List<AiRef> Sorted(IEnumerable<AiRef> references) =>
            [.. references.OrderBy(reference => reference.Id).ThenBy(reference => reference.Key, StringComparer.Ordinal)];

        /// <summary>A calendar date, as a relationship stores it: the day, in UTC.</summary>
        private static DateTime? Day(DateTime? date) => date is { } value ? DateTime.SpecifyKind(value.Date, DateTimeKind.Utc) : null;
    }
}
