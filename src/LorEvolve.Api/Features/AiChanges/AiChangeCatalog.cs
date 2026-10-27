using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// One field definition. <paramref name="Version"/> is what a lore_field update is checked against; <paramref name="LinksToTypeId"/>
/// and <paramref name="LinksToGroupId"/> are a link field's limit by id (both null: any entry); <paramref name="Archived"/> marks
/// a field kept out of forms (Issue #39), listed apart and never given a value.
/// </summary>
public sealed record AiChangeOptionField(
    Guid Id,
    string Name,
    string Kind,
    bool Required,
    IReadOnlyList<AiChangeOptionChoice> Choices,
    string? LinksTo,
    string? Meaning,
    int Version = 1,
    string? DefaultValue = null,
    Guid? LinksToTypeId = null,
    Guid? LinksToGroupId = null,
    bool Archived = false);

public sealed record AiChangeOptionChoice(Guid Id, string Value);

/// <summary>
/// One lore type with its active fields; <paramref name="ArchivedFields"/> are its archived ones, apart, so nothing writes a
/// value to one by accident. <paramref name="ParentId"/> is the type it sits beneath; <paramref name="GroupIds"/> its groups.
/// </summary>
public sealed record AiChangeOptionType(
    Guid Id,
    string Name,
    IReadOnlyList<AiChangeOptionField> Fields,
    string? Description = null,
    string? Icon = null,
    Guid? ParentId = null,
    IReadOnlyList<Guid>? GroupIds = null,
    IReadOnlyList<AiChangeOptionField>? ArchivedFields = null,
    int Entries = 0);

/// <summary>A relationship kind; <paramref name="Relationships"/> counts the links using it, which keep it from changing direction.</summary>
public sealed record AiChangeOptionRelationshipType(Guid Id, string Name, string? InverseName, bool Symmetric, string? Description = null, int Relationships = 0);

public sealed record AiChangeOptionChapter(Guid Id, string Title);

public sealed record AiChangeOptionArc(Guid Id, string Title);

public sealed record AiChangeOptionStory(Guid Id, string Title, IReadOnlyList<AiChangeOptionChapter> Chapters, IReadOnlyList<AiChangeOptionArc>? PlotArcs = null);

public sealed record AiChangeOptionNamed(Guid Id, string Name);

public sealed record AiChangeOptionRule(Guid Id, string Title, bool HasCheck);

/// <summary>
/// What an AI may propose in this universe, for this person, and the ids it needs to: the role's allowed changes, the lore
/// types with their active fields and choices, the relationship kinds, the stories with their chapters and plot arcs, the date
/// periods and months, the world rules, the event kinds and methods a rule's check or a moment's details name, and - for the
/// owner alone - their own ideas in this universe (ADR 0047, ADR 0048) - and the universe's real schema: every type with its
/// description, parent, groups, active and archived fields, every group, the field kinds and icons LorEvolve has, and whether this
/// person through this entry point may propose schema (ADR 0062). Read-only and bounded. Another account's ideas, and every
/// idea to a collaborator, are never listed.
/// </summary>
public sealed record AiChangeOptions(
    string Role,
    IReadOnlyList<string> Allowed,
    IReadOnlyList<AiChangeOptionType> LoreTypes,
    IReadOnlyList<AiChangeOptionRelationshipType> RelationshipTypes,
    IReadOnlyList<AiChangeOptionStory> Stories,
    bool MoreStories,
    IReadOnlyList<AiChangeOptionNamed> DatePeriods,
    IReadOnlyList<AiChangeOptionNamed> Months,
    int MaxChanges,
    int MaxProseCharacters,
    string Notes,
    IReadOnlyList<AiChangeOptionRule>? WorldRules = null,
    bool MoreWorldRules = false,
    IReadOnlyList<AiChangeOptionNamed>? EventKinds = null,
    IReadOnlyList<AiChangeOptionNamed>? Methods = null,
    IReadOnlyList<AiChangeOptionNamed>? Ideas = null,
    bool MoreIdeas = false,
    AiChangeSchemaOptions? Schema = null,
    AiChangeOptionProgression? Progression = null);

internal static class AiChangeCatalog
{
    private sealed record FieldRow(
        Guid Id,
        string Name,
        EntityFieldKind Kind,
        bool IsRequired,
        EntityFieldSemantic? Semantic,
        Guid? TargetEntityTypeId,
        string? TargetTypeName,
        Guid? TargetGroupId,
        int Version,
        string? DefaultValue,
        bool Archived,
        List<AiChangeOptionChoice> Choices);

    private const int StoryLimit = 30;

    private const int ChapterLimit = 60;

    private const int ArcLimit = 40;

    private const int RuleLimit = 50;

    private const int IdeaLimit = 50;

    public const string Notes =
        "Every change is staged for a person to review in LorEvolve; nothing changes until they approve it there. "
        + "Use ids exactly as given. To refer to something another change in the same proposal creates, use {\"ref\": \"<that change's id>\"} "
        + "instead of an id. Only the fields listed for a type exist. Types, fields, choices, groups, relationship kinds, date periods, "
        + "the calendar, event kinds and methods change only through a schema proposal (see schema), never in the same proposal as "
        + "content. An image change sends no file: it says which entry, or which of its appearances, a picture is for, and the person "
        + "uploads the picture on the proposal's review page in LorEvolve, then approves it; an AI never replaces a profile picture. "
        + "remove moves an item to LorEvolve's Trash (an idea to its owner's deleted ideas), "
        + "from where it can be restored; nothing is ever deleted for good. An article is written as blocks (paragraph, heading, bullet_list, "
        + "numbered_list, quote) of plain text, apart from the entry's fields. reorder takes the whole order of a container. Ideas are the "
        + "universe owner's own and are offered only to the owner. Only propose changes the person asked for.";

    /// <summary>What a schema proposal is, for the AI reading the catalog.</summary>
    public const string SchemaNotes =
        "A schema proposal holds only definitions - lore_type, lore_field, lore_group, relationship_kind, chronology, event_kind and "
        + "method - never entries, relationships or moments that use them. Inspect the "
        + "types, fields and groups here first and reuse what exists instead of making a near-duplicate. A group collects types "
        + "(Locations: Kingdom, City); it is not a type, a parent or a field choice. When more than one model fits - Orc as its own "
        + "type, or as a choice of a Race field on Character - ask the person which they want before proposing. Use only the field "
        + "kinds listed; a field's meaning for LorEvolve's rules is set by the author in LorEvolve, never here. A change can refer to a type or "
        + "group another change of the same proposal creates with {\"ref\": id}. remove on a lore_field archives it: it keeps every "
        + "value and can be restored in LorEvolve; no other definition is ever removed here. A relationship kind's Canon age rules and family "
        + "meaning stay the author's; a kind relationships already use keeps its direction. chronology is written whole: list every "
        + "existing date period and month by id, in its current order, and add new ones; nothing dated is moved, so existing periods are "
        + "never reordered or removed, a period that dates anything keeps the way its years count, and a calendar can't start while "
        + "simple dates use month numbers (schema.chronology says which). Once a schema proposal is approved, read this catalog again "
        + "for the new ids and propose what uses them in a second proposal.";

    public static async Task<AiChangeOptions> ReadAsync(
        LorEvolveDbContext db,
        Guid universeId,
        UniverseRole role,
        CancellationToken cancellationToken,
        bool schemaAllowed = false,
        Guid? progressionOf = null)
    {
        var groups = await db.EntityTypeGroups.AsNoTracking()
            .Where(group => group.UniverseId == universeId)
            .ToDictionaryAsync(group => group.Id, group => group.Name, cancellationToken);
        var types = await db.EntityTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .OrderBy(type => type.Name)
            .Select(type => new
            {
                type.Id,
                type.Name,
                type.Description,
                type.Icon,
                type.ParentId,
                GroupIds = db.EntityTypeGroupMembers.Where(member => member.EntityTypeId == type.Id).Select(member => member.EntityTypeGroupId).ToList(),
                Entries = db.Entities.Count(entity => entity.EntityTypeId == type.Id && entity.DeletedAt == null),
                Fields = type.Fields
                    .OrderBy(field => field.DisplayOrder)
                    .ThenBy(field => field.Name)
                    .Select(field => new FieldRow(
                        field.Id,
                        field.Name,
                        field.Kind,
                        field.IsRequired,
                        field.Semantic,
                        field.TargetEntityTypeId,
                        field.TargetEntityType != null ? field.TargetEntityType.Name : null,
                        field.TargetGroupId,
                        field.Version,
                        field.DefaultValue,
                        field.ArchivedAt != null,
                        field.Options.OrderBy(option => option.DisplayOrder).Select(option => new AiChangeOptionChoice(option.Id, option.Value)).ToList()))
                    .ToList(),
            })
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        var stories = await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == universeId && story.DeletedAt == null)
            .OrderBy(story => story.Title)
            .Take(StoryLimit + 1)
            .Select(story => new
            {
                story.Id,
                story.Title,
                Chapters = story.Chapters.Where(chapter => chapter.DeletedAt == null)
                    .OrderBy(chapter => chapter.SortOrder)
                    .Take(ChapterLimit)
                    .Select(chapter => new AiChangeOptionChapter(chapter.Id, chapter.Title))
                    .ToList(),
                PlotArcs = story.PlotArcs.Where(arc => arc.DeletedAt == null)
                    .OrderBy(arc => arc.SortOrder)
                    .Take(ArcLimit)
                    .Select(arc => new AiChangeOptionArc(arc.Id, arc.Title))
                    .ToList(),
            })
            .ToListAsync(cancellationToken);

        var allowed = new List<string>();
        foreach (var resource in Enum.GetValues<AiChangeResource>())
        {
            foreach (var action in Enum.GetValues<AiChangeAction>())
            {
                var prose = resource is AiChangeResource.Manuscript or AiChangeResource.Article;
                var ordered = resource is AiChangeResource.Chapter or AiChangeResource.Scene or AiChangeResource.PlotArc or AiChangeResource.PlotBeat;
                var offered = action switch
                {
                    AiChangeAction.Create or AiChangeAction.Remove => !prose && resource != AiChangeResource.Progression,
                    AiChangeAction.Reorder => ordered,
                    _ => resource != AiChangeResource.Media,
                };
                if (resource == AiChangeResource.Media)
                {
                    // A picture is only ever added, and its file comes from the person, in LorEvolve.
                    offered = action == AiChangeAction.Create;
                }
                if (AiChangePermissions.IsSchema(resource))
                {
                    // Schema: create and update (the reckoning: update); remove only archives a field. Offered only where schema
                    // may be proposed.
                    offered = schemaAllowed
                        && (action == AiChangeAction.Update
                            || (action == AiChangeAction.Create && resource != AiChangeResource.Chronology)
                            || (action == AiChangeAction.Remove && resource == AiChangeResource.LoreField));
                }

                if (offered && AiChangePermissions.MayStage(role, resource, action))
                {
                    allowed.Add($"{Wire(action)} {Wire(resource)}");
                    if (resource == AiChangeResource.ValidationTerm)
                    {
                        allowed.Add($"{Wire(action)} method");
                    }
                }
            }
        }

        var rules = await db.WorldRules.AsNoTracking()
            .Where(rule => rule.UniverseId == universeId && rule.DeletedAt == null)
            .OrderBy(rule => rule.Title)
            .Take(RuleLimit + 1)
            .Select(rule => new AiChangeOptionRule(rule.Id, rule.Title, rule.Validation != null))
            .ToListAsync(cancellationToken);

        var terms = await db.ValidationTerms.AsNoTracking()
            .Where(term => term.UniverseId == universeId)
            .OrderBy(term => term.Name)
            .Select(term => new { term.Id, term.Name, term.Kind })
            .ToListAsync(cancellationToken);

        // The owner's own ideas in this universe, most recently worked on first - and nobody else's, to nobody else.
        var ideas = role == UniverseRole.Owner
            ? await db.Ideas.AsNoTracking()
                .Where(idea => idea.UniverseId == universeId && idea.DeletedAt == null && idea.OwnerId == idea.Universe!.OwnerId)
                .OrderByDescending(idea => idea.UpdatedAt)
                .Take(IdeaLimit + 1)
                .Select(idea => new AiChangeOptionNamed(idea.Id, idea.Title))
                .ToListAsync(cancellationToken)
            : null;

        // A field limited to a type accepts the types nested beneath it too (Issue #61), so a target that has any says so.
        var parents = types.Select(type => type.ParentId).OfType<Guid>().ToHashSet();

        AiChangeOptionField Field(FieldRow field) => new(
            field.Id,
            field.Name,
            Kind(field.Kind),
            field.IsRequired,
            field.Choices,
            field.Kind != EntityFieldKind.EntityReference ? null
                : field.TargetTypeName is { } typeName
                    ? parents.Contains(field.TargetEntityTypeId!.Value) ? $"entries of type {typeName} or a type nested beneath it" : $"entries of type {typeName}"
                : field.TargetGroupId is { } group && groups.TryGetValue(group, out var groupName) ? $"entries of a type in the group {groupName}"
                : "any entry",
            field.Semantic?.ToString(),
            field.Version,
            field.DefaultValue,
            field.TargetEntityTypeId,
            field.TargetGroupId,
            field.Archived);

        var mayStageSchema = AiChangePermissions.MayStage(role, AiChangeResource.LoreType, AiChangeAction.Create);
        var reckoning = await Chronology.ChronologyEndpoints.DescribeAsync(db, universeId, cancellationToken);
        var chronology = new AiChangeOptionChronology(
            [.. reckoning.Eras.Select(era => new AiChangeOptionPeriod(
                era.Id,
                era.Name,
                era.Abbreviation,
                era.Direction == Chronology.ChronologyEraDirection.Descending ? "descending" : "ascending",
                era.LabelPosition == Chronology.ChronologyLabelPosition.AfterYear ? "after" : "before",
                era.MomentCount + era.YearCount + era.SceneCount + era.EntryEraCount + era.PeriodCount > 0))],
            reckoning.Calendar is { } calendar
                ? [.. calendar.Months.Select(month => new AiChangeOptionMonth(month.Id, month.Name, month.Abbreviation, month.DayCount, month.UseCount > 0))]
                : null,
            (await Chronology.ChronologyCalendarEndpoints.SimpleMonthsInUseAsync(db, universeId, cancellationToken)).Count > 0);
        var schema = new AiChangeSchemaOptions(
            schemaAllowed && mayStageSchema,
            !mayStageSchema ? "Only an owner or Editor can have an AI propose types, fields and groups."
                : !schemaAllowed ? "This connection may not propose schema. The person can allow it by connecting the app again in LorEvolve and ticking schema changes."
                : null,
            [.. AiChangeStaging.FieldKinds.Select(kind => kind.Wire)],
            [.. EntityTypeIcons.Keys],
            [.. (await EntityTypeGroupEndpoints.LoadGroupsAsync(db, universeId, cancellationToken)).Select(group => new AiChangeOptionGroup(group.Id, group.Name, group.TypeIds, group.FamilyTreeEnabled))],
            SchemaNotes,
            chronology);

        return new AiChangeOptions(
            role.ToString(),
            allowed,
            [.. types.Select(type => new AiChangeOptionType(
                type.Id,
                type.Name,
                [.. type.Fields.Where(field => !field.Archived).Select(field => Field(field))],
                type.Description,
                type.Icon,
                type.ParentId,
                type.GroupIds,
                [.. type.Fields.Where(field => field.Archived).Select(field => Field(field))],
                type.Entries))],
            await db.RelationshipTypes.AsNoTracking()
                .Where(type => type.UniverseId == universeId)
                .OrderBy(type => type.DisplayOrder)
                .Select(type => new AiChangeOptionRelationshipType(
                    type.Id,
                    type.Name,
                    type.InverseName,
                    type.IsSymmetric,
                    type.Description,
                    db.Relationships.Count(relationship => relationship.RelationshipTypeId == type.Id)))
                .ToListAsync(cancellationToken),
            [.. stories.Take(StoryLimit).Select(story => new AiChangeOptionStory(story.Id, story.Title, story.Chapters, story.PlotArcs))],
            stories.Count > StoryLimit,
            await db.ChronologyEras.AsNoTracking()
                .Where(era => era.UniverseId == universeId)
                .OrderBy(era => era.SortOrder)
                .Select(era => new AiChangeOptionNamed(era.Id, era.Name))
                .ToListAsync(cancellationToken),
            await db.ChronologyCalendarMonths.AsNoTracking()
                .Where(month => month.Calendar!.UniverseId == universeId)
                .OrderBy(month => month.SortOrder)
                .Select(month => new AiChangeOptionNamed(month.Id, month.Name))
                .ToListAsync(cancellationToken),
            AiChangeLimits.MaxOperations,
            AiChangeLimits.MaxManuscriptCharacters,
            Notes,
            [.. rules.Take(RuleLimit)],
            rules.Count > RuleLimit,
            [.. terms.Where(term => term.Kind == RuleValidation.ValidationTermKind.EventKind).Select(term => new AiChangeOptionNamed(term.Id, term.Name))],
            [.. terms.Where(term => term.Kind == RuleValidation.ValidationTermKind.Method).Select(term => new AiChangeOptionNamed(term.Id, term.Name))],
            ideas is null ? null : [.. ideas.Take(IdeaLimit)],
            ideas is { Count: > IdeaLimit },
            schema,
            progressionOf is { } entityId ? await ProgressionAsync(db, universeId, entityId, cancellationToken) : null);
    }

    /// <summary>A live entry's progression, by id, for a progression change; null for anything else.</summary>
    private static async Task<AiChangeOptionProgression?> ProgressionAsync(LorEvolveDbContext db, Guid universeId, Guid entityId, CancellationToken cancellationToken)
    {
        var name = await db.Entities.AsNoTracking()
            .Where(entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null)
            .Select(entity => entity.Name)
            .FirstOrDefaultAsync(cancellationToken);
        if (name is null)
        {
            return null;
        }

        var snapshot = await Progression.ProgressionState.ReadAsync(db, entityId, cancellationToken);
        var version = await db.EntityProgressions.AsNoTracking().Where(row => row.EntityId == entityId).Select(row => (int?)row.Version).FirstOrDefaultAsync(cancellationToken) ?? 0;
        var pictures = await db.EntityAppearances.AsNoTracking()
            .Where(look => look.EntityId == entityId)
            .Select(look => new { look.Id, Count = look.Images.Count })
            .ToDictionaryAsync(look => look.Id, look => look.Count, cancellationToken);

        return new AiChangeOptionProgression(
            entityId,
            name,
            version,
            [.. snapshot.Eras.Select(era => new AiChangeOptionNamed(era.Id!.Value, era.Name ?? string.Empty))],
            [.. (snapshot.Forms ?? []).Select(form => new AiChangeOptionProgressionItem(form.Id!.Value, form.Name ?? string.Empty, form.EraIds ?? []))],
            [.. (snapshot.Abilities ?? []).Select(ability => new AiChangeOptionProgressionItem(ability.Id!.Value, ability.Name ?? string.Empty, ability.EraIds ?? [], ability.FormIds ?? []))],
            [.. (snapshot.Appearances ?? []).Select(look => new AiChangeOptionProgressionItem(look.Id!.Value, look.Label ?? string.Empty, look.EraIds ?? [], look.FormIds ?? [], pictures.GetValueOrDefault(look.Id!.Value)))]);
    }

    private static string Kind(EntityFieldKind kind) => kind switch
    {
        EntityFieldKind.ShortText => "short_text (text)",
        EntityFieldKind.LongText => "long_text (text)",
        EntityFieldKind.Number => "number (number)",
        EntityFieldKind.Boolean => "yes_no (boolean)",
        EntityFieldKind.Date => "date (date)",
        EntityFieldKind.Select => "one_choice (optionIds, one)",
        EntityFieldKind.MultiSelect => "choices (optionIds)",
        _ => "link (entry)",
    };

    private static string Wire(AiChangeAction action) => action.ToString().ToLowerInvariant();

    private static string Wire(AiChangeResource resource) => resource switch
    {
        AiChangeResource.LoreEntry => "lore_entry",
        AiChangeResource.TimelineEvent => "timeline_event",
        AiChangeResource.PlotArc => "plot_arc",
        AiChangeResource.PlotBeat => "plot_beat",
        AiChangeResource.WorldRule => "world_rule",
        AiChangeResource.LoreType => "lore_type",
        AiChangeResource.LoreField => "lore_field",
        AiChangeResource.LoreGroup => "lore_group",
        AiChangeResource.RelationshipType => "relationship_kind",
        AiChangeResource.Chronology => "chronology",
        AiChangeResource.ValidationTerm => "event_kind",
        AiChangeResource.Progression => "progression",
        AiChangeResource.Media => "image",
        _ => resource.ToString().ToLowerInvariant(),
    };
}
