using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Lorex.Api.Features.WorldRules;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.AiChanges;

/// <summary>
/// Decisions on a proposal (ADR 0047): approve a set of its pending changes, reject some or all, or edit one before
/// approving. Only a signed-in person decides - never a token, never the AI.
///
/// <para><b>An approval is one transaction.</b> The selected changes are applied together, in dependency order, each through
/// its resource's own write path as the approver, under one run of the Canon promotion gate; the proposal's own record of
/// what was applied is written in the same transaction. Any refusal - a check, a write path, the gate - rolls all of it
/// back and leaves every selected change pending. Nothing is ever marked applied before its write succeeded.</para>
///
/// <para><b>Checked again inside it.</b> The approver's role and the proposer's, the app's permission to propose, the
/// revision the approver reviewed, that each change is still pending, that everything a change needs is selected or
/// already applied, and every check staging made - edit versions and stored forms included - all read inside the
/// transaction the writes commit in, which SQLite's single writer serialises. Two approvers racing: the second finds the
/// changes decided.</para>
///
/// <para><b>Idempotent.</b> An approval names its own id. Sent again - a lost answer, a double click - it finds the changes
/// it already applied under that id and answers with the same receipt, applying nothing twice.</para>
/// </summary>
internal static class AiChangeCommit
{
    public static async Task<IResult> ApproveAsync(
        LorexDbContext db,
        CanonPromotionGate gate,
        TimeProvider clock,
        Guid universeId,
        Guid proposalId,
        string approverId,
        AiChangeApproveRequest request,
        CancellationToken cancellationToken)
    {
        if (request.ApprovalId is not { } approvalId || request.OperationIds is not { Count: > 0 } selected || request.Revision is not { } revision)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["operationIds"] = ["Choose the changes to approve, with the proposal's revision and an approval id."],
            });
        }

        if (selected.Distinct().Count() != selected.Count)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["operationIds"] = ["Each change is listed once."] });
        }

        await AiChangeRetention.SweepAsync(db, clock.GetUtcNow().UtcDateTime, cancellationToken);

        // A repeated approval answers from what the first one applied, without a rule sweep.
        if (await ReplayAsync(db, universeId, proposalId, approvalId, selected, approverId, cancellationToken) is { } replayed)
        {
            return replayed;
        }

        return await gate.RunAsync(
            universeId,
            token => ApplyAsync(db, clock, universeId, proposalId, approverId, approvalId, revision, selected, token),
            cancellationToken);
    }

    private static async Task<IResult?> ReplayAsync(
        LorexDbContext db,
        Guid universeId,
        Guid proposalId,
        Guid approvalId,
        IReadOnlyList<Guid> selected,
        string approverId,
        CancellationToken cancellationToken)
    {
        var applied = await db.AiChangeOperations.AsNoTracking()
            .Where(operation => operation.ProposalId == proposalId
                && operation.Proposal!.UniverseId == universeId
                && operation.ApprovalId == approvalId)
            .OrderBy(operation => operation.ResolvedAt)
            .ThenBy(operation => operation.Sequence)
            .ToListAsync(cancellationToken);

        if (applied.Count == 0)
        {
            return null;
        }

        if (Mismatch(applied, selected, approverId) is { } refused)
        {
            return refused;
        }

        var role = await UniverseAccess.RoleAsync(db, universeId, approverId, cancellationToken);
        var proposal = role is { } effective ? await AiChangeViews.ReadAsync(db, universeId, proposalId, approverId, effective, cancellationToken) : null;
        return proposal is null ? Results.NotFound() : Results.Ok(new AiChangeReceipt(approvalId, Receipt(applied), proposal));
    }

    /// <summary>
    /// Whether a request naming an approval id already used is that same approval sent again, or a refusal. A retry must name
    /// exactly the changes that approval applied - no fewer, no more - and come from the person who approved them; anything
    /// else is a different request reusing the id, refused with 409 <see cref="AiChangeCodes.ApprovalMismatch"/> so it can
    /// neither apply anything nor be answered with someone else's receipt.
    /// </summary>
    private static IResult? Mismatch(List<AiChangeOperation> applied, IReadOnlyList<Guid> selected, string approverId) =>
        applied.Select(operation => operation.Id).ToHashSet().SetEquals(selected)
            && applied.All(operation => operation.ResolvedByUserId == approverId)
            ? null
            : Refused(
                AiChangeCodes.ApprovalMismatch,
                "Approval id already used",
                "That approval id was already used for a different approval. Nothing was applied. Approve again with a new id.");

    /// <summary>Inside the gate's transaction: everything checked again, then every selected change applied, or none.</summary>
    private static async Task<IResult> ApplyAsync(
        LorexDbContext db,
        TimeProvider clock,
        Guid universeId,
        Guid proposalId,
        string approverId,
        Guid approvalId,
        int revision,
        IReadOnlyList<Guid> selected,
        CancellationToken cancellationToken)
    {
        var proposal = await db.AiChangeProposals
            .Include(row => row.Operations)
            .FirstOrDefaultAsync(row => row.Id == proposalId && row.UniverseId == universeId, cancellationToken);
        if (proposal is null || !AiChangeViews.MayRead(proposal, approverId))
        {
            return Results.NotFound();
        }

        // The approver's role, now: approving is applying, so it takes the role that could make the change by hand.
        if (await UniverseAccess.RoleAsync(db, universeId, approverId, cancellationToken) is not { } approver)
        {
            return Results.NotFound();
        }

        // Read again in here: a second request with this id that waited behind the first finds its receipt - only when it
        // is the very same request, by the same person.
        var mine = proposal.Operations.Where(operation => operation.ApprovalId == approvalId).ToList();
        if (mine.Count > 0)
        {
            if (Mismatch(mine, selected, approverId) is { } refused)
            {
                return refused;
            }

            return Results.Ok(new AiChangeReceipt(approvalId, Receipt(mine), (await AiChangeViews.ReadAsync(db, universeId, proposalId, approverId, approver, cancellationToken))!));
        }

        if (proposal.Status != AiChangeProposalStatus.Open)
        {
            return Refused(AiChangeCodes.NotOpen, "This proposal is closed", "Nothing in it can be approved any more.");
        }

        if (proposal.Revision != revision)
        {
            return Refused(AiChangeCodes.ProposalChanged, "Proposal changed", "Someone edited these changes after you opened them. Nothing was applied. Review them again.");
        }

        var byId = proposal.Operations.ToDictionary(operation => operation.Id);
        if (selected.Any(id => !byId.ContainsKey(id)))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["operationIds"] = ["Choose changes from this proposal."] });
        }

        var chosen = selected.Select(id => byId[id]).ToList();
        if (chosen.Any(operation => operation.Status != AiChangeOperationStatus.Pending))
        {
            return Refused(AiChangeCodes.AlreadyDecided, "Already decided", "Someone already approved or rejected some of these changes. Nothing was applied.");
        }

        if (chosen.Any(operation => !AiChangePermissions.MayApprove(approver, operation.Resource, operation.Action)))
        {
            return UniverseAccess.PermissionDenied();
        }

        // The person it was staged for, and the app it came through, must still be able to propose it.
        if (await AiChangeViews.BlockedAsync(db, proposal, cancellationToken) is { } blocked)
        {
            return Refused(AiChangeCodes.Blocked, "Can't be approved", blocked);
        }

        var proposerRole = (await UniverseAccess.RoleAsync(db, universeId, proposal.ProposedByUserId, cancellationToken))!.Value;
        if (chosen.Any(operation => !AiChangePermissions.MayStage(proposerRole, operation.Resource, operation.Action)))
        {
            return Refused(AiChangeCodes.Blocked, "Can't be approved", "The person who asked for these changes can no longer propose some of them. Reject them instead.");
        }

        var works = proposal.Operations.OrderBy(operation => operation.Sequence).Select(AiChangeWork.From).ToList();
        await new AiChangeChecker(db, universeId, proposal.ProposedByUserId).CheckAsync(works, cancellationToken);
        var worksById = works.ToDictionary(work => work.OperationId);
        var byKey = works.ToDictionary(work => work.Key, StringComparer.Ordinal);
        var picked = chosen.Select(operation => worksById[operation.Id]).ToList();
        var pickedKeys = picked.Select(work => work.Key).ToHashSet(StringComparer.Ordinal);

        // Everything a selected change needs must come with it, or have been applied already.
        var missing = picked
            .SelectMany(work => work.DependsOn)
            .Where(key => !pickedKeys.Contains(key) && byKey[key].Status != AiChangeOperationStatus.Committed)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (missing.Count > 0)
        {
            return Refused(
                AiChangeCodes.MissingDependency,
                "Approve these together",
                "Some of these changes need others you didn't select. Select them too, or reject the changes that need them.",
                new Dictionary<string, object?> { ["needs"] = missing });
        }

        var troubled = picked.Where(work => work.Issues.Count > 0).ToList();
        if (troubled.Count > 0)
        {
            return Refused(
                AiChangeCodes.CannotApprove,
                "Can't be approved yet",
                "Some of these changes can't be applied as they stand. Nothing was applied.",
                new Dictionary<string, object?>
                {
                    ["operations"] = troubled.Select(work => new { operationId = work.OperationId, key = work.Key, issues = work.Issues }).ToList(),
                });
        }

        var made = works.Where(work => work.Status == AiChangeOperationStatus.Committed && work.ResultId is not null)
            .ToDictionary(work => work.Key, work => work.ResultId!.Value, StringComparer.Ordinal);
        var now = clock.GetUtcNow().UtcDateTime;

        foreach (var work in Ordered(picked, pickedKeys))
        {
            var (resultId, problem) = await RunAsync(db, universeId, approverId, work, made, cancellationToken);
            if (problem is not null)
            {
                return CommitRefused(work, problem);
            }

            if (work.Action == AiChangeAction.Create)
            {
                made[work.Key] = resultId!.Value;
            }

            var row = byId[work.OperationId];
            row.Status = AiChangeOperationStatus.Committed;
            row.ResultId = resultId ?? work.TargetId;
            row.ApprovalId = approvalId;
            row.ResolvedByUserId = approverId;
            row.ResolvedAt = now;
        }

        Close(proposal, now);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new AiChangeReceipt(
            approvalId,
            Receipt([.. Ordered(picked, pickedKeys).Select(work => byId[work.OperationId])]),
            (await AiChangeViews.ReadAsync(db, universeId, proposalId, approverId, approver, cancellationToken))!));
    }

    /// <summary>The selected changes in an order that puts every one after what it needs; otherwise as the AI listed them.</summary>
    private static List<AiChangeWork> Ordered(List<AiChangeWork> picked, HashSet<string> keys)
    {
        var ordered = new List<AiChangeWork>();
        var done = new HashSet<string>(StringComparer.Ordinal);
        var left = picked.OrderBy(work => work.Sequence).ToList();
        while (left.Count > 0)
        {
            var next = left.First(work => work.DependsOn.All(key => !keys.Contains(key) || done.Contains(key)));
            ordered.Add(next);
            done.Add(next.Key);
            left.Remove(next);
        }

        return ordered;
    }

    /// <summary>
    /// One change through its resource's own write path, as the approver, with every reference resolved to a real id. The
    /// id it made or changed, or the write path's own refusal.
    /// </summary>
    private static async Task<(Guid? Id, IResult? Problem)> RunAsync(
        LorexDbContext db,
        Guid universeId,
        string approverId,
        AiChangeWork work,
        Dictionary<string, Guid> made,
        CancellationToken cancellationToken)
    {
        Guid Id(AiRef reference) => reference.Id ?? made[reference.Key!];
        var target = work.TargetId;

        switch (work.Proposed)
        {
            case RemoveValues remove:
                // To the Trash - or an idea to its owner's deleted ideas - through each resource's own lifecycle; never a
                // permanent delete (ADR 0048).
                var trashed = work.Resource switch
                {
                    AiChangeResource.LoreEntry => await EntityEndpoints.TrashCoreAsync(universeId, target!.Value, db, cancellationToken),
                    AiChangeResource.Story => await StoryEndpoints.TrashCoreAsync(db, universeId, target!.Value, cancellationToken),
                    AiChangeResource.Chapter => await ChapterEndpoints.TrashCoreAsync(db, universeId, remove.StoryId!.Value, target!.Value, cancellationToken),
                    AiChangeResource.Scene => await SceneEndpoints.TrashCoreAsync(db, universeId, remove.StoryId!.Value, target!.Value, cancellationToken),
                    AiChangeResource.Relationship => await RelationshipEndpoints.TrashCoreAsync(universeId, target!.Value, db, cancellationToken),
                    AiChangeResource.TimelineEvent => await TimelineEndpoints.TrashCoreAsync(universeId, target!.Value, db, cancellationToken),
                    AiChangeResource.PlotArc => await PlotArcEndpoints.TrashCoreAsync(db, universeId, remove.StoryId!.Value, target!.Value, cancellationToken),
                    AiChangeResource.PlotBeat => await PlotBeatEndpoints.TrashCoreAsync(db, universeId, remove.StoryId!.Value, target!.Value, cancellationToken),
                    AiChangeResource.WorldRule => await WorldRuleEndpoints.TrashCoreAsync(db, null, universeId, target!.Value, cancellationToken),
                    AiChangeResource.Idea => await IdeaEndpoints.DeleteCoreAsync(db, approverId, target!.Value, cancellationToken),

                    // A field is archived, never deleted: it keeps every value and comes back with a restore (Issue #39).
                    AiChangeResource.LoreField => await EntityTypeEndpoints.ArchiveFieldCoreAsync(
                        db, universeId, ((FieldValues)work.Before!).Type.Id!.Value, target!.Value, cancellationToken),
                    _ => throw new InvalidOperationException($"A {work.Resource} change is never a removal."),
                };
                return Done(trashed, target);

            case OrderValues order:
                return Done(await ReorderAsync(db, universeId, work.Resource, order, Id, cancellationToken), work.Resource == AiChangeResource.PlotBeat ? Id(order.Arc!) : order.Story.Id);

            case ArticleValues article:
                var entityId = Id(article.Entry);
                var (written, _) = (await AiChangeSnapshots.ArticleAsync(db, universeId, entityId, cancellationToken)) ?? (string.Empty, 0);
                return Done(
                    await EntityArticleEndpoints.SaveCoreAsync(
                        db,
                        universeId,
                        entityId,
                        new EntityArticleRequest(AiChangeArticles.Document(written, article.Append, article.Blocks), work.BaseVersion),
                        approverId,
                        cancellationToken),
                    entityId);

            case PlotArcValues arc:
                var plotArc = new PlotArcRequest(arc.Title, arc.Description, arc.Notes);
                return work.Action == AiChangeAction.Create
                    ? Made<PlotArcResponse>(await PlotArcEndpoints.CreateCoreAsync(db, universeId, Id(arc.Story), plotArc, cancellationToken), detail => detail.Id)
                    : Done(await PlotArcEndpoints.UpdateCoreAsync(db, universeId, Id(arc.Story), target!.Value, plotArc, cancellationToken), target);

            case PlotBeatValues beat:
                var arcId = Id(beat.Arc);
                var beatStory = beat.Story?.Id ?? await db.PlotArcs.Where(row => row.Id == arcId).Select(row => row.StoryId).SingleAsync(cancellationToken);
                var plotBeat = new PlotBeatRequest(beat.Title, beat.Description, beat.Notes, [.. beat.Scenes.Select(Id)], [.. beat.Lore.Select(Id)], arcId);
                return work.Action == AiChangeAction.Create
                    ? Made<PlotBeatResponse>(await PlotBeatEndpoints.CreateCoreAsync(db, universeId, beatStory, arcId, plotBeat, cancellationToken), detail => detail.Id)
                    : Done(await PlotBeatEndpoints.UpdateCoreAsync(db, universeId, beatStory, target!.Value, plotBeat, cancellationToken), target);

            case WorldRuleValues rule:
                var stated = new WorldRuleRequest(
                    rule.Title,
                    rule.Description,
                    work.Action == AiChangeAction.Create
                        ? null
                        : await db.WorldRules.Where(row => row.Id == target).Select(row => (DateTime?)row.UpdatedAt).SingleAsync(cancellationToken),
                    rule.Check is { } check
                        ? new WorldRuleValidationRequest(WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod, check.EventKindId, check.MethodId, check.MaxOccurrences)
                        : new WorldRuleValidationRequest(WorldRuleValidationKind.None, null, null, null));
                return work.Action == AiChangeAction.Create
                    ? Made<WorldRuleDetail>(await WorldRuleEndpoints.CreateCoreAsync(db, null, universeId, stated, cancellationToken), detail => detail.Id)
                    : Done(await WorldRuleEndpoints.UpdateCoreAsync(db, null, universeId, target!.Value, stated, cancellationToken), target);

            case IdeaValues idea:
                // Always the approver's own idea, in this universe: the approval already required the approver to be the
                // owner who asked for it (ADR 0048).
                var kept = new IdeaRequest(
                    idea.Title,
                    idea.Body,
                    universeId,
                    [.. idea.References.Select(reference => new IdeaReferenceInput(reference.Kind, Id(reference.Target)))],
                    work.Action == AiChangeAction.Create
                        ? null
                        : await db.Ideas.Where(row => row.Id == target).Select(row => (DateTime?)row.UpdatedAt).SingleAsync(cancellationToken));
                return work.Action == AiChangeAction.Create
                    ? Made<IdeaDetail>(await IdeaEndpoints.CreateCoreAsync(db, approverId, kept, cancellationToken), detail => detail.Id)
                    : Done(await IdeaEndpoints.UpdateCoreAsync(db, approverId, target!.Value, kept, cancellationToken), target);

            // Schema (ADR 0062): each definition through the Types screen's own write path, as the approver.
            case TypeValues type:
                var typed = new EntityTypeRequest(
                    type.Name,
                    type.Description,
                    type.Icon,
                    type.AccentColor,
                    null,
                    type.FamilyTreeEligible,
                    new EntityTypeParentChoice(type.Parent is { } parent ? Id(parent) : null),
                    [.. type.Groups.Select(group => new EntityTypeGroupChoice(Id(group)))]);
                return work.Action == AiChangeAction.Create
                    ? Made<EntityTypeResponse>(await EntityTypeEndpoints.CreateCoreAsync(db, universeId, typed, cancellationToken), detail => detail.Id)
                    : Done(await EntityTypeEndpoints.UpdateCoreAsync(db, universeId, target!.Value, typed, cancellationToken), target);

            case FieldValues field:
                var ofType = Id(field.Type);
                var defined = new FieldDefinitionRequest(
                    field.Name,
                    field.Kind,
                    field.Required,
                    null,
                    field.DefaultValue,
                    field.Options,
                    field.Semantic,
                    field.TargetType is { } linksToType ? Id(linksToType) : null,
                    field.TargetGroup is { } linksToGroup ? Id(linksToGroup) : null,
                    work.BaseVersion);
                return work.Action == AiChangeAction.Create
                    ? Made<EntityTypeResponse>(
                        await EntityTypeEndpoints.AddFieldCoreAsync(db, universeId, ofType, defined, cancellationToken),
                        detail => detail.Fields.Single(added => added.Name == field.Name).Id)
                    : Done(await EntityTypeEndpoints.UpdateFieldCoreAsync(universeId, ofType, target!.Value, defined, db, cancellationToken), target);

            case GroupValues group:
                return work.Action == AiChangeAction.Create
                    ? Made<EntityTypeGroupResponse>(
                        await EntityTypeGroupEndpoints.CreateCoreAsync(db, universeId, group.Name, group.FamilyTreeEnabled, cancellationToken),
                        detail => detail.Id)
                    : Done(await EntityTypeGroupEndpoints.UpdateCoreAsync(db, universeId, target!.Value, group.Name, group.FamilyTreeEnabled, cancellationToken), target);

            case RelationshipKindValues kind:
                var described = new RelationshipTypeRequest(kind.Name, kind.InverseName, kind.Symmetric, kind.Description, null, kind.Constraints, kind.FamilySemantic);
                return work.Action == AiChangeAction.Create
                    ? Made<RelationshipTypeResponse>(await RelationshipTypeEndpoints.CreateCoreAsync(db, universeId, described, cancellationToken), detail => detail.Id)
                    : Done(await RelationshipTypeEndpoints.UpdateCoreAsync(db, universeId, target!.Value, described, cancellationToken), target);

            case ChronologyValues reckoning:
                // Each half through its own screen's write: the periods under the gate they are always under, the calendar as
                // it is saved by hand. Only what changed is written.
                var was = (ChronologyValues)work.Before!;
                if (!AiChangeSnapshots.Same(was.Eras, reckoning.Eras)
                    && await Chronology.ChronologyEndpoints.UpdateCoreAsync(
                        universeId,
                        new Chronology.ChronologyRequest([.. reckoning.Eras.Select(era => new Chronology.ChronologyEraRequest(era.Id, era.Name, era.Abbreviation, era.Direction, era.Label))]),
                        db,
                        cancellationToken) is var periods
                    && !Succeeded(periods))
                {
                    return (null, periods);
                }

                if (reckoning.Months is { } months && !AiChangeSnapshots.Same(was.Months, months))
                {
                    return Done(
                        await Chronology.ChronologyCalendarEndpoints.SaveCoreAsync(
                            db,
                            universeId,
                            new Chronology.ChronologyCalendarRequest([.. months.Select(month => new Chronology.ChronologyCalendarMonthRequest(month.Id, month.Name, month.Abbreviation, month.Days))]),
                            cancellationToken),
                        universeId);
                }

                return (universeId, null);

            case TermValues term:
                return work.Action == AiChangeAction.Create
                    ? Made<ValidationTermResponse>(await ValidationTermEndpoints.CreateCoreAsync(db, universeId, new ValidationTermRequest(term.Kind, term.Name), cancellationToken), detail => detail.Id)
                    : Done(await ValidationTermEndpoints.RenameCoreAsync(db, universeId, target!.Value, new ValidationTermRenameRequest(term.Name), cancellationToken), target);

            case LoreValues lore:
                var entry = new EntityRequest(
                    lore.TypeId,
                    lore.Name,
                    lore.Summary,
                    lore.CanonStatus,
                    lore.Aliases,
                    lore.Tags,
                    [.. lore.Fields.Select(field => new FieldValueInput(
                        field.FieldId, field.Text, field.Number, field.Boolean, field.Date, field.OptionIds, field.Entry is { } link ? Id(link) : null, field.EraId))],
                    work.BaseVersion);
                if (work.Action == AiChangeAction.Create)
                {
                    var (entity, refused) = await EntityEndpoints.CreateEntryAsync(db, universeId, entry, approverId, cancellationToken);
                    return (entity?.Id, refused);
                }

                return Done(await EntityEndpoints.UpdateCoreAsync(universeId, target!.Value, entry, approverId, db, cancellationToken), target);

            case RelationshipValues relationship:
                var link = new RelationshipRequest(
                    relationship.TypeId, Id(relationship.Source), Id(relationship.Target), relationship.CanonStatus, relationship.StartDate, relationship.EndDate, relationship.Notes);
                return work.Action == AiChangeAction.Create
                    ? Made<RelationshipDetail>(await RelationshipEndpoints.CreateCoreAsync(universeId, link, db, cancellationToken), detail => detail.Id)
                    : Done(await RelationshipEndpoints.UpdateCoreAsync(universeId, target!.Value, link, db, cancellationToken), target);

            case StoryValues story:
                var told = new StoryRequest(story.Title, story.Premise, story.Status, work.BaseVersion);
                return work.Action == AiChangeAction.Create
                    ? Made<StoryDetail>(await StoryEndpoints.CreateCoreAsync(db, universeId, told, cancellationToken), detail => detail.Id)
                    : Done(await StoryEndpoints.UpdateCoreAsync(db, universeId, target!.Value, told, cancellationToken), target);

            case ChapterValues chapter:
                var section = new ChapterRequest(chapter.Title, chapter.Summary, chapter.Notes);
                return work.Action == AiChangeAction.Create
                    ? Made<ChapterResponse>(await ChapterEndpoints.CreateCoreAsync(db, universeId, Id(chapter.Story), section, cancellationToken), detail => detail.Id)
                    : Done(await ChapterEndpoints.UpdateCoreAsync(db, universeId, Id(chapter.Story), target!.Value, section, cancellationToken), target);

            case SceneValues scene:
                var shown = new SceneRequest(
                    scene.Title,
                    scene.Summary,
                    scene.Notes,
                    scene.PointOfView is { } pov ? Id(pov) : null,
                    scene.Date,
                    [.. scene.Lore.Select(Id)],
                    scene.Chapter is { } inChapter ? Id(inChapter) : null,
                    work.BaseVersion);
                return work.Action == AiChangeAction.Create
                    ? Made<SceneResponse>(await SceneEndpoints.CreateCoreAsync(db, universeId, Id(scene.Story), shown, cancellationToken), detail => detail.Id)
                    : Done(await SceneEndpoints.UpdateCoreAsync(db, universeId, Id(scene.Story), target!.Value, shown, cancellationToken), target);

            case ManuscriptValues manuscript:
                var sceneId = Id(manuscript.Scene);
                var storyId = manuscript.StoryId ?? await db.Scenes.Where(row => row.Id == sceneId).Select(row => row.StoryId).SingleAsync(cancellationToken);
                var (current, _) = (await AiChangeSnapshots.ManuscriptAsync(db, sceneId, cancellationToken))!.Value;
                var content = manuscript.Append ? AiChangeText.Appended(current, manuscript.Text) : manuscript.Text;
                return Done(
                    await SceneManuscriptEndpoints.SaveCoreAsync(db, universeId, storyId, sceneId, new SceneManuscriptRequest(content, work.BaseVersion), approverId, cancellationToken),
                    sceneId);

            case TimelineValues moment:
                // A change from before issue 45 holds no stories or details, and keeps what is stored (ADR 0048).
                var dated = AiChangeRequests.Moment(
                    moment,
                    [.. moment.Participants.Select(Id)],
                    moment.Stories is { } stories ? [.. stories.Select(Id)] : null,
                    moment.Stories is null
                        ? null
                        : new TimelineValidationRequest(moment.Details?.EventKindId, moment.Details?.MethodId, moment.Details?.Participant is { } participant ? Id(participant) : null));
                return work.Action == AiChangeAction.Create
                    ? Made<TimelineEntryResponse>(await TimelineEndpoints.CreateCoreAsync(universeId, dated, db, cancellationToken), detail => detail.Id)
                    : Done(await TimelineEndpoints.UpdateCoreAsync(universeId, target!.Value, dated, db, cancellationToken), target);

            default:
                throw new InvalidOperationException("An AI change of an unknown shape.");
        }
    }

    /// <summary>A whole order through its container's own order route, every item resolved to a real id.</summary>
    private static async Task<IResult> ReorderAsync(
        LorexDbContext db,
        Guid universeId,
        AiChangeResource resource,
        OrderValues order,
        Func<AiRef, Guid> id,
        CancellationToken cancellationToken)
    {
        List<Guid> items = [.. order.Items.Select(id)];
        return resource switch
        {
            AiChangeResource.Chapter => await ChapterEndpoints.ReorderCoreAsync(db, universeId, id(order.Story), new ChapterOrderRequest(items), cancellationToken),
            AiChangeResource.Scene => await SceneEndpoints.ReorderCoreAsync(
                db, universeId, id(order.Story), new SceneOrderRequest(items, order.Chapter is { } chapter ? id(chapter) : null), cancellationToken),
            AiChangeResource.PlotArc => await PlotArcEndpoints.ReorderCoreAsync(db, universeId, id(order.Story), new PlotArcOrderRequest(items), cancellationToken),
            _ => await PlotBeatEndpoints.ReorderCoreAsync(db, universeId, id(order.Story), id(order.Arc!), new PlotBeatOrderRequest(items), cancellationToken),
        };
    }

    private static (Guid? Id, IResult? Problem) Done(IResult result, Guid? id) => Succeeded(result) ? (id, null) : (null, result);

    private static (Guid? Id, IResult? Problem) Made<T>(IResult result, Func<T, Guid> id) =>
        Succeeded(result) && result is IValueHttpResult { Value: T made } ? (id(made), null) : (null, result);

    private static bool Succeeded(IResult result) =>
        result is not IStatusCodeHttpResult { StatusCode: { } status } || status is >= 200 and < 300;

    /// <summary>A write path refused one change: the whole approval is rolled back, and the refusal names that change.</summary>
    private static IResult CommitRefused(AiChangeWork work, IResult refusal)
    {
        var details = refusal switch
        {
            ProblemHttpResult problem => problem.ProblemDetails,
            ValidationProblem validation => validation.ProblemDetails,
            _ => null,
        };

        var reasons = details is Microsoft.AspNetCore.Http.HttpValidationProblemDetails validationDetails
            ? validationDetails.Errors.SelectMany(error => error.Value).ToList()
            : details?.Detail is { } detail ? [detail] : ["That item isn't there any more."];

        return Refused(
            details?.Extensions.TryGetValue("code", out var code) == true && code?.ToString() == CanonPromotionGate.BlockedCode
                ? CanonPromotionGate.BlockedCode
                : AiChangeCodes.CommitRefused,
            "Not applied",
            $"LoreX refused \"{work.Key}\", so nothing was applied: {string.Join(" ", reasons)}",
            new Dictionary<string, object?> { ["operationId"] = work.OperationId, ["key"] = work.Key, ["reasons"] = reasons });
    }

    // ---------- Rejecting and editing ----------

    /// <summary>
    /// Rejects pending changes - and every pending change that needs one of them, which could never be applied without it.
    /// Touches nothing in the universe. A reviewer rejects any; the person it was staged for may withdraw their own.
    /// </summary>
    public static async Task<IResult> RejectAsync(
        LorexDbContext db,
        TimeProvider clock,
        Guid universeId,
        Guid proposalId,
        string userId,
        UniverseRole role,
        AiChangeRejectRequest request,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var proposal = await db.AiChangeProposals
            .Include(row => row.Operations)
            .FirstOrDefaultAsync(row => row.Id == proposalId && row.UniverseId == universeId, cancellationToken);
        var mayReview = AiChangePermissions.MayReview(role);
        if (proposal is null || (!mayReview && proposal.ProposedByUserId != userId) || !AiChangeViews.MayRead(proposal, userId))
        {
            return Results.NotFound();
        }

        if (proposal.Status != AiChangeProposalStatus.Open)
        {
            return Refused(AiChangeCodes.NotOpen, "This proposal is closed", "Nothing in it is waiting for a decision.");
        }

        var pending = proposal.Operations.Where(operation => operation.Status == AiChangeOperationStatus.Pending).ToList();
        var chosen = request.All
            ? pending
            : pending.Where(operation => request.OperationIds?.Contains(operation.Id) == true).ToList();

        if (chosen.Count == 0 || (!request.All && chosen.Count != (request.OperationIds?.Distinct().Count() ?? 0)))
        {
            return Refused(AiChangeCodes.AlreadyDecided, "Already decided", "Those changes aren't waiting for a decision any more.");
        }

        var now = clock.GetUtcNow().UtcDateTime;
        var rejected = chosen.Select(operation => operation.Key).ToHashSet(StringComparer.Ordinal);
        foreach (var operation in chosen)
        {
            Decide(operation, userId, now, null);
        }

        // Whatever needs a rejected change goes with it, however far down.
        for (var grew = true; grew;)
        {
            grew = false;
            foreach (var operation in proposal.Operations.Where(operation => operation.Status == AiChangeOperationStatus.Pending))
            {
                var needs = System.Text.Json.JsonSerializer.Deserialize<List<string>>(operation.DependsOn, AiChangeJson.Options) ?? [];
                if (needs.Any(rejected.Contains))
                {
                    Decide(operation, userId, now, "needs_rejected");
                    rejected.Add(operation.Key);
                    grew = true;
                }
            }
        }

        Close(proposal, now);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await AiChangeViews.ReadAsync(db, universeId, proposalId, userId, role, cancellationToken));
    }

    /// <summary>
    /// A reviewer's edit to one pending change: only the plain values the review offers, checked again exactly as staging
    /// checks them, over the revision the reviewer was shown. The proposal's revision moves on, so an approval prepared
    /// before the edit is refused rather than applying what nobody reviewed.
    /// </summary>
    public static async Task<IResult> EditAsync(
        LorexDbContext db,
        Guid universeId,
        Guid proposalId,
        Guid operationId,
        string userId,
        UniverseRole role,
        AiChangeEditRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Values is not { } values || request.Revision is not { } revision)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["Send the new values and the proposal's revision."] });
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var proposal = await db.AiChangeProposals
            .Include(row => row.Operations)
            .FirstOrDefaultAsync(row => row.Id == proposalId && row.UniverseId == universeId, cancellationToken);
        var row = proposal?.Operations.FirstOrDefault(operation => operation.Id == operationId);
        if (proposal is null || row is null || !AiChangeViews.MayRead(proposal, userId) || !AiChangePermissions.MayReview(role))
        {
            return Results.NotFound();
        }

        if (proposal.Status != AiChangeProposalStatus.Open || row.Status != AiChangeOperationStatus.Pending)
        {
            return Refused(AiChangeCodes.AlreadyDecided, "Already decided", "This change isn't waiting for a decision any more.");
        }

        if (proposal.Revision != revision)
        {
            return Refused(AiChangeCodes.ProposalChanged, "Proposal changed", "Someone edited these changes after you opened them. Review them again.");
        }

        var works = proposal.Operations.OrderBy(operation => operation.Sequence).Select(AiChangeWork.From).ToList();
        var work = works.Single(candidate => candidate.OperationId == operationId);
        if (Edited(work.Proposed, values) is not { } edited)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["This change has nothing that can be edited here."] });
        }

        work.Proposed = edited;
        await new AiChangeChecker(db, universeId, proposal.ProposedByUserId).CheckAsync(works, cancellationToken);
        if (work.IsConflict)
        {
            return Refused(AiChangeCodes.CannotApprove, "Can't be edited", "This changed in LoreX after the AI suggested it, so it can only be rejected.");
        }

        if (work.Issues.Count > 0)
        {
            return Results.ValidationProblem(
                work.Issues.GroupBy(issue => issue.Field ?? "values").ToDictionary(group => group.Key, group => group.Select(issue => issue.Message).ToArray()));
        }

        if (work.Action == AiChangeAction.Update && AiChangeSnapshots.Same(work.Before, edited))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["With that edit, this change wouldn't change anything. Reject it instead."] });
        }

        row.Proposed = AiChangeJson.Write(edited);
        proposal.Revision++;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await AiChangeViews.ReadAsync(db, universeId, proposalId, userId, role, cancellationToken));
    }

    /// <summary>The values with the review's edits applied: a value left out stays, an empty text clears an optional one.</summary>
    private static object? Edited(object proposed, AiChangeEditable values)
    {
        static string? Optional(string? edit, string? stored) => edit is null ? stored : string.IsNullOrWhiteSpace(edit) ? null : edit.Trim();
        static string Required(string? edit, string stored) => edit?.Trim() ?? stored;

        return proposed switch
        {
            LoreValues lore => lore with
            {
                Name = Required(values.Name, lore.Name),
                Summary = Optional(values.Summary, lore.Summary),
                CanonStatus = values.CanonStatus ?? lore.CanonStatus,
            },
            StoryValues story => story with { Title = Required(values.Title, story.Title), Premise = Optional(values.Premise, story.Premise) },
            ChapterValues chapter => chapter with
            {
                Title = Required(values.Title, chapter.Title),
                Summary = Optional(values.Summary, chapter.Summary),
                Notes = Optional(values.Notes, chapter.Notes),
            },
            SceneValues scene => scene with
            {
                Title = Required(values.Title, scene.Title),
                Summary = Optional(values.Summary, scene.Summary),
                Notes = Optional(values.Notes, scene.Notes),
            },
            RelationshipValues relationship => relationship with
            {
                Notes = Optional(values.Notes, relationship.Notes),
                CanonStatus = values.CanonStatus ?? relationship.CanonStatus,
            },
            TimelineValues moment => moment with
            {
                Title = Required(values.Title, moment.Title),
                Description = Optional(values.Description, moment.Description),
                CanonStatus = values.CanonStatus ?? moment.CanonStatus,
            },
            ManuscriptValues manuscript => manuscript with { Text = values.Text ?? manuscript.Text },
            PlotArcValues arc => arc with
            {
                Title = Required(values.Title, arc.Title),
                Description = Optional(values.Description, arc.Description),
                Notes = Optional(values.Notes, arc.Notes),
            },
            PlotBeatValues beat => beat with
            {
                Title = Required(values.Title, beat.Title),
                Description = Optional(values.Description, beat.Description),
                Notes = Optional(values.Notes, beat.Notes),
            },
            WorldRuleValues rule => rule with
            {
                Title = Required(values.Title, rule.Title),
                Description = values.Description is null ? rule.Description : values.Description.Trim().Length == 0 ? string.Empty : values.Description,
            },
            IdeaValues idea => idea with
            {
                Title = Required(values.Title, idea.Title),
                Body = values.Text is null ? idea.Body : values.Text.Trim().Length == 0 ? string.Empty : values.Text,
            },
            _ => null,
        };
    }

    // ---------- Shared ----------

    private static void Decide(AiChangeOperation operation, string userId, DateTime now, string? note)
    {
        operation.Status = AiChangeOperationStatus.Rejected;
        operation.ResolvedByUserId = userId;
        operation.ResolvedAt = now;
        operation.ResolutionNote = note;
    }

    /// <summary>The proposal's status from its changes: open while any waits; then approved, partly approved or rejected.</summary>
    private static void Close(AiChangeProposal proposal, DateTime now)
    {
        var statuses = proposal.Operations.Select(operation => operation.Status).ToList();
        if (statuses.Contains(AiChangeOperationStatus.Pending))
        {
            proposal.Status = AiChangeProposalStatus.Open;
            return;
        }

        proposal.Status = statuses.All(status => status == AiChangeOperationStatus.Committed)
            ? AiChangeProposalStatus.Approved
            : statuses.Contains(AiChangeOperationStatus.Committed)
                ? AiChangeProposalStatus.PartiallyApproved
                : AiChangeProposalStatus.Rejected;
        proposal.ClosedAt = now;
    }

    private static List<AiChangeReceiptLine> Receipt(IEnumerable<AiChangeOperation> applied) =>
        [.. applied.Select(operation => new AiChangeReceiptLine(operation.Id, operation.Key, operation.Resource, operation.Action, operation.ResultId))];

    private static IResult Refused(string code, string title, string detail, Dictionary<string, object?>? more = null)
    {
        var extensions = new Dictionary<string, object?> { ["code"] = code };
        foreach (var (key, value) in more ?? [])
        {
            extensions[key] = value;
        }

        return Results.Problem(title: title, detail: detail, statusCode: StatusCodes.Status409Conflict, extensions: extensions);
    }
}
