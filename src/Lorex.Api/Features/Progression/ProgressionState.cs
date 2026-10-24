using System.Text.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Progression;

/// <summary>
/// Reading, checking and writing an entry's progression as one normalised <see cref="ProgressionSnapshot"/>: what is stored
/// is read into that shape, a save is checked and normalised into it, two of them compare as JSON, and the write turns the
/// difference into rows. One shape for the read, the save, the history and the restore, so none can mean something the
/// others do not.
/// </summary>
internal static class ProgressionState
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static string Serialize(ProgressionSnapshot snapshot) => JsonSerializer.Serialize(snapshot, Json);

    public static ProgressionSnapshot Deserialize(string json) =>
        JsonSerializer.Deserialize<ProgressionSnapshot>(json, Json) is { } snapshot
            ? snapshot with { Eras = snapshot.Eras ?? [] }
            : ProgressionSnapshot.Empty;

    // ---------- Reading ----------

    /// <summary>
    /// The progression as stored, normalised. Only active fields' overrides: an archived field is in no form, so no save carries
    /// it and no read shows it, and its overrides stay exactly as they are (Issue #39).
    /// </summary>
    public static async Task<ProgressionSnapshot> ReadAsync(LorexDbContext db, Guid entityId, CancellationToken cancellationToken)
    {
        var eras = await db.EntityEras.AsNoTracking()
            .Where(era => era.EntityId == entityId)
            .OrderBy(era => era.SortOrder)
            .Select(era => new
            {
                era.Id,
                era.Name,
                era.Description,
                era.StartEraId,
                era.StartYear,
                era.StartMonth,
                era.StartMonthId,
                era.StartDay,
                era.EndEraId,
                era.EndYear,
                era.EndMonth,
                era.EndMonthId,
                era.EndDay,
                Stories = era.Stories.Select(link => link.StoryId).ToList(),
                Scenes = era.Scenes.Select(link => link.SceneId).ToList(),
                Values = era.FieldValues.Where(value => value.FieldDefinition!.ArchivedAt == null).ToList(),
            })
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        return new ProgressionSnapshot([
            .. eras.Select(era => new EraInput(
                era.Id,
                era.Name,
                era.Description,
                Point(era.StartEraId, era.StartYear, era.StartMonth, era.StartDay, era.StartMonthId),
                Point(era.EndEraId, era.EndYear, era.EndMonth, era.EndDay, era.EndMonthId),
                Sorted(era.Stories),
                Sorted(era.Scenes),
                Overrides(era.Values))),
        ]);
    }

    private static ChronologyValue? Point(Guid? eraId, int? year, int? month, int? day, Guid? monthId) =>
        year is null ? null : new ChronologyValue(eraId, year, month, day, monthId);

    private static List<Guid> Sorted(IEnumerable<Guid> ids) => [.. ids.Distinct().Order()];

    /// <summary>Rows folded back into one override per field - a multi-select is one row per option - in field id order.</summary>
    private static List<EraFieldInput> Overrides(IEnumerable<EntityEraFieldValue> rows) =>
    [
        .. rows.GroupBy(row => row.FieldDefinitionId)
            .OrderBy(group => group.Key)
            .Select(group => group.Any(row => row.IsCleared)
                ? new EraFieldInput(group.Key, true, null, null, null, null, null, null)
                : new EraFieldInput(
                    group.Key,
                    false,
                    group.Select(row => row.TextValue).FirstOrDefault(text => text != null),
                    group.Select(row => row.NumberValue).FirstOrDefault(number => number != null),
                    group.Select(row => row.BooleanValue).FirstOrDefault(flag => flag != null),
                    group.Select(row => row.DateValue).FirstOrDefault(date => date != null) is { } date ? Plain(date) : null,
                    group.Any(row => row.OptionId != null) ? Sorted(group.Where(row => row.OptionId != null).Select(row => row.OptionId!.Value)) : null,
                    group.Select(row => row.ReferencedEntityId).FirstOrDefault(id => id != null),
                    group.Select(row => row.EraId).FirstOrDefault(id => id != null))),
    ];

    /// <summary>A date compared as the moment it names, never by how its kind was written: SQLite returns no kind.</summary>
    private static DateTime Plain(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Unspecified);

    /// <summary>
    /// What a snapshot's eras read as now: the fields, choices, entries, stories and scenes they name, by today's names. Used for
    /// the current progression and for an older version alike, so one that names something deleted since says "removed".
    /// </summary>
    public static async Task<List<EraResponse>> DescribeAsync(
        LorexDbContext db,
        Guid universeId,
        IReadOnlyList<EraInput> eras,
        CancellationToken cancellationToken)
    {
        var fieldIds = eras.SelectMany(era => era.Fields ?? []).Select(field => field.FieldDefinitionId).Distinct().ToList();
        var optionIds = eras.SelectMany(era => era.Fields ?? []).SelectMany(field => field.OptionIds ?? []).Distinct().ToList();
        var entityIds = eras.SelectMany(era => era.Fields ?? []).Select(field => field.ReferencedEntityId).OfType<Guid>().Distinct().ToList();
        var storyIds = eras.SelectMany(era => era.StoryIds ?? []).Distinct().ToList();
        var sceneIds = eras.SelectMany(era => era.SceneIds ?? []).Distinct().ToList();

        var fields = fieldIds.Count == 0 ? [] : await db.EntityFieldDefinitions.AsNoTracking()
            .Where(field => fieldIds.Contains(field.Id) && field.EntityType!.UniverseId == universeId)
            .ToDictionaryAsync(field => field.Id, field => new { field.Name, field.Kind, field.DisplayOrder }, cancellationToken);

        var options = optionIds.Count == 0 ? [] : await db.EntityFieldOptions.AsNoTracking()
            .Where(option => optionIds.Contains(option.Id))
            .ToDictionaryAsync(option => option.Id, option => option.Value, cancellationToken);

        var entities = entityIds.Count == 0 ? [] : await db.Entities.AsNoTracking()
            .Where(entity => entityIds.Contains(entity.Id) && entity.UniverseId == universeId)
            .ToDictionaryAsync(entity => entity.Id, entity => new { entity.Name, Trashed = entity.DeletedAt != null }, cancellationToken);

        var stories = storyIds.Count == 0 ? [] : await db.Stories.AsNoTracking()
            .Where(story => storyIds.Contains(story.Id) && story.UniverseId == universeId)
            .ToDictionaryAsync(story => story.Id, story => new EraStoryRef(story.Id, story.Title, story.DeletedAt != null), cancellationToken);

        var scenes = sceneIds.Count == 0 ? [] : await db.Scenes.AsNoTracking()
            .Where(scene => sceneIds.Contains(scene.Id) && scene.Story!.UniverseId == universeId)
            .Select(scene => new EraSceneRef(scene.Id, scene.StoryId, scene.Title, scene.Story!.Title, scene.DeletedAt != null || scene.Story.DeletedAt != null))
            .ToDictionaryAsync(scene => scene.Id, cancellationToken);

        return
        [
            .. eras.Select((era, index) => new EraResponse(
                era.Id!.Value,
                era.Name!,
                era.Description,
                index,
                era.Start,
                era.End,
                [.. (era.StoryIds ?? []).Select(id => stories.GetValueOrDefault(id)).OfType<EraStoryRef>().OrderBy(story => story.Title, StringComparer.CurrentCultureIgnoreCase)],
                [.. (era.SceneIds ?? []).Select(id => scenes.GetValueOrDefault(id)).OfType<EraSceneRef>()
                    .OrderBy(scene => scene.StoryTitle, StringComparer.CurrentCultureIgnoreCase).ThenBy(scene => scene.Title, StringComparer.CurrentCultureIgnoreCase)],
                [
                    .. (era.Fields ?? [])
                        .OrderBy(field => fields.GetValueOrDefault(field.FieldDefinitionId)?.DisplayOrder ?? int.MaxValue)
                        .ThenBy(field => fields.GetValueOrDefault(field.FieldDefinitionId)?.Name, StringComparer.Ordinal)
                        .Select(field =>
                        {
                            var definition = fields.GetValueOrDefault(field.FieldDefinitionId);
                            var linked = field.ReferencedEntityId is { } id ? entities.GetValueOrDefault(id) : null;
                            var chosen = field.OptionIds ?? [];
                            return new EraFieldResponse(
                                field.FieldDefinitionId,
                                definition?.Name ?? "Removed field",
                                definition?.Kind ?? EntityFieldKind.ShortText,
                                field.Cleared,
                                field.Text,
                                field.Number,
                                field.Boolean,
                                field.Date,
                                chosen,
                                [.. chosen.Select(option => options.GetValueOrDefault(option)).OfType<string>()],
                                field.ReferencedEntityId,
                                linked?.Name,
                                linked?.Trashed ?? false,
                                field.EraId);
                        }),
                ])),
        ];
    }

    // ---------- Checking ----------

    /// <summary>
    /// A save checked and normalised against the entry as it is: names, the dated span on the universe's own chronology,
    /// stories and scenes of this universe, and each override held to exactly what the entry's own save allows for that field
    /// (<see cref="EntityEndpoints.BuildRows"/>), never requiring one. Reads only. A collection left out keeps
    /// <paramref name="current"/>'s. <paramref name="recreating"/> lets an era id that is no longer this entry's come back as
    /// the era it was - a restore of an older version - rather than being refused as unknown.
    /// </summary>
    public static async Task<(ProgressionSnapshot Snapshot, Dictionary<string, string[]> Errors)> NormalizeAsync(
        LorexDbContext db,
        Guid universeId,
        Guid entityId,
        Guid entityTypeId,
        ProgressionSnapshot current,
        ProgressionRequest request,
        bool recreating,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Eras is null)
        {
            return (current, errors);
        }

        if (request.Eras.Count > ProgressionLimits.MaxEras)
        {
            errors["eras"] = [$"An entry can have at most {ProgressionLimits.MaxEras} eras."];
            return (current, errors);
        }

        var known = current.Eras.ToDictionary(era => era.Id!.Value);
        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        var definitions = await db.EntityFieldDefinitions.AsNoTracking()
            .Include(field => field.Options)
            .Where(field => field.EntityTypeId == entityTypeId && field.EntityType!.UniverseId == universeId && field.ArchivedAt == null)
            .ToListAsync(cancellationToken);
        var byId = definitions.ToDictionary(field => field.Id);

        var sent = request.Eras.OfType<EraInput>().ToList();

        var (referenced, members) = await EntityEndpoints.LinkTargetsAsync(
            db,
            universeId,
            definitions,
            sent.SelectMany(era => era.Fields ?? [])
                .Where(field => !field.Cleared && byId.GetValueOrDefault(field.FieldDefinitionId)?.Kind == EntityFieldKind.EntityReference)
                .Select(field => field.ReferencedEntityId)
                .OfType<Guid>(),
            cancellationToken);

        var storyIds = sent.SelectMany(era => era.StoryIds ?? []).Distinct().ToList();
        var stories = storyIds.Count == 0 ? [] : await db.Stories.AsNoTracking()
            .Where(story => storyIds.Contains(story.Id) && story.UniverseId == universeId)
            .ToDictionaryAsync(story => story.Id, story => story.DeletedAt != null, cancellationToken);

        var sceneIds = sent.SelectMany(era => era.SceneIds ?? []).Distinct().ToList();
        var scenes = sceneIds.Count == 0 ? [] : await db.Scenes.AsNoTracking()
            .Where(scene => sceneIds.Contains(scene.Id) && scene.Story!.UniverseId == universeId)
            .Select(scene => new { scene.Id, Trashed = scene.DeletedAt != null || scene.Story!.DeletedAt != null })
            .ToDictionaryAsync(scene => scene.Id, scene => scene.Trashed, cancellationToken);

        var elsewhere = new HashSet<Guid>();
        if (recreating)
        {
            var missing = sent.Select(era => era.Id).OfType<Guid>().Where(id => !known.ContainsKey(id)).ToList();
            elsewhere = missing.Count == 0 ? [] : [.. await db.EntityEras.AsNoTracking()
                .Where(era => missing.Contains(era.Id) && era.EntityId != entityId)
                .Select(era => era.Id)
                .ToListAsync(cancellationToken)];
        }

        var names = new HashSet<string>(StringComparer.CurrentCultureIgnoreCase);
        var ids = new HashSet<Guid>();
        var eras = new List<EraInput>();

        for (var index = 0; index < request.Eras.Count; index++)
        {
            var key = $"eras[{index}]";

            if (request.Eras[index] is not { } era)
            {
                errors[key] = ["Send each era as an object."];
                continue;
            }

            var before = era.Id is { } given ? known.GetValueOrDefault(given) : null;

            if (era.Id is { } id && (!ids.Add(id) || (before is null && (!recreating || elsewhere.Contains(id)))))
            {
                errors[$"{key}.id"] = ["This era is not one of this entry's. Reload the entry and try again."];
                continue;
            }

            var name = LoreValidation.Normalize(era.Name);
            if (name is null)
            {
                errors[$"{key}.name"] = ["Give the era a name."];
            }
            else if (name.Length > ProgressionLimits.NameMaxLength)
            {
                errors[$"{key}.name"] = [$"An era's name can be at most {ProgressionLimits.NameMaxLength} characters."];
            }
            else if (!names.Add(name))
            {
                errors[$"{key}.name"] = ["Another era of this entry already has this name."];
            }

            var description = LoreValidation.Normalize(era.Description);
            if (description?.Length > ProgressionLimits.DescriptionMaxLength)
            {
                errors[$"{key}.description"] = [$"An era's description can be at most {ProgressionLimits.DescriptionMaxLength:N0} characters."];
            }

            ChronologySpans.Check(era.Start, era.End, key, chronology, errors);

            var storyList = Sorted(era.StoryIds ?? []);
            var sceneList = Sorted(era.SceneIds ?? []);

            if (storyList.Count > ProgressionLimits.MaxStoriesPerEra)
            {
                errors[$"{key}.storyIds"] = [$"An era can cover at most {ProgressionLimits.MaxStoriesPerEra} stories."];
            }
            else if (storyList.Any(story => !stories.TryGetValue(story, out var trashed)
                || (trashed && !(before?.StoryIds ?? []).Contains(story))))
            {
                errors[$"{key}.storyIds"] = ["Choose stories of this universe that are not in the Trash."];
            }

            if (sceneList.Count > ProgressionLimits.MaxScenesPerEra)
            {
                errors[$"{key}.sceneIds"] = [$"An era can cover at most {ProgressionLimits.MaxScenesPerEra} scenes."];
            }
            else if (sceneList.Any(scene => !scenes.TryGetValue(scene, out var trashed)
                || (trashed && !(before?.SceneIds ?? []).Contains(scene))))
            {
                errors[$"{key}.sceneIds"] = ["Choose scenes of this universe that are not in the Trash."];
            }

            var overrides = new List<EraFieldInput>();
            var seen = new HashSet<Guid>();

            foreach (var field in era.Fields ?? [])
            {
                // A field that is not an active field of the entry's type is ignored, as an entry's save ignores one, so the
                // answer confirms nothing about fields elsewhere.
                if (!byId.TryGetValue(field.FieldDefinitionId, out var definition) || !seen.Add(field.FieldDefinitionId))
                {
                    continue;
                }

                if (field.Cleared)
                {
                    if (definition.IsRequired)
                    {
                        errors[$"{key}.fields.{definition.Id}"] = [$"{definition.Name} is required, so an era can't leave it empty. Give it a value or let the era inherit it."];
                    }
                    else
                    {
                        overrides.Add(new EraFieldInput(definition.Id, true, null, null, null, null, null, null));
                    }

                    continue;
                }

                var fieldErrors = new Dictionary<string, string[]>();
                var rows = EntityEndpoints.BuildRows(entityId, definition, field.ToValue(), chronology, referenced, members, fieldErrors);

                foreach (var (_, messages) in fieldErrors)
                {
                    errors[$"{key}.fields.{definition.Id}"] = messages;
                }

                if (fieldErrors.Count == 0 && rows.Count == 0)
                {
                    // "Set for this era" with nothing in it would quietly read as the entry's value: say so instead.
                    errors[$"{key}.fields.{definition.Id}"] = [$"Give {definition.Name} a value for this era, leave it empty with None, or let the era inherit it."];
                }

                if (fieldErrors.Count == 0 && rows.Count > 0)
                {
                    overrides.Add(Overrides(rows.Select(row => new EntityEraFieldValue
                    {
                        FieldDefinitionId = row.FieldDefinitionId,
                        TextValue = row.TextValue,
                        NumberValue = row.NumberValue,
                        EraId = row.EraId,
                        BooleanValue = row.BooleanValue,
                        DateValue = row.DateValue,
                        OptionId = row.OptionId,
                        ReferencedEntityId = row.ReferencedEntityId,
                    }))[0]);
                }
            }

            eras.Add(new EraInput(
                era.Id ?? Guid.NewGuid(),
                name,
                description,
                era.Start,
                era.End,
                storyList,
                sceneList,
                [.. overrides.OrderBy(field => field.FieldDefinitionId)]));
        }

        return (new ProgressionSnapshot(eras), errors);
    }

    // ---------- Writing ----------

    /// <summary>
    /// Turns <paramref name="current"/> into <paramref name="wanted"/>: eras kept by id are updated in place, their links and
    /// active overrides replaced; eras left out are deleted with everything they hold; new ones are added. Inside the caller's
    /// transaction; nothing is saved here but the rows. Refuses - writing nothing - to delete an era that still holds an
    /// archived field's value, which no form shows.
    /// </summary>
    public static async Task<IResult?> ApplyAsync(
        LorexDbContext db,
        Guid entityId,
        ProgressionSnapshot current,
        ProgressionSnapshot wanted,
        CancellationToken cancellationToken)
    {
        var keep = wanted.Eras.Select(era => era.Id!.Value).ToHashSet();
        var removed = current.Eras.Select(era => era.Id!.Value).Where(id => !keep.Contains(id)).ToList();

        if (removed.Count > 0)
        {
            var archived = await db.EntityEraFieldValues.AsNoTracking()
                .Where(value => removed.Contains(value.EntityEraId) && value.FieldDefinition!.ArchivedAt != null)
                .Select(value => new { Era = value.EntityEra!.Name, Field = value.FieldDefinition!.Name })
                .FirstOrDefaultAsync(cancellationToken);

            if (archived is not null)
            {
                return Results.Problem(
                    title: "Era holds archived values",
                    detail: $"\"{archived.Era}\" can't be removed because it still holds a value in the archived field \"{archived.Field}\". "
                        + "Restore the field on its type to see the value, then try again.",
                    statusCode: StatusCodes.Status409Conflict,
                    extensions: new Dictionary<string, object?> { ["code"] = ProgressionEndpoints.EraArchivedValuesCode });
            }

            await db.EntityEras.Where(era => removed.Contains(era.Id)).ExecuteDeleteAsync(cancellationToken);
        }

        var existing = current.Eras.Select(era => era.Id!.Value).Where(keep.Contains).ToList();

        if (existing.Count > 0)
        {
            await db.EntityEraStories.Where(link => existing.Contains(link.EntityEraId)).ExecuteDeleteAsync(cancellationToken);
            await db.EntityEraScenes.Where(link => existing.Contains(link.EntityEraId)).ExecuteDeleteAsync(cancellationToken);
            await db.EntityEraFieldValues
                .Where(value => existing.Contains(value.EntityEraId) && value.FieldDefinition!.ArchivedAt == null)
                .ExecuteDeleteAsync(cancellationToken);
        }

        var stored = await db.EntityEras.Where(era => era.EntityId == entityId).ToDictionaryAsync(era => era.Id, cancellationToken);

        for (var index = 0; index < wanted.Eras.Count; index++)
        {
            var era = wanted.Eras[index];
            var id = era.Id!.Value;

            if (!stored.TryGetValue(id, out var row))
            {
                row = new EntityEra { Id = id, EntityId = entityId, Name = era.Name! };
                db.EntityEras.Add(row);
            }

            row.Name = era.Name!;
            row.Description = era.Description;
            row.SortOrder = index;
            (row.StartEraId, row.StartYear, row.StartMonth, row.StartMonthId, row.StartDay) = Columns(era.Start);
            (row.EndEraId, row.EndYear, row.EndMonth, row.EndMonthId, row.EndDay) = Columns(era.End);

            foreach (var story in era.StoryIds ?? [])
            {
                db.EntityEraStories.Add(new EntityEraStory { EntityEraId = id, StoryId = story });
            }

            foreach (var scene in era.SceneIds ?? [])
            {
                db.EntityEraScenes.Add(new EntityEraScene { EntityEraId = id, SceneId = scene });
            }

            foreach (var field in era.Fields ?? [])
            {
                foreach (var value in Rows(id, field))
                {
                    db.EntityEraFieldValues.Add(value);
                }
            }
        }

        return null;
    }

    private static (Guid? Era, int? Year, int? Month, Guid? MonthId, int? Day) Columns(ChronologyValue? point) =>
        point is null ? (null, null, null, null, null) : (point.EraId, point.Year, point.Month, point.MonthId, point.Day);

    /// <summary>One override as rows: one for a cleared field, one per chosen option, one for anything else.</summary>
    internal static IEnumerable<EntityEraFieldValue> Rows(Guid eraId, EraFieldInput field)
    {
        EntityEraFieldValue New() => new() { Id = Guid.NewGuid(), EntityEraId = eraId, FieldDefinitionId = field.FieldDefinitionId };

        if (field.Cleared)
        {
            var cleared = New();
            cleared.IsCleared = true;
            yield return cleared;
            yield break;
        }

        if (field.OptionIds is { Count: > 0 } chosen)
        {
            foreach (var option in chosen)
            {
                var row = New();
                row.OptionId = option;
                yield return row;
            }

            yield break;
        }

        var single = New();
        single.TextValue = field.Text;
        single.NumberValue = field.Number;
        single.EraId = field.EraId;
        single.BooleanValue = field.Boolean;
        single.DateValue = field.Date;
        single.ReferencedEntityId = field.ReferencedEntityId;
        yield return single;
    }
}
