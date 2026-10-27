using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.WorldRules;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// The checks of the resources issue 45 added (ADR 0048), run where issue 32's run: at staging, on every read, and inside every
/// approval. Each is the resource's own validator and reference rules, with ids re-resolved in this universe, plus the
/// stale-change check its stored form or version allows.
/// </summary>
internal sealed partial class AiChangeChecker
{
    private async Task CheckArticleAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var article = (ArticleValues)work.Proposed;

        if (AiChangeArticles.Problem(article.Blocks) is { } problem)
        {
            work.Problem(AiChangeCodes.Invalid, problem, "blocks");
            return;
        }

        var current = string.Empty;
        var (entityId, pending) = Resolve(article.Entry);
        if (pending is null)
        {
            if (entityId is not { } existing
                || await AiChangeSnapshots.ArticleAsync(db, universeId, existing, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "That entry isn't in this universe, or it is in the Trash.", "entry");
                return;
            }

            if (stored.Version != work.BaseVersion)
            {
                work.Conflict("This entry's article was saved after the AI wrote this change, so it can't be applied. Nothing newer will be overwritten. Reject it, or ask for the change again.");
            }

            current = stored.Content;
        }

        // The article's own validation, on the document as it would be stored - the same a save from the editor passes.
        var document = AiChangeArticles.Document(current, article.Append, article.Blocks);
        if (LoreValidation.ValidateArticle(document) is { } errors)
        {
            work.Problems(errors);
        }
    }

    private async Task CheckPlotArcAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var arc = (PlotArcValues)work.Proposed;

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.PlotArcAsync(db, universeId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "This plot arc isn't in this universe any more. It may be in the Trash.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone changed this arc after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }
        }
        else
        {
            CheckStory(work, arc.Story, "story");
        }

        work.Problems(StoryValidation.ValidatePlotArc(new PlotArcRequest(arc.Title, arc.Description, arc.Notes)));
    }

    private async Task CheckPlotBeatAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var beat = (PlotBeatValues)work.Proposed;
        var keptLore = new HashSet<Guid>();

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.PlotBeatAsync(db, universeId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "This plot beat isn't in this universe any more. It may be in the Trash.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone changed this beat after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }

            keptLore = [.. stored.Lore.Select(lore => lore.Id).OfType<Guid>()];
        }

        // The story the beat is in: its existing arc's, or the story an arc this proposal creates is in. A beat moves only
        // between arcs of one story.
        var story = StoryOfArc(work, beat.Arc);
        if (work.Before is PlotBeatValues before && story is not null && before.Story != story)
        {
            work.Problem(AiChangeCodes.WrongRef, "A beat moves only to another arc of the same story.", "arc");
        }

        foreach (var scene in beat.Scenes)
        {
            var (sceneId, pendingScene) = Resolve(scene);
            if (pendingScene?.Proposed is SceneValues proposedScene)
            {
                if (story is not null && proposedScene.Story != story)
                {
                    work.Problem(AiChangeCodes.WrongRef, "That scene is in another story.", "scenes");
                }
            }
            else if (sceneId is { } existing
                && (!_scenes.TryGetValue(existing, out var found) || found.Trashed || (story?.Id is { } storyId && found.StoryId != storyId)))
            {
                work.Problem(AiChangeCodes.NotFound, "Link scenes from the beat's own story, and none in the Trash.", "scenes");
            }
        }

        foreach (var lore in beat.Lore)
        {
            CheckEntry(work, lore, "lore", keptLore);
        }

        work.Problems(StoryValidation.ValidatePlotBeat(new PlotBeatRequest(beat.Title, beat.Description, beat.Notes, null, null)));
    }

    /// <summary>The story an arc reference is in: an existing live arc's, or a created arc's own story reference.</summary>
    private AiRef? StoryOfArc(AiChangeWork work, AiRef arc)
    {
        var (arcId, pending) = Resolve(arc);
        if (pending?.Proposed is PlotArcValues created)
        {
            return created.Story;
        }

        if (arcId is { } existing)
        {
            if (!_arcs.TryGetValue(existing, out var found) || found.Trashed)
            {
                work.Problem(AiChangeCodes.NotFound, "That plot arc isn't in this universe, or it is in the Trash.", "arc");
                return null;
            }

            return AiRef.To(found.StoryId);
        }

        return null;
    }

    private async Task CheckWorldRuleAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var rule = (WorldRuleValues)work.Proposed;

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.WorldRuleAsync(db, universeId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "This world rule isn't in this universe any more. It may be in the Trash.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone changed this rule after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }
        }

        if (string.IsNullOrEmpty(rule.Title))
        {
            work.Problem(AiChangeCodes.Invalid, "Give the rule a title, so it can be found again.", "title");
        }
        else if (rule.Title.Length > WorldRuleLimits.TitleMaxLength)
        {
            work.Problem(AiChangeCodes.Invalid, $"Keep the title to {WorldRuleLimits.TitleMaxLength} characters or fewer.", "title");
        }

        if (rule.Description.Length > WorldRuleLimits.DescriptionMaxLength)
        {
            work.Problem(AiChangeCodes.Invalid, $"Keep the description to {WorldRuleLimits.DescriptionMaxLength:N0} characters or fewer.", "description");
        }

        // The check's own rule: both terms of this universe, of the right kind, and a count from 1.
        if (rule.Check is { } check)
        {
            work.Problems(await RuleValidationInput.ValidateRuleAsync(
                db,
                universeId,
                new WorldRuleValidationRequest(WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod, check.EventKindId, check.MethodId, check.MaxOccurrences),
                cancellationToken));
        }
    }

    private async Task CheckIdeaAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var idea = (IdeaValues)work.Proposed;
        var keptTargets = new HashSet<(IdeaReferenceKind, Guid)>();

        await CheckIdeaOwnerAsync(work, cancellationToken);

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.IdeaAsync(db, universeId, proposerId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "That idea isn't one of yours in this universe any more. It may have been deleted.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("This idea was changed after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }

            keptTargets = [.. stored.References.Where(reference => reference.Target.Id is not null).Select(reference => (reference.Kind, reference.Target.Id!.Value))];
        }

        if (string.IsNullOrEmpty(idea.Title))
        {
            work.Problem(AiChangeCodes.Invalid, "Give the idea a title, so it can be found again.", "title");
        }
        else if (idea.Title.Length > IdeaLimits.TitleMaxLength)
        {
            work.Problem(AiChangeCodes.Invalid, $"Keep the title under {IdeaLimits.TitleMaxLength} characters.", "title");
        }

        if (idea.Body.Length > IdeaLimits.BodyMaxLength)
        {
            work.Problem(AiChangeCodes.Invalid, $"Keep the idea under {IdeaLimits.BodyMaxLength:N0} characters.", "body");
        }

        if (idea.References.Count > IdeaLimits.MaxReferences)
        {
            work.Problem(AiChangeCodes.Invalid, $"An idea can reference up to {IdeaLimits.MaxReferences} things.", "references");
        }

        // Existing targets through the idea's own resolution, inside this universe only: something elsewhere, or in the Trash
        // and not already referenced, is refused as the idea's save refuses it.
        var existing = idea.References
            .Select(reference => (reference.Kind, Id: Resolve(reference.Target).Id))
            .Where(reference => reference.Id is not null)
            .Select(reference => new IdeaReferenceInput(reference.Kind, reference.Id!.Value))
            .Distinct()
            .ToList();
        if (existing.Count > 0)
        {
            var found = (await IdeaReferences.ResolveAsync(db, universeId, existing, cancellationToken))
                .ToDictionary(view => (view.Kind, view.Id), view => view.IsInTrash);
            if (existing.Any(reference => !found.ContainsKey((reference.Kind, reference.Id))))
            {
                work.Problem(AiChangeCodes.NotFound, "Something referenced isn't in this universe. An idea's references stay inside its universe.", "references");
            }
            else if (existing.Any(reference => found[(reference.Kind, reference.Id)] && !keptTargets.Contains((reference.Kind, reference.Id))))
            {
                work.Problem(AiChangeCodes.Trashed, "Something in the Trash can't be newly referenced. Restore it first.", "references");
            }
        }
    }

    /// <summary>
    /// An idea is the universe owner's own (ADR 0030): the account the proposal was staged for must own the universe now, or
    /// no idea change in it can be applied.
    /// </summary>
    private async Task CheckIdeaOwnerAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        if (!await db.Universes.AsNoTracking().AnyAsync(universe => universe.Id == universeId && universe.OwnerId == proposerId, cancellationToken))
        {
            work.Problem(AiChangeCodes.NotAllowed, "Ideas are the universe owner's own, and the person who asked for this one doesn't own this universe.");
        }
    }

    /// <summary>
    /// A container's whole order: unchanged since it was staged (apart from what this proposal itself created there), and naming
    /// every item there will be - each existing one and each item this proposal creates in it - exactly once. Nothing else in
    /// the proposal may move an item into or out of the container, or remove one: the order could not say where it goes.
    /// </summary>
    private async Task CheckOrderAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var order = (OrderValues)work.Proposed;
        var before = (OrderValues)work.Before!;

        if (await AiChangeSnapshots.OrderAsync(db, universeId, work.Resource, order.Story.Id, order.Chapter?.Id, order.Arc?.Id, cancellationToken) is not { } current)
        {
            work.Problem(AiChangeCodes.NotFound, "That container isn't in this universe any more, or it is in the Trash.");
            return;
        }

        bool InContainer(AiChangeWork other) => (other.Proposed, work.Resource) switch
        {
            (ChapterValues chapter, AiChangeResource.Chapter) => chapter.Story == order.Story,
            (PlotArcValues arc, AiChangeResource.PlotArc) => arc.Story == order.Story,
            (SceneValues scene, AiChangeResource.Scene) => scene.Story == order.Story && scene.Chapter == order.Chapter,
            (PlotBeatValues beat, AiChangeResource.PlotBeat) => beat.Arc == order.Arc,
            _ => false,
        };

        var creates = works.Where(other => other.Resource == work.Resource && other.Action == AiChangeAction.Create && other.Status != AiChangeOperationStatus.Rejected && InContainer(other)).ToList();
        var made = creates.Where(other => other.Status == AiChangeOperationStatus.Committed && other.ResultId is not null).Select(other => other.ResultId!.Value).ToHashSet();

        // What is there now is what was there, plus only what this proposal's own applied creates appended.
        var stored = current.Items.Select(item => item.Id!.Value).ToList();
        if (!stored.Where(id => !made.Contains(id)).SequenceEqual(before.Items.Select(item => item.Id!.Value)) || stored.Count(made.Contains) != made.Count)
        {
            work.Conflict("This order changed after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            return;
        }

        var listed = order.Items.Select(item => item.Id is { } id ? id.ToString() : $"ref:{item.Key}").ToHashSet(StringComparer.Ordinal);
        var wanted = before.Items.Select(item => item.Id!.Value.ToString())
            .Concat(creates.Select(other => $"ref:{other.Key}"))
            .ToHashSet(StringComparer.Ordinal);
        if (!listed.SetEquals(wanted))
        {
            work.Problem(AiChangeCodes.Invalid, "List every item of this container exactly once - each one there now and each one this proposal creates in it - and nothing else.", "items");
        }

        var moved = works.Where(other => other != work && other.IsPending && other.Action is AiChangeAction.Update or AiChangeAction.Remove && other.Resource == work.Resource
            && (other.Action == AiChangeAction.Remove
                ? before.Items.Any(item => item.Id == other.TargetId)
                : other.Before is { } was && InContainer(new AiChangeWork { Key = other.Key, Proposed = was }) != InContainer(other)));
        if (moved.Any())
        {
            work.Problem(AiChangeCodes.Unsupported, "Another change in this proposal moves an item into or out of this container, or removes one. Put the new order in a proposal of its own once those are decided.");
        }

        if (works.Any(other => other != work && other.IsPending && other.Action == AiChangeAction.Reorder && other.Resource == work.Resource
            && other.Proposed is OrderValues same && same.Story == order.Story && same.Chapter == order.Chapter && same.Arc == order.Arc
            && other.Sequence < work.Sequence))
        {
            work.Problem(AiChangeCodes.Duplicate, "Another change in this proposal already sets this order. Put both in one change.");
        }
    }
}
