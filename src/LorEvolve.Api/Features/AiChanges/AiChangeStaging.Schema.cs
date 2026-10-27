using LorEvolve.Api.Features.Lore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// The values of schema changes (ADR 0062) - a lore type, a field definition, a semantic group - built as every other
/// resource's are: a create from the input alone, an update as the stored form with only what the input sets changed, a
/// field's removal as its archive. A field's meaning is never taken from the input (ADR 0011); an update keeps the stored one.
/// </summary>
internal static partial class AiChangeStaging
{
    /// <summary>The field kinds as an AI names them, in the order get_change_options lists them.</summary>
    internal static readonly IReadOnlyList<(string Wire, EntityFieldKind Kind)> FieldKinds =
    [
        ("short_text", EntityFieldKind.ShortText),
        ("long_text", EntityFieldKind.LongText),
        ("number", EntityFieldKind.Number),
        ("yes_no", EntityFieldKind.Boolean),
        ("date", EntityFieldKind.Date),
        ("one_choice", EntityFieldKind.Select),
        ("choices", EntityFieldKind.MultiSelect),
        ("link", EntityFieldKind.EntityReference),
    ];

    private sealed partial class Builder
    {
        private async Task<AiChangeWork?> LoreTypeAsync(CancellationToken cancellationToken)
        {
            if (input.LoreType is not { } type)
            {
                Fail(AiChangeCodes.Invalid, "Put the type's values in loreType.", "loreType");
                return null;
            }

            return action == AiChangeAction.Create
                ? Work(null, null, TypeForm(type, null))
                : await StoredAsync(
                    () => AiChangeSnapshots.TypeAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, TypeForm(type, stored)));
        }

        private TypeValues? TypeForm(AiLoreTypeInput type, TypeValues? before)
        {
            if (type.Root == true && type.Parent is not null)
            {
                Fail(AiChangeCodes.Invalid, "Give a parent, or make the type a root - not both.", "loreType.parent");
                return null;
            }

            var parent = type.Root == true ? null : type.Parent is null ? before?.Parent : Ref(type.Parent, "loreType.parent");
            var groups = type.Groups is null
                ? before?.Groups ?? []
                : Sorted(type.Groups.Select(group => Ref(group, "loreType.groups")).OfType<AiRef>().Distinct());

            return new TypeValues(
                (type.Name ?? before?.Name ?? string.Empty).Trim(),
                Cleared(type.Description, before?.Description),
                Cleared(type.Icon, before?.Icon),
                Cleared(type.AccentColor, before?.AccentColor),
                parent,
                groups,
                type.FamilyTree ?? before?.FamilyTreeEligible ?? false);
        }

        private async Task<AiChangeWork?> LoreFieldAsync(CancellationToken cancellationToken)
        {
            if (action != AiChangeAction.Remove && input.Field is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the field's definition in field.", "field");
                return null;
            }

            if (action == AiChangeAction.Create)
            {
                return Work(null, null, FieldForm(input.Field!, null));
            }

            // A removal archives the field: it leaves forms and keeps every value, and can be restored in LorEvolve (Issue #39).
            return await StoredAsync(
                () => AiChangeSnapshots.FieldAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                stored => stored.Archived
                    ? Archived()
                    : Work(stored.Form, stored.Version, action == AiChangeAction.Remove ? new RemoveValues(null) : FieldForm(input.Field!, stored.Form)));

            AiChangeWork? Archived()
            {
                Fail(AiChangeCodes.Unsupported, "That field is archived. Restore it in LorEvolve's Types before changing it.", "targetId");
                return null;
            }
        }

        private FieldValues? FieldForm(AiLoreFieldInput field, FieldValues? before)
        {
            var type = before?.Type ?? Ref(field.Type, "field.type");
            if (type is null)
            {
                Fail(AiChangeCodes.Invalid, "Say which lore type the field belongs to, in field.type.", "field.type");
                return null;
            }

            if (before is not null && field.Type is not null && Ref(field.Type, "field.type") != before.Type)
            {
                Fail(AiChangeCodes.Unsupported, "A field can't move to another type. Add a field to that type instead.", "field.type");
                return null;
            }

            EntityFieldKind? kind = field.Kind is null
                ? before?.Kind
                : FieldKinds.FirstOrDefault(known => string.Equals(known.Wire, field.Kind.Trim(), StringComparison.OrdinalIgnoreCase)) is { Wire: not null } found ? found.Kind : null;
            if (kind is null)
            {
                Fail(AiChangeCodes.Invalid, $"A field's kind is one of {string.Join(", ", FieldKinds.Select(known => known.Wire))}.", "field.kind");
                return null;
            }

            var limits = new[] { field.LinksToType is not null, field.LinksToGroup is not null, field.LinksToAny == true }.Count(set => set);
            if (limits > 1)
            {
                Fail(AiChangeCodes.Invalid, "A link field is limited to one type, to one group, or to any entry - choose one.", "field.linksToType");
                return null;
            }

            // A limit given replaces the stored one; none given keeps it while the field still links.
            AiRef? targetType = null, targetGroup = null;
            if (field.LinksToType is not null)
            {
                targetType = Ref(field.LinksToType, "field.linksToType");
            }
            else if (field.LinksToGroup is not null)
            {
                targetGroup = Ref(field.LinksToGroup, "field.linksToGroup");
            }
            else if (field.LinksToAny != true && kind == EntityFieldKind.EntityReference)
            {
                (targetType, targetGroup) = (before?.TargetType, before?.TargetGroup);
            }

            List<string> options = field.Options is null
                ? before?.Options ?? []
                : [.. field.Options.Where(option => !string.IsNullOrWhiteSpace(option)).Select(option => option.Trim()).Distinct(StringComparer.OrdinalIgnoreCase)];

            return new FieldValues(
                type,
                (field.Name ?? before?.Name ?? string.Empty).Trim(),
                kind.Value,
                field.Required ?? before?.Required ?? false,
                Cleared(field.DefaultValue, before?.DefaultValue),
                options,
                targetType,
                targetGroup,
                before?.Semantic);
        }

        private async Task<AiChangeWork?> RelationshipKindAsync(CancellationToken cancellationToken)
        {
            if (input.RelationshipKind is not { } kind)
            {
                Fail(AiChangeCodes.Invalid, "Put the kind's values in relationshipKind.", "relationshipKind");
                return null;
            }

            return action == AiChangeAction.Create
                ? Work(null, null, KindForm(kind, null))
                : await StoredAsync(
                    () => AiChangeSnapshots.RelationshipKindAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, KindForm(kind, stored)));
        }

        /// <summary>A kind's Canon age rules and family meaning are kept as stored: an AI never sets what a kind means (ADR 0062).</summary>
        private static RelationshipKindValues KindForm(AiRelationshipKindInput kind, RelationshipKindValues? before)
        {
            var symmetric = kind.Symmetric ?? before?.Symmetric ?? false;
            return new RelationshipKindValues(
                (kind.Name ?? before?.Name ?? string.Empty).Trim(),
                symmetric ? null : Cleared(kind.InverseName, before?.InverseName),
                symmetric,
                Cleared(kind.Description, before?.Description),
                before?.Constraints,
                before?.FamilySemantic ?? Relationships.RelationshipFamilySemantic.None);
        }

        /// <summary>
        /// The reckoning, whole: what the AI lists, each existing period or month starting from what is stored, so leaving a
        /// value out keeps it. What is left out of the list is not removed here - the checks refuse that - and the change is
        /// bound to the whole stored reckoning.
        /// </summary>
        private async Task<AiChangeWork?> ChronologyAsync(CancellationToken cancellationToken)
        {
            if (input.Chronology is not { } chronology || (chronology.Eras is null && chronology.Months is null))
            {
                Fail(AiChangeCodes.Invalid, "Put the date periods, the calendar's months, or both in chronology.", "chronology");
                return null;
            }

            var stored = await AiChangeSnapshots.ChronologyAsync(db, universeId, cancellationToken);
            var eras = stored.Eras.ToDictionary(era => era.Id!.Value);
            var months = (stored.Months ?? []).ToDictionary(month => month.Id!.Value);

            List<DatePeriodValue> periods = [];
            foreach (var era in chronology.Eras ?? [])
            {
                var was = era?.Id is { } id ? eras.GetValueOrDefault(id) : null;
                Chronology.ChronologyEraDirection? direction = era?.Direction?.Trim().ToLowerInvariant() switch
                {
                    null => was?.Direction ?? Chronology.ChronologyEraDirection.Ascending,
                    "ascending" or "up" => Chronology.ChronologyEraDirection.Ascending,
                    "descending" or "down" => Chronology.ChronologyEraDirection.Descending,
                    _ => null,
                };
                Chronology.ChronologyLabelPosition? label = era?.Label?.Trim().ToLowerInvariant() switch
                {
                    null => was?.Label ?? Chronology.ChronologyLabelPosition.BeforeYear,
                    "before" or "before_year" => Chronology.ChronologyLabelPosition.BeforeYear,
                    "after" or "after_year" => Chronology.ChronologyLabelPosition.AfterYear,
                    _ => null,
                };
                if (era is null || direction is null || label is null)
                {
                    Fail(AiChangeCodes.Invalid, "A date period's direction is ascending or descending, and its label goes before or after the year.", "chronology.eras");
                    return null;
                }

                periods.Add(new DatePeriodValue(era.Id, (era.Name ?? was?.Name ?? string.Empty).Trim(), Cleared(era.Abbreviation, was?.Abbreviation), direction.Value, label.Value));
            }

            List<MonthValue> year = [];
            foreach (var month in chronology.Months ?? [])
            {
                var was = month?.Id is { } id ? months.GetValueOrDefault(id) : null;
                if (month is null || (month.Days ?? was?.Days) is not { } days)
                {
                    Fail(AiChangeCodes.Invalid, "Give every new month its number of days.", "chronology.months");
                    return null;
                }

                year.Add(new MonthValue(month.Id, (month.Name ?? was?.Name ?? string.Empty).Trim(), Cleared(month.Abbreviation, was?.Abbreviation), days));
            }

            var work = Work(stored, null, new ChronologyValues(
                chronology.Eras is null ? stored.Eras : periods,
                chronology.Months is null ? stored.Months : year));
            if (work is not null)
            {
                // One reckoning per universe, so one change to it per proposal.
                work.TargetId = universeId;
            }

            return work;
        }

        private async Task<AiChangeWork?> TermAsync(CancellationToken cancellationToken)
        {
            RuleValidation.ValidationTermKind? named = input.Resource?.Trim().ToLowerInvariant().Replace('-', '_') switch
            {
                "event_kind" => RuleValidation.ValidationTermKind.EventKind,
                "method" => RuleValidation.ValidationTermKind.Method,
                _ => null,
            };

            if (input.Term is not { } term)
            {
                Fail(AiChangeCodes.Invalid, "Put the event kind's or method's name in term.", "term");
                return null;
            }

            if (action == AiChangeAction.Create)
            {
                if (named is not { } kind)
                {
                    Fail(AiChangeCodes.Invalid, "Say which it is: resource event_kind or method.", "resource");
                    return null;
                }

                return Work(null, null, new TermValues(kind, (term.Name ?? string.Empty).Trim()));
            }

            return await StoredAsync(
                () => AiChangeSnapshots.TermAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                stored => named is { } asked && asked != stored.Kind
                    ? Mismatched()
                    : Work(stored, null, stored with { Name = (term.Name ?? stored.Name).Trim() }));

            AiChangeWork? Mismatched()
            {
                Fail(AiChangeCodes.Unsupported, "An event kind can't become a method, or a method an event kind: every rule and moment naming it would change meaning.", "resource");
                return null;
            }
        }

        private async Task<AiChangeWork?> LoreGroupAsync(CancellationToken cancellationToken)
        {
            if (input.Group is not { } group)
            {
                Fail(AiChangeCodes.Invalid, "Put the group's values in group.", "group");
                return null;
            }

            return action == AiChangeAction.Create
                ? Work(null, null, new GroupValues((group.Name ?? string.Empty).Trim(), group.FamilyTree ?? false))
                : await StoredAsync(
                    () => AiChangeSnapshots.GroupAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                    stored => Work(stored, null, new GroupValues((group.Name ?? stored.Name).Trim(), group.FamilyTree ?? stored.FamilyTreeEnabled)));
        }
    }
}
