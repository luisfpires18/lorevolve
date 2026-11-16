using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.ProjectEntities;
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

    /// <summary>
    /// A proposed project entry (#148), checked against the same rules the web routes apply: the project is this
    /// universe's, the type is that project's, the name fits, every field named belongs to the type or one above it,
    /// a link stays inside the project, and the lore entry it stands for is this universe's lore.
    ///
    /// <para>This is the parity the issue asks for. Nothing here is a second rule set: the limits come from
    /// <see cref="LoreLimits"/>, the scope comes from the same <c>ProjectId</c> the routes use, and anything refused
    /// here would be refused by the route as well.</para>
    /// </summary>
    private async Task CheckProjectEntryAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var entry = (ProjectEntryValues)work.Proposed;

        if (string.IsNullOrWhiteSpace(entry.Name))
        {
            work.Problem(AiChangeCodes.Invalid, "Give the entry a name.", "name");
        }
        else if (entry.Name.Length > LoreLimits.NameMaxLength)
        {
            work.Problem(AiChangeCodes.Invalid, $"Keep the name to {LoreLimits.NameMaxLength} characters or fewer.", "name");
        }

        if (entry.Summary.Length > LoreLimits.SummaryMaxLength)
        {
            work.Problem(AiChangeCodes.Invalid, $"Keep the summary to {LoreLimits.SummaryMaxLength:N0} characters or fewer.", "summary");
        }

        // The project has to be one of this universe's. A project of another universe is reported as not found rather
        // than refused, so a proposal cannot be used to discover that it exists.
        if (!await db.CreativeProjects.AsNoTracking()
                .AnyAsync(project => project.Id == entry.ProjectId && project.UniverseId == universeId, cancellationToken))
        {
            work.Problem(AiChangeCodes.NotFound, "No project of this universe has that id.", "projectId");
            return;
        }

        // The type may be one this proposal creates, by typeRef. Walk up through the types it creates, which must be this
        // project's, to the first one that exists: from there the stored lineage takes over. Pending keys are the part of
        // the lineage that does not exist yet.
        var pendingTypes = new HashSet<string>(StringComparer.Ordinal);
        Guid? typeId = entry.TypeRef is null ? entry.TypeId : null;
        var next = entry.TypeRef is { } typeRef ? new AiRef(null, typeRef) : null;
        while (next is not null)
        {
            var (id, pending) = Resolve(next);
            if (pending is null)
            {
                typeId = id;
                break;
            }

            if (pending.Proposed is not ProjectTypeValues proposedType || !pendingTypes.Add(pending.Key))
            {
                break;
            }

            if (proposedType.ProjectId != entry.ProjectId)
            {
                work.Problem(AiChangeCodes.NotFound, "That type is proposed for another project. An entry's type is one of its own project's.", "typeRef");
                return;
            }

            next = proposedType.Parent;
        }

        if (typeId is null && pendingTypes.Count == 0)
        {
            // A typeRef this proposal does not create was reported with the references.
            return;
        }

        // The type has to be that project's own, which is what keeps a project's entries out of the lore and out of
        // another project (#143).
        if (typeId is { } existingType
            && !await db.EntityTypes.AsNoTracking().IgnoreQueryFilters()
                .AnyAsync(type => type.Id == existingType && type.ProjectId == entry.ProjectId, cancellationToken))
        {
            work.Problem(AiChangeCodes.NotFound, "That type does not belong to this project. Read its types with get_project_schema.", "typeId");
            return;
        }

        // The fields an entry of this type may hold: its own and every type above it, resolved by the same helper the
        // routes use, over this project's types only.
        var parents = await EntityTypeEndpoints.ParentsAsync(db, universeId, cancellationToken, entry.ProjectId);
        var lineage = typeId is { } known ? EntityTypeHierarchy.Lineage(parents, known) : [];

        var definitions = await db.EntityFieldDefinitions.AsNoTracking().IgnoreQueryFilters()
            .Where(field => lineage.Contains(field.EntityTypeId) && field.ArchivedAt == null)
            .Select(field => new { field.Id, field.Name })
            .ToListAsync(cancellationToken);

        var byId = definitions.ToDictionary(field => field.Id, field => field.Name);

        foreach (var value in entry.Fields)
        {
            var fieldId = value.FieldId;
            string? name = null;
            if (value.FieldRef is { } fieldRef)
            {
                var (made, proposedField) = Resolve(new AiRef(null, fieldRef));
                if (proposedField?.Proposed is ProjectSchemaFieldValues field)
                {
                    // A field this proposal creates, on a type of the entry's lineage: one it creates, or one that exists.
                    var onLineage = field.Type.Key is { } key
                        ? pendingTypes.Contains(key) || Resolve(field.Type).Id is { } madeType && lineage.Contains(madeType)
                        : lineage.Contains(field.Type.Id!.Value);
                    if (!onLineage)
                    {
                        work.Problem(AiChangeCodes.NotFound, $"The field \"{fieldRef}\" is proposed for a type this entry is not of.", "fields");
                    }

                    name = field.Name;
                }
                else if (made is { } madeField)
                {
                    fieldId = madeField;
                }
                else
                {
                    // Reported with the references.
                    continue;
                }
            }

            if (name is null && !byId.TryGetValue(fieldId, out name))
            {
                work.Problem(
                    AiChangeCodes.NotFound,
                    "That field is not on this type or any type above it. Read the type's fields with get_project_schema.",
                    "fields");
                continue;
            }

            // A link field reaches entries of this same project, never the lore and never another project's (#144).
            if (value.LinkedEntryId is { } linked
                && !await db.Entities.AsNoTracking().IgnoreQueryFilters()
                    .AnyAsync(
                        candidate => candidate.Id == linked
                            && candidate.ProjectId == entry.ProjectId
                            && candidate.DeletedAt == null,
                        cancellationToken))
            {
                work.Problem(AiChangeCodes.NotFound, $"{name} can only link to another entry of this project.", "fields");
            }
        }

        // The optional link to the lore: this universe's lore, live, and never a project's entry. db.Entities carries
        // the lore filter, which is exactly the set a canon link may name.
        if (entry.CanonEntryId is { } canon
            && !await db.Entities.AsNoTracking()
                .AnyAsync(
                    lore => lore.Id == canon && lore.UniverseId == universeId && lore.DeletedAt == null,
                    cancellationToken))
        {
            work.Problem(AiChangeCodes.NotFound, "No live lore entry of this universe has that id.", "canonEntryId");
        }
    }

    /// <summary>
    /// A proposed type of a project, held to the Types route's own rules: its validation, the per-project limit, one name
    /// per project ignoring case, and a parent of the same project that does not close a loop. The types this proposal
    /// creates count toward the limit and the names, so a proposal cannot pass here and fail at approval.
    /// </summary>
    private async Task CheckProjectTypeAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var type = (ProjectTypeValues)work.Proposed;

        work.Problems(ProjectEntityTypeEndpoints.Validate(new ProjectEntityTypeRequest(type.Name, type.Description, type.Icon, type.AccentColor)));

        if (!await ProjectOfUniverseAsync(type.ProjectId, cancellationToken))
        {
            work.Problem(AiChangeCodes.NotFound, "No project of this universe has that id.", "projectId");
            return;
        }

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.ProjectTypeAsync(db, universeId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "This type isn't in that project any more.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone changed this type after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }
        }

        var existing = await db.EntityTypes.AsNoTracking().IgnoreQueryFilters()
            .Where(candidate => candidate.ProjectId == type.ProjectId)
            .Select(candidate => new { candidate.Id, candidate.Name, candidate.ParentId })
            .ToListAsync(cancellationToken);

        var created = works
            .Where(other => other != work && other.IsPending && other.Action == AiChangeAction.Create)
            .Select(other => other.Proposed)
            .OfType<ProjectTypeValues>()
            .Where(other => other.ProjectId == type.ProjectId)
            .ToList();

        if (work.Action == AiChangeAction.Create && existing.Count + created.Count >= ProjectEntityTypeEndpoints.MaxTypesPerProject)
        {
            work.Problem(AiChangeCodes.Invalid, $"A project can have at most {ProjectEntityTypeEndpoints.MaxTypesPerProject} types.", "name");
        }

        if (existing.Any(other => other.Id != work.TargetId && string.Equals(other.Name, type.Name, StringComparison.OrdinalIgnoreCase))
            || created.Any(other => string.Equals(other.Name, type.Name, StringComparison.OrdinalIgnoreCase)))
        {
            work.Problem(AiChangeCodes.Invalid, "This project already has a type with that name.", "name");
        }

        // The parent: a type of this project that exists, or one this proposal creates for it. Walked up through the
        // created ones to the first that exists, which is where a loop through this type would show.
        var parentOf = existing.ToDictionary(each => each.Id, each => each.ParentId);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var next = type.Parent; next is not null;)
        {
            var (id, pending) = Resolve(next);
            if (pending is null)
            {
                if (id is { } parentId && !parentOf.ContainsKey(parentId))
                {
                    work.Problem(AiChangeCodes.NotFound, "Choose a type from this project, or none.", "parentId");
                }
                else if (id is { } within && work.TargetId is { } self
                    && (within == self || EntityTypeHierarchy.IsWithin(parentOf, within, self)))
                {
                    work.Problem(AiChangeCodes.Invalid, "A type cannot be put inside itself.", "parentId");
                }

                break;
            }

            if (pending.Proposed is not ProjectTypeValues above || !seen.Add(pending.Key))
            {
                break;
            }

            if (above.ProjectId != type.ProjectId)
            {
                work.Problem(AiChangeCodes.NotFound, "Choose a type from this project, or none.", "parentId");
                break;
            }

            next = above.Parent;
        }
    }

    /// <summary>
    /// A proposed field on a project's type, held to the Types route's own rules: its validation (a kind LorEvolve has,
    /// choices only on a field of choices), the per-type limit, one name per type, and a required field only on a type
    /// with no entries yet. The fields this proposal adds to the same type count toward the limit and the names.
    /// </summary>
    private async Task CheckProjectFieldAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var field = (ProjectSchemaFieldValues)work.Proposed;

        work.Problems(ProjectEntityTypeEndpoints.ValidateField(new ProjectEntityFieldRequest(field.Name, field.Kind, field.IsRequired, field.Options)));

        if (!await ProjectOfUniverseAsync(field.ProjectId, cancellationToken))
        {
            work.Problem(AiChangeCodes.NotFound, "No project of this universe has that id.", "projectId");
            return;
        }

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.ProjectFieldAsync(db, universeId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "This field isn't in that project any more.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone changed this field after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }
        }

        var (typeId, pendingType) = Resolve(field.Type);
        if (pendingType?.Proposed is ProjectTypeValues proposedType && proposedType.ProjectId != field.ProjectId)
        {
            work.Problem(AiChangeCodes.NotFound, "That type is proposed for another project. A field goes on a type of its own project.", "typeId");
            return;
        }

        if (typeId is { } existingType
            && !await db.EntityTypes.AsNoTracking().IgnoreQueryFilters()
                .AnyAsync(type => type.Id == existingType && type.ProjectId == field.ProjectId, cancellationToken))
        {
            work.Problem(AiChangeCodes.NotFound, "That type does not belong to this project. Read its types with get_project_schema.", "typeId");
            return;
        }

        // Archived fields count, as the route counts them: they still hold their values.
        var existing = typeId is { } ofType
            ? await db.EntityFieldDefinitions.AsNoTracking().IgnoreQueryFilters()
                .Where(candidate => candidate.EntityTypeId == ofType)
                .Select(candidate => new { candidate.Id, candidate.Name })
                .ToListAsync(cancellationToken)
            : [];

        var added = works
            .Where(other => other != work && other.IsPending && other.Action == AiChangeAction.Create)
            .Select(other => other.Proposed)
            .OfType<ProjectSchemaFieldValues>()
            .Where(other => other.Type == field.Type)
            .ToList();

        if (work.Action == AiChangeAction.Create && existing.Count + added.Count >= ProjectEntityTypeEndpoints.MaxFieldsPerType)
        {
            work.Problem(AiChangeCodes.Invalid, $"A type can have at most {ProjectEntityTypeEndpoints.MaxFieldsPerType} fields.", "name");
        }

        // The route compares names ignoring case on an add and exactly on a save; so does this.
        var comparison = work.Action == AiChangeAction.Create ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (existing.Any(other => other.Id != work.TargetId && string.Equals(other.Name, field.Name, comparison))
            || added.Any(other => string.Equals(other.Name, field.Name, StringComparison.OrdinalIgnoreCase)))
        {
            work.Problem(AiChangeCodes.Invalid, "This type already has a field with that name.", "name");
        }

        if (work.Action == AiChangeAction.Create
            && field.IsRequired
            && typeId is { } holding
            && await db.Entities.AsNoTracking().IgnoreQueryFilters().AnyAsync(entry => entry.EntityTypeId == holding, cancellationToken))
        {
            work.Problem(AiChangeCodes.Invalid, "Entries of this type already exist, so a new field cannot be required. Add it, fill it in, then make it required.", "isRequired");
        }
    }

    private Task<bool> ProjectOfUniverseAsync(Guid projectId, CancellationToken cancellationToken) =>
        db.CreativeProjects.AsNoTracking().AnyAsync(project => project.Id == projectId && project.UniverseId == universeId, cancellationToken);

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

        if (idea.ProjectId is { } projectId
            && !await db.CreativeProjects.AnyAsync(project => project.Id == projectId && project.UniverseId == universeId, cancellationToken))
        {
            work.Problem(AiChangeCodes.Invalid, "That project isn't one of this universe's. Choose one from list_projects, or none.", "projectId");
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

        if (await AiChangeSnapshots.OrderAsync(db, universeId, work.Resource, order.Story.Id, order.Chapter?.Id, cancellationToken) is not { } current)
        {
            work.Problem(AiChangeCodes.NotFound, "That container isn't in this universe any more, or it is in the Trash.");
            return;
        }

        bool InContainer(AiChangeWork other) => (other.Proposed, work.Resource) switch
        {
            (ChapterValues chapter, AiChangeResource.Chapter) => chapter.Story == order.Story,
            (PlotArcValues arc, AiChangeResource.PlotArc) => arc.Story == order.Story,
            (SceneValues scene, AiChangeResource.Scene) => scene.Story == order.Story && scene.Chapter == order.Chapter,
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
            && other.Proposed is OrderValues same && same.Story == order.Story && same.Chapter == order.Chapter
            && other.Sequence < work.Sequence))
        {
            work.Problem(AiChangeCodes.Duplicate, "Another change in this proposal already sets this order. Put both in one change.");
        }
    }
}
