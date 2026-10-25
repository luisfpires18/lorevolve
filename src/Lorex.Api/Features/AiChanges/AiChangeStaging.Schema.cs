using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.AiChanges;

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

            // A removal archives the field: it leaves forms and keeps every value, and can be restored in LoreX (Issue #39).
            return await StoredAsync(
                () => AiChangeSnapshots.FieldAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                stored => stored.Archived
                    ? Archived()
                    : Work(stored.Form, stored.Version, action == AiChangeAction.Remove ? new RemoveValues(null) : FieldForm(input.Field!, stored.Form)));

            AiChangeWork? Archived()
            {
                Fail(AiChangeCodes.Unsupported, "That field is archived. Restore it in LoreX's Types before changing it.", "targetId");
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
