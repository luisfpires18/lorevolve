using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Progression;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// An entry's progression change (issue 59 phase 3, ADR 0062): the stored snapshot with what the AI listed added or changed,
/// bound to the progression's version (ADR 0043). New items get their ids from LorEvolve here, so a new form can be available in
/// a new era and a new outfit worn in a new form within the one save; an AI names them by its own keys, never by ids. What the
/// AI leaves out stays exactly as stored - an appearance's pictures included, since a save never carries pictures - and
/// nothing is removed: taking an era, form or look away is the author's, by hand.
/// </summary>
internal static partial class AiChangeStaging
{
    private sealed partial class Builder
    {
        private async Task<AiChangeWork?> ProgressionAsync(CancellationToken cancellationToken)
        {
            if (input.Progression is not { } progression)
            {
                Fail(AiChangeCodes.Invalid, "Put the eras, forms, abilities or appearances in progression, with the entry in targetId.", "progression");
                return null;
            }

            var entityId = input.TargetId!.Value;
            var live = await db.Entities.AsNoTracking()
                .AnyAsync(entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null, cancellationToken);
            if (!live)
            {
                Fail(AiChangeCodes.NotFound, "That entry isn't in this universe, or it is in the Trash.", "targetId");
                return null;
            }

            var stored = await ProgressionState.ReadAsync(db, entityId, cancellationToken);
            var version = await db.EntityProgressions.AsNoTracking()
                .Where(row => row.EntityId == entityId)
                .Select(row => (int?)row.Version)
                .FirstOrDefaultAsync(cancellationToken) ?? 0;

            // Every new era and form, by the key the AI gave it, gets its id first, so each list can name the others.
            var eraKeys = Keys(progression.Eras?.Where(era => era?.Id is null).Select(era => era!.Key), "progression.eras");
            var formKeys = Keys(progression.Forms?.Where(form => form?.Id is null).Select(form => form!.Key), "progression.forms");
            if (_failed)
            {
                return null;
            }

            Guid? Era(AiProgressionRef? reference, string field) => Item(reference, eraKeys, stored.Eras.Select(era => era.Id!.Value), "era", field);
            Guid? Form(AiProgressionRef? reference, string field) => Item(reference, formKeys, (stored.Forms ?? []).Select(form => form.Id!.Value), "form", field);
            List<Guid> Eras(IReadOnlyList<AiProgressionRef>? references, string field) => [.. (references ?? []).Select(reference => Era(reference, field)).OfType<Guid>().Distinct()];
            List<Guid> Forms(IReadOnlyList<AiProgressionRef>? references, string field) => [.. (references ?? []).Select(reference => Form(reference, field)).OfType<Guid>().Distinct()];

            var eras = stored.Eras.ToList();
            foreach (var era in progression.Eras ?? [])
            {
                if (era is null)
                {
                    continue;
                }

                var at = era.Id is { } eraId ? eras.FindIndex(row => row.Id == eraId) : -1;
                if (era.Id is not null && at < 0)
                {
                    Fail(AiChangeCodes.NotFound, "That era isn't one of this entry's.", "progression.eras");
                    continue;
                }

                var was = at < 0 ? null : eras[at];
                var next = new EraInput(
                    was?.Id ?? eraKeys[era.Key!.Trim()],
                    (era.Name ?? was?.Name ?? string.Empty).Trim(),
                    Cleared(era.Description, was?.Description),
                    era.Start is { } start ? new ChronologyValue(start.EraId, start.Year, start.Month, start.Day, start.MonthId) : was?.Start,
                    era.End is { } end ? new ChronologyValue(end.EraId, end.Year, end.Month, end.Day, end.MonthId) : was?.End,
                    era.StoryIds is null ? was?.StoryIds ?? [] : [.. era.StoryIds.Distinct()],
                    era.SceneIds is null ? was?.SceneIds ?? [] : [.. era.SceneIds.Distinct()],
                    era.Fields is null ? was?.Fields ?? [] : [.. era.Fields.Where(field => field?.FieldId is not null).Select(field => new EraFieldInput(
                        field.FieldId!.Value,
                        field.Clear == true,
                        field.Text,
                        field.Number,
                        field.Boolean,
                        field.Date is { } date ? DateTime.SpecifyKind(date.Date, DateTimeKind.Utc) : null,
                        field.OptionIds,
                        field.Entry?.Id,
                        field.EraId))]);
                if (at < 0)
                {
                    eras.Add(next);
                }
                else
                {
                    eras[at] = next;
                }
            }

            List<FormInput> Merge(List<FormInput> list, IReadOnlyList<AiFormItemInput>? items, string field, Dictionary<string, Guid>? keys)
            {
                foreach (var item in items ?? [])
                {
                    if (item is null)
                    {
                        continue;
                    }

                    var at = item.Id is { } itemId ? list.FindIndex(row => row.Id == itemId) : -1;
                    if (item.Id is not null && at < 0)
                    {
                        Fail(AiChangeCodes.NotFound, "That isn't one of this entry's.", field);
                        continue;
                    }

                    var was = at < 0 ? null : list[at];
                    var next = new FormInput(
                        was?.Id ?? (keys is not null && item.Key is { } key && keys.TryGetValue(key.Trim(), out var made) ? made : Guid.NewGuid()),
                        (item.Name ?? was?.Name ?? string.Empty).Trim(),
                        Cleared(item.Description, was?.Description),
                        item.UnlockEra is null ? was?.UnlockEraId : Era(item.UnlockEra, $"{field}.unlockEra"),
                        item.UnlockSceneId ?? was?.UnlockSceneId,
                        item.UnlockMomentId ?? was?.UnlockMomentId,
                        item.Eras is null ? was?.EraIds ?? [] : Eras(item.Eras, $"{field}.eras"),
                        item.SceneIds is null ? was?.SceneIds ?? [] : [.. item.SceneIds.Distinct()]);
                    if (at < 0)
                    {
                        list.Add(next);
                    }
                    else
                    {
                        list[at] = next;
                    }
                }

                return list;
            }

            var forms = Merge([.. stored.Forms ?? []], progression.Forms, "progression.forms", formKeys);

            // An ability is a form's shape plus the forms it belongs to.
            var abilities = (stored.Abilities ?? []).ToList();
            foreach (var item in progression.Abilities ?? [])
            {
                if (item is null)
                {
                    continue;
                }

                var at = item.Id is { } abilityId ? abilities.FindIndex(row => row.Id == abilityId) : -1;
                if (item.Id is not null && at < 0)
                {
                    Fail(AiChangeCodes.NotFound, "That ability isn't one of this entry's.", "progression.abilities");
                    continue;
                }

                var was = at < 0 ? null : abilities[at];
                var shape = Merge([], [item with { Id = null }], "progression.abilities", null).Single();
                var next = new AbilityInput(
                    was?.Id ?? shape.Id,
                    item.Name is null ? was?.Name ?? string.Empty : shape.Name,
                    item.Description is null ? was?.Description : shape.Description,
                    item.UnlockEra is null ? was?.UnlockEraId : shape.UnlockEraId,
                    item.UnlockSceneId ?? was?.UnlockSceneId,
                    item.UnlockMomentId ?? was?.UnlockMomentId,
                    item.Eras is null ? was?.EraIds ?? [] : shape.EraIds,
                    item.SceneIds is null ? was?.SceneIds ?? [] : shape.SceneIds,
                    item.Forms is null ? was?.FormIds ?? [] : Forms(item.Forms, "progression.abilities.forms"));
                if (at < 0)
                {
                    abilities.Add(next);
                }
                else
                {
                    abilities[at] = next;
                }
            }

            var appearances = (stored.Appearances ?? []).ToList();
            foreach (var item in progression.Appearances ?? [])
            {
                if (item is null)
                {
                    continue;
                }

                var at = item.Id is { } appearanceId ? appearances.FindIndex(row => row.Id == appearanceId) : -1;
                if (item.Id is not null && at < 0)
                {
                    Fail(AiChangeCodes.NotFound, "That appearance isn't one of this entry's.", "progression.appearances");
                    continue;
                }

                var was = at < 0 ? null : appearances[at];
                var next = new AppearanceInput(
                    was?.Id ?? Guid.NewGuid(),
                    (item.Label ?? was?.Label ?? string.Empty).Trim(),
                    Cleared(item.Notes, was?.Notes),
                    item.Eras is null ? was?.EraIds ?? [] : Eras(item.Eras, "progression.appearances.eras"),
                    item.Forms is null ? was?.FormIds ?? [] : Forms(item.Forms, "progression.appearances.forms"),
                    item.SceneIds is null ? was?.SceneIds ?? [] : [.. item.SceneIds.Distinct()]);
                if (at < 0)
                {
                    appearances.Add(next);
                }
                else
                {
                    appearances[at] = next;
                }
            }

            var merged = new ProgressionSnapshot(eras, forms, abilities, appearances);
            if (_failed)
            {
                return null;
            }

            if (AiChangeSnapshots.Same(stored, merged))
            {
                Fail(AiChangeCodes.Invalid, "This change wouldn't change anything.");
                return null;
            }

            var work = Work(stored, version, new ProgressionValues(entityId, merged));
            if (work is not null)
            {
                work.TargetId = entityId;
            }

            return work;
        }

        /// <summary>The keys of the new items of one list: each given, unique, and turned into the id the item will have.</summary>
        private Dictionary<string, Guid> Keys(IEnumerable<string?>? keys, string field)
        {
            var made = new Dictionary<string, Guid>(StringComparer.Ordinal);
            foreach (var key in keys ?? [])
            {
                if (string.IsNullOrWhiteSpace(key) || !made.TryAdd(key.Trim(), Guid.NewGuid()))
                {
                    Fail(AiChangeCodes.Invalid, "Give every new era and form a key of its own, so others can name it.", field);
                }
            }

            return made;
        }

        /// <summary>An existing era or form of the entry by id, or a new one of this change by key; anything else is refused.</summary>
        private Guid? Item(AiProgressionRef? reference, Dictionary<string, Guid> keys, IEnumerable<Guid> existing, string noun, string field)
        {
            if (reference is null)
            {
                return null;
            }

            if (reference.Id is { } id && reference.Key is null && existing.Contains(id))
            {
                return id;
            }

            if (reference.Id is null && reference.Key is { } key && keys.TryGetValue(key.Trim(), out var made))
            {
                return made;
            }

            Fail(AiChangeCodes.NotFound, $"That isn't one of this entry's {noun}s, by id, or a new {noun} of this change, by key.", field);
            return null;
        }
    }
}
