using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Progression;

/// <summary>
/// An entry's appearances (Issue #43) inside its progression: read into the save's own shape, checked against the eras and
/// forms the same save leaves, written as the difference, and described by today's names with the pictures each holds now.
/// The pictures are not part of the snapshot - they are added and removed on their own routes (<see cref="AppearanceImageEndpoints"/>)
/// and never versioned - so an appearance holding any is never removed here.
/// </summary>
internal static class ProgressionAppearances
{
    private static List<Guid> Sorted(IEnumerable<Guid> ids) => [.. ids.Distinct().Order()];

    // ---------- Reading ----------

    public static async Task<List<AppearanceInput>> ReadAsync(LorexDbContext db, Guid entityId, CancellationToken cancellationToken)
    {
        var appearances = await db.EntityAppearances.AsNoTracking()
            .Where(appearance => appearance.EntityId == entityId)
            .OrderBy(appearance => appearance.SortOrder)
            .Select(appearance => new
            {
                appearance.Id,
                appearance.Label,
                appearance.Notes,
                Eras = appearance.Eras.Select(link => link.EntityEraId).ToList(),
                Forms = appearance.Forms.Select(link => link.EntityFormId).ToList(),
                Scenes = appearance.Scenes.Select(link => link.SceneId).ToList(),
            })
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        return [.. appearances.Select(appearance => new AppearanceInput(
            appearance.Id, appearance.Label, appearance.Notes, Sorted(appearance.Eras), Sorted(appearance.Forms), Sorted(appearance.Scenes)))];
    }

    /// <summary>
    /// A snapshot's appearances by today's names; eras and forms are named from the same snapshot. With
    /// <paramref name="withImages"/>, each with the pictures it holds now - a past version is shown without them, since they
    /// were never part of it.
    /// </summary>
    public static async Task<List<AppearanceResponse>> DescribeAsync(
        LorexDbContext db,
        Guid universeId,
        ProgressionSnapshot snapshot,
        bool withImages,
        CancellationToken cancellationToken)
    {
        var appearances = snapshot.Appearances ?? [];
        if (appearances.Count == 0)
        {
            return [];
        }

        var sceneIds = appearances.SelectMany(appearance => appearance.SceneIds ?? []).Distinct().ToList();
        var scenes = sceneIds.Count == 0 ? [] : await db.Scenes.AsNoTracking()
            .Where(scene => sceneIds.Contains(scene.Id) && scene.Story!.UniverseId == universeId)
            .Select(scene => new EraSceneRef(scene.Id, scene.StoryId, scene.Title, scene.Story!.Title, scene.DeletedAt != null || scene.Story.DeletedAt != null))
            .ToDictionaryAsync(scene => scene.Id, cancellationToken);

        var ids = appearances.Select(appearance => appearance.Id!.Value).ToList();
        var images = !withImages ? [] : (await db.EntityAppearanceImages.AsNoTracking()
                .Where(image => ids.Contains(image.EntityAppearanceId))
                .OrderBy(image => image.SortOrder)
                .Select(image => new { image.EntityAppearanceId, Ref = new AppearanceImageRef(image.Id, image.ContentType, image.Width, image.Height, image.FileName) })
                .ToListAsync(cancellationToken))
            .GroupBy(image => image.EntityAppearanceId)
            .ToDictionary(group => group.Key, group => group.Select(image => image.Ref).ToList());

        List<EraRef> Named(IEnumerable<(Guid? Id, string? Name)> known, IEnumerable<Guid>? chosen) =>
            [.. known.Where(one => one.Id is { } id && (chosen ?? []).Contains(id)).Select(one => new EraRef(one.Id!.Value, one.Name ?? string.Empty))];

        var eras = snapshot.Eras.Select(era => (era.Id, era.Name)).ToList();
        var forms = (snapshot.Forms ?? []).Select(form => (form.Id, form.Name)).ToList();

        return [.. appearances.Select((appearance, index) => new AppearanceResponse(
            appearance.Id!.Value,
            appearance.Label!,
            appearance.Notes,
            index,
            Named(eras, appearance.EraIds),
            Named(forms, appearance.FormIds),
            [.. (appearance.SceneIds ?? []).Select(id => scenes.GetValueOrDefault(id)).OfType<EraSceneRef>()
                .OrderBy(scene => scene.StoryTitle, StringComparer.CurrentCultureIgnoreCase).ThenBy(scene => scene.Title, StringComparer.CurrentCultureIgnoreCase)],
            images.GetValueOrDefault(appearance.Id!.Value) ?? []))];
    }

    // ---------- Checking ----------

    /// <summary>
    /// The appearances a save sends, checked against the eras and forms the same save leaves and the universe's scenes, and
    /// normalised. A list left out keeps <paramref name="current"/>'s - which must still fit the eras and forms left.
    /// </summary>
    public static async Task<List<AppearanceInput>> NormalizeAsync(
        LorexDbContext db,
        Guid universeId,
        Guid entityId,
        ProgressionSnapshot current,
        ProgressionRequest request,
        IReadOnlySet<Guid> eraIds,
        IReadOnlySet<Guid> formIds,
        bool recreating,
        Dictionary<string, string[]> errors,
        CancellationToken cancellationToken)
    {
        var sent = request.Appearances ?? [.. (current.Appearances ?? []).Cast<AppearanceInput?>()];

        if (sent.Count > ProgressionLimits.MaxAppearances)
        {
            errors["appearances"] = [$"An entry can have at most {ProgressionLimits.MaxAppearances} appearances."];
            return [.. current.Appearances ?? []];
        }

        var before = (current.Appearances ?? []).ToDictionary(appearance => appearance.Id!.Value);

        var sceneIds = sent.OfType<AppearanceInput>().SelectMany(appearance => appearance.SceneIds ?? []).Distinct().ToList();
        var scenes = sceneIds.Count == 0 ? [] : await db.Scenes.AsNoTracking()
            .Where(scene => sceneIds.Contains(scene.Id) && scene.Story!.UniverseId == universeId)
            .Select(scene => new { scene.Id, Trashed = scene.DeletedAt != null || scene.Story!.DeletedAt != null })
            .ToDictionaryAsync(scene => scene.Id, scene => scene.Trashed, cancellationToken);

        var foreign = new HashSet<Guid>();
        if (recreating)
        {
            var missing = sent.OfType<AppearanceInput>().Select(appearance => appearance.Id).OfType<Guid>().Where(id => !before.ContainsKey(id)).ToList();
            foreign = missing.Count == 0 ? [] : [.. await db.EntityAppearances.AsNoTracking()
                .Where(appearance => missing.Contains(appearance.Id) && appearance.EntityId != entityId)
                .Select(appearance => appearance.Id)
                .ToListAsync(cancellationToken)];
        }

        var appearances = new List<AppearanceInput>();
        var ids = new HashSet<Guid>();
        var labels = new HashSet<string>(StringComparer.CurrentCultureIgnoreCase);

        for (var index = 0; index < sent.Count; index++)
        {
            var key = $"appearances[{index}]";
            if (sent[index] is not { } appearance)
            {
                errors[key] = ["Send each appearance as an object."];
                continue;
            }

            var known = appearance.Id is { } given && before.ContainsKey(given);
            if (appearance.Id is { } id && (!ids.Add(id) || (!known && (!recreating || foreign.Contains(id)))))
            {
                errors[$"{key}.id"] = ["This is not one of this entry's. Reload the entry and try again."];
                continue;
            }

            var label = LoreValidation.Normalize(appearance.Label);
            if (label is null)
            {
                errors[$"{key}.label"] = ["Give it a label."];
            }
            else if (label.Length > ProgressionLimits.NameMaxLength)
            {
                errors[$"{key}.label"] = [$"A label can be at most {ProgressionLimits.NameMaxLength} characters."];
            }
            else if (!labels.Add(label))
            {
                errors[$"{key}.label"] = ["Another appearance of this entry already has this label."];
            }

            var notes = LoreValidation.Normalize(appearance.Notes);
            if (notes?.Length > ProgressionLimits.DescriptionMaxLength)
            {
                errors[$"{key}.notes"] = [$"Notes can be at most {ProgressionLimits.DescriptionMaxLength:N0} characters."];
            }

            var eras = Sorted(appearance.EraIds ?? []);
            if (eras.Any(era => !eraIds.Contains(era)))
            {
                errors[$"{key}.eraIds"] = ["Choose eras of this entry."];
            }

            var forms = Sorted(appearance.FormIds ?? []);
            if (forms.Any(form => !formIds.Contains(form)))
            {
                errors[$"{key}.formIds"] = ["Choose forms of this entry."];
            }

            var linked = Sorted(appearance.SceneIds ?? []);
            var linkedBefore = appearance.Id is { } existing && before.TryGetValue(existing, out var was) ? was.SceneIds ?? [] : [];
            if (linked.Count > ProgressionLimits.MaxScenesPerEra)
            {
                errors[$"{key}.sceneIds"] = [$"At most {ProgressionLimits.MaxScenesPerEra} scenes."];
            }
            else if (linked.Any(scene => !scenes.TryGetValue(scene, out var trashed) || (trashed && !linkedBefore.Contains(scene))))
            {
                errors[$"{key}.sceneIds"] = ["Choose scenes of this universe that are not in the Trash."];
            }

            appearances.Add(new AppearanceInput(appearance.Id ?? Guid.NewGuid(), label, notes, eras, forms, linked));
        }

        return appearances;
    }

    // ---------- Writing ----------

    /// <summary>
    /// The refusal, before anything is written, of a save or restore that would remove an appearance still holding pictures:
    /// pictures are not versioned, so nothing could bring them back.
    /// </summary>
    public static async Task<IResult?> RefuseRemovingPicturesAsync(
        LorexDbContext db,
        ProgressionSnapshot current,
        ProgressionSnapshot wanted,
        CancellationToken cancellationToken)
    {
        var keep = (wanted.Appearances ?? []).Select(appearance => appearance.Id!.Value).ToHashSet();
        var removed = (current.Appearances ?? []).Select(appearance => appearance.Id!.Value).Where(id => !keep.Contains(id)).ToList();
        if (removed.Count == 0)
        {
            return null;
        }

        var holding = await db.EntityAppearanceImages.AsNoTracking()
            .Where(image => removed.Contains(image.EntityAppearanceId))
            .Select(image => image.Appearance!.Label)
            .FirstOrDefaultAsync(cancellationToken);

        return holding is null ? null : Results.Problem(
            title: "Appearance holds pictures",
            detail: $"\"{holding}\" can't be removed while it holds pictures, which history cannot bring back. Remove its pictures first.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ProgressionEndpoints.AppearanceHoldsPicturesCode });
    }

    /// <summary>Turns the stored appearances into the wanted ones by id, inside the caller's transaction, after eras and forms.</summary>
    public static async Task ApplyAsync(
        LorexDbContext db,
        Guid entityId,
        ProgressionSnapshot current,
        ProgressionSnapshot wanted,
        CancellationToken cancellationToken)
    {
        var wantedAppearances = wanted.Appearances ?? [];
        var keep = wantedAppearances.Select(appearance => appearance.Id!.Value).ToHashSet();

        var removed = (current.Appearances ?? []).Select(appearance => appearance.Id!.Value).Where(id => !keep.Contains(id)).ToList();
        if (removed.Count > 0)
        {
            await db.EntityAppearances.Where(appearance => removed.Contains(appearance.Id)).ExecuteDeleteAsync(cancellationToken);
        }

        await db.EntityAppearanceEras.Where(link => link.Appearance!.EntityId == entityId).ExecuteDeleteAsync(cancellationToken);
        await db.EntityAppearanceForms.Where(link => link.Appearance!.EntityId == entityId).ExecuteDeleteAsync(cancellationToken);
        await db.EntityAppearanceScenes.Where(link => link.Appearance!.EntityId == entityId).ExecuteDeleteAsync(cancellationToken);

        var stored = await db.EntityAppearances.Where(appearance => appearance.EntityId == entityId).ToDictionaryAsync(appearance => appearance.Id, cancellationToken);
        for (var index = 0; index < wantedAppearances.Count; index++)
        {
            var appearance = wantedAppearances[index];
            var id = appearance.Id!.Value;
            if (!stored.TryGetValue(id, out var row))
            {
                row = new EntityAppearance { Id = id, EntityId = entityId, Label = appearance.Label! };
                db.EntityAppearances.Add(row);
            }

            row.Label = appearance.Label!;
            row.Notes = appearance.Notes;
            row.SortOrder = index;

            foreach (var era in appearance.EraIds ?? [])
            {
                db.EntityAppearanceEras.Add(new EntityAppearanceEra { EntityAppearanceId = id, EntityEraId = era });
            }

            foreach (var form in appearance.FormIds ?? [])
            {
                db.EntityAppearanceForms.Add(new EntityAppearanceForm { EntityAppearanceId = id, EntityFormId = form });
            }

            foreach (var scene in appearance.SceneIds ?? [])
            {
                db.EntityAppearanceScenes.Add(new EntityAppearanceScene { EntityAppearanceId = id, SceneId = scene });
            }
        }
    }
}
