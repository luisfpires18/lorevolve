using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Progression;

/// <summary>
/// An entry's forms and abilities (Issue #42) inside its progression: read into the save's own shape, checked and normalised
/// against the eras the same save leaves, written as the difference, and described by today's names. Kept apart from
/// <see cref="ProgressionState"/> only for size; the snapshot, the version and the history are the progression's.
///
/// Everything here is what the author said and nothing more: availability is the eras ticked, the first unlock is the era,
/// scene or moment named, and "used in" is the scenes listed. Nothing is worked out from era order, and nothing is checked
/// against anything else - a form used in a scene of an era it is not available in is the author's story, not an error.
/// </summary>
internal static class ProgressionForms
{
    private static List<Guid> Sorted(IEnumerable<Guid> ids) => [.. ids.Distinct().Order()];

    // ---------- Reading ----------

    public static async Task<(List<FormInput> Forms, List<AbilityInput> Abilities)> ReadAsync(
        LorEvolveDbContext db,
        Guid entityId,
        CancellationToken cancellationToken)
    {
        var forms = await db.EntityForms.AsNoTracking()
            .Where(form => form.EntityId == entityId)
            .OrderBy(form => form.SortOrder)
            .Select(form => new
            {
                form.Id,
                form.Name,
                form.Description,
                form.UnlockEntityEraId,
                form.UnlockSceneId,
                form.UnlockTimelineEntryId,
                Eras = form.Eras.Select(link => link.EntityEraId).ToList(),
                Scenes = form.Scenes.Select(link => link.SceneId).ToList(),
            })
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        var abilities = await db.EntityAbilities.AsNoTracking()
            .Where(ability => ability.EntityId == entityId)
            .OrderBy(ability => ability.SortOrder)
            .Select(ability => new
            {
                ability.Id,
                ability.Name,
                ability.Description,
                ability.UnlockEntityEraId,
                ability.UnlockSceneId,
                ability.UnlockTimelineEntryId,
                Eras = ability.Eras.Select(link => link.EntityEraId).ToList(),
                Scenes = ability.Scenes.Select(link => link.SceneId).ToList(),
                Forms = ability.Forms.Select(link => link.EntityFormId).ToList(),
            })
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        return (
            [.. forms.Select(form => new FormInput(
                form.Id, form.Name, form.Description, form.UnlockEntityEraId, form.UnlockSceneId, form.UnlockTimelineEntryId,
                Sorted(form.Eras), Sorted(form.Scenes)))],
            [.. abilities.Select(ability => new AbilityInput(
                ability.Id, ability.Name, ability.Description, ability.UnlockEntityEraId, ability.UnlockSceneId, ability.UnlockTimelineEntryId,
                Sorted(ability.Eras), Sorted(ability.Scenes), Sorted(ability.Forms)))]);
    }

    /// <summary>A snapshot's forms and abilities by today's names; eras and forms are named from the same snapshot.</summary>
    public static async Task<(List<FormResponse> Forms, List<AbilityResponse> Abilities)> DescribeAsync(
        LorEvolveDbContext db,
        Guid universeId,
        ProgressionSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        var forms = snapshot.Forms ?? [];
        var abilities = snapshot.Abilities ?? [];

        var eraNames = snapshot.Eras.Where(era => era.Id is not null).ToDictionary(era => era.Id!.Value, era => era.Name ?? string.Empty);
        var formNames = forms.Where(form => form.Id is not null).ToDictionary(form => form.Id!.Value, form => form.Name ?? string.Empty);

        var sceneIds = forms.SelectMany(form => (form.SceneIds ?? []).Append(form.UnlockSceneId ?? Guid.Empty))
            .Concat(abilities.SelectMany(ability => (ability.SceneIds ?? []).Append(ability.UnlockSceneId ?? Guid.Empty)))
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToList();
        var momentIds = forms.Select(form => form.UnlockMomentId)
            .Concat(abilities.Select(ability => ability.UnlockMomentId))
            .OfType<Guid>()
            .Distinct()
            .ToList();

        var scenes = sceneIds.Count == 0 ? [] : await db.Scenes.AsNoTracking()
            .Where(scene => sceneIds.Contains(scene.Id) && scene.Story!.UniverseId == universeId)
            .Select(scene => new EraSceneRef(scene.Id, scene.StoryId, scene.Title, scene.Story!.Title, scene.DeletedAt != null || scene.Story.DeletedAt != null))
            .ToDictionaryAsync(scene => scene.Id, cancellationToken);

        var moments = momentIds.Count == 0 ? [] : await db.TimelineEntries.AsNoTracking()
            .Where(moment => momentIds.Contains(moment.Id) && moment.UniverseId == universeId)
            .Select(moment => new MomentRef(moment.Id, moment.Title, moment.DeletedAt != null))
            .ToDictionaryAsync(moment => moment.Id, cancellationToken);

        EraRef? Era(Guid? id) => id is { } era && eraNames.TryGetValue(era, out var name) ? new EraRef(era, name) : null;

        UnlockMilestone Unlock(Guid? era, Guid? scene, Guid? moment) => new(
            Era(era),
            scene is { } sceneId ? scenes.GetValueOrDefault(sceneId) : null,
            moment is { } momentId ? moments.GetValueOrDefault(momentId) : null);

        List<EraRef> Eras(IEnumerable<Guid>? ids) =>
            [.. snapshot.Eras.Where(era => era.Id is { } id && (ids ?? []).Contains(id)).Select(era => new EraRef(era.Id!.Value, era.Name ?? string.Empty))];

        List<EraSceneRef> Scenes(IEnumerable<Guid>? ids) =>
            [.. (ids ?? []).Select(id => scenes.GetValueOrDefault(id)).OfType<EraSceneRef>()
                .OrderBy(scene => scene.StoryTitle, StringComparer.CurrentCultureIgnoreCase).ThenBy(scene => scene.Title, StringComparer.CurrentCultureIgnoreCase)];

        return (
            [.. forms.Select((form, index) => new FormResponse(
                form.Id!.Value, form.Name!, form.Description, index,
                Unlock(form.UnlockEraId, form.UnlockSceneId, form.UnlockMomentId),
                Eras(form.EraIds), Scenes(form.SceneIds)))],
            [.. abilities.Select((ability, index) => new AbilityResponse(
                ability.Id!.Value, ability.Name!, ability.Description, index,
                Unlock(ability.UnlockEraId, ability.UnlockSceneId, ability.UnlockMomentId),
                Eras(ability.EraIds), Scenes(ability.SceneIds),
                [.. forms.Where(form => form.Id is { } id && (ability.FormIds ?? []).Contains(id)).Select(form => new EraRef(form.Id!.Value, formNames[form.Id.Value]))]))]);
    }

    // ---------- Checking ----------

    /// <summary>
    /// The forms and abilities a save sends, checked against the eras the same save leaves (<paramref name="eraIds"/>) and the
    /// universe's scenes and moments, and normalised. A collection left out keeps <paramref name="current"/>'s - which must still
    /// fit the eras left, so removing an era a form names is said rather than done behind the author's back.
    /// </summary>
    public static async Task<(List<FormInput> Forms, List<AbilityInput> Abilities)> NormalizeAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid entityId,
        ProgressionSnapshot current,
        ProgressionRequest request,
        IReadOnlySet<Guid> eraIds,
        bool recreating,
        Dictionary<string, string[]> errors,
        CancellationToken cancellationToken)
    {
        var sentForms = request.Forms ?? [.. (current.Forms ?? []).Cast<FormInput?>()];
        var sentAbilities = request.Abilities ?? [.. (current.Abilities ?? []).Cast<AbilityInput?>()];

        if (sentForms.Count > ProgressionLimits.MaxForms)
        {
            errors["forms"] = [$"An entry can have at most {ProgressionLimits.MaxForms} forms."];
            return ([.. current.Forms ?? []], [.. current.Abilities ?? []]);
        }

        if (sentAbilities.Count > ProgressionLimits.MaxAbilities)
        {
            errors["abilities"] = [$"An entry can have at most {ProgressionLimits.MaxAbilities} abilities."];
            return ([.. current.Forms ?? []], [.. current.Abilities ?? []]);
        }

        var formsBefore = (current.Forms ?? []).ToDictionary(form => form.Id!.Value);
        var abilitiesBefore = (current.Abilities ?? []).ToDictionary(ability => ability.Id!.Value);

        // Every scene and moment either list names, read once, only from this universe, with whether each is in the Trash.
        var sceneIds = sentForms.OfType<FormInput>().SelectMany(form => (form.SceneIds ?? []).Append(form.UnlockSceneId ?? Guid.Empty))
            .Concat(sentAbilities.OfType<AbilityInput>().SelectMany(ability => (ability.SceneIds ?? []).Append(ability.UnlockSceneId ?? Guid.Empty)))
            .Where(id => id != Guid.Empty).Distinct().ToList();
        var scenes = sceneIds.Count == 0 ? [] : await db.Scenes.AsNoTracking()
            .Where(scene => sceneIds.Contains(scene.Id) && scene.Story!.UniverseId == universeId)
            .Select(scene => new { scene.Id, Trashed = scene.DeletedAt != null || scene.Story!.DeletedAt != null })
            .ToDictionaryAsync(scene => scene.Id, scene => scene.Trashed, cancellationToken);

        var momentIds = sentForms.OfType<FormInput>().Select(form => form.UnlockMomentId)
            .Concat(sentAbilities.OfType<AbilityInput>().Select(ability => ability.UnlockMomentId))
            .OfType<Guid>().Distinct().ToList();
        var moments = momentIds.Count == 0 ? [] : await db.TimelineEntries.AsNoTracking()
            .Where(moment => momentIds.Contains(moment.Id) && moment.UniverseId == universeId)
            .ToDictionaryAsync(moment => moment.Id, moment => moment.DeletedAt != null, cancellationToken);

        var foreign = new HashSet<Guid>();
        if (recreating)
        {
            var missing = sentForms.OfType<FormInput>().Select(form => form.Id).OfType<Guid>().Where(id => !formsBefore.ContainsKey(id))
                .Concat(sentAbilities.OfType<AbilityInput>().Select(ability => ability.Id).OfType<Guid>().Where(id => !abilitiesBefore.ContainsKey(id)))
                .ToList();
            foreign = missing.Count == 0 ? [] : [.. await db.EntityForms.AsNoTracking()
                    .Where(form => missing.Contains(form.Id) && form.EntityId != entityId).Select(form => form.Id)
                    .Concat(db.EntityAbilities.AsNoTracking().Where(ability => missing.Contains(ability.Id) && ability.EntityId != entityId).Select(ability => ability.Id))
                    .ToListAsync(cancellationToken)];
        }

        // The checks a form and an ability share, keyed under "forms[i]" or "abilities[i]".
        (Guid Id, string? Name, string? Description, List<Guid> Eras, List<Guid> Scenes)? Common(
            string key,
            Guid? id,
            string? rawName,
            string? rawDescription,
            Guid? unlockEra,
            Guid? unlockScene,
            Guid? unlockMoment,
            IReadOnlyList<Guid>? rawEras,
            IReadOnlyList<Guid>? rawScenes,
            bool known,
            Guid? beforeUnlockScene,
            Guid? beforeUnlockMoment,
            IReadOnlyList<Guid>? beforeScenes,
            HashSet<Guid> ids,
            HashSet<string> names)
        {
            if (id is { } given && (!ids.Add(given) || (!known && (!recreating || foreign.Contains(given)))))
            {
                errors[$"{key}.id"] = ["This is not one of this entry's. Reload the entry and try again."];
                return null;
            }

            var name = LoreValidation.Normalize(rawName);
            if (name is null)
            {
                errors[$"{key}.name"] = ["Give it a name."];
            }
            else if (name.Length > ProgressionLimits.NameMaxLength)
            {
                errors[$"{key}.name"] = [$"A name can be at most {ProgressionLimits.NameMaxLength} characters."];
            }
            else if (!names.Add(name))
            {
                errors[$"{key}.name"] = ["Another one of this entry already has this name."];
            }

            var description = LoreValidation.Normalize(rawDescription);
            if (description?.Length > ProgressionLimits.DescriptionMaxLength)
            {
                errors[$"{key}.description"] = [$"A description can be at most {ProgressionLimits.DescriptionMaxLength:N0} characters."];
            }

            var eras = Sorted(rawEras ?? []);
            if (eras.Any(era => !eraIds.Contains(era)))
            {
                errors[$"{key}.eraIds"] = ["Choose eras of this entry."];
            }

            if (unlockEra is { } era && !eraIds.Contains(era))
            {
                errors[$"{key}.unlockEraId"] = ["Choose an era of this entry."];
            }

            var linked = Sorted(rawScenes ?? []);
            if (linked.Count > ProgressionLimits.MaxScenesPerEra)
            {
                errors[$"{key}.sceneIds"] = [$"At most {ProgressionLimits.MaxScenesPerEra} scenes."];
            }
            else if (linked.Any(scene => !scenes.TryGetValue(scene, out var trashed) || (trashed && !(beforeScenes ?? []).Contains(scene))))
            {
                errors[$"{key}.sceneIds"] = ["Choose scenes of this universe that are not in the Trash."];
            }

            if (unlockScene is { } scene && (!scenes.TryGetValue(scene, out var sceneTrashed) || (sceneTrashed && beforeUnlockScene != scene)))
            {
                errors[$"{key}.unlockSceneId"] = ["Choose a scene of this universe that is not in the Trash."];
            }

            if (unlockMoment is { } moment && (!moments.TryGetValue(moment, out var momentTrashed) || (momentTrashed && beforeUnlockMoment != moment)))
            {
                errors[$"{key}.unlockMomentId"] = ["Choose a timeline moment of this universe that is not in the Trash."];
            }

            return (id ?? Guid.NewGuid(), name, description, eras, linked);
        }

        var forms = new List<FormInput>();
        var formIds = new HashSet<Guid>();
        var formNames = new HashSet<string>(StringComparer.CurrentCultureIgnoreCase);

        for (var index = 0; index < sentForms.Count; index++)
        {
            var key = $"forms[{index}]";
            if (sentForms[index] is not { } form)
            {
                errors[key] = ["Send each form as an object."];
                continue;
            }

            var before = form.Id is { } formId ? formsBefore.GetValueOrDefault(formId) : null;
            if (Common(key, form.Id, form.Name, form.Description, form.UnlockEraId, form.UnlockSceneId, form.UnlockMomentId, form.EraIds,
                    form.SceneIds, before is not null, before?.UnlockSceneId, before?.UnlockMomentId, before?.SceneIds, formIds, formNames) is { } checkedForm)
            {
                forms.Add(new FormInput(checkedForm.Id, checkedForm.Name, checkedForm.Description, form.UnlockEraId, form.UnlockSceneId,
                    form.UnlockMomentId, checkedForm.Eras, checkedForm.Scenes));
            }
        }

        var keptForms = forms.Select(form => form.Id!.Value).ToHashSet();
        var abilities = new List<AbilityInput>();
        var abilityIds = new HashSet<Guid>();
        var abilityNames = new HashSet<string>(StringComparer.CurrentCultureIgnoreCase);

        for (var index = 0; index < sentAbilities.Count; index++)
        {
            var key = $"abilities[{index}]";
            if (sentAbilities[index] is not { } ability)
            {
                errors[key] = ["Send each ability as an object."];
                continue;
            }

            var before = ability.Id is { } abilityId ? abilitiesBefore.GetValueOrDefault(abilityId) : null;
            var belongs = Sorted(ability.FormIds ?? []);
            if (belongs.Any(form => !keptForms.Contains(form)))
            {
                errors[$"{key}.formIds"] = ["Choose forms of this entry."];
            }

            if (Common(key, ability.Id, ability.Name, ability.Description, ability.UnlockEraId, ability.UnlockSceneId, ability.UnlockMomentId,
                    ability.EraIds, ability.SceneIds, before is not null, before?.UnlockSceneId, before?.UnlockMomentId, before?.SceneIds, abilityIds,
                    abilityNames) is { } checkedAbility)
            {
                abilities.Add(new AbilityInput(checkedAbility.Id, checkedAbility.Name, checkedAbility.Description, ability.UnlockEraId,
                    ability.UnlockSceneId, ability.UnlockMomentId, checkedAbility.Eras, checkedAbility.Scenes, belongs));
            }
        }

        return (forms, abilities);
    }

    // ---------- Writing ----------

    /// <summary>
    /// Turns the stored forms and abilities into the wanted ones by id - kept ones updated in place with their links replaced,
    /// left-out ones deleted with their links, new ones added - inside the caller's transaction, after the eras are written.
    /// </summary>
    public static async Task ApplyAsync(
        LorEvolveDbContext db,
        Guid entityId,
        ProgressionSnapshot current,
        ProgressionSnapshot wanted,
        CancellationToken cancellationToken)
    {
        var wantedForms = wanted.Forms ?? [];
        var wantedAbilities = wanted.Abilities ?? [];
        var keepForms = wantedForms.Select(form => form.Id!.Value).ToHashSet();
        var keepAbilities = wantedAbilities.Select(ability => ability.Id!.Value).ToHashSet();

        var removedAbilities = (current.Abilities ?? []).Select(ability => ability.Id!.Value).Where(id => !keepAbilities.Contains(id)).ToList();
        if (removedAbilities.Count > 0)
        {
            await db.EntityAbilities.Where(ability => removedAbilities.Contains(ability.Id)).ExecuteDeleteAsync(cancellationToken);
        }

        var removedForms = (current.Forms ?? []).Select(form => form.Id!.Value).Where(id => !keepForms.Contains(id)).ToList();
        if (removedForms.Count > 0)
        {
            await db.EntityForms.Where(form => removedForms.Contains(form.Id)).ExecuteDeleteAsync(cancellationToken);
        }

        await db.EntityFormEras.Where(link => link.Form!.EntityId == entityId).ExecuteDeleteAsync(cancellationToken);
        await db.EntityFormScenes.Where(link => link.Form!.EntityId == entityId).ExecuteDeleteAsync(cancellationToken);
        await db.EntityAbilityEras.Where(link => link.Ability!.EntityId == entityId).ExecuteDeleteAsync(cancellationToken);
        await db.EntityAbilityScenes.Where(link => link.Ability!.EntityId == entityId).ExecuteDeleteAsync(cancellationToken);
        await db.EntityAbilityForms.Where(link => link.Ability!.EntityId == entityId).ExecuteDeleteAsync(cancellationToken);

        var storedForms = await db.EntityForms.Where(form => form.EntityId == entityId).ToDictionaryAsync(form => form.Id, cancellationToken);
        for (var index = 0; index < wantedForms.Count; index++)
        {
            var form = wantedForms[index];
            var id = form.Id!.Value;
            if (!storedForms.TryGetValue(id, out var row))
            {
                row = new EntityForm { Id = id, EntityId = entityId, Name = form.Name! };
                db.EntityForms.Add(row);
            }

            row.Name = form.Name!;
            row.Description = form.Description;
            row.SortOrder = index;
            row.UnlockEntityEraId = form.UnlockEraId;
            row.UnlockSceneId = form.UnlockSceneId;
            row.UnlockTimelineEntryId = form.UnlockMomentId;

            foreach (var era in form.EraIds ?? [])
            {
                db.EntityFormEras.Add(new EntityFormEra { EntityFormId = id, EntityEraId = era });
            }

            foreach (var scene in form.SceneIds ?? [])
            {
                db.EntityFormScenes.Add(new EntityFormScene { EntityFormId = id, SceneId = scene });
            }
        }

        var storedAbilities = await db.EntityAbilities.Where(ability => ability.EntityId == entityId).ToDictionaryAsync(ability => ability.Id, cancellationToken);
        for (var index = 0; index < wantedAbilities.Count; index++)
        {
            var ability = wantedAbilities[index];
            var id = ability.Id!.Value;
            if (!storedAbilities.TryGetValue(id, out var row))
            {
                row = new EntityAbility { Id = id, EntityId = entityId, Name = ability.Name! };
                db.EntityAbilities.Add(row);
            }

            row.Name = ability.Name!;
            row.Description = ability.Description;
            row.SortOrder = index;
            row.UnlockEntityEraId = ability.UnlockEraId;
            row.UnlockSceneId = ability.UnlockSceneId;
            row.UnlockTimelineEntryId = ability.UnlockMomentId;

            foreach (var era in ability.EraIds ?? [])
            {
                db.EntityAbilityEras.Add(new EntityAbilityEra { EntityAbilityId = id, EntityEraId = era });
            }

            foreach (var scene in ability.SceneIds ?? [])
            {
                db.EntityAbilityScenes.Add(new EntityAbilityScene { EntityAbilityId = id, SceneId = scene });
            }

            foreach (var form in ability.FormIds ?? [])
            {
                db.EntityAbilityForms.Add(new EntityAbilityForm { EntityAbilityId = id, EntityFormId = form });
            }
        }
    }
}
