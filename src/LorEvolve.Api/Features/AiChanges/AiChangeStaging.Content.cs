using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// The values of the resources issue 45 added (ADR 0048) - an entry's article, plot arcs, world rules, the owner's
/// ideas, and a container's whole order - built from an AI's input exactly as issue 32's are: a create from the input alone,
/// an update as the stored form with only what the input sets changed, a removal as where the item lives.
/// </summary>
internal static partial class AiChangeStaging
{
    private sealed partial class Builder
    {
        private async Task<AiChangeWork?> ArticleAsync(CancellationToken cancellationToken)
        {
            var article = input.Article;
            if (article is null || Ref(article.Entry, "article.entry") is not { } entry)
            {
                Fail(AiChangeCodes.Invalid, "Put the article in article, with the entry it belongs to.", "article");
                return null;
            }

            bool? append = article.Mode?.Trim().ToLowerInvariant() switch
            {
                "append" => true,
                "replace" => false,
                _ => null,
            };

            if (append is null || article.Blocks is null)
            {
                Fail(AiChangeCodes.Invalid, "Say whether the blocks are appended or replace the article (mode), and send the blocks.", "article.mode");
                return null;
            }

            var blocks = article.Blocks
                .Select(block => new ArticleBlock(
                    block?.Kind?.Trim().ToLowerInvariant() ?? string.Empty,
                    block?.Text,
                    block?.Level,
                    block?.Items is { } items ? [.. items] : null))
                .ToList();

            if (append.Value && blocks.Count == 0)
            {
                Fail(AiChangeCodes.Invalid, "There's nothing to add.", "article.blocks");
                return null;
            }

            // An entry this proposal creates starts with no article: version 0, nothing to overwrite.
            if (entry.Id is not { } entityId)
            {
                return Work(null, 0, new ArticleValues(entry, append.Value, blocks));
            }

            if (await AiChangeSnapshots.ArticleAsync(db, universeId, entityId, cancellationToken) is not { } stored)
            {
                Fail(AiChangeCodes.NotFound, "That entry isn't in this universe, or it is in the Trash.", "article.entry");
                return null;
            }

            // Replacing an article must name the version it was written over, so newer writing is never overwritten unseen.
            if (!append.Value && input.ExpectedVersion is null)
            {
                Fail(AiChangeCodes.Invalid, "To replace an article, read the entry first and send its articleVersion as expectedVersion.", "expectedVersion");
                return null;
            }

            if (input.ExpectedVersion is { } expected && expected != stored.Version)
            {
                Fail(AiChangeCodes.ChangedSince, $"This article was saved after you read it (you read version {expected}; it is now {stored.Version}). Read it again first.", "expectedVersion");
                return null;
            }

            if (!append.Value && string.Equals(stored.Content, AiChangeArticles.Document(string.Empty, false, blocks), StringComparison.Ordinal))
            {
                Fail(AiChangeCodes.Invalid, "This change wouldn't change anything.");
                return null;
            }

            var work = Work(null, stored.Version, new ArticleValues(entry, append.Value, blocks));
            if (work is not null)
            {
                work.TargetId = entityId;
            }

            return work;
        }

        private async Task<AiChangeWork?> PlotArcAsync(CancellationToken cancellationToken)
        {
            if (action == AiChangeAction.Create)
            {
                return Work(null, null, PlotArc(input.PlotArc, null));
            }

            return await StoredAsync(
                () => AiChangeSnapshots.PlotArcAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                stored => Work(stored, null, action == AiChangeAction.Remove ? new RemoveValues(stored.Story.Id) : PlotArc(input.PlotArc, stored)));
        }

        private PlotArcValues? PlotArc(AiPlotArcInput? arc, PlotArcValues? before)
        {
            if (arc is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the arc's values in plotArc.", "plotArc");
                return null;
            }

            var story = before?.Story ?? Ref(arc.Story, "plotArc.story");
            if (story is null)
            {
                Fail(AiChangeCodes.Invalid, "Say which story the arc is in.", "plotArc.story");
                return null;
            }

            return new PlotArcValues(story, (arc.Title ?? before?.Title ?? string.Empty).Trim(), Cleared(arc.Description, before?.Description), Cleared(arc.Notes, before?.Notes));
        }

        private async Task<AiChangeWork?> ProjectEntryAsync(CancellationToken cancellationToken)
        {
            if (action == AiChangeAction.Create)
            {
                return Work(null, null, ProjectEntry(input.ProjectEntry, null));
            }

            return await StoredAsync(
                () => AiChangeSnapshots.ProjectEntryAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                stored => Work(
                    stored,
                    null,
                    action == AiChangeAction.Remove ? new RemoveValues(null) : ProjectEntry(input.ProjectEntry, stored)));
        }

        /// <summary>
        /// The values a proposed project entry would hold (#148). On an update the stored entry is the starting point,
        /// so a proposal that names only a name changes only the name, and only the fields it names are touched: the
        /// rest of an author's entry is left exactly as it is.
        /// </summary>
        private ProjectEntryValues? ProjectEntry(AiProjectEntryInput? entry, ProjectEntryValues? before)
        {
            if (entry is null && before is null)
            {
                Fail(AiChangeCodes.Invalid, "Say what the project entry should hold.", "projectEntry");
                return null;
            }

            // An entry belongs to the project it was made in and does not move between projects, so on an update the
            // stored project wins and a proposal naming another one is refused rather than quietly corrected. Found by
            // the first review round of #148: without this a cross-project update reached the commit, which refused it
            // as a missing entry, so the person would have approved a change that then failed.
            if (before is { } current && entry?.ProjectId is { } named && named != current.ProjectId)
            {
                Fail(
                    AiChangeCodes.Invalid,
                    "An entry stays in the project it was made in. Leave projectId out, or send its own project.",
                    "projectEntry.projectId");
                return null;
            }

            var projectId = before?.ProjectId ?? entry?.ProjectId ?? Guid.Empty;
            // The type is an existing one by id, or one this proposal creates, by its change's id in typeRef.
            var typeRef = entry?.TypeId is null ? entry?.TypeRef?.Trim() : null;
            if (entry?.TypeId is not null && !string.IsNullOrWhiteSpace(entry.TypeRef))
            {
                Fail(AiChangeCodes.Invalid, "Give the entry's type as typeId or as typeRef, not both.", "projectEntry.typeRef");
                return null;
            }

            var typeId = string.IsNullOrEmpty(typeRef) ? entry?.TypeId ?? before?.TypeId ?? Guid.Empty : Guid.Empty;

            if (projectId == Guid.Empty)
            {
                Fail(AiChangeCodes.Invalid, "Name the project this entry belongs to.", "projectEntry.projectId");
                return null;
            }

            if (typeId == Guid.Empty && string.IsNullOrEmpty(typeRef))
            {
                Fail(AiChangeCodes.Invalid, "Name a type of that project, from get_project_schema.", "projectEntry.typeId");
                return null;
            }

            var fields = before?.Fields is { } stored ? new List<ProjectFieldValue>(stored) : [];

            foreach (var value in entry?.Fields ?? [])
            {
                var fieldRef = value?.FieldRef?.Trim();
                if (value is null || (value.FieldId is null) == string.IsNullOrEmpty(fieldRef))
                {
                    Fail(AiChangeCodes.Invalid, "Every field value needs exactly one of the field's id and fieldRef, a project_field create in this proposal.", "projectEntry.fields");
                    return null;
                }

                var fieldId = value.FieldId ?? Guid.Empty;
                fields.RemoveAll(each => fieldId != Guid.Empty ? each.FieldId == fieldId : each.FieldRef == fieldRef);
                fields.Add(new ProjectFieldValue(
                    fieldId,
                    value.Text,
                    value.Number,
                    value.Boolean,
                    value.Date,
                    value.Choices?.ToList(),
                    value.LinkedEntryId,
                    value.FieldId is null ? fieldRef : null));
            }

            // The link to a lore entry: left as it was unless this change names one or asks for it to go.
            var canon = entry?.ClearCanonEntry == true
                ? null
                : entry?.CanonEntryId ?? before?.CanonEntryId;

            return new ProjectEntryValues(
                projectId,
                typeId,
                (entry?.Name ?? before?.Name ?? string.Empty).Trim(),
                Cleared(entry?.Summary, before?.Summary) ?? string.Empty,
                canon,
                fields,
                string.IsNullOrEmpty(typeRef) ? null : typeRef);
        }

        private async Task<AiChangeWork?> ProjectTypeAsync(CancellationToken cancellationToken)
        {
            if (input.ProjectType is not { } type)
            {
                Fail(AiChangeCodes.Invalid, "Put the type's values in projectType.", "projectType");
                return null;
            }

            return action == AiChangeAction.Create
                ? Work(null, null, ProjectType(type, null))
                : await StoredAsync(
                    () => AiChangeSnapshots.ProjectTypeAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, ProjectType(type, stored)));
        }

        /// <summary>A proposed type of a project: on an update the stored type with only what the input sets changed.</summary>
        private ProjectTypeValues? ProjectType(AiProjectTypeInput type, ProjectTypeValues? before)
        {
            if (before is { } current && type.ProjectId is { } named && named != current.ProjectId)
            {
                Fail(AiChangeCodes.Invalid, "A type stays in the project it was made in. Leave projectId out, or send its own project.", "projectType.projectId");
                return null;
            }

            var projectId = before?.ProjectId ?? type.ProjectId ?? Guid.Empty;
            if (projectId == Guid.Empty)
            {
                Fail(AiChangeCodes.Invalid, "Name the project this type belongs to.", "projectType.projectId");
                return null;
            }

            var parent = type.ParentId is null && type.ParentRef is null
                ? before?.Parent
                : Ref(new AiRefInput(type.ParentId, type.ParentRef), "projectType.parentId");
            if (_failed)
            {
                return null;
            }

            return new ProjectTypeValues(
                projectId,
                (type.Name ?? before?.Name ?? string.Empty).Trim(),
                Cleared(type.Description, before?.Description),
                Cleared(type.Icon, before?.Icon),
                Cleared(type.AccentColor, before?.AccentColor),
                parent);
        }

        private async Task<AiChangeWork?> ProjectFieldAsync(CancellationToken cancellationToken)
        {
            if (input.ProjectField is not { } field)
            {
                Fail(AiChangeCodes.Invalid, "Put the field's values in projectField.", "projectField");
                return null;
            }

            return action == AiChangeAction.Create
                ? Work(null, null, ProjectField(field, null))
                : await StoredAsync(
                    () => AiChangeSnapshots.ProjectFieldAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, ProjectField(field, stored)));
        }

        /// <summary>A proposed field on a project's type: on an update the stored field with only what the input sets changed.</summary>
        private ProjectSchemaFieldValues? ProjectField(AiProjectSchemaFieldInput field, ProjectSchemaFieldValues? before)
        {
            if (before is { } current && field.ProjectId is { } named && named != current.ProjectId)
            {
                Fail(AiChangeCodes.Invalid, "A field stays in the project it was made in. Leave projectId out, or send its own project.", "projectField.projectId");
                return null;
            }

            var projectId = before?.ProjectId ?? field.ProjectId ?? Guid.Empty;
            if (projectId == Guid.Empty)
            {
                Fail(AiChangeCodes.Invalid, "Name the project this field's type belongs to.", "projectField.projectId");
                return null;
            }

            var given = field.TypeId is null && field.TypeRef is null
                ? null
                : Ref(new AiRefInput(field.TypeId, field.TypeRef), "projectField.typeId");
            if (_failed)
            {
                return null;
            }

            if (before is not null && given is not null && given != before.Type)
            {
                Fail(AiChangeCodes.Unsupported, "A field can't move to another type. Add a field to that type instead.", "projectField.typeId");
                return null;
            }

            if ((before?.Type ?? given) is not { } type)
            {
                Fail(AiChangeCodes.Invalid, "Say which type of the project the field belongs to, in typeId or typeRef.", "projectField.typeId");
                return null;
            }

            EntityFieldKind? kind = field.Kind is null ? before?.Kind : ProjectFieldKind(field.Kind);
            if (kind is null)
            {
                Fail(AiChangeCodes.Invalid, $"A field's kind is one of {string.Join(", ", FieldKinds.Select(known => known.Wire))}.", "projectField.kind");
                return null;
            }

            return new ProjectSchemaFieldValues(
                projectId,
                type,
                (field.Name ?? before?.Name ?? string.Empty).Trim(),
                kind.Value,
                field.IsRequired ?? before?.IsRequired ?? false,
                field.Options is null ? before?.Options ?? [] : ProjectEntityTypeEndpoints.Options(new ProjectEntityFieldRequest(null, kind.Value, null, field.Options)));
        }

        /// <summary>A field kind as an AI names it: the wire names get_change_options lists, or the names get_project_schema shows.</summary>
        private static EntityFieldKind? ProjectFieldKind(string text)
        {
            var trimmed = text.Trim();
            if (FieldKinds.FirstOrDefault(known => string.Equals(known.Wire, trimmed, StringComparison.OrdinalIgnoreCase)) is { Wire: not null } found)
            {
                return found.Kind;
            }

            return !trimmed.All(char.IsAsciiDigit) && Enum.TryParse<EntityFieldKind>(trimmed, true, out var parsed) && Enum.IsDefined(parsed)
                ? parsed
                : null;
        }

        private async Task<AiChangeWork?> WorldRuleAsync(CancellationToken cancellationToken)
        {
            if (action == AiChangeAction.Create)
            {
                return Work(null, null, WorldRule(input.WorldRule, null));
            }

            return await StoredAsync(
                () => AiChangeSnapshots.WorldRuleAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                stored => Work(stored, null, action == AiChangeAction.Remove ? new RemoveValues(null) : WorldRule(input.WorldRule, stored)));
        }

        private WorldRuleValues? WorldRule(AiWorldRuleInput? rule, WorldRuleValues? before)
        {
            if (rule is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the rule's values in worldRule.", "worldRule");
                return null;
            }

            var check = before?.Check;
            if (rule.RemoveCheck == true)
            {
                check = null;
            }
            else if (rule.Check is { } asked)
            {
                if (asked.EventKindId is not { } eventKind || asked.MethodId is not { } method || asked.MaxOccurrences is not { } most)
                {
                    Fail(AiChangeCodes.Invalid, "A rule's check needs eventKindId, methodId and maxOccurrences.", "worldRule.check");
                    return null;
                }

                check = new RuleCheckValues(eventKind, method, most);
            }

            // The description is plain text stored exactly as written, so only a cleared one changes; nothing is trimmed in it.
            var description = rule.Description is null ? before?.Description ?? string.Empty : rule.Description.Trim().Length == 0 ? string.Empty : rule.Description;
            return new WorldRuleValues((rule.Title ?? before?.Title ?? string.Empty).Trim(), description, check);
        }

        private async Task<AiChangeWork?> IdeaAsync(CancellationToken cancellationToken)
        {
            if (action == AiChangeAction.Create)
            {
                return Work(null, null, Idea(input.Idea, null));
            }

            // Only the proposer's own live idea of this universe: another account's, an unassigned one or one of another
            // universe answers exactly as one that does not exist.
            return await StoredAsync(
                () => AiChangeSnapshots.IdeaAsync(db, universeId, userId, input.TargetId!.Value, cancellationToken),
                stored => Work(stored, null, action == AiChangeAction.Remove ? new RemoveValues(null) : Idea(input.Idea, stored)));
        }

        private IdeaValues? Idea(AiIdeaInput? idea, IdeaValues? before)
        {
            if (idea is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the idea's values in idea.", "idea");
                return null;
            }

            var references = before?.References ?? [];
            if (idea.References is { } asked)
            {
                references = [];
                foreach (var reference in asked)
                {
                    IdeaReferenceKind? kind = reference?.Kind?.Trim().ToLowerInvariant().Replace('-', '_') switch
                    {
                        "lore_entry" or "lore" or "entry" => IdeaReferenceKind.Entity,
                        "story" => IdeaReferenceKind.Story,
                        "scene" => IdeaReferenceKind.Scene,
                        "plot_arc" or "arc" => IdeaReferenceKind.PlotArc,
                        _ => null,
                    };

                    if (kind is null || Ref(new AiRefInput(reference!.Id, reference.Ref), "idea.references") is not { } target)
                    {
                        Fail(AiChangeCodes.Invalid, "Each reference is a kind (lore_entry, story, scene or plot_arc) and exactly one of id and ref.", "idea.references");
                        continue;
                    }

                    references.Add(new IdeaReferenceValue(kind.Value, target));
                }

                references = [.. references.Distinct().OrderBy(reference => reference.Kind).ThenBy(reference => reference.Target.Id).ThenBy(reference => reference.Target.Key, StringComparer.Ordinal)];
            }

            // The body is plain text stored exactly as written; only a cleared one changes.
            var body = idea.Body is null ? before?.Body ?? string.Empty : idea.Body.Trim().Length == 0 ? string.Empty : idea.Body;
            var project = idea.ProjectId is { } asked2 ? asked2 == Guid.Empty ? null : asked2 : before?.ProjectId;
            return new IdeaValues((idea.Title ?? before?.Title ?? string.Empty).Trim(), body, references, project);
        }

        /// <summary>
        /// A container's whole order: the container named by an existing id, and every item - existing ones by id, ones this
        /// proposal creates there by ref - bound to the order as it is now.
        /// </summary>
        private async Task<AiChangeWork?> OrderAsync(CancellationToken cancellationToken)
        {
            var order = input.Order;
            if (order?.Items is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the container and its whole order in order: its items, first first.", "order");
                return null;
            }

            var items = order.Items.Select(reference => Ref(reference, "order.items")).OfType<AiRef>().ToList();
            if (items.Distinct().Count() != items.Count)
            {
                Fail(AiChangeCodes.Duplicate, "List each item once.", "order.items");
                return null;
            }

            AiRef? Existing(AiRefInput? reference, string field)
            {
                var resolved = Ref(reference, field);
                if (resolved is { Id: null })
                {
                    Fail(AiChangeCodes.Invalid, "Reorder a container that exists already: one this proposal creates is in the order its items are created.", field);
                    return null;
                }

                return resolved;
            }

            AiRef? chapter = null;
            var story = Existing(order.Story, "order.story");
            if (resource == AiChangeResource.Scene)
            {
                chapter = Existing(order.Chapter, "order.chapter");
                if ((chapter is null) != (order.Unchaptered == true))
                {
                    Fail(AiChangeCodes.Invalid, "For scenes, name the chapter, or set unchaptered for the story's unchaptered scenes.", "order.chapter");
                    return null;
                }
            }

            if (_failed || story is null)
            {
                if (!_failed)
                {
                    Fail(AiChangeCodes.Invalid, "Say which story's order this is.", "order");
                }

                return null;
            }

            if (await AiChangeSnapshots.OrderAsync(db, universeId, resource, story.Id, chapter?.Id, cancellationToken) is not { } stored)
            {
                Fail(AiChangeCodes.NotFound, "That container isn't in this universe, or it is in the Trash.", "order");
                return null;
            }

            var proposed = stored with { Items = items };
            if (AiChangeSnapshots.Same(stored, proposed))
            {
                Fail(AiChangeCodes.Invalid, "This change wouldn't change anything.");
                return null;
            }

            return Work(stored, null, proposed);
        }
    }
}
