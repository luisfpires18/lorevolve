using System.Globalization;
using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Lore;

/// <summary>Reading filters from a request: each one checked against the type's own fields, the lore's or a project's.</summary>
public static partial class EntityFieldFilters
{
    /// <summary>
    /// Every filter checked against the universe and the type asked for, or the problems. A field, option or entry that is
    /// not this universe's gets the same answer as one that does not exist, so nothing about another world is revealed.
    /// </summary>
    public static async Task<(List<EntityFieldFilter> Filters, Dictionary<string, string[]>? Errors)> ResolveAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid? entityTypeId,
        string[] raw,
        CancellationToken cancellationToken,
        Guid? projectId = null)
    {
        var filters = new List<EntityFieldFilter>();
        if (raw.Length == 0)
        {
            return (filters, null);
        }

        if (raw.Length > MaxFilters)
        {
            return (filters, new() { ["field"] = [$"At most {MaxFilters} field filters can be used at once."] });
        }

        if (entityTypeId is not { } typeId)
        {
            return (filters, new() { ["field"] = ["Field filters need a type: a field belongs to one type."] });
        }

        // The type's fields and those it inherits from every type above it (ADR 0007 amendment, 2026-11-12).
        // A project's list (projectId set) filters by its own type's fields: the scope is named, past the lore-only filter.
        var lineage = await EntityEndpoints.FieldLineageAsync(db, universeId, typeId, cancellationToken, projectId);
        var fields = await db.EntityFieldDefinitions.AsNoTracking().IgnoreQueryFilters()
            // Active fields only: an archived one is out of Lore's filters as it is out of every form (Issue #39), so a filter
            // naming it is refused like any field this type does not have.
            .Where(field => lineage.Contains(field.EntityTypeId)
                && field.EntityType!.UniverseId == universeId
                && field.EntityType!.ProjectId == projectId
                && field.ArchivedAt == null)
            .Select(field => new
            {
                field.Id,
                field.Kind,
                field.TargetEntityTypeId,
                field.TargetGroupId,
                Options = field.Options.Select(option => option.Id).ToList(),
            })
            .ToDictionaryAsync(field => field.Id, cancellationToken);

        var errors = new Dictionary<string, string[]>();
        var references = new Dictionary<int, (Guid EntityId, Guid? Target, Guid? Group)>();

        for (var index = 0; index < raw.Length; index++)
        {
            var key = $"field[{index}]";
            var parts = (raw[index] ?? string.Empty).Split(':', 3);

            if (parts.Length != 3
                || !Guid.TryParse(parts[0], out var fieldId)
                || !fields.TryGetValue(fieldId, out var field))
            {
                errors[key] = ["This is not a field of the chosen type."];
                continue;
            }

            if (!Tokens.TryGetValue(parts[1], out var op) || !Allows(field.Kind, op))
            {
                errors[key] = ["This field cannot be filtered that way."];
                continue;
            }

            var value = parts[2];
            switch (field.Kind)
            {
                case EntityFieldKind.ShortText:
                case EntityFieldKind.LongText:
                    if (LoreValidation.Normalize(value) is not { } text || text.Length > LoreLimits.TextValueMaxLength)
                    {
                        errors[key] = ["Give some text to look for."];
                        break;
                    }

                    filters.Add(new(fieldId, field.Kind, op, Text: text));
                    break;

                case EntityFieldKind.Number:
                    if (!double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number)
                        || !double.IsFinite(number))
                    {
                        errors[key] = ["Give a number."];
                        break;
                    }

                    filters.Add(new(fieldId, field.Kind, op, Number: number));
                    break;

                case EntityFieldKind.Boolean:
                    if (value is not ("true" or "false"))
                    {
                        errors[key] = ["Choose yes or no."];
                        break;
                    }

                    filters.Add(new(fieldId, field.Kind, op, Boolean: value == "true"));
                    break;

                case EntityFieldKind.Select:
                case EntityFieldKind.MultiSelect:
                    if (!Guid.TryParse(value, out var optionId) || !field.Options.Contains(optionId))
                    {
                        errors[key] = ["Choose one of this field's options."];
                        break;
                    }

                    filters.Add(new(fieldId, field.Kind, op, Id: optionId));
                    break;

                case EntityFieldKind.EntityReference:
                    if (!Guid.TryParse(value, out var entityId))
                    {
                        errors[key] = ["Choose an entry of this universe."];
                        break;
                    }

                    references[index] = (entityId, field.TargetEntityTypeId, field.TargetGroupId);
                    filters.Add(new(fieldId, field.Kind, op, Id: entityId));
                    break;
            }
        }

        // One read for every referenced entry, with its type, and only this universe's count. A field limited to one type
        // is compared only with an entry that type or a type nested beneath it allows: any other is a filter that cannot mean
        // anything, so it is refused rather than answered with nothing - and an entry of another universe gets the same answer.
        if (references.Count > 0)
        {
            var wanted = references.Values.Select(reference => reference.EntityId).Distinct().ToList();
            var known = await db.Entities.AsNoTracking().IgnoreQueryFilters()
                .Where(entity => entity.UniverseId == universeId && entity.ProjectId == projectId && wanted.Contains(entity.Id))
                .ToDictionaryAsync(entity => entity.Id, entity => entity.EntityTypeId, cancellationToken);

            // A field limited to a group compares only with an entry whose type is in it now, by the same rule a save uses.
            var groups = references.Values
                .Where(reference => reference.Group is not null)
                .Select(reference => reference.Group!.Value)
                .Distinct()
                .ToList();
            var members = groups.Count == 0
                ? []
                : (await db.EntityTypeGroupMembers.AsNoTracking()
                    .Where(member => groups.Contains(member.EntityTypeGroupId))
                    .Select(member => new { member.EntityTypeGroupId, member.EntityTypeId })
                    .ToListAsync(cancellationToken))
                    .Select(member => (member.EntityTypeGroupId, member.EntityTypeId))
                    .ToHashSet();
            var parentOf = references.Values.Any(reference => reference.Target is not null)
                ? await EntityTypeEndpoints.ParentsAsync(db, universeId, cancellationToken, projectId)
                : [];

            foreach (var (index, (entityId, target, group)) in references)
            {
                if (!known.TryGetValue(entityId, out var typeOf))
                {
                    errors[$"field[{index}]"] = [target is null && group is null
                        ? "Choose an entry of this universe."
                        : "Choose an entry of the type this field allows."];
                }
                else if (!EntityEndpoints.LinkAllows(target, group, typeOf, parentOf, members))
                {
                    errors[$"field[{index}]"] = ["Choose an entry of the type this field allows."];
                }
            }
        }

        return errors.Count > 0 ? (filters, errors) : (filters, null);
    }
}
